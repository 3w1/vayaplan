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
  if (createdProposalIds.length > 0) {
    await testPool.query(
      `DELETE FROM curation_proposals WHERE id = ANY($1::int[]);`,
      [createdProposalIds]
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
        title, proposed_date, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Duplicada', '2026-10-24', $1, 'dj_tardeo', 'https://instagram.com/p/dup1/',
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
        title, proposed_date, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Test Imagen CDN', '2026-10-24', $1, 'dj_tardeo', 'https://instagram.com/p/cdn1/',
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
});
