import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Pool } from 'pg';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';

process.env.DATABASE_URL = rawTestDbUrl.trim();
process.env.MOCK_R2 = 'true';

const { app } = await import('../../../index');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { sign } = await import('hono/jwt');
const { getLatestEventImageDecisions } = await import('../../../services/biblioteca-images/biblioteca-service');
const { R2_PROPOSALS_MAP } = await import('../biblioteca-images');

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
let originalEventsSnapshot: any[] = [];

beforeAll(async () => {
  adminToken = await sign(
    { email: 'admin-endpoint-test@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  const res = await testPool.query(`
    SELECT id, title, image_url, image_thumb_url, image_original_url, verified_at, verified_by, updated_at
    FROM events
    WHERE id IN (9, 14, 16, 19, 35, 44, 46)
    ORDER BY id;
  `);
  originalEventsSnapshot = res.rows;
});

beforeEach(async () => {
  // Limpiar decisiones de prueba para tener un estado determinista antes de cada prueba
  await testPool.query(`DELETE FROM event_image_decisions WHERE event_id IN (9, 14, 16, 19, 35, 44, 46);`);
});

afterAll(async () => {
  await testPool.query(`DELETE FROM event_image_decisions WHERE event_id IN (9, 14, 16, 19, 35, 44, 46);`);
  for (const row of originalEventsSnapshot) {
    await testPool.query(
      `UPDATE events
       SET image_url = $1,
           image_thumb_url = $2,
           image_original_url = $3,
           verified_at = $4,
           verified_by = $5,
           updated_at = $6
       WHERE id = $7`,
      [row.image_url, row.image_thumb_url, row.image_original_url, row.verified_at, row.verified_by, row.updated_at, row.id]
    );
  }
  await testPool.end();
});

describe('Endpoint Real Hono: GET y POST /api/v1/admin/biblioteca-images', () => {
  test('1. Rechazo claro ante un parámetro status inválido (HTTP 400)', async () => {
    const res = await app.request('/api/v1/admin/biblioteca-images/proposals?status=invalido', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_status');
    expect(body.message).toContain('pending, resolved, all');
  });

  test('2. Valor por defecto de status: omisión equivale exactamente a status=pending', async () => {
    const resDefault = await app.request('/api/v1/admin/biblioteca-images/proposals', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resDefault.status).toBe(200);
    const dataDefault = await resDefault.json();

    const resPending = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resPending.status).toBe(200);
    const dataPending = await resPending.json();

    expect(dataDefault.proposals.length).toBe(dataPending.proposals.length);
    expect(dataDefault.proposals.map((p: any) => p.eventId)).toEqual(dataPending.proposals.map((p: any) => p.eventId));
  });

  test('3. Evento verificado editorialmente en general pero sin decisión de imagen permanece PENDIENTE', async () => {
    // #9 con verified_at editorial general previo de publicación
    await testPool.query(`
      UPDATE events
      SET image_url = NULL,
          image_original_url = NULL,
          verified_at = '2026-10-19 23:44:57+00',
          verified_by = 'curador_general@vayaplan.com'
      WHERE id = 9;
    `);

    const res = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    const event9 = data.proposals.find((p: any) => p.eventId === 9);

    expect(event9).toBeDefined();
    expect(event9.isPending).toBe(true);
    expect(event9.activeDecision).toBeNull();
    // Demuestra que verified_at general no oculta la propuesta de imagen
    expect(event9.verifiedAt).toBe('2026-10-19T23:44:57.000Z');
    expect(event9.verifiedBy).toBe('curador_general@vayaplan.com');
  });

  test('4. Imagen idéntica a la candidata sin decisión previa en tabla dedicada permanece PENDIENTE', async () => {
    const candidateZo = 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';

    await testPool.query(`
      UPDATE events
      SET image_url = $1,
          verified_at = '2026-10-27 10:00:00+00',
          verified_by = 'admin@vayaplan.com'
      WHERE id = 44;
    `, [candidateZo]);

    const res = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    const event44 = data.proposals.find((p: any) => p.eventId === 44);

    expect(event44).toBeDefined();
    // Permanece pendiente porque no hay registro en event_image_decisions
    expect(event44.isPending).toBe(true);
    expect(event44.activeDecision).toBeNull();
    expect(event44.currentImageUrl).toBe(candidateZo);
    expect(event44.proposedImageUrl).toBe(candidateZo);
  });

  test('5. Contadores coherentes y segregados entre las pestañas pending, resolved y all', async () => {
    const resPending = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resResolved = await app.request('/api/v1/admin/biblioteca-images/proposals?status=resolved', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const resAll = await app.request('/api/v1/admin/biblioteca-images/proposals?status=all', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const dPending = await resPending.json();
    const dResolved = await resResolved.json();
    const dAll = await resAll.json();

    expect(dPending.totalPublished).toBe(dResolved.totalPublished);
    expect(dPending.totalPublished).toBe(dAll.totalPublished);
    expect(dPending.totalPending + dPending.totalResolved).toBe(dPending.totalPublished);
    expect(dAll.proposals.length).toBe(dPending.totalPublished);
    expect(dPending.proposals.length).toBe(dPending.totalPending);
    expect(dResolved.proposals.length).toBe(dResolved.totalResolved);
  });

  test('6. POST /decision con "adopt": actualiza imagen en events, NO toca verified_at/verified_by, registra en event_image_decisions y pasa a resueltas', async () => {
    const candidateZo = 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';
    const genericPoster = 'https://jazzpalencia.es/wp-content/uploads/2026/09/Cartel-Jazz-2026.webp';
    const initialVerifiedAt = '2026-10-20 12:00:00+00';
    const initialVerifiedBy = 'original_curator@vayaplan.com';

    await testPool.query(`
      UPDATE events
      SET image_url = $1,
          image_original_url = NULL,
          verified_at = $2,
          verified_by = $3
      WHERE id = 44;
    `, [genericPoster, initialVerifiedAt, initialVerifiedBy]);

    const adoptRes = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 44,
        action: 'adopt',
        candidateKey: 'biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp',
        candidateUrl: candidateZo,
        adoptedImageUrl: candidateZo,
        adoptedR2Key: 'biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp',
        adoptedCredit: 'Festival Jazz Palencia',
        notes: 'Adopción oficial autorizada',
      }),
    });
    expect(adoptRes.status).toBe(200);
    const adoptBody = await adoptRes.json();
    expect(adoptBody.success).toBe(true);
    expect(adoptBody.event.image_url).toBe(candidateZo);
    expect(adoptBody.event.image_original_url).toBe(genericPoster);

    // Comprobar en base de datos: verified_at y verified_by de events PERMANECEN INTACTOS
    const dbEvents = await testPool.query('SELECT image_url, image_original_url, verified_at, verified_by FROM events WHERE id = 44;');
    expect(dbEvents.rows[0].image_url).toBe(candidateZo);
    expect(dbEvents.rows[0].image_original_url).toBe(genericPoster);
    const dbVerifiedAtIso = new Date(dbEvents.rows[0].verified_at).toISOString();
    expect(dbVerifiedAtIso).toBe('2026-10-20T12:00:00.000Z');
    expect(dbEvents.rows[0].verified_by).toBe(initialVerifiedBy);

    // Comprobar inserción dedicada en event_image_decisions
    const dbDecisions = await testPool.query('SELECT * FROM event_image_decisions WHERE event_id = 44 ORDER BY id DESC;');
    expect(dbDecisions.rows.length).toBe(1);
    expect(dbDecisions.rows[0].action).toBe('adopt');
    expect(dbDecisions.rows[0].operator_email).toBe('admin-endpoint-test@vayaplan.com');
    expect(dbDecisions.rows[0].notes).toBe('Adopción oficial autorizada');

    // Recarga posterior: debe desaparecer de pending y figurar en resolved
    const resAfterPending = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dAfterPending = await resAfterPending.json();
    expect(dAfterPending.proposals.find((p: any) => p.eventId === 44)).toBeUndefined();

    const resAfterResolved = await app.request('/api/v1/admin/biblioteca-images/proposals?status=resolved', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dAfterResolved = await resAfterResolved.json();
    const resolved44 = dAfterResolved.proposals.find((p: any) => p.eventId === 44);
    expect(resolved44).toBeDefined();
    expect(resolved44.isPending).toBe(false);
    expect(resolved44.activeDecision).toBeDefined();
    expect(resolved44.activeDecision.action).toBe('adopt');
  });

  test('7. POST con "keep_current" y "discard": persisten en event_image_decisions, sacan de pendientes y no alteran events', async () => {
    const initialEvents = await testPool.query('SELECT image_url, verified_at, verified_by FROM events WHERE id = 35;');
    const initialImage = initialEvents.rows[0].image_url;

    // Ejecutar keep_current en evento #35
    const resKeep = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 35,
        action: 'keep_current',
        candidateKey: 'biblioteca-publica/escucha-jazz-biblioteca-sesion-1/927980595fc0.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/escucha-jazz-biblioteca-sesion-1/927980595fc0.webp',
      }),
    });
    expect(resKeep.status).toBe(200);

    // events NO debe haber cambiado
    const afterKeepEvents = await testPool.query('SELECT image_url, verified_at, verified_by FROM events WHERE id = 35;');
    expect(afterKeepEvents.rows[0].image_url).toBe(initialImage);

    // event_image_decisions tiene el registro
    const decKeep = await testPool.query('SELECT * FROM event_image_decisions WHERE event_id = 35 AND action = \'keep_current\';');
    expect(decKeep.rows.length).toBe(1);

    // Comprobar que sale de pendientes
    const resPending = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dPending = await resPending.json();
    expect(dPending.proposals.find((p: any) => p.eventId === 35)).toBeUndefined();

    // Ejecutar discard en evento #19
    const resDiscard = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 19,
        action: 'discard',
        candidateKey: 'biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
        candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
      }),
    });
    expect(resDiscard.status).toBe(200);

    const decDiscard = await testPool.query('SELECT * FROM event_image_decisions WHERE event_id = 19 AND action = \'discard\';');
    expect(decDiscard.rows.length).toBe(1);

    // Comprobar que en resolved aparece con la acción discard
    const resResolved = await app.request('/api/v1/admin/biblioteca-images/proposals?status=resolved', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dResolved = await resResolved.json();
    const resolved19 = dResolved.proposals.find((p: any) => p.eventId === 19);
    expect(resolved19).toBeDefined();
    expect(resolved19.activeDecision.action).toBe('discard');
  });

  test('8. "request_search" tras "adopt": NO deja el evento resuelto, reabre la tarjeta en pendientes y conserva el histórico', async () => {
    const candidateZo = 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';
    const candidateKey = 'biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';

    // 1. Primero se adopta la imagen oficial
    const resAdopt = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 44,
        action: 'adopt',
        candidateKey,
        candidateUrl: candidateZo,
      }),
    });
    expect(resAdopt.status).toBe(200);

    // 2. Posteriormente el operador solicita búsqueda alternativa para el mismo evento
    const resSearch = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 44,
        action: 'request_search',
        candidateKey,
        candidateUrl: candidateZo,
        notes: 'Buscar versión con mayor contraste y texto legible',
      }),
    });
    expect(resSearch.status).toBe(200);

    // 3. Comprobar que la tarjeta REAPARECE en pendientes y NO queda falsamente como adoptada
    const resPending = await app.request('/api/v1/admin/biblioteca-images/proposals?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dPending = await resPending.json();
    const pending44 = dPending.proposals.find((p: any) => p.eventId === 44);
    expect(pending44).toBeDefined();
    expect(pending44.isPending).toBe(true);
    expect(pending44.activeDecision).toBeDefined();
    expect(pending44.activeDecision.action).toBe('request_search');
    expect(pending44.activeDecision.notes).toBe('Buscar versión con mayor contraste y texto legible');

    // 4. Comprobar en base de datos que se conservan ambas decisiones en el historial
    const historyRes = await testPool.query(
      'SELECT action, notes, created_at FROM event_image_decisions WHERE event_id = 44 ORDER BY id ASC;'
    );
    expect(historyRes.rows.length).toBe(2);
    expect(historyRes.rows[0].action).toBe('adopt');
    expect(historyRes.rows[1].action).toBe('request_search');
  });

  test('9. Idempotencia: reintentar con la misma idempotencyKey responde idénticamente sin duplicar filas', async () => {
    const idemKey = 'test-idempotency-key-' + Date.now();
    const payload = {
      eventId: 9,
      action: 'adopt',
      candidateKey: 'biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
      candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
      idempotencyKey: idemKey,
      notes: 'Primera ejecución',
    };

    // Primera llamada
    const res1 = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.idempotent).toBe(false);

    // Segunda llamada (reintento exacto con la misma clave)
    const res2 = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.idempotent).toBe(true);
    expect(body2.decision.id).toBe(body1.decision.id);

    // En la base de datos debe existir exactamente 1 fila
    const rows = await testPool.query('SELECT * FROM event_image_decisions WHERE idempotency_key = $1;', [idemKey]);
    expect(rows.rows.length).toBe(1);
  });

  test('10. Conflicto de Idempotencia: reintentar con la misma idempotencyKey pero payload divergente retorna HTTP 409', async () => {
    const idemKey = 'test-conflict-key-' + Date.now();
    const payload1 = {
      eventId: 9,
      action: 'adopt',
      candidateKey: 'biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
      candidateUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
      idempotencyKey: idemKey,
      notes: 'Payload inicial',
    };

    const res1 = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload1),
    });
    expect(res1.status).toBe(200);

    // Intento con diferente acción y notas reutilizando la misma idempotencyKey
    const payload2 = {
      ...payload1,
      action: 'discard',
      notes: 'Payload divergente malicioso o corrupto',
    };

    const res2 = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload2),
    });
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toBe('idempotency_conflict');
  });

  test('11. Protección de candidata obsoleta (stale_candidate): rechaza de forma limpia con HTTP 409 si la candidata no coincide', async () => {
    const res = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 9,
        action: 'adopt',
        candidateKey: 'clave-antigua-o-falsa-de-otra-version.webp',
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('stale_candidate');
    expect(body.message).toContain('ya no coincide');
  });

  test('12. Concurrencia y serialización determinista: peticiones paralelas sobre el mismo evento se resuelven sin deadlock', async () => {
    const candidateZo = 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';
    const candidateKey = 'biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';

    const p1 = app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 44,
        action: 'adopt',
        candidateKey,
        candidateUrl: candidateZo,
        notes: 'Concurrente 1',
      }),
    });

    const p2 = app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 44,
        action: 'keep_current',
        candidateKey,
        candidateUrl: candidateZo,
        notes: 'Concurrente 2',
      }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect([200, 409]).toContain(res1.status);
    expect([200, 409]).toContain(res2.status);

    // Ambas transacciones concluyeron ordenadamente y los registros persisten en base de datos
    const decisions = await testPool.query('SELECT * FROM event_image_decisions WHERE event_id = 44;');
    expect(decisions.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('13. Coherencia de variantes de imagen: adopt actualiza image_url, image_thumb_url e image_detail_url evitando que quede una variante antigua visible', async () => {
    // 1. Añadir columna image_detail_url a events para verificar compatibilidad con esquemas de variantes completas
    await testPool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS image_detail_url TEXT;`);

    const candidateZo = 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp';
    const oldDetailVariant = 'https://media.vayaplan.com/antiguo-zo-detail.webp';
    const oldThumbVariant = 'https://media.vayaplan.com/antiguo-zo-thumb.webp';
    const oldGeneralUrl = 'https://media.vayaplan.com/antiguo-zo-general.webp';
    const originalArchivalPoster = 'https://jazzpalencia.es/cartel-fuente-original.jpg';
    const verifiedEditorialDate = '2026-10-15 08:30:00+00';
    const verifiedEditorialCurator = 'curador_patrimonio@vayaplan.com';

    // Estado inicial del evento con variantes antiguas segregadas
    await testPool.query(`
      UPDATE events
      SET image_url = $1,
          image_thumb_url = $2,
          image_detail_url = $3,
          image_original_url = $4,
          verified_at = $5,
          verified_by = $6
      WHERE id = 44;
    `, [oldGeneralUrl, oldThumbVariant, oldDetailVariant, originalArchivalPoster, verifiedEditorialDate, verifiedEditorialCurator]);

    // Ejecutar adopción
    const res = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 44,
        action: 'adopt',
        candidateKey: 'biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp',
        candidateUrl: candidateZo,
      }),
    });
    expect(res.status).toBe(200);

    // Comprobar en base de datos la sincronización de todas las variantes públicas
    const dbRow = await testPool.query(
      'SELECT image_url, image_thumb_url, image_detail_url, image_original_url, verified_at, verified_by FROM events WHERE id = 44;'
    );
    const ev = dbRow.rows[0];

    // Ninguna variante pública debe haber quedado con la URL antigua
    expect(ev.image_url).toBe(candidateZo);
    expect(ev.image_thumb_url).toBe(candidateZo);
    expect(ev.image_detail_url).toBe(candidateZo);
    expect(ev.image_detail_url).not.toBe(oldDetailVariant);

    // Preservación estricta de la imagen original y la verificación editorial previa
    expect(ev.image_original_url).toBe(originalArchivalPoster);
    expect(ev.verified_by).toBe(verifiedEditorialCurator);
    expect(new Date(ev.verified_at).toISOString()).toBe('2026-10-15T08:30:00.000Z');

    // Precedencia en vistas públicas:
    // Listado: renderEventThumbnail(ev.image_thumb_url || ev.image_url) -> candidateZo
    const listadoThumbnail = ev.image_thumb_url || ev.image_url;
    expect(listadoThumbnail).toBe(candidateZo);

    // Detalle: ev.image_detail_url || ev.image_url -> candidateZo
    const detalleImage = ev.image_detail_url || ev.image_url;
    expect(detalleImage).toBe(candidateZo);

    // Visor / Lightbox: ev.image_url -> candidateZo
    const visorPoster = ev.image_url;
    expect(visorPoster).toBe(candidateZo);

    // Limpieza de la columna de prueba
    await testPool.query(`ALTER TABLE events DROP COLUMN IF EXISTS image_detail_url;`);
  });

  test('14. Control de estado previo (stale_decision_state): rechaza decisión si otro operador modificó el estado de revisión entretanto', async () => {
    const candidateKey = 'biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp';
    const candidateUrl = 'https://media.vayaplan.com/biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp';

    // Ambos operadores cargan la propuesta #19 sin decisiones previas (expectedPreviousDecisionId = null)

    // 1. Operador 1 aplica 'discard'
    const resOp1 = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 19,
        action: 'discard',
        candidateKey,
        candidateUrl,
        expectedPreviousDecisionId: null,
      }),
    });
    expect(resOp1.status).toBe(200);
    const bodyOp1 = await resOp1.json();
    const firstDecisionId = bodyOp1.decision.id;
    expect(firstDecisionId).toBeDefined();

    // 2. Operador 2 intenta aplicar 'keep_current' enviando el estado anterior obsoleto (expectedPreviousDecisionId = null)
    const resOp2Stale = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 19,
        action: 'keep_current',
        candidateKey,
        candidateUrl,
        expectedPreviousDecisionId: null, // Obsoleto: ya existe la decisión 1
      }),
    });
    expect(resOp2Stale.status).toBe(409);
    const bodyOp2Stale = await resOp2Stale.json();
    expect(bodyOp2Stale.error).toBe('stale_decision_state');
    expect(bodyOp2Stale.message).toContain('El estado de revisión ha cambiado');

    // 3. Operador 2 recarga, ve la decisión previa #firstDecisionId y decide reabrir con 'request_search'
    const resOp2Updated = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        eventId: 19,
        action: 'request_search',
        candidateKey,
        candidateUrl,
        expectedPreviousDecisionId: firstDecisionId,
        notes: 'Reapertura para buscar alternativa',
      }),
    });
    expect(resOp2Updated.status).toBe(200);
    const bodyOp2Updated = await resOp2Updated.json();
    expect(bodyOp2Updated.decision.id).toBeGreaterThan(firstDecisionId);
  });

  test('15. Determinismo de secuencia id bajo bloqueo FOR UPDATE: la última decisión se rige estrictamente por id DESC sin depender del reloj', async () => {
    const client1 = await testPool.connect();
    const client2 = await testPool.connect();

    try {
      // Iniciar Tx1 y tomar el bloqueo FOR UPDATE
      await client1.query('BEGIN');
      await client1.query('SELECT id FROM events WHERE id = 9 FOR UPDATE;');

      let tx2AcquiredLock = false;

      // Iniciar Tx2 en paralelo: intentará bloquear el mismo evento y quedará retenida esperando
      const tx2Promise = (async () => {
        await client2.query('BEGIN');
        // Quedará en espera hasta que Tx1 haga COMMIT
        await client2.query('SELECT id FROM events WHERE id = 9 FOR UPDATE;');
        tx2AcquiredLock = true;
        const res = await client2.query(`
          INSERT INTO event_image_decisions (
            event_id, candidate_key, candidate_url, action, operator_email, created_at
          ) VALUES (
            9, 'test-order-key', 'https://media.vayaplan.com/test.webp', 'keep_current', 'client2@vayaplan.com', clock_timestamp()
          ) RETURNING id, created_at;
        `);
        await client2.query('COMMIT');
        return res.rows[0];
      })();

      // Esperar 80 ms para dar tiempo a que Tx2 intente el SELECT FOR UPDATE y quede bloqueada
      await new Promise(r => setTimeout(r, 80));
      expect(tx2AcquiredLock).toBe(false); // Demuestra que Tx2 está bloqueada esperando a Tx1

      // Tx1 inserta y confirma
      const res1 = await client1.query(`
        INSERT INTO event_image_decisions (
          event_id, candidate_key, candidate_url, action, operator_email, created_at
        ) VALUES (
          9, 'test-order-key', 'https://media.vayaplan.com/test.webp', 'adopt', 'client1@vayaplan.com', clock_timestamp()
        ) RETURNING id, created_at;
      `);
      await client1.query('COMMIT');

      // Tx2 se desbloquea automáticamente y completa su inserción
      const res2 = await tx2Promise;

      const dec1 = res1.rows[0];
      const dec2 = res2;

      // La secuencia primaria autoincremental de PostgreSQL (id SERIAL) rige estrictamente
      // el orden de inserción obtenido al liberarse el bloqueo de fila (dec2.id > dec1.id)
      expect(dec1.id).toBeLessThan(dec2.id);

      // getLatestEventImageDecisions resuelve la última decisión activa mediante "ORDER BY event_id, candidate_key, id DESC"
      // garantizando que dec2 sea la decisión seleccionada, con total independencia de variaciones del reloj
      const latestMap = await getLatestEventImageDecisions([9]);
      const activeDec = latestMap.get('9:test-order-key');
      expect(activeDec).toBeDefined();
      expect(activeDec?.id).toBe(dec2.id);
      expect(activeDec?.action).toBe('keep_current');
      expect(activeDec?.operatorEmail).toBe('client2@vayaplan.com');
    } finally {
      client1.release();
      client2.release();
    }
  });

  test('16. Identidad real del operador en auditoría: registro exacto, rechazo ante contexto sin email y protección contra suplantación', async () => {
    // 1. Administrador autenticado con email válido: se registra exactamente su identidad
    const specificOperatorEmail = 'auditor-real-2026@vayaplan.com';
    const validOperatorToken = await sign(
      { email: specificOperatorEmail, role: 'admin' },
      JWT_SECRET,
      'HS256'
    );

    const candidateKey = R2_PROPOSALS_MAP[14].r2Key;
    const candidateUrl = R2_PROPOSALS_MAP[14].finalUrl;

    const resValid = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validOperatorToken}`,
      },
      body: JSON.stringify({
        eventId: 14,
        action: 'keep_current',
        candidateKey,
        candidateUrl,
      }),
    });

    expect(resValid.status).toBe(200);
    const bodyValid = await resValid.json();
    expect(bodyValid.success).toBe(true);

    const dbCheckValid = await testPool.query(
      `SELECT operator_email FROM event_image_decisions WHERE event_id = 14 ORDER BY id DESC LIMIT 1;`
    );
    expect(dbCheckValid.rows[0].operator_email).toBe(specificOperatorEmail);

    // 2. Contexto autenticado sin email válido: operación rechazada (401) y cero escrituras
    const noEmailToken = await sign(
      { role: 'admin' }, // Token válido de admin pero sin email
      JWT_SECRET,
      'HS256'
    );

    const beforeCountRes = await testPool.query(
      `SELECT COUNT(*)::int AS count FROM event_image_decisions WHERE event_id = 16;`
    );
    const countBefore = beforeCountRes.rows[0].count;

    const resNoEmail = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${noEmailToken}`,
      },
      body: JSON.stringify({
        eventId: 16,
        action: 'keep_current',
        candidateKey: R2_PROPOSALS_MAP[16].r2Key,
        candidateUrl: R2_PROPOSALS_MAP[16].finalUrl,
      }),
    });

    expect(resNoEmail.status).toBe(401);
    const bodyNoEmail = await resNoEmail.json();
    expect(bodyNoEmail.error).toBe('unauthorized');
    expect(bodyNoEmail.message).toContain('No se pudo determinar la identidad del operador autenticado');

    // Cero escrituras en la base de datos
    const afterCountRes = await testPool.query(
      `SELECT COUNT(*)::int AS count FROM event_image_decisions WHERE event_id = 16;`
    );
    expect(afterCountRes.rows[0].count).toBe(countBefore);

    // 3. Payload con operator_email ajeno: no suplanta al usuario autenticado
    const genuineOperatorEmail = 'genuino-seguro@vayaplan.com';
    const genuineToken = await sign(
      { email: genuineOperatorEmail, role: 'admin' },
      JWT_SECRET,
      'HS256'
    );

    const resSpoofAttempt = await app.request('/api/v1/admin/biblioteca-images/decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${genuineToken}`,
      },
      body: JSON.stringify({
        eventId: 16,
        action: 'discard',
        candidateKey: R2_PROPOSALS_MAP[16].r2Key,
        candidateUrl: R2_PROPOSALS_MAP[16].finalUrl,
        operator_email: 'suplantador@atacante.com',
        operatorEmail: 'suplantador@atacante.com',
      }),
    });

    expect(resSpoofAttempt.status).toBe(200);
    const dbCheckSpoof = await testPool.query(
      `SELECT operator_email FROM event_image_decisions WHERE event_id = 16 ORDER BY id DESC LIMIT 1;`
    );
    // Debe registrar la identidad del token autenticado, NUNCA el email del payload
    expect(dbCheckSpoof.rows[0].operator_email).toBe(genuineOperatorEmail);
    expect(dbCheckSpoof.rows[0].operator_email).not.toBe('suplantador@atacante.com');
  });
});
