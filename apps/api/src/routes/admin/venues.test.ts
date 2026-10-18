import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { sign } from 'hono/jwt';
import { app } from '../../index';
import { JWT_SECRET } from '../../middleware/auth';

const testDbUrl = process.env.DATABASE_URL || process.env.VENUE_IMPORT_TEST_DB_URL;
if (!testDbUrl || (!testDbUrl.includes('test') && !testDbUrl.includes('synthetic'))) {
  console.error(
    'Error de seguridad preventiva: La base de datos objetivo debe ser sintética o de test.\n' +
      'Configura DATABASE_URL con la base de datos de pruebas (ej: vayaplan_import_synthetic).'
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: testDbUrl });
let adminToken: string;
let createdTestVenueId: number | null = null;
let venueWithDependenciesId: number | null = null;

beforeAll(async () => {
  // Generar token JWT administrativo válido
  adminToken = await sign(
    { email: 'admin-test@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  // Identificar un local existente con dependencias (eventos) en la base sintética
  const depRes = await pool.query<{ venue_id: number }>(
    `SELECT venue_id FROM events WHERE venue_id IS NOT NULL LIMIT 1;`
  );
  if (depRes.rows.length > 0) {
    venueWithDependenciesId = depRes.rows[0].venue_id;
  }
});

afterAll(async () => {
  if (createdTestVenueId) {
    await pool.query(`DELETE FROM venues WHERE id = $1`, [createdTestVenueId]);
  }
  await pool.end();
});

describe('1. Autenticación y Autorización en Venues Admin', () => {
  test('Rechaza peticiones GET sin cabecera de autenticación (401)', async () => {
    const res = await app.request('/api/v1/admin/venues');
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('unauthorized');
  });

  test('Rechaza peticiones DELETE sin autenticación (401)', async () => {
    const res = await app.request('/api/v1/admin/venues/1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('2. Listado de Locales y Paginación Server-Side', () => {
  test('Retorna respuesta estructurada con total, total_pages, page y limit', async () => {
    const res = await app.request('/api/v1/admin/venues?page=1&limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.total).toBe('number');
    expect(data.total).toBeGreaterThan(0);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(5);
    expect(typeof data.total_pages).toBe('number');
    expect(Array.isArray(data.venues)).toBe(true);
    expect(data.venues.length).toBeLessThanOrEqual(5);

    // Columnas necesarias
    const first = data.venues[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('city_name');
    expect(first).toHaveProperty('category');
    expect(first).toHaveProperty('phone');
    expect(first).toHaveProperty('whatsapp_contact');
    expect(first).toHaveProperty('is_active');
    expect(first).toHaveProperty('created_at');
  });

  test('Paginación server-side: la página 2 devuelve elementos distintos', async () => {
    const resP1 = await app.request('/api/v1/admin/venues?page=1&limit=3', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resP2 = await app.request('/api/v1/admin/venues?page=2&limit=3', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data1 = await resP1.json();
    const data2 = await resP2.json();
    expect(data1.venues.length).toBe(3);
    expect(data2.venues.length).toBe(3);
    expect(data1.venues[0].id).not.toBe(data2.venues[0].id);
  });

  test('Soporta all=true para compatibilidad de dropdowns de asignación', async () => {
    const res = await app.request('/api/v1/admin/venues?all=true', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venues.length).toBe(data.total);
    expect(data.venues.length).toBeGreaterThanOrEqual(50);
  });
});

describe('3. Búsqueda y Filtros de Locales', () => {
  test('Búsqueda por nombre encuentra el local', async () => {
    const res = await app.request('/api/v1/admin/venues?q=Teatro', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venues.length).toBeGreaterThan(0);
    expect(
      data.venues.some((v: any) => v.name.toLowerCase().includes('teatro') || v.address?.toLowerCase().includes('teatro'))
    ).toBe(true);
  });

  test('Filtro por presencia de WhatsApp (yes / no)', async () => {
    const resYes = await app.request('/api/v1/admin/venues?has_whatsapp=yes&limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataYes = await resYes.json();
    for (const v of dataYes.venues) {
      expect(v.whatsapp_contact).not.toBeNull();
      expect(v.whatsapp_contact.trim().length).toBeGreaterThan(0);
    }

    const resNo = await app.request('/api/v1/admin/venues?has_whatsapp=no&limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataNo = await resNo.json();
    for (const v of dataNo.venues) {
      expect(!v.whatsapp_contact || v.whatsapp_contact.trim() === '').toBe(true);
    }
  });

  test('Filtro por estado (active / inactive)', async () => {
    const resActive = await app.request('/api/v1/admin/venues?status=active&limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataActive = await resActive.json();
    for (const v of dataActive.venues) {
      expect(v.is_active).toBe(true);
    }
  });

  test('Ordenación por nombre, ciudad y fecha de creación', async () => {
    const resNameAsc = await app.request('/api/v1/admin/venues?sort_by=name&sort_order=asc&limit=10', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataNameAsc = await resNameAsc.json();
    if (dataNameAsc.venues.length >= 2) {
      expect(dataNameAsc.venues[0].name.localeCompare(dataNameAsc.venues[1].name)).toBeLessThanOrEqual(0);
    }

    const resCreatedDesc = await app.request('/api/v1/admin/venues?sort_by=created_at&sort_order=desc&limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataCreatedDesc = await resCreatedDesc.json();
    expect(dataCreatedDesc.venues.length).toBeGreaterThan(0);
  });
});

describe('4. Creación y Edición de Local (CRUD)', () => {
  test('Crea un local temporal con campos extendidos (categoría, teléfono, zona)', async () => {
    const newVenuePayload = {
      name: 'Local Sintético Temporal Test',
      address: 'Calle Ficticia 123',
      city_id: 1,
      phone: '+34 979 99 88 77',
      category: 'cafeteria',
      zone: 'centro',
      whatsapp_contact: '+34600998877',
      is_active: true,
    };

    const res = await app.request('/api/v1/admin/venues', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newVenuePayload),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.venue).toHaveProperty('id');
    expect(data.venue.name).toBe('Local Sintético Temporal Test');
    createdTestVenueId = data.venue.id;
  });

  test('Actualiza campos del local con PATCH', async () => {
    expect(createdTestVenueId).not.toBeNull();
    const updatePayload = {
      name: 'Local Sintético Temporal Renombrado',
      phone: '+34 979 00 11 22',
      category: 'restaurante',
    };

    const res = await app.request(`/api/v1/admin/venues/${createdTestVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.venue.name).toBe('Local Sintético Temporal Renombrado');
    expect(data.venue.phone).toBe('+34 979 00 11 22');
    expect(data.venue.category).toBe('restaurante');
  });
});

describe('5. Inspección Previa de Dependencias (GET /venues/:id/dependencies)', () => {
  test('Inspección de local provisional ID 9999 no está protegido por ID (is_protected=false)', async () => {
    const res = await app.request('/api/v1/admin/venues/9999/dependencies', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venue.id).toBe(9999);
    expect(data.is_protected).toBe(false);
  });

  test('Inspección de local con dependencias activas detecta dependencias y bloquea', async () => {
    if (!venueWithDependenciesId) return;
    const res = await app.request(`/api/v1/admin/venues/${venueWithDependenciesId}/dependencies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.has_dependencies).toBe(true);
    expect(data.can_delete).toBe(false);
    expect(data.dependencies.length).toBeGreaterThan(0);
  });

  test('Inspección de local sintético limpio sin dependencias autoriza el borrado (can_delete=true)', async () => {
    expect(createdTestVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${createdTestVenueId}/dependencies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.is_protected).toBe(false);
    expect(data.has_dependencies).toBe(false);
    expect(data.can_delete).toBe(true);
    expect(data.dependencies.length).toBe(0);
  });
});

describe('6. Borrado Seguro y Protegido (DELETE /venues/:id)', () => {
  test('Venue 9999 no está bloqueado por ID; si tiene dependencias, se rechaza con 409; si no las tiene, se autoriza el borrado', async () => {
    // 1. Asignar temporalmente una dependencia a 9999 para probar el bloqueo por dependencias
    const insertRes = await pool.query<{ id: number }>(
      `INSERT INTO events (city_id, venue_id, title, category, start_time, editorial_date, status, source_type)
       VALUES (1, 9999, 'Test Dependencia 9999', 'cultura', now(), CURRENT_DATE, 'tentative', 'manual')
       RETURNING id;`
    );
    const tempEventId = insertRes.rows[0].id;

    // Con dependencia activa, DELETE /venues/9999 debe responder 409 Conflict (no 403)
    const resBlocked = await app.request('/api/v1/admin/venues/9999', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resBlocked.status).toBe(409);
    const blockedData = await resBlocked.json();
    expect(blockedData.error).toBe('venue_has_dependencies');
    expect(blockedData.dependencies.length).toBeGreaterThan(0);

    // Retirar la dependencia temporal
    await pool.query(`DELETE FROM events WHERE id = $1;`, [tempEventId]);

    // Verificar dependencies de 9999 sin dependencias: can_delete = true
    const depRes = await app.request('/api/v1/admin/venues/9999/dependencies', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(depRes.status).toBe(200);
    const depData = await depRes.json();
    expect(depData.is_protected).toBe(false);
    expect(depData.can_delete).toBe(true);
  });

  test('Intento de borrado de local con dependencias activas es bloqueado con 409 Conflict', async () => {
    if (!venueWithDependenciesId) return;
    const res = await app.request(`/api/v1/admin/venues/${venueWithDependenciesId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('venue_has_dependencies');
    expect(Array.isArray(data.dependencies)).toBe(true);
    expect(data.dependencies.length).toBeGreaterThan(0);
  });

  test('Borrado de local inexistente devuelve 404', async () => {
    const res = await app.request('/api/v1/admin/venues/99999999', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);
  });

  test('Borrado transaccional de local limpio sin dependencias se ejecuta con éxito (200 OK)', async () => {
    expect(createdTestVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${createdTestVenueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.deleted_venue.id).toBe(createdTestVenueId);

    // Confirmar eliminación en la base de datos
    const checkRes = await pool.query(`SELECT id FROM venues WHERE id = $1`, [createdTestVenueId]);
    expect(checkRes.rows.length).toBe(0);
    createdTestVenueId = null; // ya fue borrado
  });
});

describe('7. Edición Completa de Locales y Soporte Facebook', () => {
  let fullVenueId: number | null = null;

  afterAll(async () => {
    if (fullVenueId) {
      await pool.query(`DELETE FROM venues WHERE id = $1`, [fullVenueId]);
    }
  });

  test('POST /api/v1/admin/venues crea un local con todos los campos incluyendo facebook_url', async () => {
    const payload = {
      name: 'Local Completo Facebook Test',
      slug: 'local-completo-facebook-test',
      city_id: 1,
      category: 'bar',
      zone: 'centro_puebla',
      is_active: true,
      address: 'Calle Mayor 45, Palencia',
      latitude: 42.0085587,
      longitude: -4.5295375,
      google_maps_url: 'https://maps.google.com/?cid=12345',
      phone: '+34 979 11 22 33',
      whatsapp_contact: '+34600112233',
      website_url: 'https://www.localcompleto.com',
      instagram_handle: '@localcompleto',
      facebook_url: 'https://m.facebook.com/localcompleto/',
    };

    const res = await app.request('/api/v1/admin/venues', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.venue).toBeDefined();
    fullVenueId = data.venue.id;

    // Normalización de instagram (@ eliminado)
    expect(data.venue.instagram_handle).toBe('localcompleto');
    // Normalización de facebook (m.facebook.com -> www.facebook.com)
    expect(data.venue.facebook_url).toBe('https://www.facebook.com/localcompleto');
    expect(data.venue.website_url).toBe('https://www.localcompleto.com/');
    expect(data.venue.zone).toBe('centro_puebla');
    expect(Number(data.venue.latitude)).toBeCloseTo(42.0085587, 5);
    expect(Number(data.venue.longitude)).toBeCloseTo(-4.5295375, 5);
    expect(data.venue.is_active).toBe(true);
  });

  test('GET /api/v1/admin/venues devuelve facebook_url y website_url en el listado', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request('/api/v1/admin/venues?q=Local+Completo+Facebook+Test', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const venue = data.venues.find((v: any) => v.id === fullVenueId);
    expect(venue).toBeDefined();
    expect(venue.facebook_url).toBe('https://www.facebook.com/localcompleto');
    expect(venue.website_url).toBe('https://www.localcompleto.com/');
  });

  test('Rechaza URL de Facebook en website_url con 400 y código facebook_url_required', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        website_url: 'https://www.facebook.com/mi-local-fb',
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('facebook_url_required');
    expect(data.message).toContain('facebook_url');
  });

  test('PATCH normaliza subdominios regionales (es-la., es-es.) y apex a www.facebook.com', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        facebook_url: 'https://es-la.facebook.com/Agora-Palencia-1704363213143529/',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venue.facebook_url).toBe('https://www.facebook.com/Agora-Palencia-1704363213143529');
  });

  test('Rechaza dominio no perteneciente a facebook.com en facebook_url', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        facebook_url: 'https://www.otra-web.com/perfil',
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_parameter');
    expect(data.message).toContain('Facebook');
  });

  test('Rechaza subdominio de Facebook en website_url con 400 y código facebook_url_required', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        website_url: 'https://es-es.facebook.com/ElPortalPalencia/',
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('facebook_url_required');
    expect(data.message).toContain('facebook_url');
  });

  test('Rechaza coordenadas inválidas (latitud fuera de rango)', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: 999.99,
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_parameter');
  });

  test('Rechaza coordenadas inválidas (longitud fuera de rango)', async () => {
    expect(fullVenueId).not.toBeNull();
    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        longitude: -200.5,
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_parameter');
  });

  test('PATCH actualiza y vacía campos explícitamente a null', async () => {
    expect(fullVenueId).not.toBeNull();
    const clearPayload = {
      website_url: null,
      facebook_url: null,
      instagram_handle: null,
      phone: null,
      whatsapp_contact: null,
      google_maps_url: null,
      zone: null,
      category: null,
      latitude: null,
      longitude: null,
      is_active: false,
    };

    const res = await app.request(`/api/v1/admin/venues/${fullVenueId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clearPayload),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.venue.website_url).toBeNull();
    expect(data.venue.facebook_url).toBeNull();
    expect(data.venue.instagram_handle).toBeNull();
    expect(data.venue.phone).toBeNull();
    expect(data.venue.whatsapp_contact).toBeNull();
    expect(data.venue.google_maps_url).toBeNull();
    expect(data.venue.latitude).toBeNull();
    expect(data.venue.longitude).toBeNull();
    expect(data.venue.is_active).toBe(false);

    // Comprobación directa en BD
    const dbRes = await pool.query(
      `SELECT website_url, facebook_url, instagram_handle, is_active FROM venues WHERE id = $1`,
      [fullVenueId]
    );
    expect(dbRes.rows[0].website_url).toBeNull();
    expect(dbRes.rows[0].facebook_url).toBeNull();
    expect(dbRes.rows[0].instagram_handle).toBeNull();
    expect(dbRes.rows[0].is_active).toBe(false);
  });
});

describe('8. Migración y Rollback DML (transition_facebook_urls.sql y rollback)', () => {
  let syntheticFbVenueId: number | null = null;
  let syntheticOwnVenueId: number | null = null;
  const originalFbUrl = 'https://es-la.facebook.com/Agora-Palencia-1704363213143529/';
  const originalOwnUrl = 'https://www.barpropia.es/';

  beforeAll(async () => {
    // Crear local con URL de Facebook en website_url
    const fbRes = await pool.query<{ id: number }>(`
      INSERT INTO venues (city_id, name, slug, website_url, is_active)
      VALUES (1, 'Bar Migracion FB Test', 'bar-migracion-fb-test', $1, true)
      RETURNING id;
    `, [originalFbUrl]);
    syntheticFbVenueId = fbRes.rows[0].id;

    // Crear local con web propia en website_url
    const ownRes = await pool.query<{ id: number }>(`
      INSERT INTO venues (city_id, name, slug, website_url, is_active)
      VALUES (1, 'Bar Migracion Web Propia Test', 'bar-migracion-web-propia-test', $1, true)
      RETURNING id;
    `, [originalOwnUrl]);
    syntheticOwnVenueId = ownRes.rows[0].id;
  });

  afterAll(async () => {
    if (syntheticFbVenueId) {
      await pool.query(`DELETE FROM venues WHERE id = $1`, [syntheticFbVenueId]);
    }
    if (syntheticOwnVenueId) {
      await pool.query(`DELETE FROM venues WHERE id = $1`, [syntheticOwnVenueId]);
    }
  });

  test('La lógica de transición migra y normaliza Facebook y preserva la web propia', async () => {
    // Ejecutar lógica de transición en la BD de pruebas
    await pool.query(`
      UPDATE venues
      SET facebook_url = REGEXP_REPLACE(website_url, '^https?://([a-zA-Z0-9-]+\\.)*facebook\\.com/', 'https://www.facebook.com/'),
          website_url = NULL
      WHERE website_url ~* '^(https?://)?([a-zA-Z0-9-]+\\.)*facebook\\.com(/|$)';
    `);

    // 1. Local de Facebook: website_url -> NULL, facebook_url -> poblado y normalizado
    const checkFb = await pool.query(
      `SELECT website_url, facebook_url FROM venues WHERE id = $1`,
      [syntheticFbVenueId]
    );
    expect(checkFb.rows[0].website_url).toBeNull();
    expect(checkFb.rows[0].facebook_url).toBe('https://www.facebook.com/Agora-Palencia-1704363213143529/');

    // 2. Local con web propia: website_url intacto, facebook_url -> NULL
    const checkOwn = await pool.query(
      `SELECT website_url, facebook_url FROM venues WHERE id = $1`,
      [syntheticOwnVenueId]
    );
    expect(checkOwn.rows[0].website_url).toBe(originalOwnUrl);
    expect(checkOwn.rows[0].facebook_url).toBeNull();
  });

  test('La lógica de reversión restaura website_url, limpia facebook_url y no altera webs propias', async () => {
    // Ejecutar lógica de rollback generada
    await pool.query(`
      UPDATE venues
      SET website_url = facebook_url,
          facebook_url = NULL
      WHERE id = $1
        AND website_url IS NULL
        AND facebook_url IS NOT NULL;
    `, [syntheticFbVenueId]);

    // 1. Local de Facebook revertido
    const checkFb = await pool.query(
      `SELECT website_url, facebook_url FROM venues WHERE id = $1`,
      [syntheticFbVenueId]
    );
    expect(checkFb.rows[0].website_url).toBe('https://www.facebook.com/Agora-Palencia-1704363213143529/');
    expect(checkFb.rows[0].facebook_url).toBeNull();

    // 2. Local con web propia sigue intacto
    const checkOwn = await pool.query(
      `SELECT website_url, facebook_url FROM venues WHERE id = $1`,
      [syntheticOwnVenueId]
    );
    expect(checkOwn.rows[0].website_url).toBe(originalOwnUrl);
    expect(checkOwn.rows[0].facebook_url).toBeNull();
  });
});

