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
const createdEventIds: number[] = [];
let testVenueId: number;

beforeAll(async () => {
  adminToken = await sign(
    { email: 'admin-sports-visibility-test@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, is_active, created_at, updated_at)
    VALUES (1, 'Estadio Sintético Test', 'estadio-sintetico-test', 'Av Test 1', true, now(), now())
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;
});

afterAll(async () => {
  if (createdEventIds.length > 0) {
    await testPool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
  }
  if (testVenueId) {
    await testPool.query(`DELETE FROM venues WHERE id = $1`, [testVenueId]);
  }
  await testPool.end();
});

describe('Reglas de Visibilidad de Eventos Deportivos y Filtro de Borradores', () => {
  test('1. Un evento draft no aparece en listado público, agenda por fecha, filtros públicos ni detalle directo', async () => {
    // Crear evento draft deportivo
    const res = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, start_time,
        status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
      ) VALUES (
        1, $1, 'Partido Secreto en Borrador Baloncesto', 'deporte', '2026-11-20',
        '2026-11-20T19:00:00Z', 'draft', 'scraper', 'https://ejemplo.com/partido', 0, true,
        'sports:test:draft:1', now(), now()
      ) RETURNING id;
    `, [testVenueId]);
    const draftId = res.rows[0].id;
    createdEventIds.push(draftId);

    // A) No aparece en agenda pública del día
    const listRes = await app.request('/api/v1/cities/palencia/events?date=2026-11-20');
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const foundInList = (listData.events || []).find((e: any) => e.id === draftId);
    expect(foundInList).toBeUndefined();

    // B) No aparece con filtro de categoría
    const filterRes = await app.request('/api/v1/cities/palencia/events?date=2026-11-20&category=deporte');
    expect(filterRes.status).toBe(200);
    const filterData = await filterRes.json();
    const foundInFilter = (filterData.events || []).find((e: any) => e.id === draftId);
    expect(foundInFilter).toBeUndefined();

    // C) Detalle directo público devuelve 404
    const detailRes = await app.request(`/api/v1/events/${draftId}`);
    expect(detailRes.status).toBe(404);
    const detailData = await detailRes.json();
    expect(detailData.error).toBe('event_not_found');
  });

  test('2 y 3. Un evento draft (origen scraper / importador deportivo y WhatsApp) aparece en el filtro de borradores del panel', async () => {
    // Crear borrador deportivo (scraper)
    const sportsDraftRes = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, start_time,
        status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
      ) VALUES (
        1, $1, 'Partido Deportivo Borrador Importador', 'deporte', '2026-11-21',
        '2026-11-21T17:00:00Z', 'draft', 'scraper', 'https://ejemplo.com/deporte-draft', 0, true,
        'sports:test:draft:2', now(), now()
      ) RETURNING id;
    `, [testVenueId]);
    const sportsDraftId = sportsDraftRes.rows[0].id;
    createdEventIds.push(sportsDraftId);

    // Crear borrador WhatsApp (tentative)
    const waDraftRes = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, start_time,
        status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
      ) VALUES (
        1, $1, 'Concierto Borrador WhatsApp', 'musica_directo', '2026-11-21',
        '2026-11-21T21:00:00Z', 'tentative', 'whatsapp', 'https://ejemplo.com/wa-draft', 0, true,
        'wa:test:draft:1', now(), now()
      ) RETURNING id;
    `, [testVenueId]);
    const waDraftId = waDraftRes.rows[0].id;
    createdEventIds.push(waDraftId);

    // Consultar el filtro de borradores del panel de administración
    const adminDraftRes = await app.request('/api/v1/admin/events?status=draft', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(adminDraftRes.status).toBe(200);
    const adminData = await adminDraftRes.json();
    const eventIds = (adminData.events || []).map((e: any) => e.id);

    // Ambos orígenes deben aparecer en el filtro de borradores
    expect(eventIds).toContain(sportsDraftId);
    expect(eventIds).toContain(waDraftId);
  });

  test('4 y 5. Un evento published aparece en agenda pública y no aparece en el filtro de borradores', async () => {
    // Crear evento publicado
    const pubRes = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, start_time,
        status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
      ) VALUES (
        1, $1, 'Partido Oficial Publicado de Rugby', 'deporte', '2026-11-22',
        '2026-11-22T12:00:00Z', 'published', 'scraper', 'https://ejemplo.com/rugby-pub', 0, true,
        'sports:test:pub:1', now(), now()
      ) RETURNING id;
    `, [testVenueId]);
    const pubId = pubRes.rows[0].id;
    createdEventIds.push(pubId);

    // 4. Aparece en agenda pública
    const listRes = await app.request('/api/v1/cities/palencia/events?date=2026-11-22');
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const foundInList = (listData.events || []).find((e: any) => e.id === pubId);
    expect(foundInList).toBeDefined();
    expect(foundInList.title).toBe('Partido Oficial Publicado de Rugby');

    // Detalle público responde 200
    const detailRes = await app.request(`/api/v1/events/${pubId}`);
    expect(detailRes.status).toBe(200);

    // 5. No aparece en el filtro de borradores
    const adminDraftRes = await app.request('/api/v1/admin/events?status=draft', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(adminDraftRes.status).toBe(200);
    const adminData = await adminDraftRes.json();
    const draftIds = (adminData.events || []).map((e: any) => e.id);
    expect(draftIds).not.toContain(pubId);
  });

  test('6. Rutas en estado draft siguen ocultas en el endpoint público GET /api/v1/cities/palencia/routes', async () => {
    const routesRes = await app.request('/api/v1/cities/palencia/routes');
    expect(routesRes.status).toBe(200);
    const routesData = await routesRes.json();
    const routes = routesData.routes || [];
    // Ninguna ruta devuelta puede tener status draft o ser la ruta ID 1 en draft
    const draftRoute = routes.find((r: any) => r.id === 1 || r.status === 'draft');
    expect(draftRoute).toBeUndefined();
  });

  test('7. Los eventos de festivales publicados siguen visibles en la agenda pública', async () => {
    // Crear festival y evento publicado vinculado en la base de datos de test
    const festRes = await testPool.query(`
      INSERT INTO festivals (city_id, name, edition, slug, start_date, end_date, is_active, created_at, updated_at)
      VALUES (1, 'Festival Jazz Test 2026', 'XIII', 'jazz-test-2026', '2026-11-01', '2026-11-20', true, now(), now())
      RETURNING id;
    `);
    const festId = festRes.rows[0].id;

    const jazzEvRes = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, start_time,
        status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
      ) VALUES (
        1, $1, 'Concierto de Jazz Inaugural', 'musica_directo', '2026-11-05',
        '2026-11-05T20:30:00Z', 'published', 'manual', 'https://jazzpalencia.es', 1500, false,
        'jazz:test:pub:1', now(), now()
      ) RETURNING id;
    `, [testVenueId]);
    const jazzEvId = jazzEvRes.rows[0].id;
    createdEventIds.push(jazzEvId);

    await testPool.query(`
      INSERT INTO event_festivals (event_id, festival_id) VALUES ($1, $2);
    `, [jazzEvId, festId]);

    // Comprobar que el evento publicado del festival se lista en la agenda pública
    const jazzRes = await app.request('/api/v1/cities/palencia/events?date=2026-11-05');
    expect(jazzRes.status).toBe(200);
    const jazzData = await jazzRes.json();
    expect(jazzData.events.length).toBeGreaterThan(0);
    const foundJazz = jazzData.events.find((e: any) => e.id === jazzEvId);
    expect(foundJazz).toBeDefined();
    expect(foundJazz.status).toBe('published');
    expect(foundJazz.festivals.length).toBe(1);
    expect(foundJazz.festivals[0].name).toBe('Festival Jazz Test 2026');

    // Limpiar festival
    await testPool.query(`DELETE FROM event_festivals WHERE event_id = $1`, [jazzEvId]);
    await testPool.query(`DELETE FROM festivals WHERE id = $1`, [festId]);
  });
});
