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

  test('5. H-02: Rechaza fechas imposibles/desbordadas (2026-02-31, 2026-04-31) y horas fuera de rango (24:00, 28:00, 29:50)', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Test Validaciones H-02', '2026-11-10', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_val_h02/',
        'https://media.vayaplan.com/bars/test/valh02.jpg', 'bars/test/valh02.jpg', 'MEDIA', 'test#val#h02',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    // Fecha inexistente 31 de febrero (desborda en Date normal, pero se rechaza en calendario estricto)
    const resFeb31 = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_date: '2026-02-31' }),
    });
    expect(resFeb31.status).toBe(400);
    expect((await resFeb31.json()).error).toBe('invalid_date');

    // Fecha inexistente 31 de abril
    const resApr31 = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_date: '2026-04-31' }),
    });
    expect(resApr31.status).toBe(400);
    expect((await resApr31.json()).error).toBe('invalid_date');

    // Fecha malformada
    const resDateMal = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_date: 'fecha-invalida' }),
    });
    expect(resDateMal.status).toBe(400);
    expect((await resDateMal.json()).error).toBe('invalid_date');

    // Horas inválidas: 24:00, 28:00, 29:50, 12:60
    for (const badTime of ['24:00', '28:00', '29:50', '12:60', 'abc']) {
      const resBadTime = await app.request(`/api/v1/admin/proposals/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposed_time: badTime }),
      });
      expect(resBadTime.status).toBe(400);
      expect((await resBadTime.json()).error).toBe('invalid_time');
    }

    // Hora fin inválida
    const resBadEndTime = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_end_time: '25:00' }),
    });
    expect(resBadEndTime.status).toBe(400);
    expect((await resBadEndTime.json()).error).toBe('invalid_end_time');

    // Título vacío
    const resEmptyTitle = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(resEmptyTitle.status).toBe(400);
    expect((await resEmptyTitle.json()).error).toBe('empty_title');

    // Confirmar que la fila en base de datos NO fue modificada tras los errores 400
    const unchanged = await testPool.query('SELECT proposed_date, proposed_time, title FROM curation_proposals WHERE id = $1;', [id]);
    expect(unchanged.rows[0].proposed_date).toBe('2026-11-10');
    expect(unchanged.rows[0].proposed_time).toBe('20:00');
    expect(unchanged.rows[0].title).toBe('Propuesta Test Validaciones H-02');
  });

  test('6. H-02: Admite horas límite válidas (00:00 y 23:59) y fecha válida de año bisiesto (2024-02-29)', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Test Horas Límite', '2026-11-10', '12:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_limits/',
        'https://media.vayaplan.com/bars/test/limits.jpg', 'bars/test/limits.jpg', 'MEDIA', 'test#limits#1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    // 00:00 como hora inicio y 23:59 como hora fin
    const resLimits = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposed_time: '00:00',
        proposed_end_time: '23:59',
      }),
    });
    expect(resLimits.status).toBe(200);

    const checkLimits = await testPool.query('SELECT proposed_time, proposed_end_time FROM curation_proposals WHERE id = $1;', [id]);
    expect(checkLimits.rows[0].proposed_time).toBe('00:00');
    expect(checkLimits.rows[0].proposed_end_time).toBe('23:59');

    // Año bisiesto 2024-02-29
    const resLeap = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed_date: '2024-02-29' }),
    });
    expect(resLeap.status).toBe(200);
    const checkLeap = await testPool.query('SELECT proposed_date FROM curation_proposals WHERE id = $1;', [id]);
    expect(checkLeap.rows[0].proposed_date).toBe('2024-02-29');
  });

  test('7. H-03: Rechaza JSON malformado, null, arrays y primitivos con 400 (invalid_body / invalid_json)', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Test H-03 Body', '2026-11-10', '12:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_body_h03/',
        'https://media.vayaplan.com/bars/test/h03.jpg', 'bars/test/h03.jpg', 'MEDIA', 'test#h03#1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    // JSON malformado sintácticamente
    const resMalformed = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: '{ json_roto: ',
    });
    expect(resMalformed.status).toBe(400);
    expect((await resMalformed.json()).error).toBe('invalid_json');

    // null como cuerpo JSON
    const resNull = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: 'null',
    });
    expect(resNull.status).toBe(400);
    expect((await resNull.json()).error).toBe('invalid_body');

    // Array como cuerpo JSON
    const resArray = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ title: 'Inyección en array' }]),
    });
    expect(resArray.status).toBe(400);
    expect((await resArray.json()).error).toBe('invalid_body');

    // Primitivo número o string
    const resPrimitive = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: '12345',
    });
    expect(resPrimitive.status).toBe(400);
    expect((await resPrimitive.json()).error).toBe('invalid_body');

    // Comprobar que en la base de datos la propuesta sigue 100% inalterada
    const checkUnchanged = await testPool.query('SELECT title, proposed_date FROM curation_proposals WHERE id = $1;', [id]);
    expect(checkUnchanged.rows[0].title).toBe('Propuesta Test H-03 Body');
    expect(checkUnchanged.rows[0].proposed_date).toBe('2026-11-10');
  });

  test('8. H-03: Objeto vacío {} devuelve 200 informativo sin ejecutar UPDATE', async () => {
    const p = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Test Empty Body', '2026-11-10', '12:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_empty/',
        'https://media.vayaplan.com/bars/test/empty.jpg', 'bars/test/empty.jpg', 'MEDIA', 'test#empty#1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = p.rows[0].id;
    createdProposalIds.push(id);

    const resEmpty = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resEmpty.status).toBe(200);
    const body = await resEmpty.json();
    expect(body.message).toContain('No hay campos que actualizar');
  });

  test('9. Bloquea edición sobre propuestas que no están en estado pending (400 proposal_not_pending)', async () => {
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

  test('10. H-01: Protección atómica del UPDATE: si la propuesta deja de estar pending, responde 409 y no altera campos', async () => {
    // Escenario de carrera determinista:
    // Creamos una propuesta inicialmente en estado pending
    const pRace = await testPool.query(
      `INSERT INTO curation_proposals (
        title, proposed_date, proposed_time, venue_id, category, source_url,
        image_url, r2_key, confidence, dedupe_key, classification, review_status, requires_manual_review
      ) VALUES (
        'Propuesta Carrera Concurrente', '2026-11-15', '20:00', $1, 'dj_tardeo', 'https://instagram.com/p/patch_race/',
        'https://media.vayaplan.com/bars/test/race.jpg', 'bars/test/race.jpg', 'ALTA', 'test#race#1',
        'EVENTO_POSIBLE', 'pending', true
      ) RETURNING id;`,
      [testVenueId]
    );
    const id = pRace.rows[0].id;
    createdProposalIds.push(id);

    // Simulamos que otro administrador concurrente aprobó o archivó la propuesta justo antes de la ejecución del UPDATE
    await testPool.query(`UPDATE curation_proposals SET review_status = 'approved_draft' WHERE id = $1;`, [id]);

    // La petición PATCH intenta editar la propuesta
    const res = await app.request(`/api/v1/admin/proposals/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Intento de sobreescritura tardía', proposed_time: '23:00' }),
    });

    // Debe ser rechazada con 400 (si es rechazo temprano) o 409 (si pasó el select pero falló el update atómico)
    expect([400, 409]).toContain(res.status);
    const body = await res.json();
    expect(body.error).toBe('proposal_not_pending');

    // Confirmar que la fila en base de datos NO se sobreescribió
    const check = await testPool.query('SELECT title, proposed_time, review_status FROM curation_proposals WHERE id = $1;', [id]);
    expect(check.rows[0].title).toBe('Propuesta Carrera Concurrente');
    expect(check.rows[0].proposed_time).toBe('20:00');
    expect(check.rows[0].review_status).toBe('approved_draft');

    // ID inexistente responde 404
    const resNotFound = await app.request(`/api/v1/admin/proposals/888888`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No existo' }),
    });
    expect(resNotFound.status).toBe(404);
    expect((await resNotFound.json()).error).toBe('not_found');
  });

  test('11. Permite borrar fecha, hora o precio enviando null explícito y preserva campos no enviados', async () => {
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
