import { query, isTestExecution } from '@vayaplan/db';
import { classifyBarPost } from './bar-classifier';
import { uploadPostImageToR2 } from './r2-image-pipeline';
import type { ApifyInstagramRawPost } from './bar-types';
import { matchPostWithPublishedEvents, type ExistingEventRecord } from './event-matcher';
import {
  acquirePersistentLock,
  releasePersistentLock,
  getPersistentLockStatus,
  DEFAULT_LOCK_KEY,
  DEFAULT_LOCK_TTL_MINUTES,
  type LockInfo,
} from './persistent-lock';

export interface IngestionSourceRow {
  id: number;
  venue_id: number;
  venue_name?: string;
  venue_slug?: string;
  venue_address?: string;
  instagram_username: string;
  instagram_profile_url?: string;
  is_active: boolean;
  posts_per_run: number;
  include_reels: boolean;
  last_ingested_at?: string;
  last_run_id?: string;
  last_status: 'never_run' | 'success' | 'partial' | 'error';
  last_error?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface IngestionRunResult {
  executionId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sourcesProcessed: number;
  totalPostsScraped: number;
  proposalsCreated: number;
  duplicatesSkipped: number;
  errors: Array<{ sourceId: number; username: string; error: string }>;
  resultsBySource: Array<{
    sourceId: number;
    venueId: number;
    username: string;
    status: 'success' | 'partial' | 'error';
    error?: string;
    postsExtracted: number;
    proposalsCreated: number;
  }>;
}

// Lock en memoria para comprobaciones rápidas
let isIngestionRunning = false;
let currentRunStartedAt: string | null = null;

export function isExecutionLocked(): { locked: boolean; startedAt: string | null; lockInfo?: LockInfo } {
  return {
    locked: isIngestionRunning,
    startedAt: currentRunStartedAt,
  };
}

export async function isExecutionLockedAsync(lockKey: string = DEFAULT_LOCK_KEY): Promise<{
  locked: boolean;
  startedAt: string | null;
  lockInfo?: LockInfo;
}> {
  try {
    const status = await getPersistentLockStatus(lockKey);
    if (status.locked) {
      return {
        locked: true,
        startedAt: status.lockInfo?.startedAt || currentRunStartedAt,
        lockInfo: status.lockInfo,
      };
    }
  } catch {
    // Fallback a estado en memoria
  }
  return {
    locked: isIngestionRunning,
    startedAt: currentRunStartedAt,
  };
}

/**
 * Fecha de referencia editorial actual (Palencia)
 */
const TODAY_EDITORIAL = '2026-10-24';

/**
 * Filtra horas que correspondan a límites de venta o de cierre ("hasta las HH:MM", "entradas hasta...")
 * Si solo se detectó una hora de cierre, debe retornarse null y clasificarse como REQUIERE_REVISION.
 */
function sanitizeProposedTime(caption: string, detectedTime: string | null): { time: string | null; requiresRevision: boolean } {
  if (!detectedTime) return { time: null, requiresRevision: false };

  const lower = (caption || '').toLowerCase();
  // Patrones de hora de cierre / fin de taquilla
  const untilRegex = new RegExp(`(?:hasta\\s+las?|entradas?\\s+hasta|cierre\\s+a\\s+las?|apertura\\s+hasta)\\s*${detectedTime}`, 'i');
  if (untilRegex.test(lower)) {
    return { time: null, requiresRevision: true };
  }

  return { time: detectedTime, requiresRevision: false };
}

/**
 * Mínimo absoluto exigido por Apify para el parámetro maxTotalChargeUsd.
 * Cualquier valor inferior es rechazado por la API de Apify con HTTP 400.
 */
export const APIFY_MIN_CHARGE_USD = 0.005;

/**
 * Estimación defensiva de coste por post en la tarifa Free de Apify
 * ($0.0017 / post de coste base + margen para tiempo de cómputo y proxy).
 */
export const APIFY_DEFAULT_COST_PER_POST_USD = 0.003;

/**
 * Resuelve y valida el límite monetario de gasto en dólares (maxTotalChargeUsd)
 * aplicable a una invocación individual del actor apify/instagram-post-scraper.
 *
 * Política de gasto:
 * 1. Si se proporciona overrideMaxTotalChargeUsd explícito, se valida estrictamente (debe ser >= 0.005).
 * 2. Si no, se evalúa la variable de entorno APIFY_MAX_TOTAL_CHARGE_USD (si existe, debe ser >= 0.005).
 * 3. Si no existe configuración previa, se calcula defensivamente en base al límite de posts:
 *    max(0.005, Number((postsLimit * 0.003).toFixed(4))).
 *
 * En ningún caso se omite maxTotalChargeUsd (lo cual permitiría gasto ilimitado) ni se permite un
 * fallback silencioso ante valores inválidos.
 */
export function resolveApifyMaxTotalChargeUsd(postsLimit: number, overrideMaxTotalChargeUsd?: number): number {
  if (overrideMaxTotalChargeUsd !== undefined) {
    if (
      typeof overrideMaxTotalChargeUsd !== 'number' ||
      isNaN(overrideMaxTotalChargeUsd) ||
      overrideMaxTotalChargeUsd < APIFY_MIN_CHARGE_USD
    ) {
      throw new Error(`overrideMaxTotalChargeUsd inválido (${overrideMaxTotalChargeUsd}). Debe ser un número >= ${APIFY_MIN_CHARGE_USD} USD.`);
    }
    return Number(overrideMaxTotalChargeUsd.toFixed(4));
  }

  const envVal = process.env.APIFY_MAX_TOTAL_CHARGE_USD;
  if (envVal !== undefined && envVal.trim() !== '') {
    const parsed = Number(envVal);
    if (isNaN(parsed) || parsed < APIFY_MIN_CHARGE_USD) {
      throw new Error(`Variable de entorno APIFY_MAX_TOTAL_CHARGE_USD inválida (${envVal}). Debe ser un número >= ${APIFY_MIN_CHARGE_USD} USD.`);
    }
    return Number(parsed.toFixed(4));
  }

  return Math.max(APIFY_MIN_CHARGE_USD, Number((postsLimit * APIFY_DEFAULT_COST_PER_POST_USD).toFixed(4)));
}

export interface RunInstagramIngestionOptions {
  sourceIds?: number[];
  onlyActive?: boolean;
  executionType?: 'manual_single' | 'manual_selected' | 'manual_all' | 'cron_scheduled';
  mockPostsProvider?: (username: string, limit: number, includeReels?: boolean) => Promise<ApifyInstagramRawPost[]>;
  overridePostsLimit?: number;
  overrideIncludeReels?: boolean;
  overrideMaxTotalChargeUsd?: number;
}

/**
 * Ejecutor principal de ingesta de Instagram para una lista de fuentes
 */
export async function runInstagramIngestion(options: RunInstagramIngestionOptions): Promise<IngestionRunResult> {
  // Validación estricta de parámetros reutilizables antes de adquirir lock
  if (options.overridePostsLimit !== undefined) {
    if (
      typeof options.overridePostsLimit !== 'number' ||
      !Number.isInteger(options.overridePostsLimit) ||
      options.overridePostsLimit < 1 ||
      options.overridePostsLimit > 20
    ) {
      throw new Error('overridePostsLimit debe ser un número entero entre 1 y 20.');
    }
  }

  if (options.overrideIncludeReels !== undefined) {
    if (typeof options.overrideIncludeReels !== 'boolean') {
      throw new Error('overrideIncludeReels debe ser un booleano (true o false).');
    }
  }

  if (options.overrideMaxTotalChargeUsd !== undefined) {
    if (
      typeof options.overrideMaxTotalChargeUsd !== 'number' ||
      isNaN(options.overrideMaxTotalChargeUsd) ||
      options.overrideMaxTotalChargeUsd < APIFY_MIN_CHARGE_USD
    ) {
      throw new Error(`overrideMaxTotalChargeUsd debe ser un número >= ${APIFY_MIN_CHARGE_USD} USD.`);
    }
  }

  const executionId = `ig_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const startedAt = new Date().toISOString();

  // 1. Adquirir lock persistente en PostgreSQL con exclusión mutua
  const lockAcquire = await acquirePersistentLock({
    lockKey: DEFAULT_LOCK_KEY,
    lockedBy: executionId,
    ttlMinutes: DEFAULT_LOCK_TTL_MINUTES,
    executionDetails: {
      executionType: options.executionType || 'manual',
      sourceIds: options.sourceIds || [],
      onlyActive: options.onlyActive,
      startedAt,
    },
  });

  if (!lockAcquire.success) {
    const lockStarted = lockAcquire.lockInfo?.startedAt || currentRunStartedAt || 'recientemente';
    const error: any = new Error(
      `Ya existe una ejecución de ingesta en curso iniciada a las ${lockStarted}. No se permiten ejecuciones concurrentes.`
    );
    error.status = 409;
    error.statusCode = 409;
    error.lockInfo = lockAcquire.lockInfo;
    throw error;
  }

  isIngestionRunning = true;
  currentRunStartedAt = startedAt;

  const result: IngestionRunResult = {
    executionId,
    startedAt,
    completedAt: '',
    durationMs: 0,
    sourcesProcessed: 0,
    totalPostsScraped: 0,
    proposalsCreated: 0,
    duplicatesSkipped: 0,
    errors: [],
    resultsBySource: [],
  };

  try {
    // 1. Obtener las fuentes a procesar
    let querySql = `
      SELECT s.*, v.name AS venue_name, v.slug AS venue_slug, v.address AS venue_address
      FROM instagram_ingestion_sources s
      JOIN venues v ON s.venue_id = v.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options.onlyActive) {
      querySql += ` AND s.is_active = true`;
    }

    if (options.sourceIds && options.sourceIds.length > 0) {
      params.push(options.sourceIds);
      querySql += ` AND s.id = ANY($${params.length})`;
    }

    querySql += ` ORDER BY s.id ASC;`;

    const sourcesRes = await query(querySql, params);
    const sources: IngestionSourceRow[] = sourcesRes.rows;

    // Cargar eventos existentes para matching defensivo y detección de duplicados
    let existingEvents: ExistingEventRecord[] = [];
    try {
      const evRes = await query(
        `SELECT id, venue_id, editorial_date, start_time, title, description, status, image_url
         FROM events
         WHERE status IN ('published', 'draft', 'tentative');`
      );
      existingEvents = evRes.rows;
    } catch (evErr) {
      console.warn('[Instagram Ingestion] No se pudieron cargar eventos existentes para matching:', evErr);
    }

    for (const source of sources) {
      result.sourcesProcessed++;
      const sourceResult = {
        sourceId: source.id,
        venueId: source.venue_id,
        username: source.instagram_username,
        status: 'success' as 'success' | 'partial' | 'error',
        error: undefined as string | undefined,
        postsExtracted: 0,
        proposalsCreated: 0,
      };

      try {
        const postsLimit = options.overridePostsLimit !== undefined
          ? Math.min(Math.max(options.overridePostsLimit, 1), 20)
          : Math.min(Math.max(source.posts_per_run || 5, 1), 20);

        const includeReels = options.overrideIncludeReels !== undefined
          ? options.overrideIncludeReels
          : Boolean(source.include_reels);

        let posts: ApifyInstagramRawPost[] = [];

        if (options.mockPostsProvider) {
          posts = await options.mockPostsProvider(source.instagram_username, postsLimit, includeReels);
        } else {
          // En modo producción / Apify, si hay token de Apify disponible
          posts = await fetchPostsFromApify(source.instagram_username, postsLimit, includeReels, {
            maxTotalChargeUsd: options.overrideMaxTotalChargeUsd,
          });
        }

        sourceResult.postsExtracted = posts.length;
        result.totalPostsScraped += posts.length;

        let sourceErrors = 0;

        for (const post of posts) {
          try {
            // Descarte local de vídeos/Reels cuando includeReels es false:
            // - El actor apify/instagram-post-scraper no admite 'includeReels' en su inputSchema.
            // - Por tanto, Apify puede devolver vídeos/Reels presentes en el feed y consumen cuota.
            // - Descarte preventivo: Se descartan localmente ANTES de clasificación, subida de imágenes a R2 y persistencia.
            // - Ausencia de peticiones compensatorias: NO se solicitan publicaciones adicionales para suplir las descartadas.
            // - Carruseles (Sidecar): Los posts multislide tienen type 'Sidecar' y son admitidos como carrusel de imágenes;
            //   únicamente los posts puramente de vídeo ('Video' o con videoUrl exclusivo) son descartados.
            if (!includeReels && (post.type === 'Video' || post.videoUrl)) {
              continue;
            }

            const shortCode = post.shortCode || post.id || '';
            const caption = post.caption || '';
            const postDate = post.timestamp ? post.timestamp.split('T')[0] : null;

            // Clasificar post con motor de reglas
            const classificationResult = classifyBarPost(post, source.venue_name);

            // Matching defensivo con eventos publicados en el catálogo
            const isNoDateTime =
              classificationResult.classification === 'CONTENIDO_VENUE' ||
              (!classificationResult.detectedDate && !classificationResult.detectedTime);

            const matchEval = matchPostWithPublishedEvents(
              {
                venueId: source.venue_id,
                proposedDate: classificationResult.detectedDate || null,
                proposedTime: classificationResult.detectedTime || null,
                title: classificationResult.candidateTitle || `Actividad en ${source.venue_name || 'local'}`,
                caption,
                imageUrl: post.displayUrl,
                postPublishedAt: post.timestamp,
                hasNoDateAndTime: isNoDateTime,
              },
              existingEvents
            );

            let effectiveDate: string | null = null;
            let effectiveTime: string | null = null;
            let effectiveClassification = classificationResult.classification;
            let effectiveReviewStatus = 'pending';
            let effectiveRequiresManualReview = true;
            let matchedEventId: number | null = matchEval.matchedEvent?.id || null;
            let matchLevel: string | null = matchEval.matchLevel !== 'SIN_MATCH' ? matchEval.matchLevel : null;
            let matchReasons: string | null = matchEval.signals.length > 0 ? matchEval.signals.join('; ') : null;

            if (isNoDateTime) {
              // Contenido de venue sin fecha ni hora
              effectiveDate = null;
              effectiveTime = null;
              effectiveClassification = 'CONTENIDO_VENUE';
              effectiveReviewStatus = 'pending';
              effectiveRequiresManualReview = true;
            } else if (
              matchEval.matchLevel === 'MATCH_EXACTO' ||
              matchEval.matchLevel === 'MATCH_ALTO' ||
              matchEval.matchLevel === 'MATCH_POSIBLE'
            ) {
              // Posible duplicado de evento ya existente en catálogo
              effectiveDate = classificationResult.detectedDate || postDate;
              effectiveTime = classificationResult.detectedTime || null;
              effectiveClassification = 'DUPLICADO_POSIBLE';
              effectiveReviewStatus = 'pending';
              effectiveRequiresManualReview = true;
            } else {
              // Post con fecha identificada sin duplicados
              effectiveDate = classificationResult.detectedDate || postDate;
              effectiveTime = classificationResult.detectedTime || null;

              // Filtro de horario ("hasta las HH:MM")
              const timeCheck = sanitizeProposedTime(caption, effectiveTime);
              effectiveTime = timeCheck.time;

              if (effectiveDate && effectiveDate < TODAY_EDITORIAL) {
                effectiveClassification = 'PAST_EVENT';
                effectiveReviewStatus = 'archived';
                effectiveRequiresManualReview = false;
              } else if (!effectiveTime) {
                effectiveClassification = 'EVENTO_POSIBLE_SIN_HORA';
                effectiveReviewStatus = 'pending';
                effectiveRequiresManualReview = true;
              } else {
                effectiveClassification = 'EVENTO_POSIBLE';
                effectiveReviewStatus = 'pending';
                effectiveRequiresManualReview = true;
              }
            }

            // Normalización de dedupe_key
            const normTitle = (classificationResult.candidateTitle || `${source.venue_name || 'Evento'} ${effectiveDate || 'sin-fecha'}`)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .slice(0, 30);
            const dedupeKey = `instagram#${source.venue_id}#${effectiveDate || 'sin-fecha'}#${effectiveTime || 'sin-hora'}#${normTitle}`;

            // Comprobar si ya existe en proposals o events
            const dupCheckProposal = await query(
              `SELECT id FROM curation_proposals WHERE dedupe_key = $1 OR instagram_post_shortcode = $2 LIMIT 1;`,
              [dedupeKey, shortCode]
            );
            const dupCheckEvent = await query(
              `SELECT id FROM events WHERE dedupe_key = $1 LIMIT 1;`,
              [dedupeKey]
            );

            if (dupCheckProposal.rows.length > 0 || dupCheckEvent.rows.length > 0) {
              result.duplicatesSkipped++;
              continue;
            }

            // Si no tiene imagen o displayUrl, o la imagen falla, no crear propuesta parcial
            if (!post.displayUrl) {
              continue;
            }

            // Subir imagen a Cloudflare R2
            let r2Image;
            try {
              r2Image = await uploadPostImageToR2(post, source.venue_slug || `venue-${source.venue_id}`);
            } catch (imgErr: any) {
              console.warn(`[Instagram Ingestion] Fallo en imagen para ${shortCode}:`, imgErr.message);
              sourceErrors++;
              continue;
            }

            // Insertar propuesta en curation_proposals
            const insertSql = `
              INSERT INTO curation_proposals (
                title,
                proposed_date,
                proposed_time,
                venue_id,
                category,
                price,
                caption,
                source_url,
                source_type,
                instagram_username,
                instagram_post_shortcode,
                r2_key,
                image_url,
                image_width,
                image_height,
                image_content_type,
                image_size_bytes,
                confidence,
                dedupe_key,
                classification,
                review_status,
                requires_manual_review,
                matched_event_id,
                match_level,
                match_reasons,
                price_status,
                price_note,
                price_source,
                price_checked_at,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'instagram',
                $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24,
                $25, $26, $27, NOW(),
                NOW(), NOW()
              ) RETURNING id;
            `;

            await query(insertSql, [
              classificationResult.candidateTitle || `Actividad en ${source.venue_name || 'local'}`,
              effectiveDate,
              effectiveTime,
              source.venue_id,
              classificationResult.candidateCategory || 'dj_tardeo',
              classificationResult.estimatedPriceCents !== null && classificationResult.estimatedPriceCents !== undefined
                ? Number((classificationResult.estimatedPriceCents / 100).toFixed(2))
                : null,
              caption,
              post.url || `https://www.instagram.com/p/${shortCode}/`,
              source.instagram_username,
              shortCode,
              r2Image.r2Key,
              r2Image.finalUrl,
              r2Image.width,
              r2Image.height,
              r2Image.contentType,
              r2Image.sizeBytes,
              classificationResult.confidence || 'MEDIA',
              dedupeKey,
              effectiveClassification,
              effectiveReviewStatus,
              effectiveRequiresManualReview,
              matchedEventId,
              matchLevel,
              matchReasons,
              classificationResult.priceStatus || 'NOT_INFORMED',
              classificationResult.priceNote || null,
              'instagram',
            ]);

            sourceResult.proposalsCreated++;
            result.proposalsCreated++;
          } catch (postErr: any) {
            console.error(`Error procesando post ${post.shortCode}:`, postErr);
            sourceErrors++;
          }
        }

        if (sourceErrors > 0 && sourceResult.proposalsCreated > 0) {
          sourceResult.status = 'partial';
        } else if (sourceErrors > 0 && sourceResult.proposalsCreated === 0) {
          sourceResult.status = 'error';
          sourceResult.error = 'Fallaron todas las publicaciones procesadas.';
        } else {
          sourceResult.status = 'success';
        }

        // Actualizar estado en instagram_ingestion_sources
        await query(
          `UPDATE instagram_ingestion_sources
           SET last_ingested_at = NOW(),
               last_run_id = $1,
               last_status = $2,
               last_error = $3,
               updated_at = NOW()
           WHERE id = $4;`,
          [executionId, sourceResult.status, sourceResult.error || null, source.id]
        );
      } catch (srcErr: any) {
        sourceResult.status = 'error';
        const isTimeout =
          srcErr.name === 'TimeoutError' ||
          srcErr.name === 'AbortError' ||
          srcErr.message?.includes('timeout') ||
          srcErr.message?.includes('aborted');

        sourceResult.error = isTimeout
          ? `Timeout local alcanzado en la extracción de @${source.instagram_username}. El estado del actor remoto en Apify es indeterminado; no se realizaron reintentos automáticos para evitar costes duplicados.`
          : (srcErr.message || String(srcErr));

        result.errors.push({
          sourceId: source.id,
          username: source.instagram_username,
          error: sourceResult.error || 'Error indeterminado',
        });

        await query(
          `UPDATE instagram_ingestion_sources
           SET last_ingested_at = NOW(),
               last_run_id = $1,
               last_status = 'error',
               last_error = $2,
               updated_at = NOW()
           WHERE id = $3;`,
          [executionId, sourceResult.error, source.id]
        );
      }

      result.resultsBySource.push(sourceResult);
    }
  } finally {
    isIngestionRunning = false;
    currentRunStartedAt = null;
    result.completedAt = new Date().toISOString();
    result.durationMs = new Date(result.completedAt).getTime() - new Date(startedAt).getTime();
    try {
      await releasePersistentLock(DEFAULT_LOCK_KEY, executionId);
    } catch (releaseErr) {
      console.error('Error al liberar lock persistente de ingesta:', releaseErr);
    }
  }

  return result;
}

/**
 * Llamada al scraper de Apify (apify/instagram-post-scraper).
 *
 * Contrato del Actor:
 * - Parámetros oficiales soportados en inputSchema:
 *   ['username', 'resultsLimit', 'skipPinnedPosts', 'includeMusicData', 'onlyPostsNewerThan', 'dataDetailLevel'].
 *   Nota: 'includeReels' NO existe en el esquema y NO se envía.
 * - skipPinnedPosts: false no garantiza orden cronológico estricto de las publicaciones más recientes.
 * - Control de gasto: maxTotalChargeUsd se calcula y envía obligatoriamente como parámetro de query string.
 * - Trazabilidad y timeout: El endpoint síncrono run-sync-get-dataset-items retorna directamente el dataset
 *   sin runId en el payload. Si ocurre un timeout local de 60s, el socket se interrumpe pero el actor remoto
 *   podría continuar su ejecución en Apify. No se realizan reintentos automáticos para prevenir sobrecostes.
 */
export async function fetchPostsFromApify(
  username: string,
  limit: number,
  includeReels: boolean,
  options?: { maxTotalChargeUsd?: number }
): Promise<ApifyInstagramRawPost[]> {
  if (isTestExecution() && process.env.ALLOW_REAL_APIFY_IN_TESTS !== 'true') {
    throw new Error('[APIFY_SAFETY_GUARD] Real Apify scraping calls are strictly blocked in test environments. Provide a mockPostsProvider.');
  }

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    throw new Error('APIFY_TOKEN no configurado en el entorno.');
  }

  const chargeLimit = resolveApifyMaxTotalChargeUsd(limit, options?.maxTotalChargeUsd);

  const endpoint = `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&maxTotalChargeUsd=${chargeLimit}`;
  const input = {
    username: [username],
    resultsLimit: limit,
    skipPinnedPosts: false,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60000), // 60s timeout local del socket
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Fallo en Apify Instagram Post Scraper (HTTP ${res.status}): ${errorBody.slice(0, 200)}`);
  }

  const items = (await res.json()) as any[];
  return items.map((item) => ({
    id: item.id || item.shortCode,
    shortCode: item.shortCode || item.code || item.id,
    type: item.type || (item.videoUrl ? 'Video' : 'Image'),
    url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
    displayUrl: item.displayUrl || item.imageUrl || item.thumbnailUrl,
    caption: item.caption || item.text || '',
    timestamp: item.timestamp || item.takenAt || null,
    likesCount: item.likesCount || 0,
    commentsCount: item.commentsCount || 0,
    dimensionsWidth: item.dimensionsWidth || 1080,
    dimensionsHeight: item.dimensionsHeight || 1080,
    ownerUsername: item.ownerUsername || username,
    taggedUsers: item.taggedUsers || [],
  }));
}
