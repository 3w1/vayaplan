import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../index');
const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let testVenueId: number;
let testFestivalId: number;
const createdFestivalIds: number[] = [];
const createdEventIds: number[] = [];

beforeAll(async () => {
  // 1. Crear local de prueba
  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
    VALUES (1, 'Teatro de Prueba Agenda', 'teatro-prueba-agenda', 'C/ Don Sancho 3', 42.0097, -4.5325, true, now(), now())
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  // 2. Crear festival de prueba
  const festRes = await testPool.query(`
    INSERT INTO festivals (city_id, name, edition, slug, description, start_date, end_date, official_url, is_active)
    VALUES (1, 'Festival Jazz Prueba', 'XI Edición', 'jazz-palencia-test', 'Festival de prueba', '2026-11-01', '2026-11-20', 'https://jazzpalencia.es', true)
    RETURNING id;
  `);
  testFestivalId = festRes.rows[0].id;
  createdFestivalIds.push(testFestivalId);

  // 3. Insertar evento con hora confirmada
  const ev1 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, time_status, start_time, editorial_date, status, source_type, created_at, updated_at
    ) VALUES (1, $1, 'Concierto Jazz Confirmado', 'musica_directo', 'confirmed', '2026-11-10T20:30:00Z', '2026-11-10', 'published', 'manual', now(), now())
    RETURNING id;
  `, [testVenueId]);
  createdEventIds.push(ev1.rows[0].id);

  // 4. Insertar evento deportivo con horario pendiente (sin hora ficticia)
  const ev2 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, time_status, start_time, editorial_date, approximate_schedule, status, source_type, created_at, updated_at
    ) VALUES (1, $1, 'Palencia vs Betis (Horario Pendiente)', 'baloncesto', 'pending_time', NULL, '2026-11-10', 'Horario por confirmar', 'published', 'manual', now(), now())
    RETURNING id;
  `, [testVenueId]);
  createdEventIds.push(ev2.rows[0].id);

  // 5. Insertar exposición con periodo de visita continuado (time_status = 'continuous')
  const ev3 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, time_status, start_time, editorial_date, end_date, schedule_text, status, source_type, created_at, updated_at
    ) VALUES (1, $1, 'Exposición Pintura', 'exposicion', 'continuous', NULL, '2026-11-05', '2026-11-15', 'Mar a vie de 8 a 18h', 'published', 'manual', now(), now())
    RETURNING id;
  `, [testVenueId]);
  createdEventIds.push(ev3.rows[0].id);

  // 6. Insertar evento asociado a festivales (sin festival_id en events, únicamente mediante event_festivals)
  const ev4 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, time_status, start_time, editorial_date, status, source_type, created_at, updated_at
    ) VALUES (1, $1, 'Conferencia sobre Jazz', 'conferencia', 'confirmed', '2026-11-12T19:00:00Z', '2026-11-12', 'published', 'manual', now(), now())
    RETURNING id;
  `, [testVenueId]);
  createdEventIds.push(ev4.rows[0].id);

  // 7. Insertar segundo festival y asociar ev4 a través de event_festivals (N:M)
  const fest2Res = await testPool.query(`
    INSERT INTO festivals (
      city_id, name, edition, slug, description, start_date, end_date, official_url, is_active, created_at, updated_at
    ) VALUES (
      1, 'Otoño Cultural Prueba', 'Edición 2026', 'otono-cultural-test',
      'Ciclo marco cultural de otoño', '2026-10-01', '2026-12-31', 'https://www.aytopalencia.es', true, now(), now()
    )
    RETURNING id;
  `);
  const testFestival2Id = fest2Res.rows[0].id;
  createdFestivalIds.push(testFestival2Id);

  await testPool.query(`
    INSERT INTO event_festivals (event_id, festival_id)
    VALUES ($1, $2), ($1, $3)
    ON CONFLICT DO NOTHING;
  `, [ev4.rows[0].id, testFestivalId, testFestival2Id]);

  // 8. Insertar evento promocionado con horario pendiente (para probar prioridad comercial en ordenación)
  const ev5 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, time_status, start_time, editorial_date, approximate_schedule, status, source_type, created_at, updated_at
    ) VALUES (1, $1, 'Partido Promocionado (Hora Pendiente)', 'futbol', 'pending_time', NULL, '2026-11-10', 'Horario por confirmar', 'published', 'manual', now(), now())
    RETURNING id;
  `, [testVenueId]);
  createdEventIds.push(ev5.rows[0].id);

  await testPool.query(`
    INSERT INTO promotions (event_id, venue_id, city_id, editorial_date, price_cents, status, starts_at, ends_at)
    VALUES ($1, $2, 1, '2026-11-10', 500, 'active', now() - interval '1 hour', now() + interval '1 day');
  `, [ev5.rows[0].id, testVenueId]);
});

afterAll(async () => {
  if (createdEventIds.length > 0) {
    await testPool.query('DELETE FROM promotions WHERE event_id = ANY($1::int[])', [createdEventIds]);
    await testPool.query('DELETE FROM events WHERE id = ANY($1::int[])', [createdEventIds]);
  }
  if (createdFestivalIds.length > 0) {
    await testPool.query('DELETE FROM festivals WHERE id = ANY($1::int[])', [createdFestivalIds]);
  }
  if (testVenueId) {
    await testPool.query('DELETE FROM venues WHERE id = $1', [testVenueId]);
  }
  await testPool.end();
});

describe('API — Piloto de Ampliación de Agenda (Contratos y Consultas)', () => {
  test('GET /api/v1/events/:id devuelve evento con hora pendiente y start_time nulo', async () => {
    const res = await app.request(`/api/v1/events/${createdEventIds[1]}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.event.time_status).toBe('pending_time');
    expect(body.event.start_time).toBeNull();
    expect(body.event.approximate_schedule).toBe('Horario por confirmar');
    expect(body.event.category).toBe('baloncesto');
  });

  test('GET /api/v1/events/:id devuelve exposición continuada con time_status continuous y start_time nulo', async () => {
    const res = await app.request(`/api/v1/events/${createdEventIds[2]}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.event.time_status).toBe('continuous');
    expect(body.event.start_time).toBeNull();
    expect(body.event.end_date).toBe('2026-11-15');
    expect(body.event.schedule_text).toBe('Mar a vie de 8 a 18h');
    expect(body.event.category).toBe('exposicion');
  });

  test('GET /api/v1/events/:id devuelve evento vinculado a festival con metadata del festival y array festivals N:M', async () => {
    const res = await app.request(`/api/v1/events/${createdEventIds[3]}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.event.festival).toBeDefined();
    expect(body.event.category).toBe('conferencia');
    expect(body.event.festivals).toBeDefined();
    expect(body.event.festivals.length).toBe(2);
    const names = body.event.festivals.map((f: any) => f.name);
    expect(names).toContain('Festival Jazz Prueba');
    expect(names).toContain('Otoño Cultural Prueba');
  });

  test('GET /api/v1/cities/palencia/events respeta prioridad comercial: evento promocionado con hora pendiente aparece antes que confirmados', async () => {
    const res = await app.request('/api/v1/cities/palencia/events?date=2026-11-10');
    expect(res.status).toBe(200);
    const body = await res.json();

    // ev5 (promocionado pendiente), ev1 (no promocionado confirmado), ev2 (no promocionado pendiente)
    const ev5Index = body.events.findIndex((e: any) => e.id === createdEventIds[4]);
    const ev1Index = body.events.findIndex((e: any) => e.id === createdEventIds[0]);
    const ev2Index = body.events.findIndex((e: any) => e.id === createdEventIds[1]);

    expect(ev5Index).toBeGreaterThanOrEqual(0);
    expect(ev1Index).toBeGreaterThanOrEqual(0);
    expect(ev2Index).toBeGreaterThanOrEqual(0);

    // Promocionado (ev5) precede a confirmado no promocionado (ev1)
    expect(ev5Index).toBeLessThan(ev1Index);
    // Confirmado no promocionado (ev1) precede a pendiente no promocionado (ev2)
    expect(ev1Index).toBeLessThan(ev2Index);
  });

  test('GET /api/v1/cities/palencia/events?date=YYYY-MM-DD no incluye exposiciones fuera de su periodo', async () => {
    // 2026-11-20 está después de la clausura de la exposición (2026-11-15)
    const res = await app.request('/api/v1/cities/palencia/events?date=2026-11-20');
    expect(res.status).toBe(200);
    const body = await res.json();

    const expo = body.events.find((e: any) => e.id === createdEventIds[2]);
    expect(expo).toBeUndefined();
  });

  test('GET /api/v1/cities/palencia/festivals/:slug devuelve el programa local del festival y resuelve pertenencia N:M', async () => {
    // 1. Programa del festival principal
    const res1 = await app.request('/api/v1/cities/palencia/festivals/jazz-palencia-test');
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.festival.name).toBe('Festival Jazz Prueba');
    expect(body1.events.some((e: any) => e.id === createdEventIds[3])).toBe(true);

    // 2. Programa del festival marco asociado vía event_festivals
    const res2 = await app.request('/api/v1/cities/palencia/festivals/otono-cultural-test');
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.festival.name).toBe('Otoño Cultural Prueba');
    expect(body2.events.some((e: any) => e.id === createdEventIds[3])).toBe(true);
  });

  test('GET /api/v1/cities/palencia/festivals/inexistente devuelve 404', async () => {
    const res = await app.request('/api/v1/cities/palencia/festivals/no-existe-este-festival');
    expect(res.status).toBe(404);
  });

  test('Validaciones defensivas de BD: transiciones y restricciones CHECK', async () => {
    // A. Transición confirmed -> pending_time: exige start_time NULL
    await testPool.query(`
      UPDATE events SET time_status = 'pending_time', start_time = NULL WHERE id = $1
    `, [createdEventIds[0]]);
    const check1 = await testPool.query('SELECT time_status, start_time FROM events WHERE id = $1', [createdEventIds[0]]);
    expect(check1.rows[0].time_status).toBe('pending_time');
    expect(check1.rows[0].start_time).toBeNull();

    // B. Intentar confirmed sin hora (start_time NULL) viola chk_events_time_consistency
    let errorConfirmedNull = false;
    try {
      await testPool.query(`
        UPDATE events SET time_status = 'confirmed', start_time = NULL WHERE id = $1
      `, [createdEventIds[0]]);
    } catch {
      errorConfirmedNull = true;
    }
    expect(errorConfirmedNull).toBe(true);

    // C. Restaurar confirmed con hora válida
    await testPool.query(`
      UPDATE events SET time_status = 'confirmed', start_time = '2026-11-10T20:30:00Z' WHERE id = $1
    `, [createdEventIds[0]]);

    // D. tentative_date con status = 'published' viola chk_events_tentative_date_publication
    let errorTentativePublished = false;
    try {
      await testPool.query(`
        UPDATE events SET time_status = 'tentative_date', start_time = NULL, status = 'published' WHERE id = $1
      `, [createdEventIds[0]]);
    } catch {
      errorTentativePublished = true;
    }
    expect(errorTentativePublished).toBe(true);
  });
});
