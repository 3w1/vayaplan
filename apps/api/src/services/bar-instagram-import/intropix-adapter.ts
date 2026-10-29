import { isTestOverrideAllowed } from './single-post-importer';

export const INTROPIX_ACTOR_ID = 'intropix/instagram-posts-reels-scraper';
export const INTROPIX_ACTOR_SLUG = 'intropix~instagram-posts-reels-scraper';

// Tarifas del Actor comprobadas en el catálogo de Apify (modelo PAY_PER_EVENT):
// - actor-start: 0.005 USD (se aplica una vez al iniciar el contenedor, incluso si el post no se entrega)
// - profile-scan: 0.002 USD (se aplica por cada cuenta distinta del autor a la que pertenece el enlace)
// - result-item: 0.0019 USD (se aplica únicamente por item entregado al dataset)
export const INTROPIX_START_CHARGE_USD = 0.005;
export const INTROPIX_PROFILE_SCAN_CHARGE_USD = 0.002;
export const INTROPIX_RESULT_ITEM_CHARGE_USD = 0.0019;

// Coste estimado en caso de éxito para 1 enlace individual: 0.005 (inicio) + 0.002 (cuenta) + 0.0019 (post) = 0.0089 USD (~0.009 USD)
export const INTROPIX_ESTIMATED_COST_USD = 0.0089;

// Límite máximo efectivo de facturación impuesto en el parámetro maxTotalChargeUsd de la URL de Apify: 0.015 USD
// (Apify restringe el importe total cobrable del Actor de pago por evento a este techo presupuestario)
export const INTROPIX_MAX_CHARGE_LIMIT_USD = 0.015;

export interface IntropixMediaSlide {
  slide_index: number;
  media_type: 'image' | 'video';
  media_url: string;
  cover_url?: string | null;
  width?: number;
  height?: number;
  video_duration?: number | null;
}

export interface IntropixDatasetItem {
  username?: string;
  user_pk?: string;
  full_name?: string;
  is_verified?: boolean;
  is_private?: boolean;
  follower_count?: number | null;
  following_count?: number | null;
  profile_pic_url?: string | null;
  biography?: string | null;
  post_pk?: string;
  shortcode: string;
  permalink: string;
  post_type: 'image' | 'video' | 'reel' | 'carousel';
  taken_at: string;
  caption?: string | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  is_paid_partnership?: boolean;
  is_off_grid?: boolean;
  coauthors?: string[];
  hashtags?: string[];
  mentions?: string[];
  media: IntropixMediaSlide[];
}

export interface IntropixOutputRecord {
  outcome: 'ok' | 'denied';
  reason?: string;
  message?: string;
  granted_results?: number;
  granted_targets?: number;
  delivered?: number;
  failed_targets?: string[];
  failed_target_reasons?: Record<string, { reason: string; message: string }>;
}

export interface IntropixScrapeResult {
  success: boolean;
  status: number;
  code: string;
  error?: string;
  item?: IntropixDatasetItem;
  outputRecord?: IntropixOutputRecord;
  runId?: string;
  reportedCostUsd?: number | null;
  shortcode?: string;
  canonicalUrl?: string;
  canCompleteManually?: boolean;
}

// Hook de override para pruebas unitarias sin consumos externos
export type IntropixFetcherMock = (
  url: string,
  payload: any
) => Promise<{
  run?: { id: string; status: string; usageTotalUsd?: number };
  output?: IntropixOutputRecord;
  items?: any[];
  error?: { status: number; code: string; message: string };
}>;

let intropixFetcherOverride: IntropixFetcherMock | null = null;

export function setIntropixFetcherOverride(mock: IntropixFetcherMock | null): void {
  intropixFetcherOverride = mock;
}

export function getIntropixFetcherOverride(): IntropixFetcherMock | null {
  return intropixFetcherOverride;
}

/**
 * Invoca el scraper alternativo intropix/instagram-posts-reels-scraper
 * siguiendo estrictamente su contrato:
 * - postUrls con exclusivamente el enlace canónico.
 * - Sin usernames ni exploración de perfiles.
 * - Límite maxTotalChargeUsd impuesto a nivel de API de Apify.
 * - Validación cruzada con el registro OUTPUT del Key-Value Store.
 * - Validación estricta y sensible a mayúsculas/minúsculas de shortcode.
 */
export async function scrapeSinglePostWithIntropix(params: {
  canonicalUrl: string;
  shortcode: string;
  customRunId?: string;
}): Promise<IntropixScrapeResult> {
  const { canonicalUrl, shortcode } = params;

  // Validación de seguridad para entornos de test: evitar llamadas reales no deseadas
  if (intropixFetcherOverride) {
    try {
      const mockResult = await intropixFetcherOverride(canonicalUrl, {
        postUrls: [canonicalUrl],
        mediaType: 'any',
        includeViews: true,
        includeOffGridReels: false,
        customRunId: params.customRunId,
      });

      if (mockResult.error) {
        return {
          success: false,
          status: mockResult.error.status,
          code: mockResult.error.code,
          error: mockResult.error.message,
          canCompleteManually: true,
          canonicalUrl,
          shortcode,
          runId: mockResult.run?.id || params.customRunId,
          reportedCostUsd: mockResult.error.code === 'apify_start_timeout' ? null : (mockResult.run?.usageTotalUsd ?? null),
        };
      }

      return processIntropixResponse({
        canonicalUrl,
        requestedShortcode: shortcode,
        run: mockResult.run || { id: params.customRunId || ('mock_run_' + Date.now()), status: 'SUCCEEDED', usageTotalUsd: INTROPIX_ESTIMATED_COST_USD },
        outputRecord: mockResult.output,
        items: mockResult.items || [],
      });
    } catch (err: any) {
      return {
        success: false,
        status: 502,
        code: 'intropix_mock_error',
        error: `Error en mock de intropix: ${err.message}`,
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
      };
    }
  }

  if (isTestOverrideAllowed() && process.env.ALLOW_REAL_APIFY_IN_TESTS !== 'true') {
    throw new Error('[APIFY_SAFETY_GUARD] Real Apify scraping calls are strictly blocked in test environments.');
  }

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return {
      success: false,
      status: 500,
      code: 'apify_not_configured',
      error: 'APIFY_TOKEN no está configurado en el servidor.',
      canCompleteManually: true,
      canonicalUrl,
      shortcode,
    };
  }

  let runData: any;
  let runId = params.customRunId;
  let defaultDatasetId: string | undefined;
  let defaultKeyValueStoreId: string | undefined;

  if (runId) {
    // Si ya existe un runId conocido, recuperamos su estado sin iniciar un run nuevo
    try {
      const getRunRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(apifyToken)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (getRunRes.ok) {
        const getRunJson = (await getRunRes.json()) as any;
        runData = getRunJson.data;
        defaultDatasetId = runData.defaultDatasetId;
        defaultKeyValueStoreId = runData.defaultKeyValueStoreId;
      }
    } catch {
      // Si falla la consulta inicial de recuperación, el bucle de sondeo continuará
    }
  } else {
    // 1. Iniciar run en Apify con maxTotalChargeUsd impuesto en la URL query string
    const runEndpoint = `https://api.apify.com/v2/acts/${INTROPIX_ACTOR_SLUG}/runs?token=${encodeURIComponent(
      apifyToken
    )}&maxTotalChargeUsd=${INTROPIX_MAX_CHARGE_LIMIT_USD}`;

    const requestPayload = {
      postUrls: [canonicalUrl],
      mediaType: 'any',
      includeViews: true,
      includeOffGridReels: false,
    };

    try {
      const runRes = await fetch(runEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(15000), // 15s para crear el run
      });

      if (!runRes.ok) {
        const errText = await runRes.text().catch(() => '');
        return {
          success: false,
          status: runRes.status === 429 ? 429 : 502,
          code: 'apify_run_start_failed',
          error: `No se pudo iniciar la tarea en el proveedor (${runRes.status}): ${errText.slice(0, 120)}`,
          canCompleteManually: true,
          canonicalUrl,
          shortcode,
        };
      }

      const runJson = (await runRes.json()) as any;
      runData = runJson.data;
      runId = runData.id;
      defaultDatasetId = runData.defaultDatasetId;
      defaultKeyValueStoreId = runData.defaultKeyValueStoreId;
    } catch (err: any) {
      // Ante timeout al iniciar el run, no sabemos si Apify lo aceptó:
      // reportedCostUsd es null (indeterminado, NUNCA 0)
      return {
        success: false,
        status: 504,
        code: 'apify_start_timeout',
        error: `Tiempo de espera al solicitar inicio de tarea en el proveedor: ${err.message}. El estado en Apify es indeterminado.`,
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        reportedCostUsd: null,
      };
    }
  }

  if (!runId) {
    return {
      success: false,
      status: 502,
      code: 'missing_run_id',
      error: 'No se obtuvo un identificador de tarea válido del proveedor.',
      canCompleteManually: true,
      canonicalUrl,
      shortcode,
    };
  }

  // 2. Esperar finalización del run (polling con timeout de 60s)
  const pollStart = Date.now();
  const maxWaitMs = 60000;
  let finalRun: any = runData;

  while (Date.now() - pollStart < maxWaitMs) {
    if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(finalRun.status)) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));

    try {
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(apifyToken)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (statusRes.ok) {
        const statusJson = (await statusRes.json()) as any;
        finalRun = statusJson.data;
      }
    } catch {
      // Ignorar fallo puntual de sondeo y reintentar mientras no expire el timeout
    }
  }

  if (!['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(finalRun.status)) {
    return {
      success: false,
      status: 504,
      code: 'apify_run_timeout',
      runId,
      error: `La tarea en el proveedor sigue ejecutándose tras 60s (runId: ${runId}). No se realizaron reintentos facturables.`,
      canCompleteManually: true,
      canonicalUrl,
      shortcode,
    };
  }

  // 3. Obtener registro OUTPUT del Key-Value Store si está disponible
  let outputRecord: IntropixOutputRecord | undefined;
  if (defaultKeyValueStoreId) {
    try {
      const outputRes = await fetch(
        `https://api.apify.com/v2/key-value-stores/${encodeURIComponent(
          defaultKeyValueStoreId
        )}/records/OUTPUT?token=${encodeURIComponent(apifyToken)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (outputRes.ok) {
        outputRecord = (await outputRes.json()) as IntropixOutputRecord;
      }
    } catch {
      // Si no existe o no se puede leer, se continuará evaluando el dataset
    }
  }

  // 4. Obtener dataset items
  let items: any[] = [];
  if (defaultDatasetId) {
    try {
      const datasetRes = await fetch(
        `https://api.apify.com/v2/datasets/${encodeURIComponent(
          defaultDatasetId
        )}/items?token=${encodeURIComponent(apifyToken)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (datasetRes.ok) {
        items = (await datasetRes.json()) as any[];
      }
    } catch {
      // Error de lectura de dataset
    }
  }

  return processIntropixResponse({
    canonicalUrl,
    requestedShortcode: shortcode,
    run: finalRun,
    outputRecord,
    items,
  });
}

/**
 * Normaliza y valida la respuesta del Actor según sus especificaciones reales:
 * - Examina OUTPUT.outcome ('ok' vs 'denied')
 * - Examina OUTPUT.failed_targets y failed_target_reasons
 * - Valida shortcode de forma estricta (no numérico, sensible a mayúsculas/minúsculas)
 * - Extrae portada de medio o carrusel
 */
export function processIntropixResponse(params: {
  canonicalUrl: string;
  requestedShortcode: string;
  run: { id: string; status: string; usageTotalUsd?: number };
  outputRecord?: IntropixOutputRecord;
  items: any[];
}): IntropixScrapeResult {
  const { canonicalUrl, requestedShortcode, run, outputRecord, items } = params;
  const reportedCostUsd = typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null;

  // 1. Evaluar si el run fue 'denied' por el guard del Actor
  if (outputRecord && outputRecord.outcome === 'denied') {
    const reason = outputRecord.reason || 'denied';
    let userMsg = outputRecord.message || 'La solicitud fue rechazada por el proveedor.';

    if (reason === 'call_budget_below_minimum') {
      userMsg = 'El límite de presupuesto configurado es inferior al mínimo requerido por el proveedor.';
    } else if (reason === 'user_daily_exhausted' || reason === 'free_capacity_exhausted') {
      userMsg = 'Capacidad temporal del proveedor agotada. Inténtalo más tarde.';
    }

    return {
      success: false,
      status: 422,
      code: `provider_${reason}`,
      error: userMsg,
      runId: run.id,
      reportedCostUsd: reportedCostUsd ?? 0, // En caso de denied, el coste es 0
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      shortcode: requestedShortcode,
    };
  }

  // 2. Evaluar si la URL falló específicamente según failed_target_reasons
  if (outputRecord && outputRecord.failed_targets && outputRecord.failed_targets.length > 0) {
    const matchedFailKey = outputRecord.failed_targets.find(
      (t) => t === canonicalUrl || t.includes(requestedShortcode)
    );

    if (matchedFailKey) {
      const targetDetail = outputRecord.failed_target_reasons?.[matchedFailKey];
      const failReason = targetDetail?.reason || 'target_failed';
      let failMessage = targetDetail?.message || 'No se pudo obtener la publicación solicitada.';

      if (failReason === 'post_not_found' || failReason === 'post_not_found_cached') {
        failMessage = 'La publicación no existe o fue eliminada en Instagram.';
      } else if (failReason === 'invalid_link' || failReason === 'share_link') {
        failMessage = 'El enlace de la publicación no tiene un formato admitido por el proveedor.';
      }

      return {
        success: false,
        status: 422,
        code: `target_${failReason}`,
        error: failMessage,
        runId: run.id,
        reportedCostUsd: reportedCostUsd ?? INTROPIX_START_CHARGE_USD,
        outputRecord,
        canCompleteManually: true,
        canonicalUrl,
        shortcode: requestedShortcode,
      };
    }
  }

  // 3. Evaluar dataset
  if (!items || items.length === 0) {
    return {
      success: false,
      status: 422,
      code: 'empty_dataset',
      error: 'El proveedor alternativo completó la ejecución pero no devolvió ninguna publicación.',
      runId: run.id,
      reportedCostUsd: reportedCostUsd ?? INTROPIX_START_CHARGE_USD,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      shortcode: requestedShortcode,
    };
  }

  const rawItem = items[0];
  if (!rawItem || typeof rawItem !== 'object') {
    return {
      success: false,
      status: 422,
      code: 'incomplete_response',
      error: 'La respuesta del proveedor alternativo no tiene una estructura de datos válida.',
      runId: run.id,
      reportedCostUsd,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      shortcode: requestedShortcode,
    };
  }

  // 4. Validación estricta de identidad:
  // intropix devuelve el shortcode en el campo canónico `rawItem.shortcode`
  let candidateShortcode: string | null = null;
  if (typeof rawItem.shortcode === 'string' && rawItem.shortcode.trim()) {
    candidateShortcode = rawItem.shortcode.trim();
  } else if (typeof rawItem.shortCode === 'string' && rawItem.shortCode.trim()) {
    candidateShortcode = rawItem.shortCode.trim();
  }

  // Rechazar identificadores numéricos puros (post_pk o media_id)
  if (!candidateShortcode || /^\d+(_\d+)?$/.test(candidateShortcode)) {
    return {
      success: false,
      status: 422,
      code: 'missing_identity',
      error: 'El proveedor alternativo no entregó un identificador alfanumérico verificable para el post.',
      runId: run.id,
      reportedCostUsd,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      shortcode: requestedShortcode,
    };
  }

  // Comparación binaria exacta y sensible a mayúsculas/minúsculas
  if (candidateShortcode !== requestedShortcode) {
    return {
      success: false,
      status: 422,
      code: 'shortcode_mismatch',
      error: 'La publicación devuelta por el proveedor no coincide con el enlace solicitado. Operación cancelada por seguridad.',
      runId: run.id,
      reportedCostUsd,
      outputRecord,
      canCompleteManually: false,
      canonicalUrl,
      shortcode: requestedShortcode,
    };
  }

  // 5. Normalizar medios y portada
  const mediaList: IntropixMediaSlide[] = Array.isArray(rawItem.media) ? rawItem.media : [];

  const normalizedItem: IntropixDatasetItem = {
    username: rawItem.username,
    user_pk: rawItem.user_pk,
    full_name: rawItem.full_name,
    is_verified: Boolean(rawItem.is_verified),
    is_private: Boolean(rawItem.is_private),
    follower_count: rawItem.follower_count ?? null,
    following_count: rawItem.following_count ?? null,
    profile_pic_url: rawItem.profile_pic_url ?? null,
    biography: rawItem.biography ?? null,
    post_pk: rawItem.post_pk,
    shortcode: candidateShortcode,
    permalink: rawItem.permalink || canonicalUrl,
    post_type: rawItem.post_type || 'image',
    taken_at: rawItem.taken_at || new Date().toISOString(),
    caption: rawItem.caption ?? null,
    like_count: rawItem.like_count ?? null,
    comment_count: rawItem.comment_count ?? null,
    view_count: rawItem.view_count ?? null,
    is_paid_partnership: Boolean(rawItem.is_paid_partnership),
    is_off_grid: Boolean(rawItem.is_off_grid),
    coauthors: Array.isArray(rawItem.coauthors) ? rawItem.coauthors : [],
    hashtags: Array.isArray(rawItem.hashtags) ? rawItem.hashtags : [],
    mentions: Array.isArray(rawItem.mentions) ? rawItem.mentions : [],
    media: mediaList,
  };

  return {
    success: true,
    status: 200,
    code: 'ok',
    item: normalizedItem,
    outputRecord,
    runId: run.id,
    reportedCostUsd,
    shortcode: candidateShortcode,
    canonicalUrl,
  };
}
