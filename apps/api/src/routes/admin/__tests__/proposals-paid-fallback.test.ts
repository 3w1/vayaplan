import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Pool } from 'pg';
import sharp from 'sharp';

const rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.2:5432/vayaplan_test';

process.env.DATABASE_URL = rawTestDbUrl.trim();
process.env.MOCK_R2 = 'true';

const { app } = await import('../../../index');
const { JWT_SECRET } = await import('../../../middleware/auth');
const { sign } = await import('hono/jwt');
const {
  setTestPostFetcherOverride,
  setTestImageFetcherOverride,
} = await import('../../../services/bar-instagram-import/single-post-importer');
const {
  setIntropixFetcherOverride,
  scrapeSinglePostWithIntropix,
  processIntropixResponse,
  INTROPIX_ACTOR_ID,
  INTROPIX_ESTIMATED_COST_USD,
  INTROPIX_MAX_CHARGE_LIMIT_USD,
  INTROPIX_START_CHARGE_USD,
} = await import('../../../services/bar-instagram-import/intropix-adapter');

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
const createdProposalIds: number[] = [];
let testVenueId: number;
let validImageBuffer: Buffer;

beforeAll(async () => {
  adminToken = await sign(
    { email: 'curator@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, category, is_active)
    VALUES (1, 'Bar Fallback Test', 'bar-fallback-test', 'Calle Mayor 10, Palencia', 'bar_musical', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = true
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  validImageBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 100, g: 40, b: 180 },
    },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  setTestPostFetcherOverride(null);
  setIntropixFetcherOverride(null);
  setTestImageFetcherOverride(null);

  if (createdProposalIds.length > 0) {
    await testPool.query(
      `DELETE FROM curation_proposals WHERE id = ANY($1::int[]);`,
      [createdProposalIds]
    );
  }
  await testPool.query(`DELETE FROM curation_proposals WHERE instagram_post_shortcode LIKE 'TEST_FALLBACK_%';`);
  await testPool.query(`DELETE FROM venues WHERE id = $1;`, [testVenueId]);
  await testPool.query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'ig_paid:%';`);
  await testPool.end();
});

beforeEach(async () => {
  setIntropixFetcherOverride(null);
  setTestPostFetcherOverride(null);
  setTestImageFetcherOverride(async () => validImageBuffer);
});

describe('Importación Escalonada: Actor Habitual → Alternativo con Autorización → Carga Manual', () => {
  // ============================================================================
  // 1. RECORRIDO DEL PRIMER ACTOR: DETECCIÓN DE RESTRICCIÓN Y OFERTA ESCALONADA
  // ============================================================================
  test('1. Primer Actor exitoso: cero llamadas al alternativo y canUsePaidFallback es false', async () => {
    let intropixCalled = false;
    setIntropixFetcherOverride(async () => {
      intropixCalled = true;
      return { items: [] };
    });

    const shortcode = `TEST_FALLBACK_SUCCESS_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    setTestPostFetcherOverride(async () => [
      {
        shortCode: shortcode,
        url: canonicalUrl,
        displayUrl: 'https://cdn.instagram.com/v/test_success.jpg',
        caption: 'Concierto en directo este viernes a las 21:00h en Bar Fallback Test',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    createdProposalIds.push(data.proposal.id);

    expect(intropixCalled).toBe(false);
  });

  test('2. Primer Actor con restricción de acceso confirmada: ofrece paid fallback y manual', async () => {
    const shortcode = `TEST_FALLBACK_RESTR_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    setTestPostFetcherOverride(async () => [
      {
        error: 'restricted_page',
        errorDescription: 'Contenido con restricciones de edad. Inicia sesión para continuar.',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('access_restricted');
    expect(data.canUsePaidFallback).toBe(true);
    expect(data.canCompleteManually).toBe(true);
    expect(data.canonicalUrl).toBe(canonicalUrl);
    expect(data.shortcode).toBe(shortcode);
    expect(data.message).toContain('Instagram restringe el acceso a esta publicación');
  });

  test('3. Fallo genérico o timeout en primer Actor: NO ofrece proveedor alternativo de pago', async () => {
    const shortcode = `TEST_FALLBACK_GENERIC_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    setTestPostFetcherOverride(async () => {
      const err: any = new Error('Socket timeout in Apify');
      err.name = 'TimeoutError';
      throw err;
    });

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toBe('apify_timeout');
    expect(data.canUsePaidFallback).toBeFalsy();
  });

  test('4. Discrepancia de post en primer Actor: bloqueo de seguridad sin oferta de alternativo ni manual', async () => {
    const shortcode = `TEST_FALLBACK_MISMATCH_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    setTestPostFetcherOverride(async () => [
      {
        shortCode: 'COMPLETELY_DIFFERENT_CODE',
        url: 'https://www.instagram.com/p/COMPLETELY_DIFFERENT_CODE/',
        displayUrl: 'https://cdn.instagram.com/v/test_diff.jpg',
        caption: 'Post no coincidente',
      },
    ]);

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe('shortcode_mismatch');
    expect(data.canUsePaidFallback).toBeFalsy();
    expect(data.canCompleteManually).toBe(false);
  });

  // ============================================================================
  // 2. ENDPOINT POST /api/v1/admin/proposals/prepare-paid-fallback
  // ============================================================================
  test('5. prepare-paid-fallback: control de acceso (401) y validación de entrada (400)', async () => {
    const noAuth = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/p/TEST_123/' }),
    });
    expect(noAuth.status).toBe(401);

    const badUrl = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://www.instagram.com/stories/testuser/12345/' }),
    });
    expect(badUrl.status).toBe(400);
    const badUrlData = await badUrl.json();
    expect(['stories_not_supported', 'invalid_story_id', 'story_id_missing']).toContain(badUrlData.error);
  });

  test('6. prepare-paid-fallback: previene preparación si ya existe propuesta o evento (409)', async () => {
    const shortcode = `TEST_FALLBACK_DUP_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    // Crear propuesta previa
    const propRes = await testPool.query(`
      INSERT INTO curation_proposals (title, source_url, instagram_post_shortcode, dedupe_key, review_status, image_url)
      VALUES ('Propuesta existente', $1, $2, $3, 'pending', 'https://images.vayaplan.com/test.jpg')
      RETURNING id;
    `, [canonicalUrl, shortcode, `instagram_${shortcode}`]);
    createdProposalIds.push(propRes.rows[0].id);

    const res = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('duplicate_proposal');
  });

  test('7. prepare-paid-fallback: emisión exitosa con límites estrictos del servidor y persistencia', async () => {
    const shortcode = `TEST_FALLBACK_PREP_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const res = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.operationId).toMatch(/^op_[a-f0-9]{24}$/);
    expect(data.actorId).toBe(INTROPIX_ACTOR_ID);
    expect(data.canonicalUrl).toBe(canonicalUrl);
    expect(data.shortcode).toBe(shortcode);
    expect(data.venueId).toBe(testVenueId);
    expect(data.estimatedCostUsd).toBe(INTROPIX_ESTIMATED_COST_USD);
    expect(data.maxChargeLimitUsd).toBe(INTROPIX_MAX_CHARGE_LIMIT_USD);
    expect(data.startFeeUsd).toBe(INTROPIX_START_CHARGE_USD);
    expect(data.currency).toBe('USD');
    expect(data.notice).toContain('0,005 USD');

    // Verificar en BD que la autorización está guardada en instagram_ingestion_locks
    const lockRes = await testPool.query(
      `SELECT * FROM instagram_ingestion_locks WHERE lock_key = $1;`,
      [`ig_paid:${shortcode}`]
    );
    expect(lockRes.rows.length).toBe(1);
    expect(lockRes.rows[0].locked_by).toBe('curator@vayaplan.com');
    expect(lockRes.rows[0].execution_details.status).toBe('authorized');
    expect(lockRes.rows[0].execution_details.operationId).toBe(data.operationId);
  });

  // ============================================================================
  // 3. ENDPOINT POST /api/v1/admin/proposals/execute-paid-fallback
  // ============================================================================
  test('8. execute-paid-fallback: control de acceso (401) y validación de campos requeridos (400)', async () => {
    const resNoAuth = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: 'op_123', canonicalUrl: 'url', shortcode: 'code' }),
    });
    expect(resNoAuth.status).toBe(401);

    const resMissing = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ canonicalUrl: 'https://www.instagram.com/p/TEST/' }),
    });
    expect(resMissing.status).toBe(400);
    const dataMissing = await resMissing.json();
    expect(dataMissing.error).toBe('missing_operation_id');
  });

  test('9. execute-paid-fallback: rechazo cuando no existe autorización previa (404)', async () => {
    const res = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: 'op_unregistered',
        canonicalUrl: 'https://www.instagram.com/p/TEST_NONEXISTENT/',
        shortcode: 'TEST_NONEXISTENT',
      }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('authorization_not_found');
    expect(data.canCompleteManually).toBe(true);
  });

  test('10. execute-paid-fallback: rechazo cuando se intenta manipular operationId o URL (403/400)', async () => {
    const shortcode = `TEST_FALLBACK_TAMPER_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    // 1. Preparar autorización
    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    // 2. Intentar ejecutar con operationId manipulado
    const tamperOp = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: 'op_tampered_id',
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });
    expect(tamperOp.status).toBe(403);
    const tamperData = await tamperOp.json();
    expect(tamperData.error).toBe('invalid_operation_id');

    // 3. Intentar ejecutar con URL cambiada tras autorizar
    const tamperUrl = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: 'https://www.instagram.com/p/TEST_ANOTHER_POST/',
        shortcode: shortcode,
      }),
    });
    expect(tamperUrl.status).toBe(400);
    const tamperUrlData = await tamperUrl.json();
    expect(tamperUrlData.error).toBe('url_shortcode_mismatch');
  });

  test('11. execute-paid-fallback: rechazo cuando la autorización ha caducado (410)', async () => {
    const shortcode = `TEST_FALLBACK_EXP_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    // Modificar fecha en BD para simular caducidad inmediata
    await testPool.query(`
      UPDATE instagram_ingestion_locks
      SET expires_at = NOW() - INTERVAL '1 minute'
      WHERE lock_key = $1;
    `, [`ig_paid:${shortcode}`]);

    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });

    expect(execRes.status).toBe(410);
    const execData = await execRes.json();
    expect(execData.error).toBe('authorization_expired');
    expect(execData.canCompleteManually).toBe(true);
  });

  test('12. execute-paid-fallback: prevención de doble ejecución simultánea (Promise.all)', async () => {
    const shortcode = `TEST_FALLBACK_PARALLEL_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    // Mock que tarda 50ms para permitir probar concurrencia
    setIntropixFetcherOverride(async () => {
      await new Promise((r) => setTimeout(r, 60));
      return {
        run: { id: 'run_parallel_test', status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
        items: [
          {
            shortcode,
            permalink: canonicalUrl,
            taken_at: '2026-11-20T21:00:00Z',
            caption: 'Noche de Jazz en Palencia',
            media: [
              {
                slide_index: 0,
                media_type: 'image',
                media_url: 'https://cdn.instagram.com/v/test_parallel.jpg',
                width: 1080,
                height: 1080,
              },
            ],
          },
        ],
      };
    });

    const call1 = app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });

    const call2 = app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });

    const [res1, res2] = await Promise.all([call1, call2]);
    const statuses = [res1.status, res2.status].sort();

    // Una debe procesar (201) y la otra debe ser rechazada por estar ya en curso (409)
    expect(statuses).toEqual([201, 409]);

    const res201 = res1.status === 201 ? res1 : res2;
    const res409 = res1.status === 409 ? res1 : res2;

    const data201 = await res201.json();
    createdProposalIds.push(data201.proposal.id);

    const data409 = await res409.json();
    expect(data409.error).toBe('run_already_in_progress');
  });

  test('13. execute-paid-fallback: ejecución exitosa con intropix crea propuesta pendiente con metadatos de gasto', async () => {
    const shortcode = `TEST_FALLBACK_OK_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    setIntropixFetcherOverride(async (_url, payload) => {
      // Verificar que el payload contiene ONLY postUrls y no usernames
      expect(payload.postUrls).toEqual([canonicalUrl]);
      expect(payload.usernames).toBeUndefined();

      return {
        run: { id: 'run_intropix_real_mock_123', status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
        output: {
          outcome: 'ok',
          delivered: 1,
          granted_results: 1,
          granted_targets: 1,
          failed_targets: [],
        },
        items: [
          {
            shortcode,
            permalink: canonicalUrl,
            post_type: 'carousel',
            taken_at: '2026-11-15T20:30:00Z',
            caption: 'Actuación en directo de acústico en Palencia este sábado a las 20:30h.',
            like_count: 145,
            comment_count: 12,
            media: [
              {
                slide_index: 0,
                media_type: 'image',
                media_url: 'https://cdn.instagram.com/v/test_cover.jpg',
                width: 1080,
                height: 1080,
              },
              {
                slide_index: 1,
                media_type: 'image',
                media_url: 'https://cdn.instagram.com/v/test_slide2.jpg',
                width: 1080,
                height: 1080,
              },
            ],
          },
        ],
      };
    });

    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });

    expect(execRes.status).toBe(201);
    const execData = await execRes.json();
    expect(execData.success).toBe(true);

    const prop = execData.proposal;
    createdProposalIds.push(prop.id);

    expect(prop.review_status).toBe('pending');
    expect(prop.requires_manual_review).toBe(true);
    expect(prop.source_type).toBe('instagram_intropix');
    expect(prop.instagram_post_shortcode).toBe(shortcode);
    expect(prop.image_url).toContain('https://media.vayaplan.com/');
    expect(prop.confidence).toBe('BAJA');

    // Coste reportado registrado
    expect(execData.operation.reportedCostUsd).toBe(0.0089);
    expect(execData.operation.runId).toBe('run_intropix_real_mock_123');
  });

  test('14. execute-paid-fallback: shortcode mismatch en proveedor alternativo cancela por seguridad', async () => {
    const shortcode = `TEST_FALLBACK_MISMATCH_ALT_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    setIntropixFetcherOverride(async () => ({
      run: { id: 'run_mismatch_123', status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
      items: [
        {
          shortcode: 'DIFFERENT_SHORTCODE_ALT',
          permalink: 'https://www.instagram.com/p/DIFFERENT_SHORTCODE_ALT/',
          media: [{ slide_index: 0, media_type: 'image', media_url: 'https://cdn.instagram.com/v/test.jpg' }],
        },
      ],
    }));

    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });

    expect(execRes.status).toBe(422);
    const execData = await execRes.json();
    expect(execData.error).toBe('shortcode_mismatch');
    expect(execData.canCompleteManually).toBe(false);
  });

  test('15. execute-paid-fallback: OUTPUT denied (call_budget_below_minimum) devuelto limpiamente con coste 0', async () => {
    const shortcode = `TEST_FALLBACK_DENIED_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    setIntropixFetcherOverride(async () => ({
      run: { id: 'run_denied_123', status: 'SUCCEEDED', usageTotalUsd: 0 },
      output: {
        outcome: 'denied',
        reason: 'call_budget_below_minimum',
        message: 'The remaining budget could not cover even a single profile.',
      },
      items: [],
    }));

    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });

    expect(execRes.status).toBe(422);
    const execData = await execRes.json();
    expect(execData.error).toBe('provider_call_budget_below_minimum');
    expect(execData.canCompleteManually).toBe(true);
    expect(execData.operation.reportedCostUsd).toBe(0);
  });

  test('16. execute-paid-fallback: target fallido (post_not_found) ofrece completar manualmente', async () => {
    const shortcode = `TEST_FALLBACK_NOT_FOUND_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    setIntropixFetcherOverride(async () => ({
      run: { id: 'run_not_found_123', status: 'SUCCEEDED', usageTotalUsd: 0.005 },
      output: {
        outcome: 'ok',
        delivered: 0,
        failed_targets: [canonicalUrl],
        failed_target_reasons: {
          [canonicalUrl]: {
            reason: 'post_not_found',
            message: 'Instagram reports no such post.',
          },
        },
      },
      items: [],
    }));

    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });

    expect(execRes.status).toBe(422);
    const execData = await execRes.json();
    expect(execData.error).toBe('target_post_not_found');
    expect(execData.canCompleteManually).toBe(true);
    expect(execData.canonicalUrl).toBe(canonicalUrl);
    expect(execData.venueId).toBe(testVenueId);
  });

  test('17. Consulta de estado con GET /api/v1/admin/proposals/paid-fallback-status/:operationId', async () => {
    const shortcode = `TEST_FALLBACK_STATUS_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    const statusRes = await app.request(
      `/api/v1/admin/proposals/paid-fallback-status/${prepData.operationId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.success).toBe(true);
    expect(statusData.operation.operationId).toBe(prepData.operationId);
    expect(statusData.operation.status).toBe('authorized');
  });

  // ============================================================================
  // 4. REVISIÓN FINAL: COSTES, GARANTÍA DE LÍMITE, AUTORIZACIÓN E IDENTIDAD
  // ============================================================================

  test('18. maxTotalChargeUsd=0.015 se envía como query parameter a la API de Apify y no como campo de input del Actor', async () => {
    let capturedUrl: string | null = null;
    let capturedBody: any = null;

    const originalFetch = globalThis.fetch;
    const originalToken = process.env.APIFY_TOKEN;
    const originalSafety = process.env.ALLOW_REAL_APIFY_IN_TESTS;

    try {
      process.env.APIFY_TOKEN = 'apify_test_token_12345';
      process.env.ALLOW_REAL_APIFY_IN_TESTS = 'true';
      setIntropixFetcherOverride(null); // Desactivar override para probar la ruta real de fetch

      globalThis.fetch = (async (input: any, init?: any) => {
        capturedUrl = typeof input === 'string' ? input : input.url;
        if (init?.body) {
          capturedBody = JSON.parse(init.body);
        }
        // Simular respuesta inmediata de inicio de run
        return new Response(
          JSON.stringify({
            data: {
              id: 'run_intercept_test_999',
              status: 'RUNNING',
              defaultDatasetId: 'ds_123',
              defaultKeyValueStoreId: 'kvs_123',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      // Invocamos scrapeSinglePostWithIntropix
      scrapeSinglePostWithIntropix({
        canonicalUrl: 'https://www.instagram.com/p/TEST_INTERCEPT/',
        shortcode: 'TEST_INTERCEPT',
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 50));

      expect(capturedUrl).not.toBeNull();
      const parsedUrl = new URL(capturedUrl!);

      // 1. Debe ser un parámetro de consulta (query string) admitido por Apify API v2
      expect(parsedUrl.searchParams.get('maxTotalChargeUsd')).toBe('0.015');
      expect(parsedUrl.pathname).toBe('/v2/acts/intropix~instagram-posts-reels-scraper/runs');

      // 2. NO debe formar parte del payload JSON enviado al Actor
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.maxTotalChargeUsd).toBeUndefined();
      expect(capturedBody.postUrls).toEqual(['https://www.instagram.com/p/TEST_INTERCEPT/']);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.APIFY_TOKEN = originalToken;
      process.env.ALLOW_REAL_APIFY_IN_TESTS = originalSafety;
      setIntropixFetcherOverride(null);
    }
  });

  test('19. Control de autorización por administrador: otro administrador no puede consumir una autorización ajena (403)', async () => {
    const otherAdminToken = await sign(
      { email: 'other_operator@vayaplan.com', role: 'admin' },
      JWT_SECRET,
      'HS256'
    );

    const shortcode = `TEST_FALLBACK_OTHER_ADMIN_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    // Administrador 1 autoriza
    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    expect(prepRes.status).toBe(200);
    const prepData = await prepRes.json();

    // Administrador 2 intenta ejecutar la autorización del Administrador 1
    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${otherAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });

    expect(execRes.status).toBe(403);
    const execData = await execRes.json();
    expect(execData.error).toBe('unauthorized_user');
    expect(execData.message).toContain('Esta autorización fue concedida a otro administrador');
  });

  test('20. Autorización de un solo uso: una autorización ya finalizada no permite un segundo run (409)', async () => {
    const shortcode = `TEST_FALLBACK_SINGLE_USE_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    let runsCount = 0;
    setIntropixFetcherOverride(async () => {
      runsCount++;
      return {
        run: { id: `run_single_use_${runsCount}`, status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
        items: [
          {
            shortcode,
            permalink: canonicalUrl,
            media: [{ slide_index: 0, media_type: 'image', media_url: 'https://cdn.instagram.com/v/test.jpg' }],
          },
        ],
      };
    });

    // Primera ejecución: exitosa (201)
    const exec1 = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });
    expect(exec1.status).toBe(201);
    expect(runsCount).toBe(1);

    // Segunda ejecución con la misma autorización: ya completada, no inicia nuevo run
    const exec2 = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });
    expect(exec2.status).toBe(200);
    const data2 = await exec2.json();
    expect(data2.alreadyCompleted).toBe(true);
    expect(data2.message).toContain('ya se había completado previamente');
    expect(runsCount).toBe(1); // Cero llamadas adicionales al scraper
  });

  test('21. Recuperación tras reinicio: si ya existe un runId conocido, recupera ese run sin iniciar uno nuevo', async () => {
    const shortcode = `TEST_FALLBACK_RECOVERY_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    // Simular que el proceso se reinició y la BD ya tiene un runId guardado en estado 'running'
    const knownRunId = 'run_crash_recovery_777';
    await testPool.query(`
      UPDATE instagram_ingestion_locks
      SET execution_details = jsonb_set(
        jsonb_set(execution_details, '{status}', '"running"'),
        '{runId}', '"${knownRunId}"'
      )
      WHERE lock_key = $1;
    `, [`ig_paid:${shortcode}`]);

    let receivedRunId: string | undefined;
    setIntropixFetcherOverride(async (_url, payload) => {
      receivedRunId = payload.customRunId;
      return {
        run: { id: knownRunId, status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
        items: [
          {
            shortcode,
            permalink: canonicalUrl,
            media: [{ slide_index: 0, media_type: 'image', media_url: 'https://cdn.instagram.com/v/test.jpg' }],
          },
        ],
      };
    });

    const recoverRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
        venue_id: testVenueId,
      }),
    });

    expect(recoverRes.status).toBe(201);
    expect(receivedRunId).toBe(knownRunId); // Reanudó el run conocido
  });

  test('22. Timeout durante el inicio del run: no inicia otro run ni presenta el coste como cero (status: uncertain, reportedCost: null)', async () => {
    const shortcode = `TEST_FALLBACK_TIMEOUT_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    // Simular timeout al iniciar la llamada en Apify
    setIntropixFetcherOverride(async () => {
      return {
        error: {
          status: 504,
          code: 'apify_start_timeout',
          message: 'Tiempo de espera agotado al conectar con Apify para arrancar el contenedor.',
        },
      };
    });

    const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });

    expect(execRes.status).toBe(504);
    const execData = await execRes.json();
    expect(execData.error).toBe('apify_start_timeout');
    expect(execData.canCompleteManually).toBe(true);

    // Verificar en BD que el estado quedó como 'uncertain' y reportedCostUsd es NULL (NUNCA 0)
    const lockRes = await testPool.query(`
      SELECT execution_details FROM instagram_ingestion_locks WHERE lock_key = $1;
    `, [`ig_paid:${shortcode}`]);
    const details = lockRes.rows[0].execution_details;
    expect(details.status).toBe('uncertain');
    expect(details.reportedCostUsd).toBeNull();
  });

  test('23. Una operación incierta no vuelve automáticamente a un estado ejecutable al vencer el lock o TTL (409)', async () => {
    const shortcode = `TEST_FALLBACK_UNCERTAIN_${Date.now()}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

    // 1. Crear autorización y simular que quedó en estado 'uncertain'
    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    // Marcar como 'uncertain' y forzar expiración del lock
    await testPool.query(`
      UPDATE instagram_ingestion_locks
      SET execution_details = jsonb_set(execution_details, '{status}', '"uncertain"'),
          expires_at = NOW() - INTERVAL '2 hours'
      WHERE lock_key = $1;
    `, [`ig_paid:${shortcode}`]);

    // 2. Intentar preparar una nueva autorización para el mismo enlace
    const retryPrep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    expect(retryPrep.status).toBe(409);
    const retryData = await retryPrep.json();
    expect(retryData.error).toBe('operation_uncertain');
    expect(retryData.message).toContain('estado indeterminado en el proveedor');

    // 3. Intentar ejecutar la operación incierta directamente
    const retryExec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: shortcode,
      }),
    });
    expect(retryExec.status).toBe(409);
    const retryExecData = await retryExec.json();
    expect(retryExecData.error).toBe('operation_uncertain');
    expect(retryExecData.canCompleteManually).toBe(true);
  });

  test('24. Identidad con fixture real De_jb4yFX_T: coincidencia exacta aceptada, cambio de capitalización rechazado', async () => {
    const realShortcode = 'De_jb4yFX_T';
    const canonicalUrl = `https://www.instagram.com/p/${realShortcode}/`;

    // 1. Coincidencia exacta (De_jb4yFX_T === De_jb4yFX_T): ACEPTADA
    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: canonicalUrl, venue_id: testVenueId }),
    });
    const prepData = await prepRes.json();

    setIntropixFetcherOverride(async () => ({
      run: { id: 'run_identity_exact', status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
      items: [
        {
          shortcode: 'De_jb4yFX_T', // Valor exacto preservado
          permalink: canonicalUrl,
          media: [{ slide_index: 0, media_type: 'image', media_url: 'https://cdn.instagram.com/v/exact.jpg' }],
        },
      ],
    }));

    const execExact = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        canonicalUrl: canonicalUrl,
        shortcode: realShortcode,
        venue_id: testVenueId,
      }),
    });
    expect(execExact.status).toBe(201);
    const dataExact = await execExact.json();
    expect(dataExact.proposal.instagram_post_shortcode).toBe('De_jb4yFX_T');
    createdProposalIds.push(dataExact.proposal.id);

    // 2. Cambio a minúsculas ('de_jb4yfx_t'): RECHAZADO por shortcode_mismatch
    const mismatchLower = processIntropixResponse({
      canonicalUrl,
      requestedShortcode: 'De_jb4yFX_T',
      run: { id: 'run_identity_lower', status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
      items: [{ shortcode: 'de_jb4yfx_t', permalink: canonicalUrl, media: [] }],
    });
    expect(mismatchLower.success).toBe(false);
    expect(mismatchLower.code).toBe('shortcode_mismatch');

    // 3. Cambio a mayúsculas ('DE_JB4YFX_T'): RECHAZADO por shortcode_mismatch
    const mismatchUpper = processIntropixResponse({
      canonicalUrl,
      requestedShortcode: 'De_jb4yFX_T',
      run: { id: 'run_identity_upper', status: 'SUCCEEDED', usageTotalUsd: 0.0089 },
      items: [{ shortcode: 'DE_JB4YFX_T', permalink: canonicalUrl, media: [] }],
    });
    expect(mismatchUpper.success).toBe(false);
    expect(mismatchUpper.code).toBe('shortcode_mismatch');
  });

  test('25. Cero dependencia de migración 021: comprobación explícita de que la tabla instagram_fallback_authorizations no existe', async () => {
    // Comprobar que en PostgreSQL la tabla 021 NO existe y no es consultada
    const checkTable = await testPool.query(`
      SELECT to_regclass('public.instagram_fallback_authorizations') as table_ref;
    `);
    expect(checkTable.rows[0].table_ref).toBeNull();
  });
});
