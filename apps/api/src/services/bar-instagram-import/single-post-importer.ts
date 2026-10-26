import { query } from '@vayaplan/db';
import sharp from 'sharp';
import { putR2Object, getPublicUrlForKey } from '../r2-client';
import { validateInstagramPostUrl } from './url-validator';
import { resolveApifyMaxTotalChargeUsd, sanitizeProposedTime } from './instagram-ingestion-service';
import { acquirePersistentLock, releasePersistentLock } from './persistent-lock';
import { classifyBarPost } from './bar-classifier';
import { matchPostWithPublishedEvents } from './event-matcher';
import type { ApifyInstagramRawPost } from './bar-types';

export const MAX_SINGLE_POST_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const SINGLE_POST_APIFY_BUDGET_USD = 0.005; // Mínimo absoluto exigido por Apify

let testPostFetcherOverride: ((canonicalUrl: string, chargeLimit: number) => Promise<any[]>) | null = null;
let testImageFetcherOverride: ((url: string) => Promise<Buffer>) | null = null;

export function setTestPostFetcherOverride(fn: typeof testPostFetcherOverride) {
  testPostFetcherOverride = fn;
}

export function setTestImageFetcherOverride(fn: typeof testImageFetcherOverride) {
  testImageFetcherOverride = fn;
}

export interface ImportSingleInstagramPostParams {
  url: string;
  venueId?: number | null;
  userEmail?: string;
  mockPostFetcher?: (canonicalUrl: string, chargeLimit: number) => Promise<any[]>;
  mockImageFetcher?: (url: string) => Promise<Buffer>;
}

export interface ImportSingleInstagramPostResult {
  success: boolean;
  status: number;
  code?: string;
  error?: string;
  alreadyExisted?: boolean;
  recordType?: 'proposal' | 'event';
  proposal?: any;
  event?: any;
}

/**
 * Valida que una URL de imagen no apunte a localhost, IPs privadas o esquemas inseguros.
 */
export function isSafeImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h === '0.0.0.0' ||
      h === '169.254.169.254' ||
      h.endsWith('.internal') ||
      h.endsWith('.local')
    ) {
      return false;
    }
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Descarga y almacena de forma segura una imagen en Cloudflare R2 con validación anti-SSRF,
 * decodificación mediante Sharp y límite de tamaño.
 */
export async function downloadAndUploadPostImageToR2(
  post: ApifyInstagramRawPost,
  venueSlug: string,
  mockImageFetcher?: (url: string) => Promise<Buffer>
): Promise<{
  r2Key: string;
  finalUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  contentType: string;
}> {
  const shortCode = post.shortCode || post.id || 'unknown';
  const r2Key = `bars/${venueSlug}/${shortCode}.jpg`;

  if (!post.displayUrl || typeof post.displayUrl !== 'string') {
    throw new Error('La publicación no contiene una URL de imagen (displayUrl).');
  }

  if (!isSafeImageUrl(post.displayUrl)) {
    throw new Error('La URL de la imagen devuelta apunta a un destino no seguro o no permitido.');
  }

  let buffer: Buffer;

  if (mockImageFetcher) {
    buffer = await mockImageFetcher(post.displayUrl);
  } else {
    const res = await fetch(post.displayUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) {
      throw new Error(`Fallo al descargar la imagen de ${post.displayUrl} (HTTP ${res.status}).`);
    }

    const arrayBuffer = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  }

  if (buffer.length > MAX_SINGLE_POST_IMAGE_SIZE_BYTES) {
    throw new Error(`El tamaño de la imagen (${buffer.length} bytes) supera el límite máximo permitido.`);
  }

  // Validar y decodificar formato con Sharp para asegurar que no es un archivo malicioso
  let width = post.dimensionsWidth || 0;
  let height = post.dimensionsHeight || 0;
  let format = 'jpeg';

  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.format) {
      throw new Error('Formato de imagen no reconocido.');
    }
    format = meta.format;
    if (meta.width) width = meta.width;
    if (meta.height) height = meta.height;
  } catch (sharpErr: any) {
    throw new Error(`Archivo de imagen corrupto o inválido: ${sharpErr.message}`);
  }

  const contentType = format === 'png' ? 'image/png' : 'image/jpeg';

  await putR2Object({
    key: r2Key,
    body: buffer,
    contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const finalUrl = getPublicUrlForKey(r2Key);

  return {
    r2Key,
    finalUrl,
    sizeBytes: buffer.length,
    width,
    height,
    contentType,
  };
}

/**
 * Importa puntualmente una publicación de Instagram como propuesta de curación.
 */
export async function importSingleInstagramPost(
  params: ImportSingleInstagramPostParams
): Promise<ImportSingleInstagramPostResult> {
  const { url, venueId, userEmail, mockPostFetcher, mockImageFetcher } = params;
  const effectivePostFetcher = mockPostFetcher || testPostFetcherOverride;
  const effectiveImageFetcher = mockImageFetcher || testImageFetcherOverride;

  // 1. Validar URL sintáctica y canónica
  const urlCheck = validateInstagramPostUrl(url);
  if (!urlCheck.valid) {
    return {
      success: false,
      status: 400,
      code: urlCheck.code,
      error: urlCheck.error,
    };
  }

  const { canonicalUrl, shortcode } = urlCheck;

  // 2. Si se proporciona venueId, comprobar que existe y está activo
  let venueName: string | null = null;
  let venueSlug = 'standalone';

  if (venueId !== undefined && venueId !== null) {
    const vCheck = await query(`SELECT id, name, slug FROM venues WHERE id = $1 AND is_active = true;`, [venueId]);
    if (vCheck.rows.length === 0) {
      return {
        success: false,
        status: 400,
        code: 'venue_not_found',
        error: `El venue con ID ${venueId} no existe o no está activo en el catálogo.`,
      };
    }
    venueName = vCheck.rows[0].name;
    venueSlug = vCheck.rows[0].slug || `venue-${venueId}`;
  }

  // 3. Comprobar duplicados en base de datos ANTES de adquirir lock o llamar a Apify
  const dupProposalPre = await query(
    `SELECT id, title, review_status, classification, venue_id, created_event_id, updated_at
     FROM curation_proposals
     WHERE instagram_post_shortcode = $1 OR source_url = $2
     LIMIT 1;`,
    [shortcode, canonicalUrl]
  );

  if (dupProposalPre.rows.length > 0) {
    return {
      success: true,
      status: 200,
      alreadyExisted: true,
      recordType: 'proposal',
      proposal: dupProposalPre.rows[0],
    };
  }

  const dupEventPre = await query(
    `SELECT id, title, editorial_date, status, venue_id
     FROM events
     WHERE source_url = $1 OR dedupe_key LIKE $2
     LIMIT 1;`,
    [canonicalUrl, `%#${shortcode}`]
  );

  if (dupEventPre.rows.length > 0) {
    return {
      success: true,
      status: 200,
      alreadyExisted: true,
      recordType: 'event',
      event: dupEventPre.rows[0],
    };
  }

  // 4. Concurrencia: Adquirir lock persistente específico para este shortcode
  const lockKey = `single_post_${shortcode}`;
  const lockedBy = `single_import_${shortcode}_${Date.now()}`;

  const lockRes = await acquirePersistentLock({
    lockKey,
    lockedBy,
    ttlMinutes: 2,
    executionDetails: {
      action: 'import_single_post',
      url: canonicalUrl,
      shortcode,
      venueId: venueId || null,
      user: userEmail || 'unknown',
    },
  });

  if (!lockRes.success) {
    return {
      success: false,
      status: 409,
      code: 'import_in_progress',
      error: 'Ya hay una operación de importación en curso para esta misma publicación. Espere unos momentos.',
    };
  }

  try {
    // 5. Repetir comprobación de duplicado tras adquirir el lock
    const dupProposalLocked = await query(
      `SELECT id, title, review_status, classification, venue_id, created_event_id, updated_at
       FROM curation_proposals
       WHERE instagram_post_shortcode = $1 OR source_url = $2
       LIMIT 1;`,
      [shortcode, canonicalUrl]
    );

    if (dupProposalLocked.rows.length > 0) {
      return {
        success: true,
        status: 200,
        alreadyExisted: true,
        recordType: 'proposal',
        proposal: dupProposalLocked.rows[0],
      };
    }

    // 6. Consultar Apify con presupuesto acotado y sin mantener transacción de BD abierta
    const chargeLimit = resolveApifyMaxTotalChargeUsd(1, SINGLE_POST_APIFY_BUDGET_USD);
    let rawItems: any[];

    if (effectivePostFetcher) {
      rawItems = await effectivePostFetcher(canonicalUrl, chargeLimit);
    } else {
      const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as any).describe === 'function';
      if (isTest && process.env.ALLOW_REAL_APIFY_IN_TESTS !== 'true') {
        throw new Error('[APIFY_SAFETY_GUARD] Real Apify scraping calls are strictly blocked in test environments.');
      }

      const apifyToken = process.env.APIFY_TOKEN;
      if (!apifyToken) {
        return {
          success: false,
          status: 500,
          code: 'apify_not_configured',
          error: 'APIFY_TOKEN no está configurado en el servidor.',
        };
      }

      const endpoint = `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(
        apifyToken
      )}&maxTotalChargeUsd=${chargeLimit}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: [canonicalUrl],
          resultsLimit: 1,
          skipPinnedPosts: false,
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout de socket
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          status: 502,
          code: 'apify_http_error',
          error: `Error al consultar Apify (HTTP ${res.status}): ${errText.slice(0, 200)}`,
        };
      }

      rawItems = (await res.json()) as any[];
    }

    // 7. Validaciones estrictas de resultado
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return {
        success: false,
        status: 422,
        code: 'post_not_found',
        error: 'No se pudo recuperar la publicación desde Instagram. Puede pertenecer a una cuenta privada, haber sido eliminada o requerir inicio de sesión.',
      };
    }

    if (rawItems.length > 1) {
      return {
        success: false,
        status: 422,
        code: 'unexpected_multiple_results',
        error: `El proveedor devolvió ${rawItems.length} publicaciones para una URL individual. Operación cancelada por seguridad.`,
      };
    }

    const item = rawItems[0];
    const returnedShortcode = item.shortCode || item.code || item.id;

    if (returnedShortcode !== shortcode) {
      return {
        success: false,
        status: 422,
        code: 'shortcode_mismatch',
        error: `El post devuelto por el scraper (${returnedShortcode}) no coincide con el solicitado (${shortcode}). Operación cancelada por seguridad.`,
      };
    }

    // Normalizar objeto de post
    const rawPost: ApifyInstagramRawPost = {
      id: item.id || shortcode,
      shortCode: shortcode,
      type: item.type || (item.videoUrl ? 'Video' : 'Image'),
      url: canonicalUrl,
      displayUrl: item.displayUrl || item.imageUrl || item.thumbnailUrl,
      caption: item.caption || item.text || '',
      timestamp: item.timestamp || item.takenAt || null,
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      dimensionsWidth: item.dimensionsWidth || 1080,
      dimensionsHeight: item.dimensionsHeight || 1080,
      ownerUsername: item.ownerUsername || 'unknown',
      taggedUsers: item.taggedUsers || [],
    };

    if (!rawPost.displayUrl) {
      return {
        success: false,
        status: 422,
        code: 'missing_image',
        error: 'La publicación no contiene una imagen o miniatura utilizable como cartel.',
      };
    }

    // 8. Descarga de imagen y subida a Cloudflare R2 con protecciones
    let r2Image;
    try {
      r2Image = await downloadAndUploadPostImageToR2(rawPost, venueSlug, effectiveImageFetcher || undefined);
    } catch (imgErr: any) {
      return {
        success: false,
        status: 502,
        code: 'image_upload_failed',
        error: `Error al procesar la imagen del post: ${imgErr.message}`,
      };
    }

    // 9. Clasificación con motor de reglas existente
    const venueLabel = venueName || 'Local sin asignar';
    const classificationResult = classifyBarPost(rawPost, venueLabel);

    // Matching defensivo con eventos publicados en catálogo
    const eventsRes = await query(
      `SELECT id, title, editorial_date, start_time, venue_id, image_url
       FROM events
       WHERE status = 'published'
       ORDER BY editorial_date DESC
       LIMIT 50;`
    );
    const existingEvents = eventsRes.rows;

    const isNoDateTime =
      classificationResult.classification === 'CONTENIDO_VENUE' ||
      (!classificationResult.detectedDate && !classificationResult.detectedTime);

    const matchEval = matchPostWithPublishedEvents(
      {
        venueId: venueId || null,
        proposedDate: classificationResult.detectedDate || null,
        proposedTime: classificationResult.detectedTime || null,
        title: classificationResult.candidateTitle || `Actividad en ${venueLabel}`,
        caption: rawPost.caption || '',
        imageUrl: r2Image.finalUrl,
        postPublishedAt: rawPost.timestamp,
        hasNoDateAndTime: isNoDateTime,
      },
      existingEvents
    );

    let effectiveDate: string | null = null;
    let effectiveTime: string | null = null;
    let effectiveClassification = classificationResult.classification;
    const effectiveReviewStatus = 'pending';
    const effectiveRequiresManualReview = true;
    const matchedEventId: number | null = matchEval.matchedEvent?.id || null;
    const matchLevel: string | null = matchEval.matchLevel !== 'SIN_MATCH' ? matchEval.matchLevel : null;
    const matchReasons: string | null = matchEval.signals.length > 0 ? matchEval.signals.join('; ') : null;

    if (isNoDateTime) {
      effectiveDate = null;
      effectiveTime = null;
      effectiveClassification = 'CONTENIDO_VENUE';
    } else if (
      matchEval.matchLevel === 'MATCH_EXACTO' ||
      matchEval.matchLevel === 'MATCH_ALTO' ||
      matchEval.matchLevel === 'MATCH_POSIBLE'
    ) {
      effectiveDate = classificationResult.detectedDate || null;
      effectiveTime = classificationResult.detectedTime || null;
      effectiveClassification = 'DUPLICADO_POSIBLE';
    } else {
      effectiveDate = classificationResult.detectedDate || null;
      effectiveTime = classificationResult.detectedTime || null;
      if (effectiveTime) {
        const timeCheck = sanitizeProposedTime(rawPost.caption || '', effectiveTime);
        effectiveTime = timeCheck.time;
      }

      if (!effectiveTime) {
        effectiveClassification = 'EVENTO_POSIBLE_SIN_HORA';
      } else {
        effectiveClassification = 'EVENTO_POSIBLE';
      }
    }

    // 10. Dedupe key robusto (no depende únicamente del venue)
    const normTitle = (classificationResult.candidateTitle || `Post ${shortcode}`)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 30);
    const dedupeKey = `instagram#${venueId || 'sin-venue'}#${effectiveDate || 'sin-fecha'}#${
      effectiveTime || 'sin-hora'
    }#${normTitle}#${shortcode}`;

    // 11. Inserción atómica en curation_proposals
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
      )
      RETURNING *;
    `;

    const candidateTitle =
      classificationResult.candidateTitle || (venueName ? `Actividad en ${venueName}` : `Publicación de @${rawPost.ownerUsername}`);

    const insertParams = [
      candidateTitle.slice(0, 255),
      effectiveDate,
      effectiveTime,
      venueId || null,
      classificationResult.candidateCategory || 'dj_tardeo',
      classificationResult.estimatedPriceCents !== null && classificationResult.estimatedPriceCents !== undefined
        ? Number((classificationResult.estimatedPriceCents / 100).toFixed(2))
        : null,
      rawPost.caption || '',
      canonicalUrl,
      rawPost.ownerUsername,
      shortcode,
      r2Image.r2Key,
      r2Image.finalUrl,
      r2Image.width,
      r2Image.height,
      r2Image.contentType,
      r2Image.sizeBytes,
      classificationResult.confidence || 'BAJA',
      dedupeKey,
      effectiveClassification,
      effectiveReviewStatus,
      effectiveRequiresManualReview,
      matchedEventId,
      matchLevel,
      matchReasons,
      classificationResult.priceStatus || 'UNKNOWN',
      classificationResult.priceNote || null,
      'instagram_single_import',
    ];

    const insertRes = await query(insertSql, insertParams);
    const createdProposal = insertRes.rows[0];

    return {
      success: true,
      status: 201,
      alreadyExisted: false,
      proposal: createdProposal,
    };
  } finally {
    // 12. Liberación garantizada del lock persistente en bloque finally
    await releasePersistentLock(lockKey);
  }
}
