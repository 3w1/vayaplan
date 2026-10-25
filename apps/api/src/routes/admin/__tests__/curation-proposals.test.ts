import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

process.env.DATABASE_URL = rawTestDbUrl.trim();

const { app } = await import('../../../index');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { sign } = await import('hono/jwt');

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
const createdProposalIds: number[] = [];
const createdEventIds: number[] = [];
let testVenueId: number;

beforeAll(async () => {
  // Generar token de administrador para pruebas
  adminToken = await sign(
    { email: 'editor@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  // Asegurar venue de prueba en vayaplan_test
  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, category, is_active)
    VALUES (1, 'Bar Test Curation', 'bar-test-curation', 'Calle Mayor 1, Palencia', 'bar_musical', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = true
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;
});

afterAll(async () => {
  // Limpieza de datos creados en pruebas en la BD de test
  if (createdEventIds.length > 0) {
    await testPool.query(
      `DELETE FROM events WHERE id = ANY($1::int[]);`,
      [createdEventIds]
    );
  }
  await testPool.query(`DELETE FROM events WHERE venue_id = $1;`, [testVenueId]);
  if (createdProposalIds.length > 0) {
    await testPool.query(
      `DELETE FROM curation_proposals WHERE id = ANY($1::int[]) OR venue_id = $2;`,
      [createdProposalIds, testVenueId]
    );
  }
  await testPool.query(`DELETE FROM venues WHERE id = $1;`, [testVenueId]);
  await testPool.end();
});

describe('Bandeja de Curación de Propuestas de Bares (Admin Proposals API)', () => {
  test('1. Lista solo propuestas con review_status=pending', async () => {
    // Insertar una propuesta pendiente y una archivada
    const p1 = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Pendiente Test', '2026-10-24', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/pending1/',
        'https://media.vayaplan.com/bars/test/pending1.jpg', 'bars/test/pending1.jpg', 'ALTA', 'test#2026-10-24#pending1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    createdProposalIds.push(p1.rows[0].id);

    const p2 = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Archivada Test', '2026-02-14', null, $1, 'dj_tardeo', 'https://instagram.com/p/archived1/',
        'https://media.vayaplan.com/bars/test/archived1.jpg', 'bars/test/archived1.jpg', 'MEDIA', 'test#2026-02-14#archived1',
        'PAST_EVENT', 'archived', false
      ) RETURNING id;`,
      [testVenueId]
    );
    createdProposalIds.push(p2.rows[0].id);

    const res = await app.request('/api/v1/admin/proposals?review_status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposals).toBeArray();

    const ids = body.proposals.map((p: any) => p.id);
    expect(ids).toContain(p1.rows[0].id);
    expect(ids).not.toContain(p2.rows[0].id);
  });

  test('2. Aprueba una propuesta y crea un evento en estado DRAFT', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Sesión DJ Approval Test', '2026-10-24', '22:00', $1, 'dj_tardeo', 'https://instagram.com/p/approve1/',
        'https://media.vayaplan.com/bars/test/approve1.jpg', 'bars/test/approve1.jpg', 'ALTA', 'test#2026-10-24#approve1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const approveRes = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Sesión DJ Aprobada — Borrador Oficial',
        proposed_date: '2026-10-24',
        proposed_time: '22:00',
        venue_id: testVenueId,
        category: 'dj_tardeo',
      }),
    });

    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.success).toBe(true);
    expect(approveBody.createdEvent).toBeDefined();

    const eventId = approveBody.createdEvent.id;
    createdEventIds.push(eventId);

    // 3. Verificar que el evento creado NO está publicado (status = 'draft')
    expect(approveBody.createdEvent.status).toBe('draft');
    expect(approveBody.createdEvent.title).toBe('Sesión DJ Aprobada — Borrador Oficial');
    expect(approveBody.proposal.review_status).toBe('approved_draft');
    expect(approveBody.proposal.created_event_id).toBe(eventId);

    // Comprobar en base de datos
    const dbEvent = await testPool.query(`SELECT status FROM events WHERE id = $1;`, [eventId]);
    expect(dbEvent.rows[0].status).toBe('draft');
  });

  test('4. Rechaza una propuesta con motivo obligatorio', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta a Rechazar', '2026-10-24', '19:00', $1, 'dj_tardeo', 'https://instagram.com/p/reject1/',
        'https://media.vayaplan.com/bars/test/reject1.jpg', 'bars/test/reject1.jpg', 'MEDIA', 'test#2026-10-24#reject1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    // Intentar rechazar sin motivo -> debe fallar
    const failRes = await app.request(`/api/v1/admin/proposals/${propId}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rejection_reason: '' }),
    });
    expect(failRes.status).toBe(400);

    // Rechazar con motivo -> éxito
    const okRes = await app.request(`/api/v1/admin/proposals/${propId}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rejection_reason: 'Local cerrado temporalmente por reformas' }),
    });
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.proposal.review_status).toBe('rejected');
    expect(okBody.proposal.rejection_reason).toBe('Local cerrado temporalmente por reformas');
    expect(okBody.proposal.requires_manual_review).toBe(false);
  });

  test('5. Archiva una propuesta', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta a Archivar', '2026-01-01', $1, 'dj_tardeo', 'https://instagram.com/p/archive1/',
        'https://media.vayaplan.com/bars/test/archive1.jpg', 'bars/test/archive1.jpg', 'BAJA', 'test#2026-01-01#archive1',
        'PAST_EVENT', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposal.review_status).toBe('archived');
    expect(body.proposal.requires_manual_review).toBe(false);
  });

  test('6. Marca una propuesta como promoción', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Oferta 2x1 en Cervezas', null, $1, null, 'https://instagram.com/p/promo1/',
        'https://media.vayaplan.com/bars/test/promo1.jpg', 'bars/test/promo1.jpg', 'BAJA', 'test#promo1',
        'PROMOCION', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/promotion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposal.review_status).toBe('promotion');
    expect(body.proposal.classification).toBe('PROMOCION');
    expect(body.proposal.requires_manual_review).toBe(false);
  });

  test('7. Bloquea aprobación sin título, fecha o venue', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        '', null, null, 'dj_tardeo', 'https://instagram.com/p/incomplete1/',
        'https://media.vayaplan.com/bars/test/incomplete1.jpg', 'bars/test/incomplete1.jpg', 'BAJA', 'test#incomplete1',
        'REQUIERE_REVISION', 'pending', true
      ) RETURNING id;`,
      []
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    // Sin título ni fecha ni venue
    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('8. Bloquea creación si existe duplicado por dedupe_key', async () => {
    const dupKey = 'test#unique-dedupe-key-2026';

    // Insertar evento previo con ese dedupe_key
    const evRes = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, time_status, price_cents, is_free,
        image_url, source_type, dedupe_key, status
      ) VALUES (
        1, $1, 'Evento Previo Existente', 'dj_tardeo', '2026-10-24', 'pending_time', 0, true,
        'https://media.vayaplan.com/bars/test/prev.jpg', 'instagram', $2, 'draft'
      ) RETURNING id;
    `, [testVenueId, dupKey]);
    createdEventIds.push(evRes.rows[0].id);

    // Insertar propuesta con el mismo dedupe_key
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Duplicada', '2026-10-24', '21:00', $1, 'dj_tardeo', 'https://instagram.com/p/dup1/',
        'https://media.vayaplan.com/bars/test/dup1.jpg', 'bars/test/dup1.jpg', 'ALTA', $2,
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId, dupKey]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const approveRes = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Propuesta Duplicada',
        proposed_date: '2026-10-24',
        proposed_time: '21:00',
        venue_id: testVenueId,
      }),
    });

    expect(approveRes.status).toBe(409);
    const errBody = await approveRes.json();
    expect(errBody.error).toBe('duplicate_event');
    expect(errBody.existingEvent.id).toBe(evRes.rows[0].id);
  });

  test('9. Verifica que la imagen usada debe ser de Cloudflare R2 y bloquea CDN de Instagram', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Test Imagen CDN', '2026-10-24', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/cdn1/',
        'https://media.vayaplan.com/bars/test/cdn1.jpg', 'bars/test/cdn1.jpg', 'ALTA', 'test#cdn1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Imagen CDN',
        proposed_date: '2026-10-24',
        proposed_time: '20:00',
        venue_id: testVenueId,
        image_url: 'https://scontent-lga3-3.cdninstagram.com/v/t51.82787-15/invalid.jpg',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_image_source');
  });

  test('10. Bloquea acceso a usuarios no autenticados en la bandeja de propuestas', async () => {
    const resGet = await app.request('/api/v1/admin/proposals');
    expect(resGet.status).toBe(401);

    const resApprove = await app.request('/api/v1/admin/proposals/1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resApprove.status).toBe(401);

    const resReject = await app.request('/api/v1/admin/proposals/1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejection_reason: 'Sin auth' }),
    });
    expect(resReject.status).toBe(401);
  });

  test('11. Bug de precio: Entrada "12,50" se guarda como 12.50 (numeric) y price_cents = 1250', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Héroes El Culto — Test Precio', '2026-10-31', '21:30', $1, 'musica_directo', 'https://instagram.com/p/heroes1/',
        'https://media.vayaplan.com/bars/test/heroes1.jpg', 'bars/test/heroes1.jpg', 'ALTA', 'test#heroes#1250',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Héroes El Culto — Concierto Tributo',
        proposed_date: '2026-10-31',
        proposed_time: '21:30',
        venue_id: testVenueId,
        category: 'musica_directo',
        price: '12,50', // Entrada con coma decimal española
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const eventId = body.createdEvent.id;
    createdEventIds.push(eventId);

    // Verificar en tabla events: price_cents debe ser 1250 (12,50 €)
    const evCheck = await testPool.query(`SELECT price_cents, is_free, status FROM events WHERE id = $1;`, [eventId]);
    expect(evCheck.rows[0].price_cents).toBe(1250);
    expect(evCheck.rows[0].is_free).toBe(false);
    expect(evCheck.rows[0].status).toBe('draft');

    // Verificar en tabla curation_proposals: price debe ser 12.50
    const propCheck = await testPool.query(`SELECT price FROM curation_proposals WHERE id = $1;`, [propId]);
    expect(parseFloat(propCheck.rows[0].price)).toBe(12.50);
  });

  test('12. Normalización de precio con punto ("12.50") y miles europeos ("1.234,56")', async () => {
    const p1 = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Test Punto', '2026-11-01', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/punto1/',
        'https://media.vayaplan.com/bars/test/punto1.jpg', 'bars/test/punto1.jpg', 'ALTA', 'test#punto1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId1 = p1.rows[0].id;
    createdProposalIds.push(propId1);

    const res1 = await app.request(`/api/v1/admin/proposals/${propId1}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Punto',
        proposed_date: '2026-11-01',
        proposed_time: '20:00',
        venue_id: testVenueId,
        price: '12.50',
      }),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    const eventId1 = body1.createdEvent.id;
    createdEventIds.push(eventId1);

    const ev1 = await testPool.query(`SELECT price_cents FROM events WHERE id = $1;`, [eventId1]);
    expect(ev1.rows[0].price_cents).toBe(1250);

    // Miles europeos: "1.234,56"
    const p2 = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Test Miles', '2026-11-02', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/miles1/',
        'https://media.vayaplan.com/bars/test/miles1.jpg', 'bars/test/miles1.jpg', 'ALTA', 'test#miles1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId2 = p2.rows[0].id;
    createdProposalIds.push(propId2);

    const res2 = await app.request(`/api/v1/admin/proposals/${propId2}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Miles',
        proposed_date: '2026-11-02',
        proposed_time: '20:00',
        venue_id: testVenueId,
        price: '1.234,56',
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    const eventId2 = body2.createdEvent.id;
    createdEventIds.push(eventId2);

    const ev2 = await testPool.query(`SELECT price_cents FROM events WHERE id = $1;`, [eventId2]);
    expect(ev2.rows[0].price_cents).toBe(123456);
  });

  test('13. Rechaza precio inválido ("abc") y precio negativo ("-5")', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Test Invalid Price', '2026-11-03', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/invprice1/',
        'https://media.vayaplan.com/bars/test/invprice1.jpg', 'bars/test/invprice1.jpg', 'ALTA', 'test#invprice1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    // Texto no numérico
    const resAbc = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Invalid Price',
        proposed_date: '2026-11-03',
        proposed_time: '20:00',
        venue_id: testVenueId,
        price: 'abc',
      }),
    });
    expect(resAbc.status).toBe(400);
    const bodyAbc = await resAbc.json();
    expect(bodyAbc.error).toBe('invalid_price');

    // Negativo
    const resNeg = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Invalid Price',
        proposed_date: '2026-11-03',
        proposed_time: '20:00',
        venue_id: testVenueId,
        price: '-5',
      }),
    });
    expect(resNeg.status).toBe(400);
    const bodyNeg = await resNeg.json();
    expect(bodyNeg.error).toBe('invalid_price');
  });

  test('14. Bloqueo estricto: CONTENIDO_VENUE no puede aprobarse como evento', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Reel Bar Salvaje Sin Fecha', null, null, $1, 'dj_tardeo', 'https://instagram.com/p/salvaje1/',
        'https://media.vayaplan.com/bars/test/salvaje1.jpg', 'bars/test/salvaje1.jpg', 'BAJA', 'test#salvaje1',
        'CONTENIDO_VENUE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    const res = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Intento de Aprobar Contenido de Venue',
        proposed_date: '2026-11-05',
        proposed_time: '22:00',
        venue_id: testVenueId,
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('cannot_approve_venue_content');
  });

  test('15. Bloqueo estricto: Propuesta sin hora no puede aprobarse hasta indicar hora válida', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Evento Sin Hora Test', '2026-11-06', null, $1, 'dj_tardeo', 'https://instagram.com/p/sinhora1/',
        'https://media.vayaplan.com/bars/test/sinhora1.jpg', 'bars/test/sinhora1.jpg', 'MEDIA', 'test#sinhora1',
        'EVENTO_POSIBLE_SIN_HORA', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    // Intento sin hora
    const resNoTime = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Evento Sin Hora Test',
        proposed_date: '2026-11-06',
        proposed_time: '',
        venue_id: testVenueId,
      }),
    });
    expect(resNoTime.status).toBe(400);
    const bodyNoTime = await resNoTime.json();
    expect(bodyNoTime.error).toBe('missing_time');

    // Proporcionando hora válida -> éxito
    const resWithTime = await app.request(`/api/v1/admin/proposals/${propId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Evento Sin Hora Test',
        proposed_date: '2026-11-06',
        proposed_time: '23:30',
        venue_id: testVenueId,
      }),
    });
    expect(resWithTime.status).toBe(200);
    const bodyWithTime = await resWithTime.json();
    const eventId = bodyWithTime.createdEvent.id;
    createdEventIds.push(eventId);
    expect(bodyWithTime.createdEvent.status).toBe('draft');
  });

  test('16. Vincula propuesta a evento existente (/link-event) sin duplicar eventos', async () => {
    // 1. Crear evento ya existente en base de datos
    const existingEv = await testPool.query(`
      INSERT INTO events (
        city_id, venue_id, title, category, editorial_date, start_time, time_status, price_cents, is_free,
        image_url, source_type, dedupe_key, status
      ) VALUES (
        1, $1, 'Evento Oficial Publicado Previo', 'dj_tardeo', '2026-11-10', '2026-11-10T23:00:00+02:00', 'confirmed', 0, true,
        'https://media.vayaplan.com/bars/test/pub1.jpg', 'instagram', 'test#existing#link', 'published'
      ) RETURNING id, title;
    `, [testVenueId]);
    const existingEventId = existingEv.rows[0].id;
    createdEventIds.push(existingEventId);

    // 2. Crear propuesta candidata que coincide con el evento
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review,
        matched_event_id, match_level
      ) VALUES (
        'Post Instagram de Evento Previo', '2026-11-10', '23:00', $1, 'dj_tardeo', 'https://instagram.com/p/linkprop1/',
        'https://media.vayaplan.com/bars/test/linkprop1.jpg', 'bars/test/linkprop1.jpg', 'ALTA', 'test#linkprop1',
        'DUPLICADO_POSIBLE', 'pending', true, $2, 'MATCH_ALTO'
      ) RETURNING id;`,
      [testVenueId, existingEventId]
    );
    const propId = p.rows[0].id;
    createdProposalIds.push(propId);

    // Contar eventos antes de vincular
    const countBefore = await testPool.query(`SELECT COUNT(*)::int AS count FROM events;`);

    // 3. Vincular con confirmación humana explícita
    const linkRes = await app.request(`/api/v1/admin/proposals/${propId}/link-event`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target_event_id: existingEventId }),
    });

    expect(linkRes.status).toBe(200);
    const linkBody = await linkRes.json();
    expect(linkBody.success).toBe(true);
    expect(linkBody.proposal.created_event_id).toBe(existingEventId);
    expect(linkBody.proposal.review_status).toBe('approved_draft');

    // 4. Verificar que NO se creó ningún evento nuevo
    const countAfter = await testPool.query(`SELECT COUNT(*)::int AS count FROM events;`);
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
  });
});
