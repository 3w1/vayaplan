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

const { app } = await import('../../../index');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { sign } = await import('hono/jwt');

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
const createdEventIds: number[] = [];
let testVenueId: number;
let testFestivalId: number;

let ev52BaloncestoId: number;
let ev54RugbyId: number;
let ev57SanSilvestreId: number;
let evJazzId: number;
let evDraftFutbolId: number;

beforeAll(async () => {
  adminToken = await sign(
    { email: 'admin-filter-search-test@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, is_active, created_at, updated_at)
    VALUES (1, 'Estadio Balastera Test Filter', 'estadio-balastera-test-filter', 'C/ Test Balastera 1', true, now(), now())
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  const festRes = await testPool.query(`
    INSERT INTO festivals (city_id, name, edition, slug, description, start_date, end_date, is_active)
    VALUES (1, 'XIII Festival Internacional Jazz Palencia 2026', '13ª', 'jazz-palencia-filter-test', 'Festival', '2026-11-06', '2026-11-21', true)
    RETURNING id;
  `);
  testFestivalId = festRes.rows[0].id;

  // 1. Evento 52 equivalente: Baloncesto, published
  const r52 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
    ) VALUES (
      1, $1, 'Súper Agropal Palencia vs. Club Ourense Baloncesto', 'baloncesto', '2026-10-24',
      '2026-10-24T19:00:00Z', 'published', 'manual', 'https://www.palenciabaloncesto.com/es/proximos-partidos', 1500, false,
      'sports:test:baloncesto:52', now(), now()
    ) RETURNING id;
  `, [testVenueId]);
  ev52BaloncestoId = r52.rows[0].id;
  createdEventIds.push(ev52BaloncestoId);

  // 2. Evento 54 equivalente: Rugby, published
  const r54 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
    ) VALUES (
      1, $1, 'Silicius Palencia Rugby Club vs. Salamanca Rugby Club', 'rugby', '2026-11-08',
      '2026-11-08T12:00:00Z', 'published', 'manual', 'https://rugbyclubpalencia.com/', 0, true,
      'sports:test:rugby:54', now(), now()
    ) RETURNING id;
  `, [testVenueId]);
  ev54RugbyId = r54.rows[0].id;
  createdEventIds.push(ev54RugbyId);

  // 3. Evento 57 equivalente: San Silvestre (categoría deporte normalizada), published
  const r57 = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
    ) VALUES (
      1, $1, 'XLV San Silvestre Palentina 2026', 'deporte', '2026-12-31',
      '2026-12-31T18:00:00Z', 'published', 'manual', 'http://sansilvestrepalentina.com/', 500, false,
      'sports:test:sansilvestre:57', now(), now()
    ) RETURNING id;
  `, [testVenueId]);
  ev57SanSilvestreId = r57.rows[0].id;
  createdEventIds.push(ev57SanSilvestreId);

  // 4. Evento Jazz: musica_directo, published, vinculado a festival
  const rJazz = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
    ) VALUES (
      1, $1, 'Concierto Jazz Palencia Trío', 'musica_directo', '2026-11-10',
      '2026-11-10T20:30:00Z', 'published', 'scraper', 'https://jazzpalencia.es/trio', 2000, false,
      'jazz:test:concierto:1', now(), now()
    ) RETURNING id;
  `, [testVenueId]);
  evJazzId = rJazz.rows[0].id;
  createdEventIds.push(evJazzId);

  await testPool.query(`
    INSERT INTO event_festivals (event_id, festival_id)
    VALUES ($1, $2);
  `, [evJazzId, testFestivalId]);

  // 5. Evento draft de fútbol: Palencia Cristo Atlético vs. Burgos CF Promesas
  const rDraft = await testPool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      status, source_type, source_url, price_cents, is_free, dedupe_key, created_at, updated_at
    ) VALUES (
      1, $1, 'Palencia Cristo Atlético vs. Burgos CF Promesas', 'futbol', '2026-11-15',
      '2026-11-15T16:30:00Z', 'draft', 'scraper', 'https://palenciacristoatletico.es/proximos-partidos', 1000, false,
      'sports:test:futbol:55', now(), now()
    ) RETURNING id;
  `, [testVenueId]);
  evDraftFutbolId = rDraft.rows[0].id;
  createdEventIds.push(evDraftFutbolId);
});

afterAll(async () => {
  if (createdEventIds.length > 0) {
    await testPool.query(`DELETE FROM event_festivals WHERE event_id = ANY($1)`, [createdEventIds]);
    await testPool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
  }
  if (testFestivalId) {
    await testPool.query(`DELETE FROM festivals WHERE id = $1`, [testFestivalId]);
  }
  if (testVenueId) {
    await testPool.query(`DELETE FROM venues WHERE id = $1`, [testVenueId]);
  }
  await testPool.end();
});

describe('PARTE 6 — Casos de Prueba de Filtro por Categoría y Búsqueda en Admin', () => {
  const reqAdmin = async (queryStr: string) => {
    const res = await app.request(`/api/v1/admin/events?${queryStr}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    return res.json();
  };

  test('Normalización de Evento 57: tiene categoría deporte y el filtro no contiene excepciones ad-hoc', async () => {
    // 1. Verificar categoría real devuelta
    const data = await reqAdmin(`status=published&venue_id=${testVenueId}`);
    const ev57 = data.events.find((e: any) => e.id === ev57SanSilvestreId);
    expect(ev57).toBeDefined();
    expect(ev57.category).toBe('deporte');

    // 2. Verificar estáticamente que el filtro admin no incluye excepciones por ID 57 o sansilvestre
    const { readFileSync } = await import('node:fs');
    const adminEventsCode = readFileSync(new URL('../events.ts', import.meta.url), 'utf-8');
    expect(adminEventsCode).not.toContain('e.id = 57');
    expect(adminEventsCode).not.toContain('%sansilvestre%');
    expect(adminEventsCode).toContain("e.category IN ('baloncesto', 'futbol', 'rugby', 'deporte')");
  });

  test('Caso 1: Filtrar por "Deporte" devuelve los eventos deportivos (52, 54, 57) y ningún evento de Jazz', async () => {
    const data = await reqAdmin(`status=published&category=deporte&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(ev52BaloncestoId);
    expect(ids).toContain(ev54RugbyId);
    expect(ids).toContain(ev57SanSilvestreId);
    expect(ids).not.toContain(evJazzId);
  });

  test('Caso 2: Filtrar por "Música" devuelve los eventos de Jazz publicados', async () => {
    const data = await reqAdmin(`status=published&category=musica&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(evJazzId);
    expect(ids).not.toContain(ev52BaloncestoId);
    expect(ids).not.toContain(ev54RugbyId);
    expect(ids).not.toContain(ev57SanSilvestreId);
  });

  test('Caso 3: Filtrar por estado published y categoría deporte devuelve solo eventos deportivos publicados', async () => {
    const data = await reqAdmin(`status=published&category=deporte&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(ev52BaloncestoId);
    expect(ids).toContain(ev54RugbyId);
    expect(ids).toContain(ev57SanSilvestreId);
    // El borrador de fútbol NO debe aparecer porque es status=draft
    expect(ids).not.toContain(evDraftFutbolId);
  });

  test('Caso 4: Buscar "Rugby" devuelve el evento 54', async () => {
    const data = await reqAdmin(`q=Rugby&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(ev54RugbyId);
    expect(ids).not.toContain(ev52BaloncestoId);
    expect(ids).not.toContain(evJazzId);
  });

  test('Caso 5: Buscar "San Silvestre" devuelve el evento 57', async () => {
    const data = await reqAdmin(`q=San+Silvestre&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(ev57SanSilvestreId);
    expect(ids).not.toContain(ev52BaloncestoId);
    expect(ids).not.toContain(ev54RugbyId);
  });

  test('Caso 6: Buscar "Palencia Baloncesto" devuelve el evento 52 mediante tokenización multi-término', async () => {
    const data = await reqAdmin(`q=Palencia+Baloncesto&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(ev52BaloncestoId);
    expect(ids).not.toContain(ev54RugbyId);
    expect(ids).not.toContain(ev57SanSilvestreId);
  });

  test('Caso 7: Buscar "Jazz" devuelve eventos del Festival de Jazz', async () => {
    const data = await reqAdmin(`q=Jazz&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toContain(evJazzId);
    expect(ids).not.toContain(ev52BaloncestoId);
    expect(ids).not.toContain(ev54RugbyId);
  });

  test('Caso 8: La combinación estado + categoría + búsqueda funciona correctamente', async () => {
    const data = await reqAdmin(`status=published&category=deporte&q=baloncesto&venue_id=${testVenueId}`);
    const ids = data.events.map((e: any) => e.id);

    expect(ids).toEqual([ev52BaloncestoId]);
  });

  test('Caso 9: Un evento draft no aparece al filtrar por estado published', async () => {
    const dataPublished = await reqAdmin(`status=published&q=Burgos&venue_id=${testVenueId}`);
    expect(dataPublished.events.map((e: any) => e.id)).not.toContain(evDraftFutbolId);

    const dataDraft = await reqAdmin(`status=draft&q=Burgos&venue_id=${testVenueId}`);
    expect(dataDraft.events.map((e: any) => e.id)).toContain(evDraftFutbolId);
  });

  test('Caso 10: La paginación devuelve la estructura correcta y respeta page y limit', async () => {
    const data = await reqAdmin(`venue_id=${testVenueId}&limit=2&page=1`);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(2);
    expect(data.pagination.total).toBeGreaterThanOrEqual(4);
    expect(data.events.length).toBe(2);

    const dataPage2 = await reqAdmin(`venue_id=${testVenueId}&limit=2&page=2`);
    expect(dataPage2.pagination.page).toBe(2);
    expect(dataPage2.events.length).toBe(2);
    // Ningún evento de la página 1 debe repetirse en la página 2
    const idsP1 = data.events.map((e: any) => e.id);
    const idsP2 = dataPage2.events.map((e: any) => e.id);
    expect(idsP1.some((id: number) => idsP2.includes(id))).toBe(false);
  });

  test('Caso 11: La búsqueda es insensible a mayúsculas y minúsculas', async () => {
    const dataUpper = await reqAdmin(`q=RUGBY&venue_id=${testVenueId}`);
    const dataLower = await reqAdmin(`q=rugby&venue_id=${testVenueId}`);

    const idsUpper = dataUpper.events.map((e: any) => e.id);
    const idsLower = dataLower.events.map((e: any) => e.id);

    expect(idsUpper).toContain(ev54RugbyId);
    expect(idsLower).toContain(ev54RugbyId);
    expect(idsUpper).toEqual(idsLower);
  });

  test('Caso 12: No hay SQL injection al introducir texto malicioso en la búsqueda', async () => {
    const maliciousQ = encodeURIComponent("' OR 1=1 --");
    const data = await reqAdmin(`q=${maliciousQ}&venue_id=${testVenueId}`);

    // No debe retornar todos los eventos indiscriminadamente; debe dar 0 resultados para esa cadena
    expect(data.total).toBe(0);
    expect(data.events).toEqual([]);
  });
});
