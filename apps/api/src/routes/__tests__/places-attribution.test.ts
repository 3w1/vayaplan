import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

let parsedUrl: URL;
try {
  parsedUrl = new URL(rawTestDbUrl.trim());
} catch {
  console.error('Error de configuración: La URL de conexión de pruebas tiene un formato inválido.');
  process.exit(1);
}

const dbName = parsedUrl.pathname.replace(/^\//, '');
if (!dbName.includes('test') && !dbName.includes('synthetic')) {
  console.error(
    `Error de seguridad preventiva: La base de datos objetivo ('${dbName}') debe contener 'test' o 'synthetic'.`
  );
  process.exit(1);
}

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../index');
const { JWT_SECRET } = await import('../../middleware/auth');
const { sign } = await import('hono/jwt');

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
const createdPlaceIds: number[] = [];

beforeAll(async () => {
  adminToken = await sign(
    { email: 'admin-places-attribution@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );
});

afterAll(async () => {
  if (createdPlaceIds.length > 0) {
    await testPool.query(`DELETE FROM places WHERE id = ANY($1)`, [createdPlaceIds]);
  }
  await testPool.end();
});

describe('Atribución Fotográfica en Lugares Permanentes (places)', () => {
  describe('1. Integridad en Base de Datos (Restricción CHECK chk_places_image_attribution)', () => {
    test('permite insertar un lugar sin atribución (columnas en NULL, imagen opcional)', async () => {
      const res = await testPool.query(`
        INSERT INTO places (
          city_id, name, slug, category, highlight_text, is_active,
          image_url, image_author, image_source_url, image_license, image_license_url, image_modifications
        ) VALUES (
          1, 'Lugar Test Sin Atribución', 'lugar-test-sin-atribucion', 'cultura', 'Sin atribución', true,
          'https://cdn.vayaplan.com/places/test-sin-atribucion.webp', NULL, NULL, NULL, NULL, NULL
        ) RETURNING id;
      `);
      const id = res.rows[0].id;
      createdPlaceIds.push(id);
      expect(id).toBeGreaterThan(0);
    });

    test('permite insertar un lugar con atribución completa válida', async () => {
      const res = await testPool.query(`
        INSERT INTO places (
          city_id, name, slug, category, highlight_text, is_active,
          image_url, image_author, image_source_url, image_license, image_license_url, image_modifications
        ) VALUES (
          1, 'Lugar Test Con Atribución', 'lugar-test-con-atribucion', 'cultura', 'Con atribución', true,
          'https://cdn.vayaplan.com/places/test-con-atribucion.webp',
          'José Luis Filpo Cabana',
          'https://commons.wikimedia.org/wiki/File:Test.jpg',
          'CC BY 4.0',
          'https://creativecommons.org/licenses/by/4.0/',
          'Redimensionada y convertida a WebP'
        ) RETURNING id;
      `);
      const id = res.rows[0].id;
      createdPlaceIds.push(id);
      expect(id).toBeGreaterThan(0);
    });

    test('rechaza inserción directa con atribución parcial (falta autor)', async () => {
      let rejected = false;
      try {
        await testPool.query(`
          INSERT INTO places (
            city_id, name, slug, category, highlight_text, is_active,
            image_url, image_author, image_source_url, image_license, image_license_url
          ) VALUES (
            1, 'Lugar Inválido Sin Autor', 'lugar-invalido-sin-autor', 'cultura', 'Inválido', true,
            'https://cdn.vayaplan.com/places/test.webp',
            NULL,
            'https://commons.wikimedia.org/wiki/File:Test.jpg',
            'CC BY 4.0',
            'https://creativecommons.org/licenses/by/4.0/'
          );
        `);
      } catch (err: any) {
        rejected = true;
        expect(err.message).toContain('chk_places_image_attribution');
      }
      expect(rejected).toBe(true);
    });

    test('rechaza inserción con atribución si image_url es NULL o vacía', async () => {
      let rejected = false;
      try {
        await testPool.query(`
          INSERT INTO places (
            city_id, name, slug, category, highlight_text, is_active,
            image_url, image_author, image_source_url, image_license, image_license_url
          ) VALUES (
            1, 'Lugar Inválido Sin Foto', 'lugar-invalido-sin-foto', 'cultura', 'Inválido', true,
            NULL,
            'Autor Válido',
            'https://commons.wikimedia.org/wiki/File:Test.jpg',
            'CC BY 4.0',
            'https://creativecommons.org/licenses/by/4.0/'
          );
        `);
      } catch (err: any) {
        rejected = true;
        expect(err.message).toContain('chk_places_image_attribution');
      }
      expect(rejected).toBe(true);
    });
  });

  describe('2. Endpoint Admin POST /api/v1/admin/places', () => {
    test('crea un lugar sin atribución con éxito', async () => {
      const res = await app.request('/api/v1/admin/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Museo Test Admin Creacion 1',
          slug: 'museo-test-admin-creacion-1',
          highlight_text: 'Museo destacado sin créditos',
          image_url: 'https://cdn.vayaplan.com/places/foto.webp',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.status).toBe('ok');
      createdPlaceIds.push(data.place.id);
      expect(data.place.image_author).toBeNull();
      expect(data.place.image_source_url).toBeNull();
    });

    test('crea un lugar con atribución completa con éxito', async () => {
      const res = await app.request('/api/v1/admin/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Museo Test Admin Creacion 2',
          slug: 'museo-test-admin-creacion-2',
          highlight_text: 'Museo con atribución CC BY 4.0',
          image_url: 'https://cdn.vayaplan.com/places/museo.webp',
          image_author: 'José Luis Filpo Cabana',
          image_source_url: 'https://commons.wikimedia.org/wiki/File:Fachada.jpg',
          image_license: 'CC BY 4.0',
          image_license_url: 'https://creativecommons.org/licenses/by/4.0/',
          image_modifications: 'WebP 1200px',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.status).toBe('ok');
      createdPlaceIds.push(data.place.id);
      expect(data.place.image_author).toBe('José Luis Filpo Cabana');
      expect(data.place.image_license).toBe('CC BY 4.0');
    });

    test('rechaza creación si se envía autor pero falta fuente o licencia (400)', async () => {
      const res = await app.request('/api/v1/admin/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Museo Parcial Inválido',
          slug: 'museo-parcial-invalido',
          highlight_text: 'Intento incompleto',
          image_url: 'https://cdn.vayaplan.com/places/museo.webp',
          image_author: 'Autor Test',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_attribution');
      expect(data.message).toContain('fuente original');
    });

    test('rechaza protocolo javascript: o data: en URLs de atribución (400)', async () => {
      const res = await app.request('/api/v1/admin/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Museo XSS Test',
          slug: 'museo-xss-test',
          highlight_text: 'XSS attempt',
          image_url: 'https://cdn.vayaplan.com/places/museo.webp',
          image_author: 'Atacante',
          image_source_url: 'javascript:alert(1)',
          image_license: 'CC BY 4.0',
          image_license_url: 'https://creativecommons.org/licenses/by/4.0/',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_attribution');
      expect(data.message).toContain('no es válida');
    });

    test('rechaza atribución si no hay image_url asignada (400)', async () => {
      const res = await app.request('/api/v1/admin/places', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Museo Sin Imagen Con Creditos',
          slug: 'museo-sin-imagen-con-creditos',
          highlight_text: 'Sin foto',
          image_author: 'Autor',
          image_source_url: 'https://commons.wikimedia.org/wiki/File:Fachada.jpg',
          image_license: 'CC BY 4.0',
          image_license_url: 'https://creativecommons.org/licenses/by/4.0/',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_attribution');
      expect(data.message).toContain('imagen válida asignada');
    });
  });

  describe('3. Endpoint Admin PATCH /api/v1/admin/places/:id', () => {
    let targetPlaceId: number;

    beforeAll(async () => {
      const res = await testPool.query(`
        INSERT INTO places (
          city_id, name, slug, category, highlight_text, is_active,
          image_url, image_author, image_source_url, image_license, image_license_url, image_modifications
        ) VALUES (
          1, 'Lugar Base para Patch', 'lugar-base-patch', 'cultura', 'Base', true,
          'https://cdn.vayaplan.com/places/patch-base.webp',
          'Autor Inicial',
          'https://commons.wikimedia.org/wiki/File:Inicial.jpg',
          'CC BY 4.0',
          'https://creativecommons.org/licenses/by/4.0/',
          'Recortada'
        ) RETURNING id;
      `);
      targetPlaceId = res.rows[0].id;
      createdPlaceIds.push(targetPlaceId);
    });

    test('actualización parcial conserva campos omitidos (merged state)', async () => {
      const res = await app.request(`/api/v1/admin/places/${targetPlaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          image_modifications: 'Nueva versión 2026',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.place.image_author).toBe('Autor Inicial');
      expect(data.place.image_modifications).toBe('Nueva versión 2026');
    });

    test('permite limpiar explícitamente la atribución enviando nulls', async () => {
      const res = await app.request(`/api/v1/admin/places/${targetPlaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          image_author: null,
          image_source_url: null,
          image_license: null,
          image_license_url: null,
          image_modifications: null,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.place.image_author).toBeNull();
      expect(data.place.image_source_url).toBeNull();
      expect(data.place.image_license).toBeNull();
      expect(data.place.image_url).toBe('https://cdn.vayaplan.com/places/patch-base.webp');
    });

    test('al eliminar la imagen (image_url = null) se autolimpia la atribución residual', async () => {
      // Re-establecer atribución previa
      await testPool.query(`
        UPDATE places
        SET image_author = 'Autor Temporal',
            image_source_url = 'https://commons.wikimedia.org/test',
            image_license = 'CC BY 4.0',
            image_license_url = 'https://creativecommons.org/licenses/by/4.0/'
        WHERE id = $1;
      `, [targetPlaceId]);

      // Enviar solo image_url: null sin campos contradictorios
      const res = await app.request(`/api/v1/admin/places/${targetPlaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          image_url: null,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.place.image_url).toBeNull();
      expect(data.place.image_author).toBeNull();
      expect(data.place.image_source_url).toBeNull();
    });

    test('rechaza si se elimina la imagen pero se intenta añadir atribución al mismo tiempo (400)', async () => {
      const res = await app.request(`/api/v1/admin/places/${targetPlaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          image_url: null,
          image_author: 'Nuevo Autor Incoherente',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_attribution');
    });
  });

  describe('4. Serialización en Endpoints Públicos', () => {
    let placeWithoutAttrId: number;
    let placeWithAttrId: number;

    beforeAll(async () => {
      const p1 = await testPool.query(`
        INSERT INTO places (
          city_id, name, slug, category, highlight_text, is_active,
          image_url
        ) VALUES (
          1, 'Cine Ortega Synthetic Test', 'cine-ortega-synthetic', 'cine', 'Cine clásico', true,
          'https://cdn.vayaplan.com/places/cine-ortega.webp'
        ) RETURNING id;
      `);
      placeWithoutAttrId = p1.rows[0].id;
      createdPlaceIds.push(placeWithoutAttrId);

      const p2 = await testPool.query(`
        INSERT INTO places (
          city_id, name, slug, category, highlight_text, is_active,
          image_url, image_author, image_source_url, image_license, image_license_url, image_modifications
        ) VALUES (
          1, 'Museo Palencia Synthetic Test', 'museo-palencia-synthetic', 'museo', 'Museo arqueológico', true,
          'https://cdn.vayaplan.com/places/museo.webp',
          'José Luis Filpo Cabana',
          'https://commons.wikimedia.org/wiki/File:Museo.jpg',
          'CC BY 4.0',
          'https://creativecommons.org/licenses/by/4.0/',
          'WebP optimizado'
        ) RETURNING id;
      `);
      placeWithAttrId = p2.rows[0].id;
      createdPlaceIds.push(placeWithAttrId);
    });

    test('GET /api/v1/cities/palencia/places serializa image_attribution adecuadamente', async () => {
      const res = await app.request('/api/v1/cities/palencia/places');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.places)).toBe(true);

      const itemWithout = data.places.find((p: any) => p.id === placeWithoutAttrId);
      expect(itemWithout).toBeDefined();
      expect(itemWithout.image_attribution).toBeNull();

      const itemWith = data.places.find((p: any) => p.id === placeWithAttrId);
      expect(itemWith).toBeDefined();
      expect(itemWith.image_attribution).not.toBeNull();
      expect(itemWith.image_attribution.author).toBe('José Luis Filpo Cabana');
      expect(itemWith.image_attribution.source_url).toBe('https://commons.wikimedia.org/wiki/File:Museo.jpg');
      expect(itemWith.image_attribution.license).toBe('CC BY 4.0');
      expect(itemWith.image_attribution.license_url).toBe('https://creativecommons.org/licenses/by/4.0/');
      expect(itemWith.image_attribution.modifications).toBe('WebP optimizado');
    });

    test('GET /api/v1/cities/palencia/events serializa places con la misma estructura', async () => {
      const res = await app.request('/api/v1/cities/palencia/events?date=2026-11-20');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.places)).toBe(true);

      const itemWith = data.places.find((p: any) => p.id === placeWithAttrId);
      expect(itemWith).toBeDefined();
      expect(itemWith.image_attribution).not.toBeNull();
      expect(itemWith.image_attribution.author).toBe('José Luis Filpo Cabana');
    });

    test('GET /api/v1/cities/palencia/weekend serializa places con la misma estructura', async () => {
      const res = await app.request('/api/v1/cities/palencia/weekend');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.places)).toBe(true);

      const itemWith = data.places.find((p: any) => p.id === placeWithAttrId);
      expect(itemWith).toBeDefined();
      expect(itemWith.image_attribution).not.toBeNull();
      expect(itemWith.image_attribution.license).toBe('CC BY 4.0');
    });
  });
});
