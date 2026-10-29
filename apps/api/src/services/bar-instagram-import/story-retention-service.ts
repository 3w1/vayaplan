import { query } from '@vayaplan/db';
import { deleteR2Object } from '../r2-client';

/**
 * Parámetros temporales de la política de retención para historias de Instagram.
 * Concilian la efimeridad de origen con el ciclo de vida editorial de VayaPlan.
 */
export const STORY_PENDING_RETENTION_DAYS = 7;
export const STORY_REJECTED_RETENTION_DAYS = 7;
export const STORY_EVENT_MEDIA_GRACE_DAYS = 2; // 48h tras la celebración del evento
export const STORY_AUDIT_LOGS_RETENTION_DAYS = 365; // 1 año para auditoría contable de costes

export type StoryRetentionActionType =
  | 'keep_active'
  | 'already_substituted'
  | 'purge_proposal_r2_image'
  | 'archive_proposal_metadata'
  | 'detach_event_story_image';

export interface StoryRetentionItemEvaluation {
  proposalId: number;
  shortcode: string;
  sourceUrl: string;
  reviewStatus: string;
  acquiredAt: string;
  expiresAt: string;
  isExpired: boolean;
  eventId: number | null;
  eventDate: string | null;
  r2Key: string | null;
  imageUrl: string | null;
  isImageSubstituted: boolean;
  recommendedAction: StoryRetentionActionType;
  reason: string;
  crossReferenceCount: number;
}

export interface StoryRetentionReport {
  evaluatedAt: string;
  dryRun: boolean;
  summary: {
    totalEvaluated: number;
    activeCount: number;
    expiredPendingCount: number;
    expiredRejectedCount: number;
    expiredEventMediaCount: number;
    substitutedMediaCount: number;
    actionsRecommended: number;
  };
  items: StoryRetentionItemEvaluation[];
}

export interface StoryRetentionExecutionResult {
  executedAt: string;
  dryRun: boolean;
  purgedR2ObjectsCount: number;
  detachedEventImagesCount: number;
  archivedProposalsCount: number;
  errors: Array<{ targetId: number; error: string }>;
  auditLog: Array<{
    targetType: 'proposal' | 'event';
    targetId: number;
    action: string;
    r2KeyHash?: string;
    timestamp: string;
  }>;
}

/**
 * Evalúa en modo SOLO LECTURA (dry-run) el inventario de historias de Instagram
 * y determina qué elementos han alcanzado su vencimiento según las obligaciones aplicables.
 */
export async function evaluateStoryRetentionDryRun(options: {
  now?: Date;
  targetProposalId?: number;
} = {}): Promise<StoryRetentionReport> {
  const now = options.now || new Date();
  const nowMs = now.getTime();

  let sql = `
    SELECT 
      cp.id,
      cp.title,
      cp.source_url,
      cp.instagram_post_shortcode,
      cp.r2_key,
      cp.image_url,
      cp.review_status,
      cp.created_event_id,
      cp.created_at,
      cp.updated_at,
      cp.reviewed_at,
      e.id AS event_id,
      e.editorial_date AS event_editorial_date,
      e.image_url AS event_image_url
    FROM curation_proposals cp
    LEFT JOIN events e ON cp.created_event_id = e.id
    WHERE (cp.dedupe_key LIKE 'instagram_story_%' 
       OR cp.source_url LIKE '%/stories/%')
  `;

  const queryParams: any[] = [];
  if (options.targetProposalId) {
    queryParams.push(options.targetProposalId);
    sql += ` AND cp.id = $1`;
  }

  sql += ` ORDER BY cp.id ASC;`;

  const res = await query(sql, queryParams);
  const items: StoryRetentionItemEvaluation[] = [];

  let activeCount = 0;
  let expiredPendingCount = 0;
  let expiredRejectedCount = 0;
  let expiredEventMediaCount = 0;
  let substitutedMediaCount = 0;
  let actionsRecommended = 0;

  for (const row of res.rows) {
    const proposalId = row.id;
    const shortcode = row.instagram_post_shortcode || 'unknown';
    const sourceUrl = row.source_url;
    const reviewStatus = row.review_status;
    const acquiredAtDate = new Date(row.created_at);
    const acquiredAt = acquiredAtDate.toISOString();
    const r2Key = row.r2_key || null;
    const imageUrl = row.image_url || null;
    const eventId = row.event_id ? parseInt(String(row.event_id), 10) : null;
    const eventDate = row.event_editorial_date ? String(row.event_editorial_date).slice(0, 10) : null;
    const eventImageUrl = row.event_image_url || null;

    let expiresAtDate: Date;
    let isImageSubstituted = false;
    let recommendedAction: StoryRetentionActionType = 'keep_active';
    let reason = '';

    // Comprobar referencias cruzadas al mismo r2_key
    let crossReferenceCount = 0;
    if (r2Key) {
      const refCheck = await query(
        `SELECT COUNT(*)::int AS count 
         FROM curation_proposals 
         WHERE r2_key = $1 AND id <> $2;`,
        [r2Key, proposalId]
      );
      crossReferenceCount = refCheck.rows[0]?.count || 0;
    }

    if (eventId && eventDate) {
      // Caso 1: Propuesta aprobada y convertida en evento
      // La imagen efímera de la historia vence a los 2 días tras la fecha del evento
      const eventDateTime = new Date(`${eventDate}T23:59:59.999Z`);
      expiresAtDate = new Date(eventDateTime.getTime() + STORY_EVENT_MEDIA_GRACE_DAYS * 24 * 60 * 60 * 1000);

      // Comprobar si el evento ya sustituyó la imagen por material oficial del local
      if (eventImageUrl && imageUrl && eventImageUrl !== imageUrl) {
        isImageSubstituted = true;
        substitutedMediaCount++;
        recommendedAction = 'already_substituted';
        reason = `El evento (#${eventId}) ya cuenta con imagen oficial independiente aportada por el local. El asset efímero original puede purgarse sin impacto.`;
      } else if (nowMs > expiresAtDate.getTime()) {
        expiredEventMediaCount++;
        recommendedAction = 'detach_event_story_image';
        reason = `El evento (#${eventId}) se celebró el ${eventDate} y han transcurrido más de ${STORY_EVENT_MEDIA_GRACE_DAYS} días. Procede desacoplar la imagen efímera y purgar el archivo R2, conservando el evento intacto.`;
      } else {
        activeCount++;
        recommendedAction = 'keep_active';
        reason = `Evento futuro o en curso (#${eventId}, fecha: ${eventDate}). El cartel efímero permanece activo hasta ${expiresAtDate.toISOString().slice(0, 10)}.`;
      }
    } else if (reviewStatus === 'rejected') {
      // Caso 2: Propuesta rechazada
      const rejectedRefDate = row.reviewed_at ? new Date(row.reviewed_at) : acquiredAtDate;
      expiresAtDate = new Date(rejectedRefDate.getTime() + STORY_REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      if (nowMs > expiresAtDate.getTime()) {
        expiredRejectedCount++;
        recommendedAction = 'purge_proposal_r2_image';
        reason = `Propuesta rechazada hace más de ${STORY_REJECTED_RETENTION_DAYS} días. Procede purgar el cartel R2 y anonimizar metadatos, conservando dedupe_key.`;
      } else {
        activeCount++;
        recommendedAction = 'keep_active';
        reason = `Propuesta rechazada en periodo de gracia de revisión hasta ${expiresAtDate.toISOString().slice(0, 10)}.`;
      }
    } else {
      // Caso 3: Propuesta pendiente sin revisar (o archivada)
      expiresAtDate = new Date(acquiredAtDate.getTime() + STORY_PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      if (nowMs > expiresAtDate.getTime()) {
        expiredPendingCount++;
        recommendedAction = 'archive_proposal_metadata';
        reason = `Propuesta pendiente sin atender durante más de ${STORY_PENDING_RETENTION_DAYS} días. Procede archivar y purgar imagen efímera.`;
      } else {
        activeCount++;
        recommendedAction = 'keep_active';
        reason = `Propuesta pendiente en plazo de curación editorial hasta ${expiresAtDate.toISOString().slice(0, 10)}.`;
      }
    }

    const isExpired = nowMs > expiresAtDate.getTime();
    if (recommendedAction !== 'keep_active') {
      actionsRecommended++;
    }

    items.push({
      proposalId,
      shortcode,
      sourceUrl,
      reviewStatus,
      acquiredAt,
      expiresAt: expiresAtDate.toISOString(),
      isExpired,
      eventId,
      eventDate,
      r2Key,
      imageUrl,
      isImageSubstituted,
      recommendedAction,
      reason,
      crossReferenceCount,
    });
  }

  return {
    evaluatedAt: now.toISOString(),
    dryRun: true,
    summary: {
      totalEvaluated: items.length,
      activeCount,
      expiredPendingCount,
      expiredRejectedCount,
      expiredEventMediaCount,
      substitutedMediaCount,
      actionsRecommended,
    },
    items,
  };
}

/**
 * Ejecución de la política de retención.
 * Por defecto opera estrictamente en MODO DRY-RUN sin alterar la base de datos ni R2.
 */
export async function executeStoryRetentionPolicy(options: {
  dryRun?: boolean;
  now?: Date;
  targetProposalId?: number;
} = {}): Promise<StoryRetentionExecutionResult> {
  const isDryRun = options.dryRun !== false; // Default true
  const evaluation = await evaluateStoryRetentionDryRun({
    now: options.now,
    targetProposalId: options.targetProposalId,
  });

  const auditLog: Array<{
    targetType: 'proposal' | 'event';
    targetId: number;
    action: string;
    r2KeyHash?: string;
    timestamp: string;
  }> = [];
  const errors: Array<{ targetId: number; error: string }> = [];

  let purgedR2ObjectsCount = 0;
  let detachedEventImagesCount = 0;
  let archivedProposalsCount = 0;

  if (isDryRun) {
    // Modo Dry-run: solo proyecta qué se ejecutaría
    for (const item of evaluation.items) {
      if (item.recommendedAction === 'keep_active') continue;

      auditLog.push({
        targetType: item.eventId ? 'event' : 'proposal',
        targetId: item.eventId || item.proposalId,
        action: `[DRY_RUN] ${item.recommendedAction}`,
        r2KeyHash: item.r2Key ? `hash_${item.r2Key.slice(-16)}` : undefined,
        timestamp: evaluation.evaluatedAt,
      });

      if (item.recommendedAction === 'detach_event_story_image') {
        detachedEventImagesCount++;
        purgedR2ObjectsCount++;
      } else if (item.recommendedAction === 'purge_proposal_r2_image' || item.recommendedAction === 'already_substituted') {
        purgedR2ObjectsCount++;
      } else if (item.recommendedAction === 'archive_proposal_metadata') {
        archivedProposalsCount++;
        purgedR2ObjectsCount++;
      }
    }

    return {
      executedAt: evaluation.evaluatedAt,
      dryRun: true,
      purgedR2ObjectsCount,
      detachedEventImagesCount,
      archivedProposalsCount,
      errors,
      auditLog,
    };
  }

  // Ejecución real autorizada (cuando dryRun === false)
  const nowIso = (options.now || new Date()).toISOString();

  for (const item of evaluation.items) {
    if (item.recommendedAction === 'keep_active') continue;

    try {
      // 1. Desacoplamiento seguro de imagen en el evento (NUNCA elimina el evento)
      if (item.recommendedAction === 'detach_event_story_image' && item.eventId) {
        await query(
          `UPDATE events 
           SET image_url = NULL, 
               image_thumb_url = NULL, 
               image_original_url = NULL,
               updated_at = NOW() 
           WHERE id = $1;`,
          [item.eventId]
        );
        detachedEventImagesCount++;
        auditLog.push({
          targetType: 'event',
          targetId: item.eventId,
          action: 'detach_story_media_event_preserved',
          timestamp: nowIso,
        });
      }

      // 2. Eliminación física idempotente en Cloudflare R2
      if (item.r2Key && item.crossReferenceCount === 0) {
        try {
          await deleteR2Object(item.r2Key);
          purgedR2ObjectsCount++;
          auditLog.push({
            targetType: 'proposal',
            targetId: item.proposalId,
            action: 'r2_object_deleted',
            r2KeyHash: `hash_${item.r2Key.slice(-16)}`,
            timestamp: nowIso,
          });
        } catch (r2Err: any) {
          // Idempotencia: si el objeto ya no existía en R2 (404), no consideramos error fatal
          if (!r2Err.message?.includes('NotFound') && !r2Err.message?.includes('NoSuchKey')) {
            throw r2Err;
          }
        }
      }

      // 3. Anonimización y actualización de propuesta en PostgreSQL
      await query(
        `UPDATE curation_proposals 
         SET r2_key = NULL,
             image_url = 'placeholder://category/' || COALESCE(category, 'gastronomia'),
             caption = '[PURGED_RETENTION_POLICY]',
             review_status = CASE 
               WHEN review_status = 'pending' THEN 'archived' 
               ELSE review_status 
             END,
             updated_at = NOW()
         WHERE id = $1;`,
        [item.proposalId]
      );
      archivedProposalsCount++;

      auditLog.push({
        targetType: 'proposal',
        targetId: item.proposalId,
        action: 'proposal_metadata_archived',
        timestamp: nowIso,
      });
    } catch (itemErr: any) {
      errors.push({
        targetId: item.proposalId,
        error: itemErr.message || 'Error desconocido en ciclo de vida',
      });
    }
  }

  return {
    executedAt: nowIso,
    dryRun: false,
    purgedR2ObjectsCount,
    detachedEventImagesCount,
    archivedProposalsCount,
    errors,
    auditLog,
  };
}
