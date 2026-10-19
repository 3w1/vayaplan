import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { sign } from 'hono/jwt';
import { JWT_SECRET } from '../../../middleware/auth';
import { ingestCulturalAgenda } from '../../../services/ingestion';
import { syncJcylLibraryActivities } from '../../../services/jcyl-import/jcyl-connector';

const rawTestDbUrl = process.env.TEST_DATABASE_URL;
if (!rawTestDbUrl) {
  throw new Error('TEST_DATABASE_URL es obligatoria para ejecutar estas pruebas.');
}

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../../index');
const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
let testVenueId: number;
let festAId: number;
let festBId: number;
const createdEventIds: number[] = [];
const createdFestivalIds: number[] = [];

beforeAll(async () => {
  // 1. Generar token JWT de administrador
  adminToken = await sign(
    { id: 1, email: 'admin@vayaplan.test', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  // 2. Crear local de prueba en Palencia
  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, latitude, longitude, is_active, created_at, updated_at)
    VALUES (1, 'Teatro Principal Palencia Workflow Test', 'teatro-principal-workflow-test', 'C/ Mayor 1', 42.0097, -4.5325, true, now(), now())
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  // Local para pruebas del conector JCyL Biblioteca
  await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, is_active, created_at, updated_at)
    VALUES (1, 'Biblioteca Pública de Palencia (Test)', 'biblioteca-publica-de-palencia', 'C/ Eduardo Dato, 4', true, now(), now())
    ON CONFLICT (city_id, slug) DO NOTHING;
  `);

  // 3. Crear 2 programas / festivales de prueba
  const fA = await testPool.query(`
    INSERT INTO festivals (city_id, name, edition, slug, description, start_date, end_date, official_url, is_active)
    VALUES (1, 'XIII Jazz Palencia Festival Test', '13ª', 'jazz-palencia-workflow-test', 'Festival de jazz', '2026-11-06', '2026-11-21', 'https://jazzpalencia.es', true)
    RETURNING id;
  `);
  festAId = fA.rows[0].id;

  const fB = await testPool.query(`
    INSERT INTO festivals (city_id, name, edition, slug, description, start_date, end_date, official_url, is_active)
    VALUES (1, 'Otoño Cultural 2026 Test', 'Edición 2026', 'otono-cultural-workflow-test', 'Ciclo de otoño', '2026-10-01', '2026-12-15', 'https://aytopalencia.es', true)
    RETURNING id;
  `);
  festBId = fB.rows[0].id;
});

afterAll(async () => {
  // Limpieza defensiva en base de datos de test
  if (createdEventIds.length > 0) {
    await testPool.query(`DELETE FROM event_festivals WHERE event_id = ANY($1::int[]);`, [createdEventIds]);
    await testPool.query(`DELETE FROM events WHERE id = ANY($1::int[]);`, [createdEventIds]);
  }
  const allFestIds = [festAId, festBId, ...createdFestivalIds].filter(Boolean);
  if (allFestIds.length > 0) {
    await testPool.query(`DELETE FROM event_festivals WHERE festival_id = ANY($1::int[]);`, [allFestIds]);
    await testPool.query(`DELETE FROM festivals WHERE id = ANY($1::int[]);`, [allFestIds]);
  }
  if (testVenueId) {
    await testPool.query(`DELETE FROM venues WHERE id = $1;`, [testVenueId]);
  }
  await testPool.query(`DELETE FROM venues WHERE slug = 'biblioteca-publica-de-palencia';`);
  await testPool.end();
});

describe('Flujo Editorial Local — Piloto de Ampliación de Agenda (11 Escenarios Reales)', () => {

  // Escenario 1: Candidato -> editar -> guardar borrador -> publicar
  test('Escenario 1: Candidato -> editar -> guardar borrador -> publicar', async () => {
    // A) Crear borrador mediante POST /api/v1/admin/events/draft
    const draftPayload = {
      title: 'Borrador Inicial Piloto',
      category: 'teatro',
      editorial_date: '2026-11-12',
      time_status: 'confirmed',
      start_time: '2026-11-12T19:30:00Z',
      price_cents: 0,
      is_free: true,
      description: 'Obra teatral en fase de borrador.',
      source_url: 'https://teatroprincipalpalencia.es/evento-1'
    };

    const createRes = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(draftPayload),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    const eventId = createData.event_id;
    createdEventIds.push(eventId);
    expect(createData.event_status).toBe('tentative');

    // B) Editar campos y guardar como borrador (status: tentative) asignando local
    const editPayload = {
      title: 'Obra Teatral Verificada y Corregida',
      venue_id: testVenueId,
      price_cents: 1200,
      is_free: false,
      status: 'tentative'
    };

    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(editPayload),
    });
    expect(patchRes.status).toBe(200);

    // Verificar en BD que sigue en 'tentative' con los nuevos datos
    const dbDraft = await testPool.query(`SELECT status, title, venue_id, price_cents FROM events WHERE id = $1;`, [eventId]);
    expect(dbDraft.rows[0].status).toBe('tentative');
    expect(dbDraft.rows[0].title).toBe('Obra Teatral Verificada y Corregida');
    expect(dbDraft.rows[0].price_cents).toBe(1200);

    // C) Publicar mediante acción explícita POST /api/v1/admin/events/:id/publish
    const pubRes = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(pubRes.status).toBe(200);

    // Verificar en BD que ahora está 'published'
    const dbPub = await testPool.query(`SELECT status FROM events WHERE id = $1;`, [eventId]);
    expect(dbPub.rows[0].status).toBe('published');
  });

  // Escenario 2: Hora pendiente -> confirmada
  test('Escenario 2: Hora pendiente -> confirmada', async () => {
    // Crear evento con hora pendiente
    const createRes = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Partido Baloncesto Hora Pendiente Test',
        category: 'baloncesto',
        venue_id: testVenueId,
        editorial_date: '2026-11-14',
        time_status: 'pending_time',
        start_time: null,
        approximate_schedule: 'Jornada 7 - Pendiente TV',
        price_cents: 0,
        is_free: true,
        status: 'published'
      }),
    });
    expect(createRes.status).toBe(201);
    const eventId = (await createRes.json()).event_id;
    createdEventIds.push(eventId);

    // Confirmar hora puntual: transition a confirmed
    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        time_status: 'confirmed',
        start_time: '2026-11-14T17:00:00Z',
      }),
    });
    expect(patchRes.status).toBe(200);

    const dbEv = await testPool.query(`SELECT time_status, start_time FROM events WHERE id = $1;`, [eventId]);
    expect(dbEv.rows[0].time_status).toBe('confirmed');
    expect(new Date(dbEv.rows[0].start_time).toISOString()).toBe('2026-11-14T17:00:00.000Z');
  });

  // Escenario 3: Confirmada -> pendiente, eliminando la hora anterior
  test('Escenario 3: Confirmada -> pendiente, eliminando la hora anterior', async () => {
    // Crear evento confirmado
    const createRes = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Partido Rugby Inicialmente Confirmado',
        category: 'rugby',
        venue_id: testVenueId,
        editorial_date: '2026-11-20',
        time_status: 'confirmed',
        start_time: '2026-11-20T16:00:00Z',
        price_cents: 0,
        is_free: true,
        status: 'published'
      }),
    });
    const eventId = (await createRes.json()).event_id;
    createdEventIds.push(eventId);

    // Cambiar a pendiente de hora
    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        time_status: 'pending_time',
        approximate_schedule: 'Aplazado horario por lluvia - pendiente',
      }),
    });
    expect(patchRes.status).toBe(200);

    const dbEv = await testPool.query(`SELECT time_status, start_time, approximate_schedule FROM events WHERE id = $1;`, [eventId]);
    expect(dbEv.rows[0].time_status).toBe('pending_time');
    expect(dbEv.rows[0].start_time).toBeNull();
    expect(dbEv.rows[0].approximate_schedule).toBe('Aplazado horario por lluvia - pendiente');
  });

  // Escenario 4: Exposición con periodo y horario textual
  test('Escenario 4: Exposición con periodo y horario textual', async () => {
    const createRes = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Exposición Esculturas Palentinas',
        category: 'exposicion',
        venue_id: testVenueId,
        editorial_date: '2026-11-01',
        time_status: 'continuous',
        start_time: null,
        end_date: '2026-11-30',
        schedule_text: 'De lunes a viernes de 10:00 a 14:00 y de 17:00 a 20:30',
        price_cents: 0,
        is_free: true,
        status: 'published'
      }),
    });
    expect(createRes.status).toBe(201);
    const eventId = (await createRes.json()).event_id;
    createdEventIds.push(eventId);

    const dbEv = await testPool.query(`SELECT time_status, start_time, end_date, schedule_text, status FROM events WHERE id = $1;`, [eventId]);
    expect(dbEv.rows[0].time_status).toBe('continuous');
    expect(dbEv.rows[0].start_time).toBeNull();
    expect(dbEv.rows[0].end_date).toBe('2026-11-30');
    expect(dbEv.rows[0].schedule_text).toContain('10:00 a 14:00');
    expect(dbEv.rows[0].status).toBe('published');
  });

  // Escenario 5: Bloqueo de publicación cuando faltan datos exigidos
  test('Escenario 5: Bloqueo de publicación cuando faltan datos exigidos', async () => {
    // 5a: Tentative date bloqueado de publicación
    const resTentative = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Conferencia Provisional Fecha Tentativa',
        category: 'conferencia',
        venue_id: testVenueId,
        editorial_date: '2026-12-01',
        time_status: 'tentative_date',
        start_time: null,
        price_cents: 0,
        is_free: true,
        status: 'published', // No permitido
      }),
    });
    expect(resTentative.status).toBe(400);
    const errTentative = await resTentative.json();
    expect(errTentative.error).toBe('tentative_date_cannot_be_published');

    // 5b: Continuous sin end_date bloqueado de publicación
    const resContinuousNoEnd = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Exposición sin fecha de clausura',
        category: 'exposicion',
        venue_id: testVenueId,
        editorial_date: '2026-11-01',
        time_status: 'continuous',
        start_time: null,
        end_date: null, // Prohibido publicar sin fin
        price_cents: 0,
        is_free: true,
        status: 'published',
      }),
    });
    expect(resContinuousNoEnd.status).toBe(400);
    const errContinuous = await resContinuousNoEnd.json();
    expect(errContinuous.error).toBe('continuous_end_date_required');

    // 5c: Publicar desde endpoint /publish un evento tentative_date existente
    const draftRes = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Borrador Fecha Tentativa en DB',
        category: 'conferencia',
        venue_id: testVenueId,
        editorial_date: '2026-12-05',
        time_status: 'tentative_date',
        price_cents: 0,
        is_free: true,
      }),
    });
    const draftId = (await draftRes.json()).event_id;
    createdEventIds.push(draftId);

    const tryPublishRes = await app.request(`/api/v1/admin/events/${draftId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    expect(tryPublishRes.status).toBe(400);
    const tryPubErr = await tryPublishRes.json();
    expect(tryPubErr.error).toBe('tentative_date_cannot_be_published');
  });

  // Escenario 6: Evento asociado a dos programas
  test('Escenario 6: Evento asociado a dos programas (N:M)', async () => {
    const createRes = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Concierto Central Jazz & Ciclo Otoño',
        category: 'musica_directo',
        venue_id: testVenueId,
        editorial_date: '2026-11-15',
        time_status: 'confirmed',
        start_time: '2026-11-15T21:00:00Z',
        price_cents: 1500,
        is_free: false,
        status: 'published',
        festival_ids: [festAId, festBId],
      }),
    });
    expect(createRes.status).toBe(201);
    const eventId = (await createRes.json()).event_id;
    createdEventIds.push(eventId);

    // Verificar en BD
    const linkRes = await testPool.query(`
      SELECT festival_id FROM event_festivals WHERE event_id = $1 ORDER BY festival_id ASC;
    `, [eventId]);
    expect(linkRes.rows.length).toBe(2);
    expect(linkRes.rows.map(r => r.festival_id)).toEqual([festAId, festBId].sort((a, b) => a - b));

    // Verificar en API admin GET /admin/events/:id
    const getRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const getData = await getRes.json();
    expect(getData.event.festival_ids.length).toBe(2);
    expect(getData.event.festivals.length).toBe(2);
  });

  // Escenario 7: Retirada de una asociación
  test('Escenario 7: Retirada de una asociación', async () => {
    // Crear evento con 2 festivales
    const createRes = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Recital Inicialmente Doble Programa',
        category: 'musica_directo',
        venue_id: testVenueId,
        editorial_date: '2026-11-18',
        time_status: 'confirmed',
        start_time: '2026-11-18T20:00:00Z',
        price_cents: 0,
        is_free: true,
        status: 'published',
        festival_ids: [festAId, festBId],
      }),
    });
    const eventId = (await createRes.json()).event_id;
    createdEventIds.push(eventId);

    // Retirar festB dejando solo festA
    const patchRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        festival_ids: [festAId],
      }),
    });
    expect(patchRes.status).toBe(200);

    const linkRes = await testPool.query(`
      SELECT festival_id FROM event_festivals WHERE event_id = $1;
    `, [eventId]);
    expect(linkRes.rows.length).toBe(1);
    expect(linkRes.rows[0].festival_id).toBe(festAId);
  });

  // Escenario 8: Edición manual -> sincronización -> cambios conservados
  test('Escenario 8: Edición manual -> sincronización -> cambios conservados', async () => {
    // 1. Simular evento importado de feed con dedupe_key y source_hash
    const dedupeKey = 'jcyl:dedupe-test-8-scenario';
    const initialSyncRes = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, time_status, start_time, editorial_date,
        price_cents, is_free, status, source_type, source_url, source_hash, dedupe_key, created_at, updated_at
      ) VALUES (
        1, $1, 'Título Original de Fuente Externa', 'teatro', 'confirmed',
        '2026-11-22T19:00:00Z', '2026-11-22', 0, true, 'tentative', 'jcyl_cultural',
        'https://cultura.jcyl.es/evento-test', 'hash_original_feed_123', $2, now(), now()
      ) RETURNING id;
    `, [testVenueId, dedupeKey]);
    const eventId = initialSyncRes.rows[0].id;
    createdEventIds.push(eventId);

    // 2. Editor manual cambia título y precio desde el panel mediante PATCH
    const manualEditRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Título Editado por Humano en VayaPlan',
        price_cents: 850,
        is_free: false,
      }),
    });
    expect(manualEditRes.status).toBe(200);

    // 3. Ejecutar sincronización con conector JCyL real enviando el mismo dedupe_key
    // La protección editorial detecta hash mismatch y preserva las modificaciones manuales
    const mockRecord = {
      id_evento: 'dedupe-test-8-scenario',
      titulo: 'Título Original Que Intenta Sobrescribir',
      descripcion: 'Nueva descripción',
      nombre_lugar: 'Biblioteca Pública de Palencia',
      lugar_celebracion: 'Biblioteca Pública de Palencia',
      codigo_biblioteca: 'BPPAL',
      nombre_localidad: 'Palencia',
      fecha_inicio: '2026-11-22',
      hora_inicio: '19:00',
      gratuito: 'Si',
      valor_tarifa: null,
      enlace_contenido: 'https://cultura.jcyl.es/evento-test',
      tematica: 'Teatro',
      tipo_actividad: 'Teatro'
    };

    const syncRes = await syncJcylLibraryActivities({
      cityId: 1,
      dryRun: false,
      fetchFn: async () => ({
        ok: true,
        json: async () => ({
          total_count: 1,
          results: [mockRecord]
        })
      }) as any
    });

    expect(syncRes.preservedEditorial).toBeGreaterThanOrEqual(1);

    // 4. Verificar en base de datos que los datos editados por el humano permanecen intactos
    const dbAfterSync = await testPool.query(`SELECT title, price_cents, is_free FROM events WHERE id = $1;`, [eventId]);
    expect(dbAfterSync.rows[0].title).toBe('Título Editado por Humano en VayaPlan');
    expect(dbAfterSync.rows[0].price_cents).toBe(850);
    expect(dbAfterSync.rows[0].is_free).toBe(false);
  });

  // Escenario 9: Borrador oculto para público
  test('Escenario 9: Borrador oculto para público', async () => {
    const draftRes = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Evento Secreto Borrador Público No Debe Ver',
        category: 'teatro',
        editorial_date: '2026-11-25',
        time_status: 'confirmed',
        start_time: '2026-11-25T20:00:00Z',
        price_cents: 0,
        is_free: true,
      }),
    });
    const draftId = (await draftRes.json()).event_id;
    createdEventIds.push(draftId);

    // A) En listado público de Palencia: no aparece
    const publicListRes = await app.request('/api/v1/cities/palencia/events?date=2026-11-25');
    expect(publicListRes.status).toBe(200);
    const publicListData = await publicListRes.json();
    const found = publicListData.events?.find((e: any) => e.id === draftId);
    expect(found).toBeUndefined();

    // B) En detalle directo de evento público /api/v1/events/:id: devuelve 404
    const publicSingleRes = await app.request(`/api/v1/events/${draftId}`);
    expect(publicSingleRes.status).toBe(404);
  });

  // Escenario 10: Autorización de administración validada en servidor
  test('Escenario 10: Autorización de administración validada en servidor (401 si no autenticado)', async () => {
    // A) GET /api/v1/admin/events sin token
    const resNoToken = await app.request('/api/v1/admin/events');
    expect(resNoToken.status).toBe(401);

    // B) POST /api/v1/admin/events sin token
    const resPostNoToken = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ataque no autorizado' }),
    });
    expect(resPostNoToken.status).toBe(401);

    // C) POST /api/v1/admin/events con token inválido
    const resBadToken = await app.request('/api/v1/admin/events', {
      headers: { Authorization: 'Bearer token_invalido_malicioso' },
    });
    expect(resBadToken.status).toBe(401);
  });

  // Escenario 11: Imagen de origen no publicada automáticamente
  test('Escenario 11: Imagen de origen no publicada automáticamente (image_url NULL, original preservada)', async () => {
    // Crear evento como lo hace el conector JCyL: imageUrl va a image_original_url, y image_url es NULL
    const sourceImgRes = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Actividad Cultural Con Cartel Externo JCyL',
        category: 'cultura',
        venue_id: testVenueId,
        editorial_date: '2026-11-28',
        time_status: 'confirmed',
        start_time: '2026-11-28T18:00:00Z',
        price_cents: 0,
        is_free: true,
        image_url: null, // Política estricta: NO pública
        image_original_url: 'https://medio.jcyl.es/cartel-terceros-sin-derechos.jpg',
        source_url: 'https://cultura.jcyl.es/evento-cartel',
        source_type: 'jcyl_cultural'
      }),
    });
    expect(sourceImgRes.status).toBe(201);
    const eventId = (await sourceImgRes.json()).event_id;
    createdEventIds.push(eventId);

    // Publicar evento
    const pubRes = await app.request(`/api/v1/admin/events/${eventId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(pubRes.status).toBe(200);

    // Consultar el endpoint público
    const pubViewRes = await app.request(`/api/v1/events/${eventId}`);
    expect(pubViewRes.status).toBe(200);
    const pubViewData = await pubViewRes.json();

    // image_url debe ser null en la respuesta pública para usar fallback de categoría/marca
    expect(pubViewData.event.image_url).toBeNull();
    // image_original_url NO debe exponerse al público
    expect(pubViewData.event.image_original_url).toBeUndefined();

    // Pero en el panel admin sí está disponible para inspección
    const adminViewRes = await app.request(`/api/v1/admin/events/${eventId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminViewData = await adminViewRes.json();
    expect(adminViewData.event.image_original_url).toBe('https://medio.jcyl.es/cartel-terceros-sin-derechos.jpg');
    expect(adminViewData.event.image_url).toBeNull();
  });

  // Escenario 12: Validación estricta de time_status (rechazo con 400 ante valores inválidos)
  test('Escenario 12: Validación de time_status — rechaza valores no reconocidos con código 400', async () => {
    // A) En POST /api/v1/admin/events
    const resPost = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Evento Con Time Status Inválido',
        venue_id: testVenueId,
        category: 'cultura',
        time_status: 'status_inexistente_erroneo',
        editorial_date: '2026-11-20',
      }),
    });
    expect(resPost.status).toBe(400);
    const postData = await resPost.json();
    expect(postData.error).toBe('invalid_parameter');
    expect(postData.message).toContain('time_status');

    // B) En POST /api/v1/admin/events/draft
    const resDraft = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Borrador Con Time Status Inválido',
        venue_id: testVenueId,
        category: 'cultura',
        time_status: 'otra_cosa_invalida',
      }),
    });
    expect(resDraft.status).toBe(400);
    const draftData = await resDraft.json();
    expect(draftData.error).toBe('invalid_parameter');

    // C) En PATCH /api/v1/admin/events/:id
    const validDraftRes = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Borrador Base Para Probar Patch Time Status',
        venue_id: testVenueId,
        category: 'cultura',
        time_status: 'confirmed',
        start_time: '2026-11-25T18:00:00Z',
      }),
    });
    expect(validDraftRes.status).toBe(201);
    const draftId = (await validDraftRes.json()).event_id;
    createdEventIds.push(draftId);

    const resPatch = await app.request(`/api/v1/admin/events/${draftId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        time_status: 'valor_falso_tiempo',
      }),
    });
    expect(resPatch.status).toBe(400);
    const patchData = await resPatch.json();
    expect(patchData.error).toBe('invalid_parameter');
  });

  // Escenario 13: Creación de festival sin UPSERT — rechazo de slug duplicado con 409
  test('Escenario 13: Creación de festival — rechaza slugs duplicados con código 409 (sin sobreescritura upsert)', async () => {
    const festPayload = {
      name: 'Festival Muestra Slug Duplicado',
      edition: '1ª Edición',
      start_date: '2026-12-01',
      end_date: '2026-12-05',
      official_url: 'https://festival-duplicado.test',
      description: 'Festival creado para verificar unicidad de slug.',
    };

    const firstRes = await app.request('/api/v1/admin/festivals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(festPayload),
    });
    expect(firstRes.status).toBe(201);
    const firstData = await firstRes.json();
    const createdFestId = firstData.festival.id;
    createdFestivalIds.push(createdFestId);

    // Segundo intento con mismo nombre (produce mismo slug)
    const secondRes = await app.request('/api/v1/admin/festivals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ...festPayload,
        edition: 'Edición Sobrescritura Intentada',
      }),
    });
    expect(secondRes.status).toBe(409);
    const secondData = await secondRes.json();
    expect(secondData.error).toBe('festival_already_exists');
    expect(secondData.message).toContain('festival-muestra-slug-duplicado');

    // Confirmar en BD que la edición NO fue sobrescrita
    const checkDb = await testPool.query('SELECT edition FROM festivals WHERE id = $1', [createdFestId]);
    expect(checkDb.rows[0].edition).toBe('1ª Edición');
  });

  // Escenario 14: Transacción única para festival_ids — rollback y preservación ante ID inexistente
  test('Escenario 14: Actualización transaccional de festival_ids — rollback total si un ID no existe preservando relaciones previas', async () => {
    // 1. Crear un evento borrador
    const evRes = await app.request('/api/v1/admin/events/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: 'Evento Con Transacción de Festivales',
        venue_id: testVenueId,
        category: 'cultura',
      }),
    });
    expect(evRes.status).toBe(201);
    const eventId = (await evRes.json()).event_id;
    createdEventIds.push(eventId);

    // 2. Asociar el evento a festAId inicialmente
    const initPatch = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        festival_ids: [festAId],
      }),
    });
    expect(initPatch.status).toBe(200);

    // Verificar en BD que la relación existe
    const initRelCheck = await testPool.query('SELECT festival_id FROM event_festivals WHERE event_id = $1', [eventId]);
    expect(initRelCheck.rows.length).toBe(1);
    expect(initRelCheck.rows[0].festival_id).toBe(festAId);

    // 3. Intentar actualizar con un array que incluye un festival válido (festBId) y uno INEXISTENTE (99999999)
    const badPatch = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        festival_ids: [festBId, 99999999],
      }),
    });
    expect(badPatch.status).toBe(400);
    const badPatchData = await badPatch.json();
    expect(badPatchData.error).toBe('festival_not_found');
    expect(badPatchData.message).toContain('99999999');

    // 4. VERIFICAR QUE SE PRODUJO ROLLBACK: La relación previa con festAId debe permanecer intacta
    const postRollbackCheck = await testPool.query('SELECT festival_id FROM event_festivals WHERE event_id = $1', [eventId]);
    expect(postRollbackCheck.rows.length).toBe(1);
    expect(postRollbackCheck.rows[0].festival_id).toBe(festAId);

    // festBId NO debe haber sido asociado tampoco
    const bCheck = postRollbackCheck.rows.find((r: { festival_id: number }) => r.festival_id === festBId);
    expect(bCheck).toBeUndefined();
  });

});

