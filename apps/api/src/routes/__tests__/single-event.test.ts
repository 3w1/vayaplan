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
    { email: 'admin-single-event-test@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  // Crear local sintético aislado para las pruebas
  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, is_active, created_at, updated_at)
    VALUES (1, 'Teatro Sintético Test', 'teatro-sintetico-test', 'Calle Test 123', true, now(), now())
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  // Insertar eventos sintéticos con diferentes estados
  const insertSql = `
    INSERT INTO events (
      city_id, venue_id, title, category, start_time, editorial_date, status, source_type, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
    RETURNING id, status;
  `;

  // 1. Publicado futuro
  const evPubFut = await testPool.query(insertSql, [
    1, testVenueId, 'Concierto Publicado Futuro', 'musica_directo',
    '2026-11-20 21:00:00+00', '2026-11-20', 'published', 'manual'
  ]);
  createdEventIds.push(evPubFut.rows[0].id);

  // 2. Publicado pasado (fecha anterior)
  const evPubPast = await testPool.query(insertSql, [
    1, testVenueId, 'Concierto Publicado Pasado', 'musica_directo',
    '2026-09-10 20:00:00+00', '2026-09-10', 'published', 'manual'
  ]);
  createdEventIds.push(evPubPast.rows[0].id);

  // 3. Cancelado
  const evCanc = await testPool.query(insertSql, [
    1, testVenueId, 'Festival Cancelado Formal', 'cultura',
    '2026-11-25 18:00:00+00', '2026-11-25', 'cancelled', 'manual'
  ]);
  createdEventIds.push(evCanc.rows[0].id);

  // 4. Borrador / Tentativo (NO PÚBLICO)
  const evTent = await testPool.query(insertSql, [
    1, testVenueId, 'Borrador Confidencial Tentativo', 'teatro',
    '2026-12-01 19:00:00+00', '2026-12-01', 'tentative', 'whatsapp'
  ]);
  createdEventIds.push(evTent.rows[0].id);

  // 5. Archivado (NO PÚBLICO)
  const evArch = await testPool.query(insertSql, [
    1, testVenueId, 'Evento Descartado Archivado', 'cine',
    '2026-12-05 17:00:00+00', '2026-12-05', 'archived', 'manual'
  ]);
  createdEventIds.push(evArch.rows[0].id);

  // 6. Duplicado (NO PÚBLICO)
  const evDup = await testPool.query(insertSql, [
    1, testVenueId, 'Evento Duplicado Descartado', 'monologo',
    '2026-12-10 22:00:00+00', '2026-12-10', 'duplicate', 'manual'
  ]);
  createdEventIds.push(evDup.rows[0].id);
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

describe('Reglas de Visibilidad en Endpoint Público GET /api/v1/events/:id', () => {
  test('Evento publicado futuro: responde 200 y devuelve datos públicos del evento', async () => {
    const eventId = createdEventIds[0];
    const res = await app.request(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.event.id).toBe(eventId);
    expect(body.event.title).toBe('Concierto Publicado Futuro');
    expect(body.event.status).toBe('published');
    expect(body.event.venue.name).toBe('Teatro Sintético Test');
    expect(body.event.image_original_url).toBeUndefined(); // Sin filtración de originales
  });

  test('Evento publicado pasado: responde 200 y permanece accesible para enlaces compartidos', async () => {
    const eventId = createdEventIds[1];
    const res = await app.request(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.event.id).toBe(eventId);
    expect(body.event.title).toBe('Concierto Publicado Pasado');
    expect(body.event.status).toBe('published');
  });

  test('Evento cancelado: responde 200 con status "cancelled" para preservar aviso a la ciudadanía', async () => {
    const eventId = createdEventIds[2];
    const res = await app.request(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.event).toBeDefined();
    expect(body.event.id).toBe(eventId);
    expect(body.event.title).toBe('Festival Cancelado Formal');
    expect(body.event.status).toBe('cancelled');
  });

  test('Borrador tentativo ("tentative"): responde 404 event_not_found sin filtrar datos', async () => {
    const eventId = createdEventIds[3];
    const res = await app.request(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('event_not_found');
    expect(body.event).toBeUndefined();
    expect(body.message).toContain('no fue encontrado');
  });

  test('Evento archivado ("archived"): responde 404 event_not_found sin filtrar datos', async () => {
    const eventId = createdEventIds[4];
    const res = await app.request(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('event_not_found');
    expect(body.event).toBeUndefined();
  });

  test('Evento duplicado ("duplicate"): responde 404 event_not_found sin filtrar datos', async () => {
    const eventId = createdEventIds[5];
    const res = await app.request(`/api/v1/events/${eventId}`);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('event_not_found');
    expect(body.event).toBeUndefined();
  });

  test('ID inexistente: responde 404 event_not_found', async () => {
    const res = await app.request('/api/v1/events/999999999');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('event_not_found');
  });

  test('ID malformado o no numérico: responde 400 invalid_parameter', async () => {
    const res1 = await app.request('/api/v1/events/abc');
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toBe('invalid_parameter');

    const res2 = await app.request('/api/v1/events/-5');
    expect(res2.status).toBe(400);

    const res3 = await app.request('/api/v1/events/0');
    expect(res3.status).toBe(400);
  });

  test('Acceso administrativo autenticado: conserva visibilidad de borradores y archivados', async () => {
    const tentativeId = createdEventIds[3];
    const archivedId = createdEventIds[4];

    // Con token JWT de administrador
    const resTentative = await app.request(`/api/v1/admin/events/${tentativeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resTentative.status).toBe(200);
    const bodyTentative = await resTentative.json();
    expect(bodyTentative.event).toBeDefined();
    expect(bodyTentative.event.id).toBe(tentativeId);
    expect(bodyTentative.event.status).toBe('tentative');

    const resArchived = await app.request(`/api/v1/admin/events/${archivedId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resArchived.status).toBe(200);
    const bodyArchived = await resArchived.json();
    expect(bodyArchived.event).toBeDefined();
    expect(bodyArchived.event.id).toBe(archivedId);
    expect(bodyArchived.event.status).toBe('archived');

    // Sin autenticación: rechaza con 401
    const resUnauth = await app.request(`/api/v1/admin/events/${tentativeId}`);
    expect(resUnauth.status).toBe(401);
  });
});
