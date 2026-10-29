import { isTestOverrideAllowed } from './single-post-importer';

export const INTROPIX_STORY_ACTOR_ID = 'intropix/instagram-stories-scraper';
export const INTROPIX_STORY_ACTOR_SLUG = 'intropix~instagram-stories-scraper';

// Tarifas del Actor en Apify comprobadas (modelo PAY_PER_EVENT):
// - actor-start: 0.005 USD (por arrancar el contenedor)
// - result-item: 0.0025 USD (por historia activa entregada al dataset; 2,50 USD / 1000 items)
export const INTROPIX_STORY_START_CHARGE_USD = 0.005;
export const INTROPIX_STORY_ITEM_CHARGE_USD = 0.0025;
export const INTROPIX_STORY_MAX_RESULTS = 15;

// Coste estimado medio (arranque + entrega de historias activas):
// 0.005 + 0.0025 * 3 = 0.0125 USD
export const INTROPIX_STORY_ESTIMATED_COST_USD = 0.0125;

// Techo presupuestario estricto impuesto en maxTotalChargeUsd:
// 0.005 + 15 * 0.0025 = 0.0425 USD, redondeado defensivamente a 0.045 USD
export const INTROPIX_STORY_MAX_CHARGE_LIMIT_USD = 0.045;

export interface IntropixStoryDatasetItem {
  username: string;
  story_pk: string; // Mantenido estrictamente como cadena (sin Number ni parseInt)
  user_pk?: string;
  full_name?: string;
  is_verified?: boolean;
  is_private?: boolean;
  media_type: 'image' | 'video';
  media_url: string;
  taken_at?: string;
  expiresAt?: string;
  caption?: string | null;
  width?: number;
  height?: number;
  cover_url?: string | null;
  [key: string]: any;
}

export interface IntropixStoryOutputRecord {
  outcome: 'ok' | 'denied';
  reason?: string;
  message?: string;
  delivered?: number;
  failed_targets?: string[];
  failed_target_reasons?: Record<string, { reason: string; message: string }>;
}

export interface IntropixStoryScrapeResult {
  success: boolean;
  status: number;
  code: string;
  error?: string;
  item?: IntropixStoryDatasetItem;
  outputRecord?: IntropixStoryOutputRecord;
  runId?: string;
  reportedCostUsd?: number | null;
  storyId?: string;
  username?: string;
  canonicalUrl?: string;
  canCompleteManually?: boolean;
}

// Hook de override para pruebas unitarias sin consumos externos
export type IntropixStoryFetcherMock = (
  username: string,
  payload: any
) => Promise<{
  run?: { id: string; status: string; usageTotalUsd?: number };
  output?: IntropixStoryOutputRecord;
  items?: any[];
  error?: { status: number; code: string; message: string };
}>;

let intropixStoryFetcherOverride: IntropixStoryFetcherMock | null = null;

export function setIntropixStoryFetcherOverride(mock: IntropixStoryFetcherMock | null): void {
  intropixStoryFetcherOverride = mock;
}

export function getIntropixStoryFetcherOverride(): IntropixStoryFetcherMock | null {
  return intropixStoryFetcherOverride;
}

/**
 * Invoca el scraper de historias intropix/instagram-stories-scraper
 * siguiendo estrictamente su contrato:
 * - usernames: [username]
 * - maxResults: 15
 * - maxTotalChargeUsd impuesto a nivel de API de Apify (0.045 USD)
 * - Identificación exacta de la historia mediante story_pk === storyId
 */
export async function scrapeStoryWithIntropix(params: {
  username: string;
  storyId: string;
  canonicalUrl: string;
  customRunId?: string;
}): Promise<IntropixStoryScrapeResult> {
  const { username, storyId, canonicalUrl } = params;

  // Validación de seguridad para entornos de test: evitar llamadas reales no deseadas
  if (intropixStoryFetcherOverride) {
    try {
      const mockResult = await intropixStoryFetcherOverride(username, {
        usernames: [username],
        maxResults: INTROPIX_STORY_MAX_RESULTS,
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
          username,
          storyId,
          runId: mockResult.run?.id || params.customRunId,
          reportedCostUsd: mockResult.error.code === 'apify_start_timeout' ? null : (mockResult.run?.usageTotalUsd ?? null),
        };
      }

      return processIntropixStoryResponse({
        canonicalUrl,
        requestedUsername: username,
        requestedStoryId: storyId,
        run: mockResult.run || { id: params.customRunId || ('mock_story_run_' + Date.now()), status: 'SUCCEEDED', usageTotalUsd: INTROPIX_STORY_ESTIMATED_COST_USD },
        outputRecord: mockResult.output,
        items: mockResult.items || [],
      });
    } catch (err: any) {
      return {
        success: false,
        status: 502,
        code: 'intropix_story_mock_error',
        error: `Error en mock de historias intropix: ${err.message}`,
        canCompleteManually: true,
        canonicalUrl,
        username,
        storyId,
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
      username,
      storyId,
    };
  }

  let runData: any;
  let runId = params.customRunId;
  let defaultDatasetId: string | undefined;
  let defaultKeyValueStoreId: string | undefined;

  if (runId) {
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
      // Continuará con el bucle de espera
    }
  } else {
    // Iniciar run en Apify con maxTotalChargeUsd impuesto en la URL query string
    const runEndpoint = `https://api.apify.com/v2/acts/${INTROPIX_STORY_ACTOR_SLUG}/runs?token=${encodeURIComponent(
      apifyToken
    )}&maxTotalChargeUsd=${INTROPIX_STORY_MAX_CHARGE_LIMIT_USD}`;

    const requestPayload = {
      usernames: [username],
      maxResults: INTROPIX_STORY_MAX_RESULTS,
    };

    try {
      const runRes = await fetch(runEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(15000),
      });

      if (!runRes.ok) {
        const errText = await runRes.text().catch(() => '');
        return {
          success: false,
          status: runRes.status === 429 ? 429 : 502,
          code: 'apify_run_start_failed',
          error: `No se pudo iniciar la tarea de historias en el proveedor (${runRes.status}): ${errText.slice(0, 120)}`,
          canCompleteManually: true,
          canonicalUrl,
          username,
          storyId,
        };
      }

      const runJson = (await runRes.json()) as any;
      runData = runJson.data;
      runId = runData.id;
      defaultDatasetId = runData.defaultDatasetId;
      defaultKeyValueStoreId = runData.defaultKeyValueStoreId;
    } catch (err: any) {
      return {
        success: false,
        status: 504,
        code: 'apify_start_timeout',
        error: `Tiempo de espera al solicitar inicio de tarea de historias en el proveedor: ${err.message}. El estado en Apify es indeterminado.`,
        canCompleteManually: true,
        canonicalUrl,
        username,
        storyId,
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
      username,
      storyId,
    };
  }

  // Esperar finalización del run (polling con timeout de 60s)
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
      // Ignorar fallo puntual de sondeo
    }
  }

  if (!['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(finalRun.status)) {
    return {
      success: false,
      status: 504,
      code: 'apify_run_timeout',
      runId,
      error: `La extracción de historias sigue ejecutándose tras 60s (runId: ${runId}). No se realizaron reintentos facturables.`,
      canCompleteManually: true,
      canonicalUrl,
      username,
      storyId,
    };
  }

  // Obtener registro OUTPUT del Key-Value Store si está disponible
  let outputRecord: IntropixStoryOutputRecord | undefined;
  if (defaultKeyValueStoreId) {
    try {
      const outputRes = await fetch(
        `https://api.apify.com/v2/key-value-stores/${encodeURIComponent(
          defaultKeyValueStoreId
        )}/records/OUTPUT?token=${encodeURIComponent(apifyToken)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (outputRes.ok) {
        outputRecord = (await outputRes.json()) as IntropixStoryOutputRecord;
      }
    } catch {
      // Continuar evaluando dataset
    }
  }

  // Obtener dataset items
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

  return processIntropixStoryResponse({
    canonicalUrl,
    requestedUsername: username,
    requestedStoryId: storyId,
    run: finalRun,
    outputRecord,
    items,
  });
}

/**
 * Normaliza y valida la respuesta del scraper de historias:
 * - Evalúa OUTPUT.outcome ('ok' vs 'denied')
 * - Evalúa OUTPUT.failed_targets
 * - Detecta si la cuenta no tiene historias activas (empty dataset)
 * - Busca de forma exacta story_pk === requestedStoryId respetando identidad estricta de string
 * - Detecta truncamiento por maxResults vs historia no encontrada
 * - Comprueba compatibilidad multimedia (video sin cover estático)
 */
export function processIntropixStoryResponse(params: {
  canonicalUrl: string;
  requestedUsername: string;
  requestedStoryId: string;
  run: { id: string; status: string; usageTotalUsd?: number };
  outputRecord?: IntropixStoryOutputRecord;
  items: any[];
}): IntropixStoryScrapeResult {
  const { canonicalUrl, requestedUsername, requestedStoryId, run, outputRecord, items } = params;
  const reportedCostUsd = typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null;

  // 1. Evaluar si el run fue 'denied' por el guard del Actor
  if (outputRecord && outputRecord.outcome === 'denied') {
    const reason = outputRecord.reason || 'denied';
    let userMsg = outputRecord.message || 'La solicitud de historias fue rechazada por el proveedor.';

    if (reason === 'call_budget_below_minimum') {
      userMsg = 'El límite de presupuesto configurado es inferior al mínimo requerido por el proveedor de historias.';
    } else if (reason === 'user_daily_exhausted' || reason === 'free_capacity_exhausted') {
      userMsg = 'Capacidad temporal del proveedor agotada. Inténtalo más tarde.';
    }

    return {
      success: false,
      status: 422,
      code: `provider_${reason}`,
      error: userMsg,
      runId: run.id,
      reportedCostUsd: reportedCostUsd ?? 0,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      username: requestedUsername,
      storyId: requestedStoryId,
    };
  }

  // 2. Evaluar fallos en targets
  if (outputRecord && outputRecord.failed_targets && outputRecord.failed_targets.length > 0) {
    const matchedFail = outputRecord.failed_targets.find(
      (t) => t.toLowerCase() === requestedUsername.toLowerCase()
    );

    if (matchedFail) {
      const targetDetail = outputRecord.failed_target_reasons?.[matchedFail];
      const failReason = targetDetail?.reason || 'target_failed';
      let failMessage = targetDetail?.message || `No se pudieron obtener historias de la cuenta @${requestedUsername}.`;

      if (failReason === 'user_not_found') {
        failMessage = `La cuenta @${requestedUsername} no existe o fue eliminada en Instagram.`;
      } else if (failReason === 'private_account') {
        failMessage = `La cuenta @${requestedUsername} es privada. No se pueden extraer historias de cuentas privadas.`;
      }

      return {
        success: false,
        status: 422,
        code: `target_${failReason}`,
        error: failMessage,
        runId: run.id,
        reportedCostUsd: reportedCostUsd ?? INTROPIX_STORY_START_CHARGE_USD,
        outputRecord,
        canCompleteManually: true,
        canonicalUrl,
        username: requestedUsername,
        storyId: requestedStoryId,
      };
    }
  }

  // 3. Evaluar dataset vacío (la cuenta no tiene historias activas)
  if (!items || items.length === 0) {
    return {
      success: false,
      status: 422,
      code: 'account_no_active_stories',
      error: `La cuenta @${requestedUsername} no tiene historias activas en este momento o han expirado las 24 horas.`,
      runId: run.id,
      reportedCostUsd: reportedCostUsd ?? INTROPIX_STORY_START_CHARGE_USD,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      username: requestedUsername,
      storyId: requestedStoryId,
    };
  }

  // 4. Búsqueda exacta de la historia solicitada
  // Comprobación de identidad: story_pk === requestedStoryId Y username coincide
  const matchedItem = items.find((it: any) => {
    if (!it || typeof it !== 'object') return false;
    const itStoryPk = it.story_pk != null ? String(it.story_pk).trim() : '';
    const itUsername = typeof it.username === 'string' ? it.username.trim().toLowerCase() : '';
    return itStoryPk === requestedStoryId && itUsername === requestedUsername.toLowerCase();
  });

  if (!matchedItem) {
    // Si no se encuentra, comprobar si los resultados alcanzaron el límite maxResults
    if (items.length >= INTROPIX_STORY_MAX_RESULTS) {
      return {
        success: false,
        status: 422,
        code: 'story_not_found_truncated',
        error: `La historia solicitada no se localizó dentro de las primeras ${INTROPIX_STORY_MAX_RESULTS} historias analizadas de @${requestedUsername}. No se puede determinar si sigue activa o ha caducado.`,
        runId: run.id,
        reportedCostUsd: reportedCostUsd ?? INTROPIX_STORY_START_CHARGE_USD,
        outputRecord,
        canCompleteManually: true,
        canonicalUrl,
        username: requestedUsername,
        storyId: requestedStoryId,
      };
    }

    return {
      success: false,
      status: 422,
      code: 'story_not_found',
      error: `La historia solicitada (${requestedStoryId}) no figura entre las historias activas disponibles de @${requestedUsername}. Puede haber expirado o haber sido eliminada.`,
      runId: run.id,
      reportedCostUsd: reportedCostUsd ?? INTROPIX_STORY_START_CHARGE_USD,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      username: requestedUsername,
      storyId: requestedStoryId,
    };
  }

  // 5. Comprobación multimedia:
  // Si es un vídeo sin imagen de portada utilizable para cartel, se rechaza con código específico
  const isVideo = matchedItem.media_type === 'video';
  const hasCover = Boolean(matchedItem.cover_url || matchedItem.display_url);

  if (isVideo && !hasCover) {
    return {
      success: false,
      status: 422,
      code: 'video_without_image_cover',
      error: 'La historia solicitada es un vídeo sin imagen estática de portada. No es posible generar el cartel automáticamente; utiliza el alta manual para adjuntar la imagen.',
      runId: run.id,
      reportedCostUsd,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      username: requestedUsername,
      storyId: requestedStoryId,
    };
  }

  const primaryMediaUrl = (matchedItem.cover_url || matchedItem.display_url || matchedItem.media_url || '').trim();
  if (!primaryMediaUrl) {
    return {
      success: false,
      status: 422,
      code: 'missing_image',
      error: 'La historia no contiene una URL de imagen válida para utilizar como cartel.',
      runId: run.id,
      reportedCostUsd,
      outputRecord,
      canCompleteManually: true,
      canonicalUrl,
      username: requestedUsername,
      storyId: requestedStoryId,
    };
  }

  // 6. Normalización del item (story_pk preservado estrictamente como string de 19 dígitos)
  const normalizedItem: IntropixStoryDatasetItem = {
    username: requestedUsername,
    story_pk: requestedStoryId,
    user_pk: matchedItem.user_pk != null ? String(matchedItem.user_pk) : undefined,
    full_name: matchedItem.full_name || undefined,
    is_verified: Boolean(matchedItem.is_verified),
    is_private: Boolean(matchedItem.is_private),
    media_type: isVideo ? 'video' : 'image',
    media_url: primaryMediaUrl,
    cover_url: matchedItem.cover_url || null,
    taken_at: matchedItem.taken_at || new Date().toISOString(),
    expiresAt: matchedItem.expiresAt || undefined,
    caption: typeof matchedItem.caption === 'string' ? matchedItem.caption : null,
    width: matchedItem.width || matchedItem.dimensions?.width || 1080,
    height: matchedItem.height || matchedItem.dimensions?.height || 1920,
  };

  return {
    success: true,
    status: 200,
    code: 'ok',
    item: normalizedItem,
    outputRecord,
    runId: run.id,
    reportedCostUsd,
    storyId: requestedStoryId,
    username: requestedUsername,
    canonicalUrl,
  };
}
