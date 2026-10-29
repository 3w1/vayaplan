import { describe, expect, test, beforeAll, afterAll } from 'bun:test';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.2:5432/vayaplan_test';
process.env.DATABASE_URL = rawTestDbUrl.trim();

const { query } = await import('@vayaplan/db');
const { app } = await import('../../../index');
const { sign } = await import('hono/jwt');

describe('Administración — Integración de Categoría Gastronomía (API y Curación)', () => {
  let token: string;
  let venueId: number;
  const createdProposalIds: number[] = [];
  const createdEventIds: number[] = [];

  beforeAll(async () => {
    token = await sign(
      { email: 'admin@vayaplan.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
      process.env.JWT_SECRET || 'vayaplan_jwt_secret_dev_2026'
    );
    const venueRes = await query('SELECT id FROM venues WHERE is_active = true LIMIT 1;');
    venueId = venueRes.rows[0].id;
  });

  afterAll(async () => {
    for (const pId of createdProposalIds) {
      await query('DELETE FROM curation_proposals WHERE id = $1;', [pId]).catch(() => {});
    }
    for (const eId of createdEventIds) {
      await query('DELETE FROM events WHERE id = $1;', [eId]).catch(() => {});
    }
  });

  // ----------------------------------------------------------------------------
  // 1. Creación Manual de Propuesta con Categoría Gastronomía
  // ----------------------------------------------------------------------------
  test('1. POST /api/v1/admin/proposals/manual acepta y persiste category: gastronomia', async () => {
    const shortcode = 'TEST_GASTRO_MANUAL_' + Date.now();
    const res = await app.request('/api/v1/admin/proposals/manual', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://www.instagram.com/p/${shortcode}/`,
        title: 'Cata de Vinos Maridada Test',
        image_url: 'https://media.vayaplan.com/instagram-imports/test/cover.jpg',
        proposed_date: '2026-11-25',
        proposed_time: '20:30',
        venue_id: venueId,
        category: 'gastronomia',
        price_status: 'CONFIRMED',
        price_amount: 35.0,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.proposal).toBeDefined();
    expect(data.proposal.category).toBe('gastronomia');
    expect(data.proposal.title).toBe('Cata de Vinos Maridada Test');
    createdProposalIds.push(data.proposal.id);

    // Verificar en BD
    const dbCheck = await query('SELECT category FROM curation_proposals WHERE id = $1;', [data.proposal.id]);
    expect(dbCheck.rows[0].category).toBe('gastronomia');
  });

  // ----------------------------------------------------------------------------
  // 2. Edición de Propuesta con Gastronomía y Rechazo de Inválidas
  // ----------------------------------------------------------------------------
  test('2. PATCH /api/v1/admin/proposals/:id actualiza a gastronomia y rechaza categorias desconocidas', async () => {
    // Crear propuesta previa con source_url e image_url
    const insertRes = await query(
      `INSERT INTO curation_proposals (title, proposed_date, proposed_time, venue_id, category, source_url, source_type, image_url, classification, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'instagram', 'https://media.vayaplan.com/test.jpg', $7, $8) RETURNING id;`,
      ['Propuesta Pre-Edicion', '2026-11-26', '20:00', venueId, 'dj_tardeo', 'https://www.instagram.com/p/TEST_PRE_ED_' + Date.now() + '/', 'EVENTO_POSIBLE', 'pending']
    );
    const propId = insertRes.rows[0].id;
    createdProposalIds.push(propId);

    // Intentar asignar categoría inválida
    const errRes = await app.request(`/api/v1/admin/proposals/${propId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'categoria_inexistente_123' }),
    });
    expect(errRes.status).toBe(400);
    const errData = await errRes.json();
    expect(errData.error).toBe('invalid_category');

    // Asignar categoría 'gastronomia'
    const okRes = await app.request(`/api/v1/admin/proposals/${propId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'gastronomia' }),
    });
    expect(okRes.status).toBe(200);

    const dbCheck = await query('SELECT category FROM curation_proposals WHERE id = $1;', [propId]);
    expect(dbCheck.rows[0].category).toBe('gastronomia');
  });

  // ----------------------------------------------------------------------------
  // 3. Aprobación de Propuesta: Creación de Evento Borrador con Gastronomía
  // ----------------------------------------------------------------------------
  test('3. POST /api/v1/admin/proposals/:id/approve crea evento borrador con category gastronomia', async () => {
    const dedupeKey = 'test_gastro_approve_' + Date.now();
    const insertRes = await query(
      `INSERT INTO curation_proposals (title, proposed_date, proposed_time, venue_id, category, price, source_url, source_type, image_url, dedupe_key, classification, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'instagram', 'https://media.vayaplan.com/test.jpg', $8, $9, $10) RETURNING id;`,
      ['Cata Gourmet en Restaurante', '2026-11-27', '21:00', venueId, 'gastronomia', 45.0, 'https://www.instagram.com/p/' + dedupeKey + '/', dedupeKey, 'EVENTO_POSIBLE', 'pending']
    );
    const propId = insertRes.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Cata Gourmet en Restaurante',
        proposed_date: '2026-11-27',
        proposed_time: '21:00',
        venue_id: venueId,
        category: 'gastronomia',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.createdEvent).toBeDefined();
    expect(data.createdEvent.category).toBe('gastronomia');
    expect(data.createdEvent.status).toBe('draft');
    createdEventIds.push(data.createdEvent.id);

    // Verificar en tabla events
    const evCheck = await query('SELECT category, status FROM events WHERE id = $1;', [data.createdEvent.id]);
    expect(evCheck.rows[0].category).toBe('gastronomia');
    expect(evCheck.rows[0].status).toBe('draft');
  });

  // ----------------------------------------------------------------------------
  // 4. Creación y Edición de Eventos con Gastronomía
  // ----------------------------------------------------------------------------
  test('4. POST y PATCH en /api/v1/admin/events gestionan y validan estrictamente gastronomia', async () => {
    // POST /events
    const createRes = await app.request('/api/v1/admin/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Feria Gastronómica de Otoño',
        venue_id: venueId,
        category: 'gastronomia',
        editorial_date: '2026-11-28',
        time_status: 'confirmed',
        start_time: '2026-11-28T12:00:00.000Z',
        price_cents: 0,
        is_free: true,
        status: 'published',
      }),
    });

    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    const eventId = Number(createData.event_id);
    expect(eventId).toBeGreaterThan(0);
    createdEventIds.push(eventId);

    const initialCheck = await query('SELECT category FROM events WHERE id = $1;', [eventId]);
    expect(initialCheck.rows[0].category).toBe('gastronomia');

    // PATCH /events/:id con categoría inválida
    const patchErr = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'categoria_totalmente_invalida' }),
    });
    expect(patchErr.status).toBe(400);

    // PATCH /events/:id conservando gastronomia y modificando título
    const patchOk = await app.request(`/api/v1/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Feria Gastronómica de Otoño — Edición 2026' }),
    });
    expect(patchOk.status).toBe(200);

    const evCheck = await query('SELECT title, category FROM events WHERE id = $1;', [eventId]);
    expect(evCheck.rows[0].title).toBe('Feria Gastronómica de Otoño — Edición 2026');
    expect(evCheck.rows[0].category).toBe('gastronomia');
  });

  // ----------------------------------------------------------------------------
  // 5. Filtro de Eventos Administrativos por Gastronomía
  // ----------------------------------------------------------------------------
  test('5. GET /api/v1/admin/events?category=gastronomia devuelve los eventos gastronómicos', async () => {
    const res = await app.request('/api/v1/admin/events?category=gastronomia', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);
    for (const ev of data.events) {
      expect(['gastronomia', 'cata']).toContain(ev.category);
    }
  });

  // ----------------------------------------------------------------------------
  // 6. Agenda Pública: Borradores Gastronómicos Ocultos, Publicados Visibles
  // ----------------------------------------------------------------------------
  test('6. GET /api/v1/cities/palencia/events oculta eventos gastronómicos draft y muestra los publicados', async () => {
    // 1. Borrador gastronómico (no debe aparecer)
    const draftRes = await query(
      `INSERT INTO events (city_id, venue_id, title, category, time_status, start_time, editorial_date, price_cents, is_free, status, source_type, dedupe_key)
       VALUES (1, $1, 'Cata Secreta Borrador', 'gastronomia', 'confirmed', '2026-11-29T20:00:00Z', '2026-11-29', 2000, false, 'draft', 'manual', 'dedupe_gastro_draft_' || now()::text)
       RETURNING id;`,
      [venueId]
    );
    const draftId = draftRes.rows[0].id;
    createdEventIds.push(draftId);

    // 2. Evento publicado gastronómico
    const pubRes = await query(
      `INSERT INTO events (city_id, venue_id, title, category, time_status, start_time, editorial_date, price_cents, is_free, status, source_type, dedupe_key)
       VALUES (1, $1, 'Cata Publicada Oficial', 'gastronomia', 'confirmed', '2026-11-29T21:00:00Z', '2026-11-29', 2500, false, 'published', 'manual', 'dedupe_gastro_pub_' || now()::text)
       RETURNING id;`,
      [venueId]
    );
    const pubId = pubRes.rows[0].id;
    createdEventIds.push(pubId);

    const publicReq = await app.request('/api/v1/cities/palencia/events?date=2026-11-29');
    expect(publicReq.status).toBe(200);
    const publicData = await publicReq.json();

    const idsInPublic = publicData.events.map((e: any) => e.id);
    expect(idsInPublic).not.toContain(draftId);
    expect(idsInPublic).toContain(pubId);
  });

  // ----------------------------------------------------------------------------
  // 7. Eliminación de Conversión Silenciosa: ocio NO se convierte en dj_tardeo
  // ----------------------------------------------------------------------------
  test('7. Propuesta histórica ocio NO se convierte en dj_tardeo al aprobar y exige selección válida', async () => {
    const dedupeKey = 'test_hist_ocio_' + Date.now();
    const insertRes = await query(
      `INSERT INTO curation_proposals (title, proposed_date, proposed_time, venue_id, category, price, source_url, source_type, image_url, dedupe_key, classification, review_status)
       VALUES ($1, $2, $3, $4, 'ocio', 20.0, $5, 'instagram', 'https://media.vayaplan.com/test.jpg', $6, 'EVENTO_POSIBLE', 'pending') RETURNING id;`,
      ['Propuesta Histórica Ocio', '2026-11-30', '23:00', venueId, 'https://www.instagram.com/p/' + dedupeKey + '/', dedupeKey]
    );
    const propId = insertRes.rows[0].id;
    createdProposalIds.push(propId);

    // Intento de aprobación sin seleccionar categoría válida (heredando 'ocio')
    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Propuesta Histórica Ocio',
        proposed_date: '2026-11-30',
        proposed_time: '23:00',
        venue_id: venueId,
        // no envía category o envía 'ocio'
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_event_category');
    expect(data.message).toContain('ocio');
    expect(data.message).toContain('no es válida para publicar');

    // Confirmar que NO se creó ningún evento (ni como dj_tardeo ni como ocio)
    const evCheck = await query('SELECT id FROM events WHERE dedupe_key = $1;', [dedupeKey]);
    expect(evCheck.rows.length).toBe(0);

    // Confirmar que la propuesta permanece pendiente y con category 'ocio' intacta
    const propCheck = await query('SELECT review_status, category FROM curation_proposals WHERE id = $1;', [propId]);
    expect(propCheck.rows[0].review_status).toBe('pending');
    expect(propCheck.rows[0].category).toBe('ocio');
  });

  // ----------------------------------------------------------------------------
  // 8. Edición No Bloqueante: Guardar otros cambios conserva category histórica
  // ----------------------------------------------------------------------------
  test('8. PATCH /proposals/:id permite guardar cambios de título o fecha sin bloquear por categoría histórica', async () => {
    const dedupeKey = 'test_patch_keep_ocio_' + Date.now();
    const insertRes = await query(
      `INSERT INTO curation_proposals (title, proposed_date, proposed_time, venue_id, category, price, source_url, source_type, image_url, dedupe_key, classification, review_status)
       VALUES ($1, $2, $3, $4, 'ocio', 15.0, $5, 'instagram', 'https://media.vayaplan.com/test.jpg', $6, 'EVENTO_POSIBLE', 'pending') RETURNING id;`,
      ['Título Inicial', '2026-11-30', '22:00', venueId, 'https://www.instagram.com/p/' + dedupeKey + '/', dedupeKey]
    );
    const propId = insertRes.rows[0].id;
    createdProposalIds.push(propId);

    // Modificar título enviando category 'ocio' idéntica a la existente
    const res = await app.request(`/api/v1/admin/proposals/${propId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Título Corregido Sin Bloqueo',
        category: 'ocio',
      }),
    });

    expect(res.status).toBe(200);
    const propCheck = await query('SELECT title, category FROM curation_proposals WHERE id = $1;', [propId]);
    expect(propCheck.rows[0].title).toBe('Título Corregido Sin Bloqueo');
    expect(propCheck.rows[0].category).toBe('ocio');
  });

  // ----------------------------------------------------------------------------
  // 9. Elección Explícita de Gastronomía se Conserva al Aprobar
  // ----------------------------------------------------------------------------
  test('9. Elección explícita de category gastronomia en propuesta histórica crea evento gastronomia', async () => {
    const dedupeKey = 'test_hist_to_gastro_' + Date.now();
    const insertRes = await query(
      `INSERT INTO curation_proposals (title, proposed_date, proposed_time, venue_id, category, price, source_url, source_type, image_url, dedupe_key, classification, review_status)
       VALUES ($1, $2, $3, $4, 'ocio', 45.0, $5, 'instagram', 'https://media.vayaplan.com/test.jpg', $6, 'EVENTO_POSIBLE', 'pending') RETURNING id;`,
      ['Cata Vertical Bodega', '2026-11-29', '20:00', venueId, 'https://www.instagram.com/p/' + dedupeKey + '/', dedupeKey]
    );
    const propId = insertRes.rows[0].id;
    createdProposalIds.push(propId);

    // El operador elige explícitamente 'gastronomia' al aprobar
    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Cata Vertical Bodega',
        proposed_date: '2026-11-29',
        proposed_time: '20:00',
        venue_id: venueId,
        category: 'gastronomia',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.createdEvent.category).toBe('gastronomia');
    createdEventIds.push(data.createdEvent.id);

    const evCheck = await query('SELECT category FROM events WHERE id = $1;', [data.createdEvent.id]);
    expect(evCheck.rows[0].category).toBe('gastronomia');
  });

  // ----------------------------------------------------------------------------
  // 10. Categorías Musicales Válidas Siguen Funcionando
  // ----------------------------------------------------------------------------
  test('10. Categorías musicales válidas (musica_directo, dj_tardeo) siguen funcionando sin alteración', async () => {
    const dedupeKey = 'test_music_valid_' + Date.now();
    const insertRes = await query(
      `INSERT INTO curation_proposals (title, proposed_date, proposed_time, venue_id, category, price, source_url, source_type, image_url, dedupe_key, classification, review_status)
       VALUES ($1, $2, $3, $4, 'musica_directo', 10.0, $5, 'instagram', 'https://media.vayaplan.com/test.jpg', $6, 'EVENTO_POSIBLE', 'pending') RETURNING id;`,
      ['Concierto de Rock', '2026-11-29', '22:30', venueId, 'https://www.instagram.com/p/' + dedupeKey + '/', dedupeKey]
    );
    const propId = insertRes.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Concierto de Rock',
        proposed_date: '2026-11-29',
        proposed_time: '22:30',
        venue_id: venueId,
        category: 'musica_directo',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.createdEvent.category).toBe('musica_directo');
    createdEventIds.push(data.createdEvent.id);

    const evCheck = await query('SELECT category FROM events WHERE id = $1;', [data.createdEvent.id]);
    expect(evCheck.rows[0].category).toBe('musica_directo');
  });
});
