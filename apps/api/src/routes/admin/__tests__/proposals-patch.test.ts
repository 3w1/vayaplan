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
let testVenueId: number;
let otherVenueId: number;

beforeAll(async () => {
  adminToken = await sign(
    { email: 'editor@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, category, is_active)
    VALUES (1, 'Venue Patch Test 1', 'venue-patch-test-1', 'Calle Mayor 10, Palencia', 'bar_musical', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = true
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  const venueRes2 = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, category, is_active)
    VALUES (1, 'Venue Patch Test 2', 'venue-patch-test-2', 'Calle Mayor 20, Palencia', 'teatro', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = true
    RETURNING id;
  `);
  otherVenueId = venueRes2.rows[0].id;
});

afterAll(async () => {
  if (createdProposalIds.length > 0) {
    await testPool.query(
      `DELETE FROM curation_proposals WHERE id = ANY($1::int[]) OR venue_id IN ($2, $3);`,
      [createdProposalIds, testVenueId, otherVenueId]
    );
  }
  await testPool.query(`DELETE FROM events WHERE venue_id IN ($1, $2);`, [testVenueId, otherVenueId]);
  await testPool.query(`DELETE FROM venues WHERE id IN ($1, $2);`, [testVenueId, otherVenueId]);
  await testPool.end();
});

describe('Edición Manual de Propuestas en Bandeja de Curación (PATCH /api/v1/admin/proposals/:id)', () => {
  test('1. Requiere autenticación de administrador (401)', async () => {
    const res = await app.request('/api/v1/admin/proposals/99999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nuevo Título' }),
    });
    expect(res.status).toBe(401);
  });

  test('2. Permite actualizar título, fecha, hora, categoría y precio en una propuesta pendiente', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Original', '2026-11-01', '19:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_test_1/',
        'https://media.vayaplan.com/bars/test/patch1.jpg', 'bars/test/patch1.jpg', 'MEDIA', 'test#2026-11-01#p1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    const initialEventsCount = await testPool.query('SELECT COUNT(*) as count FROM events WHERE venue_id = $1;', [testVenueId]);

    const res = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Título Editado por Admin',
        proposed_date: '2026-11-05',
        proposed_time: '21:30',
        venue_id: otherVenueId,
        category: 'musica_directo',
        price_status: 'CONFIRMED',
        price: '15,50',
        price_note: 'Anticipada en barra',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const updated = await testPool.query('SELECT * FROM curation_proposals WHERE id = $1;', [id]);
    expect(updated.rows[0].title).toBe('Título Editado por Admin');
    expect(updated.rows[0].proposed_date).toBe('2026-11-05');
    expect(updated.rows[0].proposed_time).toBe('21:30');
    expect(updated.rows[0].venue_id).toBe(otherVenueId);
    expect(updated.rows[0].category).toBe('musica_directo');
    expect(updated.rows[0].price_status).toBe('CONFIRMED');
    expect(Number(updated.rows[0].price)).toBe(15.5);
    expect(updated.rows[0].price_note).toBe('Anticipada en barra');
    expect(updated.rows[0].review_status).toBe('pending');

    // Confirmar que NO se ha creado ningún evento
    const postEventsCount = await testPool.query('SELECT COUNT(*) as count FROM events WHERE venue_id IN ($1, $2);', [testVenueId, otherVenueId]);
    expect(Number(postEventsCount.rows[0].count)).toBe(Number(initialEventsCount.rows[0].count));
  });

  test('3. Reclasifica CONTENIDO_VENUE a EVENTO_POSIBLE permitiendo asignación de horario', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Ambiente de viernes', null, null, $1, 'dj_tardeo', 'https://instagram.com/p/patch_venue_cont/',
        'https://media.vayaplan.com/bars/test/venue1.jpg', 'bars/test/venue1.jpg', 'BAJA', 'test#venuecont#1',
        'CONTENIDO_VENUE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    const res = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Fiesta Temática de Viernes',
        classification: 'EVENTO_POSIBLE',
        proposed_date: '2026-11-13',
        proposed_time: '23:00',
      }),
    });

    expect(res.status).toBe(200);

    const check = await testPool.query('SELECT classification, proposed_date, proposed_time, review_status FROM curation_proposals WHERE id = $1;', [id]);
    expect(check.rows[0].classification).toBe('EVENTO_POSIBLE');
    expect(check.rows[0].proposed_date).toBe('2026-11-13');
    expect(check.rows[0].proposed_time).toBe('23:00');
    expect(check.rows[0].review_status).toBe('pending');
  });

  test('4. Rechaza clasificaciones inválidas (400 invalid_classification)', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Test', '2026-11-10', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_invalid_cls/',
        'https://media.vayaplan.com/bars/test/inv1.jpg', 'bars/test/inv1.jpg', 'MEDIA', 'test#inv#1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    const res = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classification: 'INVENTADA_O_MALICIOSA',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_classification');
  });

  test('5. Rechaza título vacío, fecha inválida y hora con formato incorrecto', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Test Validaciones', '2026-11-10', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_val/',
        'https://media.vayaplan.com/bars/test/val1.jpg', 'bars/test/val1.jpg', 'MEDIA', 'test#val#1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    // Título vacío
    const resTitle = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(resTitle.status).toBe(400);
    expect((await resTitle.json()).error).toBe('empty_title');

    // Fecha inválida
    const resDate = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_date: 'fecha-erronea' }),
    });
    expect(resDate.status).toBe(400);
    expect((await resDate.json()).error).toBe('invalid_date');

    // Hora inválida
    const resTime = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_time: '25:99' }),
    });
    expect(resTime.status).toBe(400);
    expect((await resTime.json()).error).toBe('invalid_time');
  });

  test('6. Bloquea edición sobre propuestas que no están en estado pending (400 proposal_not_pending)', async () => {
    const pArchived = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Ya Archivada', '2026-11-10', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_archived/',
        'https://media.vayaplan.com/bars/test/arch1.jpg', 'bars/test/arch1.jpg', 'MEDIA', 'test#arch#1',
        'EVENTO_POSIBLE', 'archived', false
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = pArchived.rows[0].id;
    createdProposalIds.push(id);

    const res = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Intento de modificar archivada' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('proposal_not_pending');
  });

  test('7. Permite borrar fecha, hora o precio enviando null explícito y preserva campos no enviados', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review,
        price, price_status, price_note
      ) VALUES (
        'Propuesta Con Horario', '2026-11-20', '22:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_clear/',
        'https://media.vayaplan.com/bars/test/clear1.jpg', 'bars/test/clear1.jpg', 'ALTA', 'test#clear#1',
        'EVENTO_POSIBLE', 'pending', true,
        10.00, 'CONFIRMED', 'Consumición incluida'
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    const res = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposed_date: null,
        proposed_time: null,
        price: null,
        price_status: 'NOT_INFORMED',
        price_note: null,
      }),
    });

    expect(res.status).toBe(200);

    const check = await testPool.query('SELECT * FROM curation_proposals WHERE id = $1;', [id]);
    expect(check.rows[0].proposed_date).toBeNull();
    expect(check.rows[0].proposed_time).toBeNull();
    expect(check.rows[0].price).toBeNull();
    expect(check.rows[0].price_status).toBe('NOT_INFORMED');
    expect(check.rows[0].price_note).toBeNull();
    // Preserva campos intactos:
    expect(check.rows[0].title).toBe('Propuesta Con Horario');
    expect(check.rows[0].category).toBe('dj_tardeo');
    expect(check.rows[0].confidence).toBe('ALTA');
    expect(check.rows[0].venue_id).toBe(testVenueId);
  });
});
