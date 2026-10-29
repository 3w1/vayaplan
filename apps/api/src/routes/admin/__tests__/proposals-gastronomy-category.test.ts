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

  // ----------------------------------------------------------------------------
  // 11. Script SQL de Corrección Protegido con operation_id, Respaldo Duradero e Idempotencia
  // ----------------------------------------------------------------------------
  test('11. Script de corrección SQL preserva status published, usa operation_id y es idempotente', async () => {
    // 1. Crear evento fixture con status 'published' y category 'dj_tardeo'
    const evInsert = await query(`
      INSERT INTO events (
        city_id, venue_id, title, description, category, start_time,
        editorial_date, price_cents, is_free, status, source_type, created_at, updated_at
      ) VALUES (
        1, $1, 'Cata Exclusiva Fixture Test', 'Descripción detallada intacta',
        'dj_tardeo', '2026-10-29 19:00:00+00', '2026-10-29', 4500, false,
        'published', 'instagram_intropix', NOW(), '2026-10-29 14:58:58.188254+00'::timestamptz
      ) RETURNING id, updated_at, status, category, title, description, price_cents;
    `, [venueId]);
    const simEvId = evInsert.rows[0].id;
    createdEventIds.push(simEvId);

    // 2. Crear propuesta fixture con category 'ocio' vinculada a este evento
    const propInsert = await query(`
      INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, price,
        image_url, source_url, source_type, created_event_id, review_status, created_at, updated_at
      ) VALUES (
        'Cata Exclusiva Fixture Test', '2026-10-29', '20:00', $1,
        'ocio', 45.0, 'https://media.vayaplan.com/test.jpg', 'https://www.instagram.com/p/test_fix/', 'instagram_intropix',
        $2, 'approved_draft', NOW(), '2026-10-29 14:31:49.66438+00'::timestamptz
      ) RETURNING id, updated_at, category, title, review_status;
    `, [venueId, simEvId]);
    const simPropId = propInsert.rows[0].id;
    createdProposalIds.push(simPropId);

    // 3. Crear tablas duraderas de auditoría y respaldo (limpiando ejecuciones previas de test)
    await query(`
      DROP TABLE IF EXISTS _test_fix_gastronomia_audit CASCADE;
      DROP TABLE IF EXISTS _test_backup_curation_prop_history CASCADE;
      DROP TABLE IF EXISTS _test_backup_events_history CASCADE;

      CREATE TABLE _test_fix_gastronomia_audit (
        id SERIAL PRIMARY KEY,
        operation_id TEXT NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INT NOT NULL,
        pre_category VARCHAR(50),
        pre_updated_at TIMESTAMPTZ,
        post_category VARCHAR(50),
        post_updated_at TIMESTAMPTZ,
        was_modified BOOLEAN NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS _test_backup_curation_prop_history (
        operation_id TEXT NOT NULL,
        proposal_id INT NOT NULL,
        row_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS _test_backup_events_history (
        operation_id TEXT NOT NULL,
        event_id INT NOT NULL,
        row_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Función auxiliar para simular la ejecución del script PL/pgSQL
    const runCorrection = async (opId: string) => {
      await query(`
        DO $$
        DECLARE
          v_op_id TEXT := '${opId}';
          v_prop_pre curation_proposals%ROWTYPE;
          v_ev_pre   events%ROWTYPE;
          v_prop_post curation_proposals%ROWTYPE;
          v_ev_post   events%ROWTYPE;
          v_prop_rows INT;
          v_ev_rows   INT;
        BEGIN
          -- 1. Consultar y verificar estado actual
          SELECT * INTO v_prop_pre FROM curation_proposals WHERE id = ${simPropId};
          IF NOT FOUND THEN
            RAISE EXCEPTION 'ABORT: Propuesta #% no encontrada', ${simPropId};
          END IF;

          SELECT * INTO v_ev_pre FROM events WHERE id = ${simEvId};
          IF NOT FOUND THEN
            RAISE EXCEPTION 'ABORT: Evento #% no encontrado', ${simEvId};
          END IF;

          -- 2. Verificar vinculación de forma segura ante NULL
          IF (v_prop_pre.created_event_id IS DISTINCT FROM ${simEvId}) AND (v_prop_pre.matched_event_id IS DISTINCT FROM ${simEvId}) THEN
            RAISE EXCEPTION 'ABORT: Propuesta #% no vinculada al evento #%', ${simPropId}, ${simEvId};
          END IF;

          -- 3. Caso Idempotente: Si ambos ya son 'gastronomia'
          IF v_prop_pre.category = 'gastronomia' AND v_ev_pre.category = 'gastronomia' THEN
            INSERT INTO _test_fix_gastronomia_audit (operation_id, entity_type, entity_id, pre_category, pre_updated_at, post_category, post_updated_at, was_modified)
            VALUES 
              (v_op_id, 'proposal', ${simPropId}, v_prop_pre.category, v_prop_pre.updated_at, v_prop_pre.category, v_prop_pre.updated_at, false),
              (v_op_id, 'event', ${simEvId}, v_ev_pre.category, v_ev_pre.updated_at, v_ev_pre.category, v_ev_pre.updated_at, false);
            RETURN;
          END IF;

          -- 4. Respaldo duradero asociado al operation_id
          INSERT INTO _test_backup_curation_prop_history (operation_id, proposal_id, row_data)
          VALUES (v_op_id, ${simPropId}, to_jsonb(v_prop_pre));

          INSERT INTO _test_backup_events_history (operation_id, event_id, row_data)
          VALUES (v_op_id, ${simEvId}, to_jsonb(v_ev_pre));

          -- 5. Actualizar propuesta con bloqueo optimista
          UPDATE curation_proposals
          SET category = 'gastronomia', updated_at = NOW()
          WHERE id = ${simPropId} AND updated_at = v_prop_pre.updated_at
          RETURNING * INTO v_prop_post;
          GET DIAGNOSTICS v_prop_rows = ROW_COUNT;
          IF v_prop_rows <> 1 THEN
            RAISE EXCEPTION 'ABORT: Bloqueo optimista falló en propuesta';
          END IF;

          -- 6. Actualizar evento con bloqueo optimista
          UPDATE events
          SET category = 'gastronomia', updated_at = NOW()
          WHERE id = ${simEvId} AND updated_at = v_ev_pre.updated_at
          RETURNING * INTO v_ev_post;
          GET DIAGNOSTICS v_ev_rows = ROW_COUNT;
          IF v_ev_rows <> 1 THEN
            RAISE EXCEPTION 'ABORT: Bloqueo optimista falló en evento';
          END IF;

          -- 7. Comparar todos los campos contra el estado previo exceptuando category y updated_at
          IF (to_jsonb(v_prop_post) - 'category' - 'updated_at') IS DISTINCT FROM (to_jsonb(v_prop_pre) - 'category' - 'updated_at') THEN
            RAISE EXCEPTION 'ABORT: Campos ajenos alterados en propuesta';
          END IF;

          IF (to_jsonb(v_ev_post) - 'category' - 'updated_at') IS DISTINCT FROM (to_jsonb(v_ev_pre) - 'category' - 'updated_at') THEN
            RAISE EXCEPTION 'ABORT: Campos ajenos alterados en evento';
          END IF;

          -- 8. Registrar auditoría con was_modified = true
          INSERT INTO _test_fix_gastronomia_audit (operation_id, entity_type, entity_id, pre_category, pre_updated_at, post_category, post_updated_at, was_modified)
          VALUES 
            (v_op_id, 'proposal', ${simPropId}, v_prop_pre.category, v_prop_pre.updated_at, v_prop_post.category, v_prop_post.updated_at, true),
            (v_op_id, 'event', ${simEvId}, v_ev_pre.category, v_ev_pre.updated_at, v_ev_post.category, v_ev_post.updated_at, true);
        END $$;
      `);
    };

    // A. Ejecución inicial: modifica ambos registros
    await runCorrection('op_test_run_1');

    const evAfter1 = (await query('SELECT * FROM events WHERE id = $1;', [simEvId])).rows[0];
    const propAfter1 = (await query('SELECT * FROM curation_proposals WHERE id = $1;', [simPropId])).rows[0];

    expect(evAfter1.status).toBe('published');
    expect(evAfter1.category).toBe('gastronomia');
    expect(evAfter1.price_cents).toBe(4500);
    expect(evAfter1.title).toBe('Cata Exclusiva Fixture Test');
    expect(propAfter1.category).toBe('gastronomia');
    expect(propAfter1.review_status).toBe('approved_draft');

    const audit1 = (await query('SELECT * FROM _test_fix_gastronomia_audit WHERE operation_id = $1;', ['op_test_run_1'])).rows;
    expect(audit1.length).toBe(2);
    expect(audit1.every((r: any) => r.was_modified === true)).toBe(true);

    // B. Ejecución repetida (Idempotencia): no debe volver a mutar ni alterar timestamps
    await runCorrection('op_test_run_2');

    const evAfter2 = (await query('SELECT * FROM events WHERE id = $1;', [simEvId])).rows[0];
    expect(evAfter2.updated_at.toISOString()).toBe(evAfter1.updated_at.toISOString());

    const audit2 = (await query('SELECT * FROM _test_fix_gastronomia_audit WHERE operation_id = $1;', ['op_test_run_2'])).rows;
    expect(audit2.length).toBe(2);
    expect(audit2.every((r: any) => r.was_modified === false)).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 12. Script SQL de Reversión por operation_id: Restaura solo was_modified=true y aborta ante mutación
  // ----------------------------------------------------------------------------
  test('12. Script de reversión por operation_id restaura versión previa y aborta ante mutación posterior', async () => {
    // 1. Obtener los IDs del test anterior
    const auditRes = await query(`
      SELECT * FROM _test_fix_gastronomia_audit 
      WHERE operation_id = 'op_test_run_1'
      ORDER BY id ASC;
    `);
    expect(auditRes.rows.length).toBe(2);

    const propAudit = auditRes.rows.find((r: any) => r.entity_type === 'proposal');
    const evAudit = auditRes.rows.find((r: any) => r.entity_type === 'event');

    // Reversión parametrizada por operation_id
    const runReversal = async (opId: string) => {
      await query(`
        DO $$
        DECLARE
          v_op_id TEXT := '${opId}';
          v_curr_prop curation_proposals%ROWTYPE;
          v_curr_ev   events%ROWTYPE;
          v_prop_audit _test_fix_gastronomia_audit%ROWTYPE;
          v_ev_audit   _test_fix_gastronomia_audit%ROWTYPE;
        BEGIN
          -- Comprobación independiente para propuesta
          SELECT * INTO v_prop_audit FROM _test_fix_gastronomia_audit 
          WHERE operation_id = v_op_id AND entity_type = 'proposal' AND entity_id = ${propAudit.entity_id};
          IF NOT FOUND THEN
            RAISE EXCEPTION 'ABORT REVERSAL: Auditoría de propuesta #% no encontrada para %', ${propAudit.entity_id}, v_op_id;
          END IF;

          -- Comprobación independiente para evento
          SELECT * INTO v_ev_audit FROM _test_fix_gastronomia_audit 
          WHERE operation_id = v_op_id AND entity_type = 'event' AND entity_id = ${evAudit.entity_id};
          IF NOT FOUND THEN
            RAISE EXCEPTION 'ABORT REVERSAL: Auditoría de evento #% no encontrada para %', ${evAudit.entity_id}, v_op_id;
          END IF;

          SELECT * INTO v_curr_prop FROM curation_proposals WHERE id = ${propAudit.entity_id};
          SELECT * INTO v_curr_ev FROM events WHERE id = ${evAudit.entity_id};

          -- Revertir solo si was_modified es true
          IF v_prop_audit.was_modified THEN
            IF v_curr_prop.updated_at IS DISTINCT FROM v_prop_audit.post_updated_at THEN
              RAISE EXCEPTION 'ABORT REVERSAL: Mutación posterior detectada en propuesta #%', ${propAudit.entity_id};
            END IF;

            UPDATE curation_proposals
            SET category = v_prop_audit.pre_category, updated_at = NOW()
            WHERE id = ${propAudit.entity_id};
          END IF;

          IF v_ev_audit.was_modified THEN
            IF v_curr_ev.updated_at IS DISTINCT FROM v_ev_audit.post_updated_at THEN
              RAISE EXCEPTION 'ABORT REVERSAL: Mutación posterior detectada en evento #%', ${evAudit.entity_id};
            END IF;

            UPDATE events
            SET category = v_ev_audit.pre_category, updated_at = NOW()
            WHERE id = ${evAudit.entity_id};
          END IF;
        END $$;
      `);
    };

    // A. Revertir op_test_run_2 (donde was_modified = false): Cero cambios
    await runReversal('op_test_run_2');
    const stillGastro = (await query('SELECT category FROM events WHERE id = $1;', [evAudit.entity_id])).rows[0];
    expect(stillGastro.category).toBe('gastronomia');

    // B. Revertir op_test_run_1 (donde was_modified = true): Restaura categorías originales
    await runReversal('op_test_run_1');
    const revertedEv = (await query('SELECT category, status FROM events WHERE id = $1;', [evAudit.entity_id])).rows[0];
    const revertedProp = (await query('SELECT category FROM curation_proposals WHERE id = $1;', [propAudit.entity_id])).rows[0];

    expect(revertedEv.category).toBe('dj_tardeo');
    expect(revertedEv.status).toBe('published'); // Estado published preservado
    expect(revertedProp.category).toBe('ocio');

    // C. Detección de mutación posterior con IS NOT DISTINCT FROM
    // Al haber sufrido ya mutación de timestamp (por la reversión previa o ediciones concurrentes),
    // un intento posterior de reversión aborta con excepción
    let threw = false;
    try {
      await runReversal('op_test_run_1');
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain('ABORT REVERSAL: Mutación posterior detectada');
    }
    expect(threw).toBe(true);

    // Limpieza de tablas de prueba
    await query('DROP TABLE IF EXISTS _test_fix_gastronomia_audit;');
    await query('DROP TABLE IF EXISTS _test_backup_curation_prop_history;');
    await query('DROP TABLE IF EXISTS _test_backup_events_history;');
  });
});
