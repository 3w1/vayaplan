import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

// Exigir base de datos de pruebas sintética
const rawTestDbUrl = process.env.TEST_DATABASE_URL || 'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

const parsedUrl = new URL(rawTestDbUrl.trim());
const dbName = parsedUrl.pathname.replace(/^\//, '');
if (!dbName.includes('test') && !dbName.includes('synthetic')) {
  throw new Error(`La base de datos objetivo ('${dbName}') debe ser sintética de pruebas.`);
}

process.env.DATABASE_URL = rawTestDbUrl.trim();

// Importar aplicación y módulos una vez fijada la BD
const { app } = await import('../../../index');
const { sign } = await import('hono/jwt');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { resetVariantsColumnCache } = await import('../../../services/image-storage');

describe('Integración de Eventos y Variantes de Cartel en BD Sintética (vayaplan_test)', () => {
  const pool = new Pool({ connectionString: rawTestDbUrl.trim() });
  let adminToken = '';
  let venueId = 0;
  let testEventIds: number[] = [];

  beforeAll(async () => {
    resetVariantsColumnCache();

    // Crear token administrativo válido
    adminToken = await sign(
      {
        sub: '1',
        email: 'admin@vayaplan.com',
        role: 'admin',
        city: 'palencia',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      JWT_SECRET || 'dev_secret_jwt'
    );

    // Obtener un local válido para las pruebas
    const venueRes = await pool.query("SELECT id FROM venues WHERE is_active = true AND id != 9999 LIMIT 1;");
    if (venueRes.rows.length === 0) {
      const insVenue = await pool.query(
        "INSERT INTO venues (name, address, city, is_active) VALUES ('Teatro Principal Test', 'Calle Mayor 1', 'palencia', true) RETURNING id;"
      );
      venueId = insVenue.rows[0].id;
    } else {
      venueId = venueRes.rows[0].id;
    }
  });

  afterAll(async () => {
    if (testEventIds.length > 0) {
      await pool.query('DELETE FROM events WHERE id = ANY($1)', [testEventIds]);
    }
    await pool.end();
  });

  it('1. Crea un evento nuevo con las 3 variantes de imagen correctamente persistidas', async () => {
    const payload = {
      title: 'Concierto de Jazz en Directo',
      start_time: '2026-11-20T21:00:00Z',
      category: 'musica_directo',
      city_id: 1,
      venue_id: venueId,
      status: 'published',
      is_free: false,
      price_cents: 1500,
      image_url: 'https://media.vayaplan.com/events/11111111-2222-3333-4444-555555555555-detail.webp',
      image_thumb_url: 'https://media.vayaplan.com/events/11111111-2222-3333-4444-555555555555-thumb.webp',
      image_original_url: 'https://media.vayaplan.com/events/11111111-2222-3333-4444-555555555555-original.jpg',
    };

    const res = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.event_id).toBeDefined();
    testEventIds.push(data.event_id);

    // Verificar en BD sintética que las columnas se guardaron exactamente
    const dbCheck = await pool.query(
      'SELECT image_url, image_thumb_url, image_original_url FROM events WHERE id = $1',
      [data.event_id]
    );
    expect(dbCheck.rows[0].image_url).toBe(payload.image_url);
    expect(dbCheck.rows[0].image_thumb_url).toBe(payload.image_thumb_url);
    expect(dbCheck.rows[0].image_original_url).toBe(payload.image_original_url);
  });

  it('2. Entrega las variantes en la API pública de listado y ficha individual', async () => {
    const eventId = testEventIds[0];

    // Ficha individual pública
    const singleRes = await app.request(`/api/v1/events/${eventId}`);
    expect(singleRes.status).toBe(200);
    const singleData = await singleRes.json();
    const ev = singleData.event;

    expect(ev.image_url).toContain('-detail.webp');
    expect(ev.image_thumb_url).toContain('-thumb.webp');
    expect(ev.image_original_url).toBeUndefined(); // Protegido por privacidad: original no expuesto al público

    // Listado público
    const listRes = await app.request('/api/v1/cities/palencia/events?date=2026-11-20');
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const found = listData.events.find((e: any) => e.id === eventId);
    expect(found).toBeDefined();
    expect(found.image_thumb_url).toContain('-thumb.webp');
    expect(found.image_original_url).toBeUndefined(); // Protegido por privacidad
  });

  it('3. Modifica y sustituye la imagen por otra variante', async () => {
    const eventId = testEventIds[0];
    const updatePayload = {
      image_url: 'https://media.vayaplan.com/events/99999999-8888-7777-6666-555555555555-detail.webp',
      image_thumb_url: 'https://media.vayaplan.com/events/99999999-8888-7777-6666-555555555555-thumb.webp',
      image_original_url: 'https://media.vayaplan.com/events/99999999-8888-7777-6666-555555555555-original.png',
    };

    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(updatePayload),
    });

    expect(patchRes.status).toBe(200);

    const dbCheck = await pool.query(
      'SELECT image_url, image_thumb_url, image_original_url FROM events WHERE id = $1',
      [eventId]
    );
    expect(dbCheck.rows[0].image_url).toBe(updatePayload.image_url);
    expect(dbCheck.rows[0].image_thumb_url).toBe(updatePayload.image_thumb_url);
    expect(dbCheck.rows[0].image_original_url).toBe(updatePayload.image_original_url);
  });

  it('4. Quita la imagen del evento y limpia todas las referencias a NULL', async () => {
    const eventId = testEventIds[0];
    const clearPayload = {
      image_url: null,
      image_thumb_url: null,
      image_original_url: null,
    };

    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(clearPayload),
    });

    expect(patchRes.status).toBe(200);

    const dbCheck = await pool.query(
      'SELECT image_url, image_thumb_url, image_original_url FROM events WHERE id = $1',
      [eventId]
    );
    expect(dbCheck.rows[0].image_url).toBeNull();
    expect(dbCheck.rows[0].image_thumb_url).toBeNull();
    expect(dbCheck.rows[0].image_original_url).toBeNull();
  });

  it('5. Evento legacy con un único image_url: el fallback responde limpiamente sin romper nada', async () => {
    // Insertar directamente un evento legacy simulando producción actual (sin variantes)
    const insLegacy = await pool.query(
      `INSERT INTO events (title, start_time, category, city_id, venue_id, status, is_free, price_cents, image_url, image_thumb_url, image_original_url, source_type, editorial_date)
       VALUES ('Festival Jazz Legacy', '2026-11-21T20:00:00Z', 'musica_directo', 1, $1, 'published', true, 0,
               'https://media.vayaplan.com/events/legacy-single.jpg', NULL, NULL, 'manual', '2026-11-21')
       RETURNING id;`,
      [venueId]
    );
    const legacyId = insLegacy.rows[0].id;
    testEventIds.push(legacyId);

    // Consulta en detalle
    const res = await app.request(`/api/v1/events/${legacyId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.image_url).toBe('https://media.vayaplan.com/events/legacy-single.jpg');
    // Fallback: al ser null las columnas, el endpoint entrega el fallback correspondiente a image_url
    expect(data.event.image_thumb_url).toBe('https://media.vayaplan.com/events/legacy-single.jpg');
    expect(data.event.image_original_url).toBeUndefined();
  });
});
