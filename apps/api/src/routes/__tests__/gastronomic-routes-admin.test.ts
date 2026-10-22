import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { sign } from 'hono/jwt';
import { JWT_SECRET } from '../../middleware/auth';

const rawTestDbUrl = process.env.TEST_DATABASE_URL;
if (!rawTestDbUrl) {
  throw new Error('TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.');
}

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../index');
const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

describe('API Administrativa — Rutas Gastronómicas (/api/v1/admin/routes)', () => {
  let adminToken: string;
  let nonAdminToken: string;
  const invalidToken = 'token.invalido.falso';

  let testCityId: number;
  let otherCityId: number;

  let venuePalencia1: number;
  let venuePalencia2: number;
  let venuePalencia3: number;
  let venuePalenciaInactive: number;
  let venueOtherCity: number;

  const createdRouteIds: number[] = [];
  const createdVenueIds: number[] = [];
  const createdCityIds: number[] = [];

  beforeAll(async () => {
    // 1. Tokens de autenticación
    adminToken = await sign(
      { email: 'admin-routes-test@vayaplan.com', role: 'admin' },
      JWT_SECRET,
      'HS256'
    );

    nonAdminToken = await sign(
      { email: 'user-regular@vayaplan.com', role: 'user' },
      JWT_SECRET,
      'HS256'
    );

    // 2. Ciudad base (Palencia = 1) y ciudad secundaria para pruebas de aislamiento
    testCityId = 1;

    await testPool.query(`SELECT setval('cities_id_seq', (SELECT MAX(id) FROM cities));`);

    const cityRes = await testPool.query(`
      INSERT INTO cities (name, slug, timezone, is_active)
      VALUES ('Valladolid Admin Test', 'valladolid-admin-test', 'Europe/Madrid', true)
      RETURNING id;
    `);
    otherCityId = cityRes.rows[0].id;
    createdCityIds.push(otherCityId);

    // 3. Crear locales para Palencia
    const v1 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar Adm 1 Test', 'bar-adm-1-test', 'C/ Mayor 1', 42.0090, -4.5320, true, now(), now())
      RETURNING id;
    `);
    venuePalencia1 = v1.rows[0].id;
    createdVenueIds.push(venuePalencia1);

    const v2 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar Adm 2 Test', 'bar-adm-2-test', 'C/ Mayor 2', 42.0091, -4.5321, true, now(), now())
      RETURNING id;
    `);
    venuePalencia2 = v2.rows[0].id;
    createdVenueIds.push(venuePalencia2);

    const v3 = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar Adm 3 Test', 'bar-adm-3-test', 'C/ Mayor 3', 42.0092, -4.5322, true, now(), now())
      RETURNING id;
    `);
    venuePalencia3 = v3.rows[0].id;
    createdVenueIds.push(venuePalencia3);

    const vInact = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES (1, 'Bar Inactivo Test', 'bar-inactivo-test', 'C/ Mayor 99', 42.0099, -4.5329, false, now(), now())
      RETURNING id;
    `);
    venuePalenciaInactive = vInact.rows[0].id;
    createdVenueIds.push(venuePalenciaInactive);

    // 4. Crear local en la otra ciudad
    const vOther = await testPool.query(`
      INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
      VALUES ($1, 'Bar Otra Ciudad Test', 'bar-otra-ciudad-test', 'Plaza Mayor 1', 41.6523, -4.7245, true, now(), now())
      RETURNING id;
    `, [otherCityId]);
    venueOtherCity = vOther.rows[0].id;
    createdVenueIds.push(venueOtherCity);
  });

  afterAll(async () => {
    // Limpieza de datos sintéticos
    if (createdRouteIds.length > 0) {
      await testPool.query(`DELETE FROM gastronomic_routes WHERE id = ANY($1::int[]);`, [createdRouteIds]);
    }
    if (createdVenueIds.length > 0) {
      await testPool.query(`DELETE FROM venues WHERE id = ANY($1::int[]);`, [createdVenueIds]);
    }
    if (createdCityIds.length > 0) {
      await testPool.query(`DELETE FROM cities WHERE id = ANY($1::int[]);`, [createdCityIds]);
    }
    await testPool.end();
  });

  // ============================================================================
  // 1. AUTENTICACIÓN Y CONTROL DE ACCESO
  // ============================================================================
  describe('1. Autenticación y Autorización', () => {
    test('401 sin token de autenticación', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes`, {
        method: 'GET',
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('unauthorized');
    });

    test('401 con token inválido', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${invalidToken}`,
        },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('unauthorized');
    });

    test('401 con token de rol no admin', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${nonAdminToken}`,
        },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('unauthorized');
    });
  });

  // ============================================================================
  // 2. LISTADO ADMINISTRATIVO
  // ============================================================================
  describe('2. Listado Administrativo (GET /api/v1/admin/cities/:cityId/routes)', () => {
    let listDraftRouteId: number;
    let listPublishedRouteId: number;
    let listArchivedRouteId: number;

    beforeAll(async () => {
      // Crear una de cada estado para comprobar filtros
      const rDraft = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Listado Borrador', 'ruta-listado-borrador', 'Sumario borrador', 'tapas', 'draft')
        RETURNING id;
      `);
      listDraftRouteId = rDraft.rows[0].id;
      createdRouteIds.push(listDraftRouteId);

      const rPub = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Listado Publicada', 'ruta-listado-publicada', 'Sumario publicada', 'bravas', 'published')
        RETURNING id;
      `);
      listPublishedRouteId = rPub.rows[0].id;
      createdRouteIds.push(listPublishedRouteId);

      const rArch = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Listado Archivada', 'ruta-listado-archivada', 'Sumario archivada', 'vino', 'archived')
        RETURNING id;
      `);
      listArchivedRouteId = rArch.rows[0].id;
      createdRouteIds.push(listArchivedRouteId);

      // Añadir participantes a la publicada para verificar participants_count
      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name)
        VALUES 
          ($1, $2, 1, 'Tapa 1'),
          ($1, $3, 2, 'Tapa 2');
      `, [listPublishedRouteId, venuePalencia1, venuePalencia2]);
    });

    test('Lista todas las rutas por defecto (status=all) incluyendo draft, published y archived', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.routes)).toBe(true);

      const ids = data.routes.map((r: any) => r.id);
      expect(ids).toContain(listDraftRouteId);
      expect(ids).toContain(listPublishedRouteId);
      expect(ids).toContain(listArchivedRouteId);

      // Comprobar que no expone display_order en las rutas
      for (const r of data.routes) {
        expect(r.display_order).toBeUndefined();
      }
    });

    test('Filtra correctamente por status=published y devuelve participants_count', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes?status=published`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.routes.every((r: any) => r.status === 'published')).toBe(true);

      const target = data.routes.find((r: any) => r.id === listPublishedRouteId);
      expect(target).toBeDefined();
      expect(target.participants_count).toBe(2);
    });

    test('Filtra correctamente por status=draft', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes?status=draft`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.routes.every((r: any) => r.status === 'draft')).toBe(true);
      expect(data.routes.some((r: any) => r.id === listDraftRouteId)).toBe(true);
    });

    test('Filtra correctamente por status=archived', async () => {
      const res = await app.request(`/api/v1/admin/cities/${testCityId}/routes?status=archived`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.routes.every((r: any) => r.status === 'archived')).toBe(true);
      expect(data.routes.some((r: any) => r.id === listArchivedRouteId)).toBe(true);
    });
  });

  // ============================================================================
  // 3. CREACIÓN DE RUTA
  // ============================================================================
  describe('3. Creación de Ruta (POST /api/v1/admin/routes)', () => {
    test('201 crea ruta en estado draft con participants []', async () => {
      const payload = {
        city_id: testCityId,
        title: 'Ruta Creación Test',
        slug: 'ruta-creacion-test',
        summary: 'Resumen editorial de prueba',
        description: 'Descripción amplia con historia',
        category: 'bravas',
        badge_label: 'Top Otoño',
        start_date: '2026-11-01',
        end_date: '2026-11-15',
        approximate_price_cents: 650,
        image_url: 'https://images.vayaplan.com/routes/creacion.jpg',
      };

      const res = await app.request('/api/v1/admin/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeDefined();
      createdRouteIds.push(data.id);
      expect(data.status).toBe('draft');
      expect(data.slug).toBe('ruta-creacion-test');
      expect(data.category).toBe('bravas');
      expect(data.approximate_price_cents).toBe(650);
      expect(Array.isArray(data.participants)).toBe(true);
      expect(data.participants.length).toBe(0);
    });

    test('409 rechaza slug duplicado en la misma ciudad', async () => {
      const payload = {
        city_id: testCityId,
        title: 'Ruta Colisión Slug',
        slug: 'ruta-creacion-test', // Ya creado en el test anterior
        summary: 'Intento de colisión',
        category: 'tapas',
      };

      const res = await app.request('/api/v1/admin/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('route_slug_conflict');
    });

    test('Rechazo de categoría inválida (400)', async () => {
      const payload = {
        city_id: testCityId,
        title: 'Ruta Categoría Inválida',
        slug: 'ruta-cat-invalida',
        summary: 'Sumario',
        category: 'hamburguesas_gourmet', // No está en VALID_GASTRONOMIC_ROUTE_CATEGORIES
      };

      const res = await app.request('/api/v1/admin/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_category');
    });

    test('Rechazo de fechas inválidas (end_date < start_date) (400)', async () => {
      const payload = {
        city_id: testCityId,
        title: 'Ruta Fechas Invertidas',
        slug: 'ruta-fechas-invertidas',
        summary: 'Sumario',
        category: 'tapas',
        start_date: '2026-12-01',
        end_date: '2026-11-01',
      };

      const res = await app.request('/api/v1/admin/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });

    test('Rechazo de precio aproximado negativo (400)', async () => {
      const payload = {
        city_id: testCityId,
        title: 'Ruta Precio Negativo',
        slug: 'ruta-precio-negativo',
        summary: 'Sumario',
        category: 'tapas',
        approximate_price_cents: -200,
      };

      const res = await app.request('/api/v1/admin/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });
  });

  // ============================================================================
  // 4. DETALLE Y EDICIÓN (GET y PATCH /api/v1/admin/routes/:id)
  // ============================================================================
  describe('4. Detalle y Edición (GET y PATCH /api/v1/admin/routes/:id)', () => {
    let testRouteId: number;

    beforeAll(async () => {
      const r = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Detalle y Patch', 'ruta-detalle-y-patch', 'Sumario original', 'tapas', 'draft')
        RETURNING id;
      `);
      testRouteId = r.rows[0].id;
      createdRouteIds.push(testRouteId);

      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, dish_price_cents, is_active)
        VALUES ($1, $2, 1, 'Tapa Original', 300, true);
      `, [testRouteId, venuePalencia1]);
    });

    test('GET 200 devuelve detalle con participantes y venue resumido', async () => {
      const res = await app.request(`/api/v1/admin/routes/${testRouteId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(testRouteId);
      expect(data.title).toBe('Ruta Detalle y Patch');
      expect(data.participants.length).toBe(1);

      const p1 = data.participants[0];
      expect(p1.display_order).toBe(1);
      expect(p1.dish_name).toBe('Tapa Original');
      expect(p1.dish_price_cents).toBe(300);
      expect(p1.venue).toBeDefined();
      expect(p1.venue.id).toBe(venuePalencia1);
      expect(p1.venue.name).toBe('Bar Adm 1 Test');
      expect(p1.venue.slug).toBe('bar-adm-1-test');
      expect(p1.venue.google_maps_url).toBeDefined();
    });

    test('PATCH actualiza campos permitidos (title, summary, category, badge_label)', async () => {
      const patchPayload = {
        title: 'Ruta Detalle Actualizada',
        summary: 'Sumario actualizado tras edición',
        category: 'reposteria',
        badge_label: 'Edición Limitada',
      };

      const res = await app.request(`/api/v1/admin/routes/${testRouteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(patchPayload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBe('Ruta Detalle Actualizada');
      expect(data.summary).toBe('Sumario actualizado tras edición');
      expect(data.category).toBe('reposteria');
      expect(data.badge_label).toBe('Edición Limitada');
    });

    test('PATCH rechaza terminantemente cambio de status (400)', async () => {
      const res = await app.request(`/api/v1/admin/routes/${testRouteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'published' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });

    test('PATCH 409 si el nuevo slug colisiona con otra ruta de la misma ciudad', async () => {
      // Creamos otra ruta para probar colisión
      const r2 = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Colisión B', 'ruta-colision-b', 'Sumario B', 'tapas', 'draft')
        RETURNING id;
      `);
      createdRouteIds.push(r2.rows[0].id);

      const res = await app.request(`/api/v1/admin/routes/${testRouteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ slug: 'ruta-colision-b' }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('route_slug_conflict');
    });
  });

  // ============================================================================
  // 5. GESTIÓN ATÓMICA DE PARTICIPANTES (PUT /api/v1/admin/routes/:id/participants)
  // ============================================================================
  describe('5. Gestión Atómica de Participantes (PUT /api/v1/admin/routes/:id/participants)', () => {
    let participantRouteId: number;

    beforeAll(async () => {
      const r = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Gestión Participantes', 'ruta-gestion-participantes', 'Sumario', 'tapas', 'draft')
        RETURNING id;
      `);
      participantRouteId = r.rows[0].id;
      createdRouteIds.push(participantRouteId);

      // Estado inicial: 1 participante
      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name)
        VALUES ($1, $2, 1, 'Tapa Antigua');
      `, [participantRouteId, venuePalencia1]);
    });

    test('Reemplazo atómico correcto y dish_image_url opcional', async () => {
      const payload = {
        participants: [
          {
            venue_id: venuePalencia2,
            display_order: 1,
            dish_name: 'Tapa Nueva 1',
            dish_price_cents: 250,
            dish_image_url: 'https://images.vayaplan.com/dish1.jpg',
            is_active: true,
          },
          {
            venue_id: venuePalencia3,
            display_order: 2,
            dish_name: 'Tapa Nueva 2 (sin imagen)',
            dish_price_cents: null,
            dish_image_url: null, // Opcional
            is_active: true,
          },
        ],
      };

      const res = await app.request(`/api/v1/admin/routes/${participantRouteId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.participants.length).toBe(2);

      const p1 = data.participants.find((p: any) => p.display_order === 1);
      expect(p1.dish_name).toBe('Tapa Nueva 1');
      expect(p1.venue_id).toBe(venuePalencia2);
      expect(p1.dish_image_url).toBe('https://images.vayaplan.com/dish1.jpg');

      const p2 = data.participants.find((p: any) => p.display_order === 2);
      expect(p2.dish_name).toBe('Tapa Nueva 2 (sin imagen)');
      expect(p2.venue_id).toBe(venuePalencia3);
      expect(p2.dish_image_url).toBeNull();
    });

    test('Rechazo de venue de otra ciudad (400)', async () => {
      const payload = {
        participants: [
          {
            venue_id: venuePalencia1,
            display_order: 1,
            dish_name: 'Tapa Palencia',
          },
          {
            venue_id: venueOtherCity, // Pertenece a otherCityId
            display_order: 2,
            dish_name: 'Tapa de otra ciudad',
          },
        ],
      };

      const res = await app.request(`/api/v1/admin/routes/${participantRouteId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });

    test('Rechazo de venue duplicado (400)', async () => {
      const payload = {
        participants: [
          {
            venue_id: venuePalencia1,
            display_order: 1,
            dish_name: 'Tapa A',
          },
          {
            venue_id: venuePalencia1, // Duplicado
            display_order: 2,
            dish_name: 'Tapa B',
          },
        ],
      };

      const res = await app.request(`/api/v1/admin/routes/${participantRouteId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });

    test('Rechazo de display_order duplicado (400)', async () => {
      const payload = {
        participants: [
          {
            venue_id: venuePalencia1,
            display_order: 1,
            dish_name: 'Tapa A',
          },
          {
            venue_id: venuePalencia2,
            display_order: 1, // Duplicado display_order
            dish_name: 'Tapa B',
          },
        ],
      };

      const res = await app.request(`/api/v1/admin/routes/${participantRouteId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });

    test('Rechazo de display_order no correlativo (400)', async () => {
      const payload = {
        participants: [
          {
            venue_id: venuePalencia1,
            display_order: 1,
            dish_name: 'Tapa A',
          },
          {
            venue_id: venuePalencia2,
            display_order: 3, // Salto a 3 sin haber 2
            dish_name: 'Tapa B',
          },
        ],
      };

      const res = await app.request(`/api/v1/admin/routes/${participantRouteId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_parameter');
    });

    test('Rollback garantizado si falla una validación en transacción', async () => {
      // Tomamos el conteo de participantes actual
      const beforeRes = await testPool.query(`
        SELECT COUNT(*)::int as count FROM gastronomic_route_participants WHERE route_id = $1;
      `, [participantRouteId]);
      const initialCount = beforeRes.rows[0].count;

      // Payload que incluye un venue que no existe (ej. 999999)
      const payload = {
        participants: [
          {
            venue_id: venuePalencia1,
            display_order: 1,
            dish_name: 'Tapa Válida',
          },
          {
            venue_id: 999999, // Inexistente
            display_order: 2,
            dish_name: 'Tapa Inexistente',
          },
        ],
      };

      const res = await app.request(`/api/v1/admin/routes/${participantRouteId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);

      // Verificamos que la BD hizo rollback y conserva los participantes previos
      const afterRes = await testPool.query(`
        SELECT COUNT(*)::int as count FROM gastronomic_route_participants WHERE route_id = $1;
      `, [participantRouteId]);
      expect(afterRes.rows[0].count).toBe(initialCount);
    });
  });

  // ============================================================================
  // 6. PUBLICACIÓN (POST /api/v1/admin/routes/:id/publish)
  // ============================================================================
  describe('6. Publicación (POST /api/v1/admin/routes/:id/publish)', () => {
    let publishRouteId: number;

    beforeAll(async () => {
      const r = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Prueba Publicar', 'ruta-prueba-publicar', 'Sumario', 'tapas', 'draft')
        RETURNING id;
      `);
      publishRouteId = r.rows[0].id;
      createdRouteIds.push(publishRouteId);
    });

    test('422 con error insufficient_stops si tiene menos de 2 participantes válidos', async () => {
      // 1 solo participante
      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, is_active)
        VALUES ($1, $2, 1, 'Tapa Única', true);
      `, [publishRouteId, venuePalencia1]);

      const res = await app.request(`/api/v1/admin/routes/${publishRouteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe('insufficient_stops');
    });

    test('422 si tiene 2 participantes pero uno de los locales está inactivo', async () => {
      // Añadir segundo participante con venuePalenciaInactive
      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, is_active)
        VALUES ($1, $2, 2, 'Tapa Local Cerrado', true);
      `, [publishRouteId, venuePalenciaInactive]);

      const res = await app.request(`/api/v1/admin/routes/${publishRouteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe('insufficient_stops');
    });

    test('200 y status published con 2 participantes válidos y activos', async () => {
      // Reemplazamos el participante inactivo por un venuePalencia2 activo
      await testPool.query(`
        UPDATE gastronomic_route_participants 
        SET venue_id = $1 
        WHERE route_id = $2 AND display_order = 2;
      `, [venuePalencia2, publishRouteId]);

      const res = await app.request(`/api/v1/admin/routes/${publishRouteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('published');
    });

    test('Rechazo 400 si ya está published', async () => {
      const res = await app.request(`/api/v1/admin/routes/${publishRouteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_status_transition');
    });
  });

  // ============================================================================
  // 7. ARCHIVADO (POST /api/v1/admin/routes/:id/archive)
  // ============================================================================
  describe('7. Archivado (POST /api/v1/admin/routes/:id/archive)', () => {
    let archiveRouteDraftId: number;
    let archiveRoutePublishedId: number;

    beforeAll(async () => {
      const r1 = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Archivo Borrador', 'ruta-archivo-borrador', 'Sumario', 'tapas', 'draft')
        RETURNING id;
      `);
      archiveRouteDraftId = r1.rows[0].id;
      createdRouteIds.push(archiveRouteDraftId);

      const r2 = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Archivo Publicada', 'ruta-archivo-publicada', 'Sumario', 'tapas', 'published')
        RETURNING id;
      `);
      archiveRoutePublishedId = r2.rows[0].id;
      createdRouteIds.push(archiveRoutePublishedId);

      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name)
        VALUES 
          ($1, $2, 1, 'Tapa Uno'),
          ($1, $3, 2, 'Tapa Dos');
      `, [archiveRoutePublishedId, venuePalencia1, venuePalencia2]);
    });

    test('Rechazo 400 desde draft', async () => {
      const res = await app.request(`/api/v1/admin/routes/${archiveRouteDraftId}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_status_transition');
    });

    test('200 transiciona a archived desde published y conserva participantes', async () => {
      const res = await app.request(`/api/v1/admin/routes/${archiveRoutePublishedId}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('archived');
      expect(data.participants.length).toBe(2);

      // Verificar en BD que los participantes y venues siguen intactos
      const dbCheck = await testPool.query(`
        SELECT COUNT(*)::int as count FROM gastronomic_route_participants WHERE route_id = $1;
      `, [archiveRoutePublishedId]);
      expect(dbCheck.rows[0].count).toBe(2);
    });

    test('Rechazo 400 al intentar publicar una ruta ya archivada', async () => {
      const res = await app.request(`/api/v1/admin/routes/${archiveRoutePublishedId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid_status_transition');
    });
  });

  // ============================================================================
  // 8. PREVIEW ADMINISTRATIVO (GET /api/v1/admin/routes/:id/preview)
  // ============================================================================
  describe('8. Previsualización (GET /api/v1/admin/routes/:id/preview)', () => {
    let previewDraftRouteId: number;
    let previewArchivedRouteId: number;

    beforeAll(async () => {
      // Ruta borrador con 1 participante activo y 1 inactivo
      const rDraft = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status, start_date, end_date)
        VALUES (1, 'Ruta Preview Borrador', 'ruta-preview-borrador', 'Sumario borrador', 'puchero', 'draft', '2026-11-01', '2026-11-30')
        RETURNING id;
      `);
      previewDraftRouteId = rDraft.rows[0].id;
      createdRouteIds.push(previewDraftRouteId);

      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, dish_price_cents, is_active)
        VALUES 
          ($1, $2, 1, 'Guiso de la Abuela Activo', 750, true),
          ($1, $3, 2, 'Guiso Inactivo de Test', 800, false),
          ($1, $4, 3, 'Guiso de Local Inactivo', 900, true);
      `, [previewDraftRouteId, venuePalencia1, venuePalencia2, venuePalenciaInactive]);

      // Ruta archivada
      const rArchived = await testPool.query(`
        INSERT INTO gastronomic_routes (city_id, title, slug, summary, category, status)
        VALUES (1, 'Ruta Preview Archivada', 'ruta-preview-archivada', 'Sumario archivado', 'vino', 'archived')
        RETURNING id;
      `);
      previewArchivedRouteId = rArchived.rows[0].id;
      createdRouteIds.push(previewArchivedRouteId);

      await testPool.query(`
        INSERT INTO gastronomic_route_participants (route_id, venue_id, display_order, dish_name, dish_price_cents, is_active)
        VALUES 
          ($1, $2, 1, 'Copa de Vino Activa', 350, true);
      `, [previewArchivedRouteId, venuePalencia1]);
    });

    test('200 para ruta en draft y devuelve el status real "draft"', async () => {
      const res = await app.request(`/api/v1/admin/routes/${previewDraftRouteId}/preview`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.route).toBeDefined();
      expect(data.route.id).toBe(previewDraftRouteId);
      expect(data.route.status).toBe('draft');
      expect(data.route.city).toBeDefined();
      expect(data.route.city.slug).toBe('palencia');
      expect(data.route.is_permanent).toBe(false); // Tiene fechas

      // Filtra participantes inválidos: solo 1 de los 3 es activo con local activo
      expect(data.route.participants.length).toBe(1);
      const p = data.route.participants[0];
      expect(p.dish.name).toBe('Guiso de la Abuela Activo');
      expect(p.dish.price_cents).toBe(750);
      expect(p.dish.price_label).toBe('7,50 €');
      expect(p.venue.name).toBe('Bar Adm 1 Test');

      // No expone display_order
      expect((p as any).display_order).toBeUndefined();
      expect((data.route as any).display_order).toBeUndefined();
    });

    test('200 para ruta archivada y devuelve el status real "archived"', async () => {
      const res = await app.request(`/api/v1/admin/routes/${previewArchivedRouteId}/preview`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.route).toBeDefined();
      expect(data.route.id).toBe(previewArchivedRouteId);
      expect(data.route.status).toBe('archived');
      expect(data.route.is_permanent).toBe(true); // Sin fechas

      // No expone display_order
      expect((data.route.participants[0] as any).display_order).toBeUndefined();
    });
  });
});
