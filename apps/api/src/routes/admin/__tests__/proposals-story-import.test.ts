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
  setIntropixStoryFetcherOverride,
  scrapeStoryWithIntropix,
  processIntropixStoryResponse,
  INTROPIX_STORY_ACTOR_ID,
  INTROPIX_STORY_MAX_CHARGE_LIMIT_USD,
  INTROPIX_STORY_START_CHARGE_USD,
  INTROPIX_STORY_ACCOUNT_SCAN_CHARGE_USD,
  INTROPIX_STORY_ITEM_CHARGE_USD,
  INTROPIX_STORY_SINGLE_ITEM_COST_USD,
  INTROPIX_STORY_MAX_RESULTS_COST_USD,
  INTROPIX_STORY_MAX_RESULTS,
  isStoryImportFeatureEnabled,
} = await import('../../../services/bar-instagram-import/intropix-story-adapter');
const { validateInstagramPostUrl } = await import('../../../services/bar-instagram-import/url-validator');

const testPool = new Pool({ connectionString: rawTestDbUrl.trim() });

let adminToken: string;
const createdProposalIds: number[] = [];
let testVenueId: number;
let validImageBuffer: Buffer;

const TARGET_REF_STORY_ID = '4018658867898287794';
const TARGET_REF_USERNAME = 'elautenticobar';
const TARGET_REF_URL = `https://www.instagram.com/stories/${TARGET_REF_USERNAME}/${TARGET_REF_STORY_ID}/`;

beforeAll(async () => {
  process.env.ENABLE_INSTAGRAM_STORY_IMPORT = 'true';
  adminToken = await sign(
    { email: 'curator@vayaplan.com', role: 'admin' },
    JWT_SECRET,
    'HS256'
  );

  const venueRes = await testPool.query(`
    INSERT INTO venues (city_id, name, slug, address, category, is_active)
    VALUES (1, 'El Autentico Bar Test', 'el-autentico-bar-test', 'Plaza Mayor 1, Palencia', 'bar_musical', true)
    ON CONFLICT (city_id, slug) DO UPDATE SET is_active = true
    RETURNING id;
  `);
  testVenueId = venueRes.rows[0].id;

  validImageBuffer = await sharp({
    create: {
      width: 400,
      height: 700,
      channels: 3,
      background: { r: 180, g: 30, b: 90 },
    },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  setTestPostFetcherOverride(null);
  setIntropixStoryFetcherOverride(null);
  setTestImageFetcherOverride(null);

  if (createdProposalIds.length > 0) {
    await testPool.query(
      `DELETE FROM curation_proposals WHERE id = ANY($1::int[]);`,
      [createdProposalIds]
    );
  }
  await testPool.query(`DELETE FROM curation_proposals WHERE instagram_username = 'elautenticobar' OR dedupe_key LIKE 'instagram_story_%';`);
  await testPool.query(`DELETE FROM venues WHERE id = $1;`, [testVenueId]);
  await testPool.query(`DELETE FROM instagram_ingestion_locks WHERE lock_key LIKE 'ig_paid_story:%';`);
  await testPool.end();
});

beforeEach(async () => {
  setIntropixStoryFetcherOverride(null);
  setTestPostFetcherOverride(null);
  setTestImageFetcherOverride(async () => validImageBuffer);
});

describe('Importación puntual de historias de Instagram (Caso de Referencia: elautenticobar/4018658867898287794)', () => {
  // ============================================================================
  // 1. VALIDACIÓN DEFENSIVA Y PRESERVACIÓN DE IDENTIFICADORES
  // ============================================================================
  test('1. URL con parámetros de rastreo (?igsh, ?utm_*) se canonicaliza limpiando query y fragmentos', () => {
    const rawUrl = `${TARGET_REF_URL}?igsh=MWQ1ZGUxMzBkMA==&utm_source=ig_story_share#ver`;
    const res = validateInstagramPostUrl(rawUrl);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.contentType).toBe('story');
      expect(res.username).toBe(TARGET_REF_USERNAME);
      expect(res.storyId).toBe(TARGET_REF_STORY_ID);
      expect(res.canonicalUrl).toBe(TARGET_REF_URL);
      expect(res.canonicalUrl).not.toContain('igsh');
      expect(res.canonicalUrl).not.toContain('#');
    }
  });

  test('2. ID de 19 dígitos (4018658867898287794) se preserva estrictamente como string sin truncamiento (> Number.MAX_SAFE_INTEGER)', () => {
    const res = validateInstagramPostUrl(TARGET_REF_URL);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(typeof res.storyId).toBe('string');
      expect(res.storyId).toBe('4018658867898287794');
      // Number.MAX_SAFE_INTEGER es 9007199254740991 (16 dígitos).
      // Un parseInt(4018658867898287794) corrompe los dígitos finales a 4018658867898288000.
      expect(Number.isSafeInteger(Number(res.storyId))).toBe(false);
      expect(res.storyId?.endsWith('7794')).toBe(true);
    }
  });

  test('3. Rechazo de dominios no autorizados y enlaces genéricos a historias de una cuenta sin ID individual', () => {
    const malicious = validateInstagramPostUrl('https://evil-instagram.com/stories/elautenticobar/4018658867898287794/');
    expect(malicious.valid).toBe(false);
    if (!malicious.valid) {
      expect(malicious.code).toBe('invalid_hostname');
    }

    const accountOnly = validateInstagramPostUrl('https://www.instagram.com/stories/elautenticobar/');
    expect(accountOnly.valid).toBe(false);
    if (!accountOnly.valid) {
      expect(accountOnly.code).toBe('story_id_missing');
      expect(accountOnly.error).toContain('@elautenticobar');
    }
  });

  test('4. Rechazo de historias con identificador no numérico', () => {
    const invalidId = validateInstagramPostUrl('https://www.instagram.com/stories/elautenticobar/evento_concierto/');
    expect(invalidId.valid).toBe(false);
    if (!invalidId.valid) {
      expect(invalidId.code).toBe('invalid_story_id');
    }
  });

  // ============================================================================
  // 2. ENLACE DIRECTO AL PROVEEDOR ALTERNATIVO (SIN CONSUMO DEL PRIMER ACTOR)
  // ============================================================================
  test('5. Enlace a historia en import-instagram-post: no ejecuta el primer Actor y deriva directamente a paid fallback', async () => {
    let firstActorCalled = false;
    setTestPostFetcherOverride(async () => {
      firstActorCalled = true;
      return [];
    });

    const res = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: TARGET_REF_URL, venue_id: testVenueId }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('story_requires_paid_fallback');
    expect(data.canUsePaidFallback).toBe(true);
    expect(data.canCompleteManually).toBe(true);
    expect(data.canonicalUrl).toBe(TARGET_REF_URL);
    expect(data.shortcode).toBe(TARGET_REF_STORY_ID);
    // El primer Actor de posts/reels NO se invoca bajo ninguna circunstancia para historias
    expect(firstActorCalled).toBe(false);
  });

  // ============================================================================
  // 3. PREPARACIÓN Y AUTORIZACIÓN DE GASTO PUNTUAL
  // ============================================================================
  test('6. prepare-paid-fallback para historia: devuelve datos específicos de intropix/instagram-stories-scraper y lock key aislado', async () => {
    const storyId = `9990001112223334445`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    const res = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl, venue_id: testVenueId }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.actorId).toBe(INTROPIX_STORY_ACTOR_ID);
    expect(data.contentType).toBe('story');
    expect(data.username).toBe(TARGET_REF_USERNAME);
    expect(data.storyId).toBe(storyId);
    expect(data.maxChargeLimitUsd).toBe(INTROPIX_STORY_MAX_CHARGE_LIMIT_USD);
    expect(data.startFeeUsd).toBe(INTROPIX_STORY_START_CHARGE_USD);
    expect(data.accountScanFeeUsd).toBe(INTROPIX_STORY_ACCOUNT_SCAN_CHARGE_USD);
    expect(data.resultItemFeeUsd).toBe(INTROPIX_STORY_ITEM_CHARGE_USD);
    expect(data.singleStoryCostUsd).toBe(INTROPIX_STORY_SINGLE_ITEM_COST_USD);
    expect(data.maxStoriesCostUsd).toBe(INTROPIX_STORY_MAX_RESULTS_COST_USD);
    expect(data.pricingFormula).toContain('0,0050');
    expect(data.pricingFormula).toContain('0,0020');
    expect(data.pricingFormula).toContain('0,0025');
    expect(data.notice).toContain('@elautenticobar');
    expect(data.notice).toContain('0,0095 USD');
    expect(data.notice).toContain('0,0445 USD');
    expect(data.notice).toContain('0,0450 USD');

    // Comprobar que en BD se persistió con lockKey aislado `ig_paid_story:...`
    const lockCheck = await testPool.query(
      `SELECT lock_key, execution_details FROM instagram_ingestion_locks WHERE lock_key = $1;`,
      [`ig_paid_story:${storyId}`]
    );
    expect(lockCheck.rows.length).toBe(1);
    expect(lockCheck.rows[0].execution_details.contentType).toBe('story');
    expect(lockCheck.rows[0].execution_details.username).toBe(TARGET_REF_USERNAME);
  });

  test('7. Cancelación: el usuario puede desistir tras la autorización sin devengar ninguna llamada a Apify', async () => {
    let storyActorCalled = false;
    setIntropixStoryFetcherOverride(async () => {
      storyActorCalled = true;
      return { items: [] };
    });

    // Se prepara la autorización
    const storyId = `9990001112223334446`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    expect(prepRes.status).toBe(200);

    // El usuario pulsa Cancelar en la UI: no se llama a execute-paid-fallback
    expect(storyActorCalled).toBe(false);
  });

  // ============================================================================
  // 4. EXTRACCIÓN Y COINCIDENCIA EXACTA DE IDENTIDAD
  // ============================================================================
  test('8. Historia encontrada entre múltiples historias activas de la cuenta: coincidencia exacta y creación de propuesta pendiente', async () => {
    const storyId = `4018658867898287794`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    let calledWithUsername = '';
    let calledWithMaxResults = 0;

    setIntropixStoryFetcherOverride(async (username, payload) => {
      calledWithUsername = username;
      calledWithMaxResults = payload.maxResults;
      return {
        run: { id: 'run_story_success_1', status: 'SUCCEEDED', usageTotalUsd: 0.0125 },
        output: { outcome: 'ok', delivered: 3 },
        items: [
          {
            username: 'elautenticobar',
            story_pk: '1111111111111111111',
            media_type: 'image',
            media_url: 'https://cdn.instagram.com/s1.jpg',
            caption: 'Tapas del viernes',
          },
          {
            username: 'elautenticobar',
            story_pk: storyId, // La historia solicitada
            media_type: 'image',
            media_url: 'https://cdn.instagram.com/s2_cartel_concierto.jpg',
            caption: 'Este sábado concierto acústico a las 21:00 en El Auténtico Bar. Entrada libre.',
            taken_at: '2026-10-31T18:00:00.000Z',
          },
          {
            username: 'elautenticobar',
            story_pk: '3333333333333333333',
            media_type: 'image',
            media_url: 'https://cdn.instagram.com/s3.jpg',
            caption: 'Buenos días Palencia',
          },
        ],
      };
    });

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl, venue_id: testVenueId }),
    });
    expect(prep.status).toBe(200);
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
        venue_id: testVenueId,
      }),
    });

    expect(exec.status).toBe(201);
    const execData = await exec.json();
    expect(calledWithUsername).toBe('elautenticobar');
    expect(calledWithMaxResults).toBe(15);
    expect(execData.success).toBe(true);
    expect(execData.proposal).toBeDefined();

    const proposal = execData.proposal;
    createdProposalIds.push(proposal.id);

    // Verificaciones obligatorias de curación y esquema
    expect(proposal.review_status).toBe('pending');
    expect(proposal.requires_manual_review).toBe(true);
    expect(proposal.source_type).toBe('instagram_intropix');
    expect(proposal.instagram_username).toBe('elautenticobar');
    expect(proposal.instagram_post_shortcode).toBe(storyId);
    expect(proposal.dedupe_key).toBe(`instagram_story_${storyId}`);
    expect(proposal.created_event_id).toBeNull();
    expect(proposal.image_url).toBeDefined();
  });

  test('9. Historia solicitada no coincide con las historias activas (ID no encontrado): error claro 422 sin inventar expiración', async () => {
    const storyId = `4018658867898289999`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_mismatch', status: 'SUCCEEDED', usageTotalUsd: 0.0075 },
      output: { outcome: 'ok', delivered: 1 },
      items: [
        {
          username: 'elautenticobar',
          story_pk: '1111111111111111111',
          media_type: 'image',
          media_url: 'https://cdn.instagram.com/otra.jpg',
        },
      ],
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
      }),
    });

    expect(exec.status).toBe(422);
    const execData = await exec.json();
    expect(execData.error).toBe('story_not_found');
    expect(execData.canCompleteManually).toBe(true);
  });

  test('10. Resultados truncados: la cuenta tiene 15 historias y la buscada no figura -> story_not_found_truncated', async () => {
    const storyId = `4018658867898288888`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    const dummyItems = Array.from({ length: 15 }, (_, i) => ({
      username: 'elautenticobar',
      story_pk: `dummy_${i}`,
      media_type: 'image',
      media_url: `https://cdn.instagram.com/dummy_${i}.jpg`,
    }));

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_trunc', status: 'SUCCEEDED', usageTotalUsd: 0.0425 },
      output: { outcome: 'ok', delivered: 15 },
      items: dummyItems,
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
      }),
    });

    expect(exec.status).toBe(422);
    const execData = await exec.json();
    expect(execData.error).toBe('story_not_found_truncated');
    expect(execData.message).toContain('15 historias analizadas');
    expect(execData.canCompleteManually).toBe(true);
  });

  test('11. Cuenta con 0 historias activas en el dataset: account_no_active_stories', async () => {
    const storyId = `4018658867898287700`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_empty', status: 'SUCCEEDED', usageTotalUsd: 0.005 },
      output: { outcome: 'ok', delivered: 0 },
      items: [],
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
      }),
    });

    expect(exec.status).toBe(422);
    const execData = await exec.json();
    expect(execData.error).toBe('account_no_active_stories');
    expect(execData.canCompleteManually).toBe(true);
  });

  test('12. Denegación del proveedor (outcome: denied): con coste 0 preserva 0', async () => {
    const storyId = `4018658867898287701`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_denied_0', status: 'FAILED', usageTotalUsd: 0 },
      output: { outcome: 'denied', reason: 'user_daily_exhausted', message: 'Límite diario alcanzado' },
      items: [],
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
      }),
    });

    expect(exec.status).toBe(422);
    const execData = await exec.json();
    expect(execData.error).toBe('provider_user_daily_exhausted');
    expect(execData.operation.reportedCostUsd).toBe(0);
    expect(execData.canCompleteManually).toBe(true);
  });

  test('12b. Denegación o fallo sin coste reportado en proveedor: reportedCostUsd es null (indeterminado), nunca 0 ni tarifa de inicio', async () => {
    const storyId = `4018658867898287799`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_denied_unknown', status: 'FAILED' }, // usageTotalUsd no reportado por Apify
      output: { outcome: 'denied', reason: 'call_budget_below_minimum' },
      items: [],
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
      }),
    });

    expect(exec.status).toBe(422);
    const execData = await exec.json();
    expect(execData.error).toBe('provider_call_budget_below_minimum');
    expect(execData.operation.reportedCostUsd).toBeNull();
  });

  // ============================================================================
  // 5. TRATAMIENTO DE MEDIOS, CAPTION NULO Y VÍDEOS
  // ============================================================================
  test('13. Historia con caption: null no provoca fallo, genera título por defecto y se registra como pendiente', async () => {
    const storyId = `4018658867898287702`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_nocaption', status: 'SUCCEEDED', usageTotalUsd: 0.0075 },
      items: [
        {
          username: 'elautenticobar',
          story_pk: storyId,
          media_type: 'image',
          media_url: 'https://cdn.instagram.com/flyer_sin_texto.jpg',
          caption: null, // Sin caption
        },
      ],
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl, venue_id: testVenueId }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
        venue_id: testVenueId,
      }),
    });

    expect(exec.status).toBe(201);
    const execData = await exec.json();
    const prop = execData.proposal;
    createdProposalIds.push(prop.id);

    expect(prop.title).toContain('Historia de @elautenticobar');
    expect(prop.caption).toBe('');
    expect(prop.review_status).toBe('pending');
  });

  test('14. Historia de tipo vídeo sin portada estática: rechazada con video_without_image_cover y oferta de carga manual', async () => {
    const storyId = `4018658867898287703`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    setIntropixStoryFetcherOverride(async () => ({
      run: { id: 'run_story_video_nocover', status: 'SUCCEEDED', usageTotalUsd: 0.0075 },
      items: [
        {
          username: 'elautenticobar',
          story_pk: storyId,
          media_type: 'video',
          media_url: 'https://cdn.instagram.com/video_story.mp4',
          cover_url: null, // Sin miniatura estática
          caption: 'Vídeo en directo',
        },
      ],
    }));

    const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    const prepData = await prep.json();

    const exec = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId: prepData.operationId,
        shortcode: prepData.shortcode,
        canonicalUrl: prepData.canonicalUrl,
      }),
    });

    expect(exec.status).toBe(422);
    const execData = await exec.json();
    expect(execData.error).toBe('video_without_image_cover');
    expect(execData.canCompleteManually).toBe(true);
  });

  // ============================================================================
  // 6. DEDUPLICACIÓN Y ALTA MANUAL COMPATIBLE
  // ============================================================================
  test('15. Deduplicación con propuesta existente: previene reimportación y cobro repetido', async () => {
    // La propuesta creada en el test 8 ya existe en la base de datos
    const storyId = `4018658867898287794`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    // 1. import-instagram-post detecta el duplicado directamente y devuelve 200 alreadyExisted
    const checkDirect = await app.request('/api/v1/admin/proposals/import-instagram-post', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    expect(checkDirect.status).toBe(200);
    const directData = await checkDirect.json();
    expect(directData.alreadyExisted).toBe(true);
    expect(directData.recordType).toBe('proposal');

    // 2. prepare-paid-fallback bloquea la preparación con 409
    const checkPrep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: storyUrl }),
    });
    expect(checkPrep.status).toBe(409);
    const prepData = await checkPrep.json();
    expect(prepData.error).toBe('duplicate_proposal');
  });

  test('16. Deduplicación con evento ya existente en catálogo: previene duplicado con 409', async () => {
    const storyId = `4018658867898287704`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    // Crear un evento ficticio con esa source_url
    const evRes = await testPool.query(`
      INSERT INTO events (
        city_id, title, editorial_date, start_time, category, status, source_type, source_url, venue_id
      ) VALUES (
        1, 'Evento Previo en El Auténtico', '2026-11-01', '2026-11-01T20:00:00Z', 'musica_directo', 'published', 'manual', $1, $2
      ) RETURNING id;
    `, [storyUrl, testVenueId]);
    const eventId = evRes.rows[0].id;

    try {
      const prep = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: storyUrl }),
      });

      expect(prep.status).toBe(409);
      const prepData = await prep.json();
      expect(prepData.error).toBe('event_already_exists');
      expect(prepData.message).toContain(`#${eventId}`);
    } finally {
      await testPool.query(`DELETE FROM events WHERE id = $1;`, [eventId]);
    }
  });

  test('17. Alta manual para historia: conserva URL canónica, shortcode y asigna dedupe_key instagram_story_...', async () => {
    const storyId = `4018658867898287705`;
    const storyUrl = `https://www.instagram.com/stories/elautenticobar/${storyId}/`;

    const res = await app.request('/api/v1/admin/proposals/manual', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: storyUrl,
        title: 'Cata de cervezas artesanas en El Auténtico',
        venue_id: testVenueId,
        category: 'gastronomia',
        proposed_date: '2026-11-05',
        proposed_time: '20:30',
        image_url: 'https://pub-f8be128d5d474586bc5ba8c6a0cb5b3b.r2.dev/manual_cartel_cata.webp',
        caption: 'Nueva cata anunciada en stories',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.proposal).toBeDefined();

    const prop = data.proposal;
    createdProposalIds.push(prop.id);

    expect(prop.review_status).toBe('pending');
    expect(prop.requires_manual_review).toBe(true);
    expect(prop.instagram_username).toBe('elautenticobar');
    expect(prop.instagram_post_shortcode).toBe(storyId);
    expect(prop.dedupe_key).toBe(`instagram_story_${storyId}`);
    expect(prop.category).toBe('gastronomia');
  });

  test('18. Garantía de curación humana: ninguna historia importada o manual se publica automáticamente', async () => {
    const check = await testPool.query(
      `SELECT review_status, created_event_id FROM curation_proposals WHERE dedupe_key LIKE 'instagram_story_%';`
    );

    for (const row of check.rows) {
      expect(row.review_status).toBe('pending');
      expect(row.created_event_id).toBeNull();
    }
  });

  // ============================================================================
  // 6. FIXTURE DE CONTRATO PUBLICADO, PRESERVACIÓN DE TIPOS Y FEATURE FLAG
  // ============================================================================
  test('19. Fixture fiel al contrato publicado (story_pk, taken_at, expiring_at, width, height, caption nullable) sin datos privados', async () => {
    const fixturePath = new URL('../../../services/bar-instagram-import/__tests__/fixtures/intropix-story-item.fixture.json', import.meta.url).pathname;
    const fixtureRaw = await Bun.file(fixturePath).text();
    const fixture = JSON.parse(fixtureRaw);

    // Comprobar ausencia estricta de datos privados
    expect(fixtureRaw).not.toContain('cookie');
    expect(fixtureRaw).not.toContain('session');
    expect(fixtureRaw).not.toContain('token');
    expect(fixtureRaw).not.toContain('Bearer');

    // Comprobar tipos y campos del contrato publicado
    expect(typeof fixture.story_pk).toBe('string');
    expect(fixture.story_pk).toBe('4018658867898287794');
    expect(typeof fixture.username).toBe('string');
    expect(fixture.username).toBe('elautenticobar');
    expect(typeof fixture.taken_at).toBe('string');
    expect(typeof fixture.expiring_at).toBe('string');
    expect(typeof fixture.width).toBe('number');
    expect(typeof fixture.height).toBe('number');
    expect(fixture.media_type).toBe('image');
    expect(typeof fixture.media_url).toBe('string');
    expect(fixture.caption === null || typeof fixture.caption === 'string').toBe(true);

    // Procesar a través del adapter comprobando el mapeo explícito
    const res = processIntropixStoryResponse({
      canonicalUrl: TARGET_REF_URL,
      requestedUsername: 'elautenticobar',
      requestedStoryId: '4018658867898287794',
      run: { id: 'run_fixture_test', status: 'SUCCEEDED', usageTotalUsd: 0.0095 },
      items: [fixture],
    });

    expect(res.success).toBe(true);
    expect(res.item).toBeDefined();
    expect(res.item?.story_pk).toBe('4018658867898287794');
    expect(res.item?.expiring_at).toBe('2026-10-30T18:30:00.000Z');
    expect(res.item?.expiresAt).toBe('2026-10-30T18:30:00.000Z');
    expect(res.item?.width).toBe(1080);
    expect(res.item?.height).toBe(1920);
    expect(res.item?.caption).toContain('Música en directo');
    expect(res.reportedCostUsd).toBe(0.0095);
  });

  test('20. Rechazo de identificadores numéricos que pierden precisión sin intentar reconstruir dígitos perdidos', () => {
    // Un JSON mal parseado o que suministra story_pk numérico
    const unsafeItems = [
      {
        username: 'elautenticobar',
        story_pk: 4018658867898288000, // número de JS > MAX_SAFE_INTEGER
        media_type: 'image',
        media_url: 'https://cdn.instagram.com/unsafe.jpg',
      },
    ];

    const res = processIntropixStoryResponse({
      canonicalUrl: TARGET_REF_URL,
      requestedUsername: 'elautenticobar',
      requestedStoryId: '4018658867898287794',
      run: { id: 'run_unsafe_number', status: 'SUCCEEDED', usageTotalUsd: 0.007 },
      items: unsafeItems,
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('unsafe_numeric_story_id');
    expect(res.error).toContain('formato numérico');
    expect(res.error).toContain('pérdida de precisión');
    expect(res.canCompleteManually).toBe(true);
  });

  test('21. Control por Feature Flag (ENABLE_INSTAGRAM_STORY_IMPORT): cuando está inactivo, rechaza con 403 y ofrece alta manual', async () => {
    const prevFlag = process.env.ENABLE_INSTAGRAM_STORY_IMPORT;
    const freshStoryId = '4018658867898289998';
    const freshStoryUrl = `https://www.instagram.com/stories/elautenticobar/${freshStoryId}/`;

    try {
      process.env.ENABLE_INSTAGRAM_STORY_IMPORT = 'false';

      // 1. Rechazo en import-instagram-post
      const importRes = await app.request('/api/v1/admin/proposals/import-instagram-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: freshStoryUrl }),
      });
      expect(importRes.status).toBe(403);
      const importData = await importRes.json();
      expect(importData.code).toBe('story_import_disabled_retention_policy_required');
      expect(importData.canUsePaidFallback).toBe(false);
      expect(importData.canCompleteManually).toBe(true);

      // 2. Rechazo en prepare-paid-fallback
      const prepRes = await app.request('/api/v1/admin/proposals/prepare-paid-fallback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: freshStoryUrl }),
      });
      expect(prepRes.status).toBe(403);
      const prepData = await prepRes.json();
      expect(prepData.code).toBe('story_import_disabled_retention_policy_required');
      expect(prepData.canCompleteManually).toBe(true);

      // 3. Rechazo en execute-paid-fallback
      const execRes = await app.request('/api/v1/admin/proposals/execute-paid-fallback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operationId: 'op_test_disabled',
          shortcode: freshStoryId,
          canonicalUrl: freshStoryUrl,
        }),
      });
      expect(execRes.status).toBe(403);
      const execData = await execRes.json();
      expect(execData.code).toBe('story_import_disabled_retention_policy_required');
      expect(execData.canCompleteManually).toBe(true);
    } finally {
      process.env.ENABLE_INSTAGRAM_STORY_IMPORT = prevFlag;
    }
  });
});
