import { getClient, query } from '@vayaplan/db';
import { validateInstagramPostUrl } from './url-validator';
import {
  INTROPIX_ACTOR_ID,
  INTROPIX_ESTIMATED_COST_USD,
  INTROPIX_MAX_CHARGE_LIMIT_USD,
  INTROPIX_START_CHARGE_USD,
  INTROPIX_PROFILE_SCAN_CHARGE_USD,
  INTROPIX_RESULT_ITEM_CHARGE_USD,
  scrapeSinglePostWithIntropix,
  type IntropixScrapeResult,
} from './intropix-adapter';
import { downloadAndUploadPostImageToR2 } from './single-post-importer';
import { classifyBarPost } from './bar-classifier';
import type { ApifyInstagramRawPost } from './bar-types';

export const AUTHORIZATION_TTL_MINUTES = 10;

export interface PrepareAuthorizationParams {
  url: string;
  venueId?: number | null;
  userEmail: string;
}

export interface PrepareAuthorizationResult {
  success: boolean;
  status: number;
  error?: string;
  code?: string;
  data?: {
    operationId: string;
    actorId: string;
    canonicalUrl: string;
    shortcode: string;
    venueId: number | null;
    estimatedCostUsd: number;
    maxChargeLimitUsd: number;
    startFeeUsd: number;
    currency: string;
    expiresAt: string;
    notice: string;
  };
}

export interface ExecuteAuthorizationParams {
  operationId: string;
  canonicalUrl: string;
  shortcode: string;
  venueId?: number | null;
  userEmail: string;
}

/**
 * Prepara y persiste de forma coordinada una autorización de gasto para el scraper alternativo.
 * Garantiza:
 * - Vinculación estricta a usuario, URL canónica, shortcode y presupuesto.
 * - Comprobación de que no existan propuestas ni eventos duplicados.
 * - TTL acotado (10 min) y resistencia a reinicios mediante BD.
 */
export async function preparePaidImportAuthorization(
  params: PrepareAuthorizationParams
): Promise<PrepareAuthorizationResult> {
  const { url, userEmail } = params;

  // 1. Validar URL de Instagram y extraer shortcode
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      status: 400,
      code: 'missing_url',
      error: 'La URL de Instagram es obligatoria.',
    };
  }

  const urlValidation = validateInstagramPostUrl(url);
  if (!urlValidation.valid) {
    return {
      success: false,
      status: 400,
      code: urlValidation.code,
      error: urlValidation.error,
    };
  }

  const { canonicalUrl, shortcode } = urlValidation;

  // 2. Validar Venue (opcional)
  let venueId: number | null = null;
  if (params.venueId !== undefined && params.venueId !== null && params.venueId !== ('' as any)) {
    const parsedVId = parseInt(String(params.venueId), 10);
    if (!isNaN(parsedVId)) {
      const vCheck = await query(`SELECT id FROM venues WHERE id = $1 AND is_active = true;`, [parsedVId]);
      if (vCheck.rows.length === 0) {
        return {
          success: false,
          status: 400,
          code: 'venue_not_found',
          error: `El local con ID ${parsedVId} no existe o está inactivo.`,
        };
      }
      venueId = parsedVId;
    }
  }

  // 3. Comprobar duplicados existentes en propuestas y catálogo
  const dedupeKey = 'instagram_' + shortcode;
  const dupProp = await query(
    `SELECT id, review_status FROM curation_proposals 
     WHERE dedupe_key = $1 OR instagram_post_shortcode = $2 OR source_url = $3 OR source_url = $4 
     LIMIT 1;`,
    [dedupeKey, shortcode, canonicalUrl, canonicalUrl.replace(/\/$/, '')]
  );

  if (dupProp.rows.length > 0) {
    return {
      success: false,
      status: 409,
      code: 'duplicate_proposal',
      error: `Esta publicación ya existe como propuesta (#${dupProp.rows[0].id}, estado: ${dupProp.rows[0].review_status}).`,
    };
  }

  const dupEvent = await query(
    `SELECT id FROM events WHERE source_url = $1 OR source_url = $2 LIMIT 1;`,
    [canonicalUrl, canonicalUrl.replace(/\/$/, '')]
  );

  if (dupEvent.rows.length > 0) {
    return {
      success: false,
      status: 409,
      code: 'event_already_exists',
      error: `Esta publicación ya tiene un evento en catálogo (#${dupEvent.rows[0].id}).`,
    };
  }

  // 4. Generar identificador único de operación y TTL
  const operationId = 'op_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AUTHORIZATION_TTL_MINUTES * 60 * 1000);
  const lockKey = `ig_paid:${shortcode}`;

  const executionDetails = {
    operationId,
    shortcode,
    canonicalUrl,
    actorId: INTROPIX_ACTOR_ID,
    venueId,
    maxBudgetUsd: INTROPIX_MAX_CHARGE_LIMIT_USD,
    estimatedCostUsd: INTROPIX_ESTIMATED_COST_USD,
    startFeeUsd: INTROPIX_START_CHARGE_USD,
    userEmail,
    status: 'authorized',
    authorizedAt: now.toISOString(),
    runId: null,
    reportedCostUsd: null,
  };

  // 5. Persistir en instagram_ingestion_locks con atomicidad transaccional
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const checkSql = `
      SELECT id, lock_key, locked_by, locked_at, expires_at, released_at, execution_details
      FROM instagram_ingestion_locks
      WHERE lock_key = $1
      FOR UPDATE;
    `;
    const checkRes = await client.query(checkSql, [lockKey]);

    if (checkRes.rows.length > 0) {
      const existing = checkRes.rows[0];
      const isExpired = new Date(existing.expires_at).getTime() <= now.getTime();
      const isReleased = existing.released_at !== null;
      const existingStatus = existing.execution_details?.status;

      // Si existe una operación previa con estado incierto (timeout de inicio sin respuesta del proveedor),
      // no permitir sobreescribirla ni reintentar automáticamente al vencer el TTL
      if (existingStatus === 'uncertain') {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 409,
          code: 'operation_uncertain',
          error: `Existe una operación previa con estado indeterminado en el proveedor para ${shortcode}. Por precaución financiera no se iniciará otro run automático; completa la propuesta manualmente.`,
        };
      }

      // Si hay una ejecución en curso activa y no expirada, no permitir sobreescribirla
      if (!isReleased && !isExpired && existingStatus === 'running') {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 409,
          code: 'operation_already_running',
          error: `Ya existe una extracción en curso para la publicación ${shortcode}.`,
        };
      }

      const updateSql = `
        UPDATE instagram_ingestion_locks
        SET locked_by = $1,
            locked_at = $2,
            expires_at = $3,
            released_at = NULL,
            execution_details = $4
        WHERE lock_key = $5;
      `;
      await client.query(updateSql, [
        userEmail,
        now.toISOString(),
        expiresAt.toISOString(),
        JSON.stringify(executionDetails),
        lockKey,
      ]);
    } else {
      const insertSql = `
        INSERT INTO instagram_ingestion_locks (
          lock_key, locked_by, locked_at, expires_at, released_at, execution_details
        ) VALUES ($1, $2, $3, $4, NULL, $5);
      `;
      await client.query(insertSql, [
        lockKey,
        userEmail,
        now.toISOString(),
        expiresAt.toISOString(),
        JSON.stringify(executionDetails),
      ]);
    }

    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    success: true,
    status: 200,
    data: {
      operationId,
      actorId: INTROPIX_ACTOR_ID,
      canonicalUrl,
      shortcode,
      venueId,
      estimatedCostUsd: INTROPIX_ESTIMATED_COST_USD,
      maxChargeLimitUsd: INTROPIX_MAX_CHARGE_LIMIT_USD,
      startFeeUsd: INTROPIX_START_CHARGE_USD,
      profileScanFeeUsd: INTROPIX_PROFILE_SCAN_CHARGE_USD,
      resultItemFeeUsd: INTROPIX_RESULT_ITEM_CHARGE_USD,
      currency: 'USD',
      expiresAt: expiresAt.toISOString(),
      notice:
        'El proveedor cobra una tarifa de inicio de run (0,005 USD), resolución de cuenta de autor (0,002 USD) y entrega de post (0,0019 USD). Coste estimado: 0,0089 USD. Sin reintentos automáticos.',
    },
  };
}

/**
 * Ejecuta una extracción autorizada con el proveedor alternativo.
 * - Valida de nuevo usuario, URL, shortcode, presupuesto y no caducidad.
 * - No mantiene transacciones de BD abiertas durante la llamada externa a Apify.
 * - Registra resultados, costes e ingestión con seguridad.
 */
export async function executeAuthorizedPaidImport(
  params: ExecuteAuthorizationParams
): Promise<{
  success: boolean;
  status: number;
  code: string;
  error?: string;
  proposal?: any;
  operation?: any;
  canCompleteManually?: boolean;
  canonicalUrl: string;
  shortcode: string;
  venueId?: number | null;
}> {
  const { operationId, canonicalUrl, shortcode, userEmail } = params;
  const lockKey = `ig_paid:${shortcode}`;
  const now = new Date();

  // 1. Validar autorización atómica en BD y transicionar a 'running'
  let executionDetails: any;
  let venueId: number | null = params.venueId ?? null;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const checkSql = `
      SELECT id, lock_key, locked_by, locked_at, expires_at, released_at, execution_details
      FROM instagram_ingestion_locks
      WHERE lock_key = $1
      FOR UPDATE;
    `;
    const checkRes = await client.query(checkSql, [lockKey]);

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 404,
        code: 'authorization_not_found',
        error: 'No se encontró una autorización previa para esta publicación. Solicita una nueva autorización.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    const row = checkRes.rows[0];
    executionDetails = row.execution_details || {};

    // Validaciones estrictas de correspondencia
    if (executionDetails.operationId !== operationId) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 403,
        code: 'invalid_operation_id',
        error: 'El identificador de operación no coincide con la autorización registrada.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    if (executionDetails.canonicalUrl !== canonicalUrl || executionDetails.shortcode !== shortcode) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 400,
        code: 'url_shortcode_mismatch',
        error: 'La URL o shortcode no coinciden con los datos autorizados.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    // Comprobar que el usuario ejecutor coincide con el administrador que autorizó
    if (executionDetails.userEmail && executionDetails.userEmail !== userEmail) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 403,
        code: 'unauthorized_user',
        error: 'Esta autorización fue concedida a otro administrador. Cada operador debe autorizar su propia extracción.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    // Una operación con resultado incierto (timeout al iniciar) nunca vuelve a un estado ejecutable
    if (executionDetails.status === 'uncertain') {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 409,
        code: 'operation_uncertain',
        error: 'El estado del run en el proveedor es indeterminado (timeout de inicio). Por seguridad presupuestaria no se reintenta automáticamente.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      await client.query('ROLLBACK');
      return {
        success: false,
        status: 410,
        code: 'authorization_expired',
        error: 'La autorización de gasto ha caducado (límite: 10 minutos). Debes confirmar una nueva autorización.',
        canCompleteManually: true,
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    let isResumeRecovery = false;

    // Validación de autorización de un solo uso y gestión de estados
    if (executionDetails.status !== 'authorized') {
      if (executionDetails.status === 'running') {
        if (executionDetails.runId) {
          // Si ya existe runId conocido, recuperamos el mismo run en lugar de fallar o lanzar otro
          isResumeRecovery = true;
        } else {
          await client.query('ROLLBACK');
          return {
            success: false,
            status: 409,
            code: 'run_already_in_progress',
            error: 'La extracción ya se encuentra en curso en el proveedor. No se iniciará otro run.',
            canCompleteManually: true,
            canonicalUrl,
            shortcode,
            venueId,
          };
        }
      } else if (executionDetails.status === 'succeeded' && executionDetails.proposalId) {
        await client.query('ROLLBACK');
        const propRes = await query(`SELECT * FROM curation_proposals WHERE id = $1;`, [executionDetails.proposalId]);
        return {
          success: true,
          status: 200,
          code: 'already_completed',
          proposal: propRes.rows[0] || null,
          operation: executionDetails,
          canonicalUrl,
          shortcode,
          venueId,
        };
      } else if (executionDetails.status === 'uncertain') {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 409,
          code: 'operation_uncertain',
          error: 'El estado del run en el proveedor es indeterminado (timeout de inicio). Por seguridad presupuestaria no se reintenta automáticamente.',
          canCompleteManually: true,
          canonicalUrl,
          shortcode,
          venueId,
        };
      } else {
        await client.query('ROLLBACK');
        return {
          success: false,
          status: 409,
          code: 'authorization_already_consumed',
          error: 'Esta autorización ya fue consumida o finalizó previamente. Solicita una nueva autorización si deseas volver a intentar.',
          canCompleteManually: true,
          canonicalUrl,
          shortcode,
          venueId,
        };
      }
    }

    venueId = executionDetails.venueId ?? venueId;

    if (!isResumeRecovery) {
      // Transicionar a 'running'
      executionDetails.status = 'running';
      executionDetails.startedAt = now.toISOString();

      const updateSql = `
        UPDATE instagram_ingestion_locks
        SET execution_details = $1,
            locked_at = $2
        WHERE lock_key = $3;
      `;
      await client.query(updateSql, [JSON.stringify(executionDetails), now.toISOString(), lockKey]);
    }

    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    // Liberar conexión antes de la llamada de red a Apify
    client.release();
  }

  // 2. Invocar proveedor alternativo (intropix) SIN mantener conexión de BD abierta
  let scrapeResult: IntropixScrapeResult;
  try {
    scrapeResult = await scrapeSinglePostWithIntropix({
      canonicalUrl,
      shortcode,
      customRunId: executionDetails.runId || undefined,
    });
  } catch (err: any) {
    scrapeResult = {
      success: false,
      status: 502,
      code: 'intropix_execution_error',
      error: `Error durante la extracción: ${err.message}`,
      canCompleteManually: true,
      canonicalUrl,
      shortcode,
    };
  }

  // 3. Procesar resultado y actualizar persistencia de forma atómica
  const updateClient = await getClient();
  try {
    await updateClient.query('BEGIN');

    const completedAt = new Date();
    executionDetails.runId = scrapeResult.runId || executionDetails.runId || null;
    executionDetails.reportedCostUsd = scrapeResult.reportedCostUsd !== undefined ? scrapeResult.reportedCostUsd : null;

    if (!scrapeResult.success || !scrapeResult.item) {
      if (scrapeResult.code === 'apify_start_timeout') {
        executionDetails.status = 'uncertain';
        executionDetails.reportedCostUsd = null; // No presentar coste como cero ante resultado incierto
      } else {
        executionDetails.status = 'failed';
      }
      executionDetails.completedAt = completedAt.toISOString();
      executionDetails.failureReason = scrapeResult.code;
      executionDetails.failureMessage = scrapeResult.error || 'Fallo desconocido en proveedor alternativo';

      await updateClient.query(
        `UPDATE instagram_ingestion_locks
         SET released_at = NOW(),
             execution_details = $1
         WHERE lock_key = $2;`,
        [JSON.stringify(executionDetails), lockKey]
      );

      await updateClient.query('COMMIT');

      console.warn(
        JSON.stringify({
          timestamp: completedAt.toISOString(),
          level: 'warn',
          service: 'bar_instagram_import_fallback',
          action: 'paid_fallback_failed',
          operationId,
          shortcode,
          code: scrapeResult.code,
          error: scrapeResult.error,
          runId: scrapeResult.runId,
          reportedCostUsd: scrapeResult.reportedCostUsd,
          user: userEmail,
        })
      );

      return {
        success: false,
        status: scrapeResult.status,
        code: scrapeResult.code,
        error: scrapeResult.error || 'No se pudo extraer la publicación con el proveedor alternativo.',
        canCompleteManually: Boolean(scrapeResult.canCompleteManually),
        canonicalUrl,
        shortcode,
        venueId,
        operation: executionDetails,
      };
    }

    // 4. Éxito: descargar imagen de portada y almacenar en Cloudflare R2
    const item = scrapeResult.item;

    // Obtener la mejor URL de portada: primera imagen o cover del reel/video
    let primaryMediaUrl = '';
    if (item.media && item.media.length > 0) {
      const firstSlide = item.media[0];
      primaryMediaUrl = firstSlide.media_type === 'video' && firstSlide.cover_url
        ? firstSlide.cover_url
        : firstSlide.media_url;
    }

    if (!primaryMediaUrl && item.profile_pic_url) {
      primaryMediaUrl = item.profile_pic_url;
    }

    if (!primaryMediaUrl) {
      executionDetails.status = 'failed';
      executionDetails.failureReason = 'missing_image';
      executionDetails.failureMessage = 'La publicación no contiene una imagen o miniatura utilizable como cartel.';

      await updateClient.query(
        `UPDATE instagram_ingestion_locks
         SET released_at = NOW(),
             execution_details = $1
         WHERE lock_key = $2;`,
        [JSON.stringify(executionDetails), lockKey]
      );

      await updateClient.query('COMMIT');

      return {
        success: false,
        status: 422,
        code: 'missing_image',
        error: 'La publicación no contiene una imagen o miniatura utilizable como cartel.',
        canCompleteManually: Boolean(scrapeResult.canCompleteManually),
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    const rawPostForR2: ApifyInstagramRawPost = {
      id: item.post_pk || shortcode,
      shortCode: shortcode,
      type: item.post_type === 'video' || item.post_type === 'reel' ? 'Video' : 'Image',
      url: canonicalUrl,
      displayUrl: primaryMediaUrl,
      caption: item.caption || '',
      timestamp: item.taken_at,
      likesCount: item.like_count || 0,
      commentsCount: item.comment_count || 0,
      dimensionsWidth: item.media?.[0]?.width || 1080,
      dimensionsHeight: item.media?.[0]?.height || 1080,
      ownerUsername: item.username || 'unknown',
      taggedUsers: [],
    };

    let r2Image: any;
    try {
      r2Image = await downloadAndUploadPostImageToR2(rawPostForR2);
    } catch (r2Err: any) {
      executionDetails.status = 'failed';
      executionDetails.failureReason = 'image_upload_failed';
      executionDetails.failureMessage = `Error al procesar y subir imagen a R2: ${r2Err.message}`;

      await updateClient.query(
        `UPDATE instagram_ingestion_locks
         SET released_at = NOW(),
             execution_details = $1
         WHERE lock_key = $2;`,
        [JSON.stringify(executionDetails), lockKey]
      );

      await updateClient.query('COMMIT');

      return {
        success: false,
        status: 502,
        code: 'image_upload_failed',
        error: `Error al procesar la imagen del post: ${r2Err.message}`,
        canCompleteManually: Boolean(scrapeResult.canCompleteManually),
        canonicalUrl,
        shortcode,
        venueId,
      };
    }

    // 5. Clasificar propuesta y detectar posibles fechas y horarios
    let venueName: string | null = null;
    if (venueId) {
      const vRes = await updateClient.query(`SELECT name FROM venues WHERE id = $1;`, [venueId]);
      if (vRes.rows.length > 0) venueName = vRes.rows[0].name;
    }

    const classificationResult = classifyBarPost(rawPostForR2, venueName || '');

    const dedupeKey = 'instagram_' + shortcode;
    const title = (classificationResult.candidateTitle || `Publicación de @${item.username || 'instagram'}`).slice(0, 255);
    const category = classificationResult.candidateCategory || classificationResult.provisionalCategory || classificationResult.category || null;
    const classification = classificationResult.classification || 'REQUIERE_REVISION';
    const proposedDate = classificationResult.detectedDate || null;
    const proposedTime = classificationResult.detectedTime || null;

    // 6. Inserción en curation_proposals como propuesta PENDIENTE
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
        price_status,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, NULL, $6, $7, 'instagram_intropix',
        $8, $9, $10, $11, $12, $13, $14, $15,
        'BAJA', $16, $17, 'pending', true, 'NOT_INFORMED',
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const insertRes = await updateClient.query(insertSql, [
      title,
      proposedDate,
      proposedTime,
      venueId,
      category,
      item.caption || '',
      canonicalUrl,
      item.username || null,
      shortcode,
      r2Image.r2Key,
      r2Image.finalUrl,
      r2Image.width || 1080,
      r2Image.height || 1080,
      r2Image.contentType || 'image/jpeg',
      r2Image.sizeBytes || 0,
      dedupeKey,
      classification,
    ]);

    const createdProposal = insertRes.rows[0];

    // Actualizar lock como succeeded
    executionDetails.status = 'succeeded';
    executionDetails.completedAt = completedAt.toISOString();
    executionDetails.proposalId = createdProposal.id;

    await updateClient.query(
      `UPDATE instagram_ingestion_locks
       SET released_at = NOW(),
           execution_details = $1
       WHERE lock_key = $2;`,
      [JSON.stringify(executionDetails), lockKey]
    );

    await updateClient.query('COMMIT');

    console.log(
      JSON.stringify({
        timestamp: completedAt.toISOString(),
        level: 'info',
        service: 'bar_instagram_import_fallback',
        action: 'paid_fallback_succeeded',
        operationId,
        proposalId: createdProposal.id,
        shortcode,
        venueId,
        reportedCostUsd: scrapeResult.reportedCostUsd,
        user: userEmail,
      })
    );

    return {
      success: true,
      status: 201,
      code: 'proposal_created',
      proposal: createdProposal,
      operation: executionDetails,
      canonicalUrl,
      shortcode,
      venueId,
    };
  } catch (dbErr: any) {
    await updateClient.query('ROLLBACK').catch(() => {});
    throw dbErr;
  } finally {
    updateClient.release();
  }
}

/**
 * Consulta el estado de una operación de importación de pago.
 */
export async function getPaidImportStatus(operationId: string): Promise<any> {
  const res = await query(
    `SELECT lock_key, locked_by, locked_at, expires_at, released_at, execution_details
     FROM instagram_ingestion_locks
     WHERE execution_details->>'operationId' = $1;`,
    [operationId]
  );

  if (res.rows.length === 0) {
    return null;
  }

  return res.rows[0].execution_details;
}
