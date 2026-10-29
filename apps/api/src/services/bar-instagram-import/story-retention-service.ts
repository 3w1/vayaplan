import { query } from '@vayaplan/db';
import { deleteR2Object } from '../r2-client';

/**
 * Parámetros temporales de la política de retención para historias de Instagram.
 * Concilian la efimeridad de origen con el ciclo de vida editorial de VayaPlan.
 */
export const STORY_PENDING_RETENTION_DAYS = 7;
export const STORY_REJECTED_RETENTION_DAYS = 7;
export const STORY_EVENT_MEDIA_GRACE_DAYS = 2; // 48h tras la celebración del evento
export const STORY_MAX_ACQUISITION_RETENTION_DAYS = 30; // Límite general máximo desde adquisición
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
  substitutedImageUrl?: string | null;
  substitutedImageProvenance?: string;
  recommendedAction: StoryRetentionActionType;
  reason: string;
  crossReferenceCount: number;
  sharedReferenceDetails?: Array<{
    proposalId: number;
    title: string;
    reviewStatus: string;
  }>;
  mediaPhysicalPurgeBlockedBySharedReferences?: boolean;
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
    sharedReferenceConflictCount: number;
  };
  items: StoryRetentionItemEvaluation[];
}

export interface StoryRetentionExecutionResult {
  executedAt: string;
  dryRun: boolean;
  purgedR2ObjectsCount: number;
  deferredR2PurgesCount: number;
  detachedEventImagesCount: number;
  archivedProposalsCount: number;
  errors: Array<{ targetId: number; error: string }>;
  auditLog: Array<{
    targetType: 'proposal' | 'event';
    targetId: number;
    action: string;
    r2KeyHash?: string;
    timestamp: string;
    operatorEmail?: string;
    details?: string;
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
  let sharedReferenceConflictCount = 0;

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
    let substitutedImageUrl: string | null = null;
    let substitutedImageProvenance: string | undefined = undefined;
    let recommendedAction: StoryRetentionActionType = 'keep_active';
    let reason = '';
    let mediaPhysicalPurgeBlockedBySharedReferences = false;

    // Límite general máximo desde adquisición (30 días)
    const maxAcquisitionCapDate = new Date(
      acquiredAtDate.getTime() + STORY_MAX_ACQUISITION_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    // Comprobar referencias cruzadas al mismo r2_key
    let crossReferenceCount = 0;
    let sharedReferenceDetails: Array<{ proposalId: number; title: string; reviewStatus: string }> = [];
    if (r2Key) {
      const refCheck = await query(
        `SELECT id, title, review_status
         FROM curation_proposals 
         WHERE r2_key = $1 AND id <> $2;`,
        [r2Key, proposalId]
      );
      crossReferenceCount = refCheck.rows.length;
      sharedReferenceDetails = refCheck.rows.map((r: any) => ({
        proposalId: r.id,
        title: r.title,
        reviewStatus: r.review_status,
      }));
    }

    if (eventId && eventDate) {
      // Caso 1: Propuesta aprobada y convertida en evento
      // Vencimiento en la fecha más temprana entre:
      // a) finalización del evento + 48h
      // b) adquisición + 30 días
      const eventDateTime = new Date(`${eventDate}T23:59:59.999Z`);
      const eventGraceDate = new Date(
        eventDateTime.getTime() + STORY_EVENT_MEDIA_GRACE_DAYS * 24 * 60 * 60 * 1000
      );
      expiresAtDate = new Date(Math.min(eventGraceDate.getTime(), maxAcquisitionCapDate.getTime()));

      // Comprobar si el evento ya sustituyó la imagen por material oficial del local
      if (eventImageUrl && imageUrl && eventImageUrl !== imageUrl) {
        isImageSubstituted = true;
        substitutedImageUrl = eventImageUrl;
        substitutedImageProvenance =
          eventImageUrl.startsWith('https://r2.vayaplan.com/official_') || eventImageUrl.includes('/official_')
            ? 'venue_official'
            : 'independent_source';
        substitutedMediaCount++;
        recommendedAction = 'already_substituted';

        let purgeNotice = '';
        if (crossReferenceCount > 0) {
          sharedReferenceConflictCount++;
          mediaPhysicalPurgeBlockedBySharedReferences = true;
          purgeNotice = `El asset efímero original (${r2Key}) NO se puede purgar físicamente aún de R2 porque tiene ${crossReferenceCount} referencias compartidas (#${sharedReferenceDetails.map((s) => s.proposalId).join(', #')}). El nuevo archivo del evento (${eventImageUrl}) permanece intacto.`;
        } else {
          purgeNotice = `El asset efímero original (${r2Key}) puede purgarse de R2 sin afectar a la nueva imagen del evento (${eventImageUrl}), cuya procedencia identificada es '${substitutedImageProvenance}'.`;
        }
        reason = `El evento (#${eventId}) ya cuenta con una imagen independiente aportada para el local. ${purgeNotice}`;
      } else if (nowMs > expiresAtDate.getTime()) {
        expiredEventMediaCount++;
        recommendedAction = 'detach_event_story_image';
        let detailNotice = `El evento (#${eventId}) se celebró el ${eventDate} y ha alcanzado su límite de conservación (${expiresAtDate.toISOString().slice(0, 10)}). Procede desacoplar la imagen efímera del evento, conservando los datos factuales intactos.`;
        if (crossReferenceCount > 0) {
          sharedReferenceConflictCount++;
          mediaPhysicalPurgeBlockedBySharedReferences = true;
          detailNotice += ` ATENCIÓN: El archivo físico en R2 (${r2Key}) NO se purgará de inmediato porque está compartido por otras ${crossReferenceCount} propuestas activas (#${sharedReferenceDetails.map((s) => s.proposalId).join(', #')}).`;
        } else {
          detailNotice += ` Procede la purga física del archivo efímero R2.`;
        }
        reason = detailNotice;
      } else {
        activeCount++;
        recommendedAction = 'keep_active';
        reason = `Evento futuro o en curso (#${eventId}, fecha: ${eventDate}). El cartel efímero permanece activo hasta ${expiresAtDate.toISOString().slice(0, 10)} (mínimo entre celebración + 48h y adquisición + 30 días).`;
      }
    } else if (reviewStatus === 'rejected') {
      // Caso 2: Propuesta rechazada
      // 7 días desde rechazo, sin superar el límite general desde adquisición (30 días)
      const rejectedRefDate = row.reviewed_at ? new Date(row.reviewed_at) : acquiredAtDate;
      const rejectedGraceDate = new Date(
        rejectedRefDate.getTime() + STORY_REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000
      );
      expiresAtDate = new Date(Math.min(rejectedGraceDate.getTime(), maxAcquisitionCapDate.getTime()));

      if (nowMs > expiresAtDate.getTime()) {
        expiredRejectedCount++;
        recommendedAction = 'purge_proposal_r2_image';
        let detailNotice = `Propuesta rechazada vencida (límite: ${expiresAtDate.toISOString().slice(0, 10)}). Procede purgar el cartel R2 y el caption efímero, conservando dedupe_key.`;
        if (crossReferenceCount > 0) {
          sharedReferenceConflictCount++;
          mediaPhysicalPurgeBlockedBySharedReferences = true;
          detailNotice += ` ATENCIÓN: El archivo en R2 se preserva temporalmente por ${crossReferenceCount} referencias compartidas (#${sharedReferenceDetails.map((s) => s.proposalId).join(', #')}).`;
        }
        reason = detailNotice;
      } else {
        activeCount++;
        recommendedAction = 'keep_active';
        reason = `Propuesta rechazada en periodo de gracia de revisión hasta ${expiresAtDate.toISOString().slice(0, 10)}.`;
      }
    } else {
      // Caso 3: Propuesta pendiente sin revisar (o archivada)
      // Vencimiento a los 7 días desde adquisición
      expiresAtDate = new Date(
        acquiredAtDate.getTime() + STORY_PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1000
      );

      if (nowMs > expiresAtDate.getTime()) {
        expiredPendingCount++;
        recommendedAction = 'archive_proposal_metadata';
        let detailNotice = `Propuesta pendiente sin atender durante más de ${STORY_PENDING_RETENTION_DAYS} días desde adquisición. Procede archivar y purgar contenido efímero.`;
        if (crossReferenceCount > 0) {
          sharedReferenceConflictCount++;
          mediaPhysicalPurgeBlockedBySharedReferences = true;
          detailNotice += ` ATENCIÓN: El archivo físico en R2 tiene ${crossReferenceCount} referencias compartidas.`;
        }
        reason = detailNotice;
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
      substitutedImageUrl,
      substitutedImageProvenance,
      recommendedAction,
      reason,
      crossReferenceCount,
      sharedReferenceDetails: crossReferenceCount > 0 ? sharedReferenceDetails : undefined,
      mediaPhysicalPurgeBlockedBySharedReferences: mediaPhysicalPurgeBlockedBySharedReferences || undefined,
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
      sharedReferenceConflictCount,
    },
    items,
  };
}

/**
 * Ejecución de la política de retención.
 * Por defecto opera estrictamente en MODO DRY-RUN sin alterar la base de datos ni R2.
 * Requiere options.dryRun === false para ejecutar purgas y desacoplamientos reales.
 */
export async function executeStoryRetentionPolicy(options: {
  dryRun?: boolean;
  now?: Date;
  targetProposalId?: number;
  operatorEmail?: string;
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
    operatorEmail?: string;
    details?: string;
  }> = [];
  const errors: Array<{ targetId: number; error: string }> = [];

  let purgedR2ObjectsCount = 0;
  let deferredR2PurgesCount = 0;
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
        operatorEmail: options.operatorEmail || 'system_dry_run',
        details: item.reason,
      });

      if (item.recommendedAction === 'detach_event_story_image') {
        detachedEventImagesCount++;
        if (item.crossReferenceCount === 0) {
          purgedR2ObjectsCount++;
        } else {
          deferredR2PurgesCount++;
        }
      } else if (
        item.recommendedAction === 'purge_proposal_r2_image' ||
        item.recommendedAction === 'already_substituted'
      ) {
        if (item.crossReferenceCount === 0) {
          purgedR2ObjectsCount++;
        } else {
          deferredR2PurgesCount++;
        }
      } else if (item.recommendedAction === 'archive_proposal_metadata') {
        archivedProposalsCount++;
        if (item.crossReferenceCount === 0) {
          purgedR2ObjectsCount++;
        } else {
          deferredR2PurgesCount++;
        }
      }
    }

    return {
      executedAt: evaluation.evaluatedAt,
      dryRun: true,
      purgedR2ObjectsCount,
      deferredR2PurgesCount,
      detachedEventImagesCount,
      archivedProposalsCount,
      errors,
      auditLog,
    };
  }

  // Ejecución real autorizada (cuando dryRun === false)
  const nowIso = (options.now || new Date()).toISOString();
  const operator = options.operatorEmail || 'admin_manual_execution';

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
          operatorEmail: operator,
          details: `Imagen efímera de historia desacoplada del evento #${item.eventId}. Registro factual del evento intacto.`,
        });
      }

      // 2. Eliminación física en Cloudflare R2 solo si NO tiene referencias compartidas
      if (item.r2Key) {
        if (item.crossReferenceCount === 0) {
          try {
            await deleteR2Object(item.r2Key);
            purgedR2ObjectsCount++;
            auditLog.push({
              targetType: 'proposal',
              targetId: item.proposalId,
              action: 'r2_object_deleted',
              r2KeyHash: `hash_${item.r2Key.slice(-16)}`,
              timestamp: nowIso,
              operatorEmail: operator,
              details: `Objeto efímero en R2 eliminado físicamente sin referencias cruzadas residuales.`,
            });
          } catch (r2Err: any) {
            // Idempotencia: si ya no existía en R2 (404), no consideramos error fatal
            if (!r2Err.message?.includes('NotFound') && !r2Err.message?.includes('NoSuchKey')) {
              throw r2Err;
            }
          }
        } else {
          deferredR2PurgesCount++;
          auditLog.push({
            targetType: 'proposal',
            targetId: item.proposalId,
            action: 'r2_physical_purge_deferred_due_to_shared_references',
            r2KeyHash: `hash_${item.r2Key.slice(-16)}`,
            timestamp: nowIso,
            operatorEmail: operator,
            details: `Purga física en R2 aplazada porque el asset está compartido con ${item.crossReferenceCount} propuestas activas.`,
          });
        }
      }

      // 3. Purga y anonimización de propuesta en PostgreSQL (eliminando el caption completo)
      await query(
        `UPDATE curation_proposals 
         SET r2_key = NULL,
             image_url = 'placeholder://category/' || COALESCE(category, 'gastronomia'),
             caption = NULL,
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
        action: 'proposal_metadata_and_caption_purged',
        timestamp: nowIso,
        operatorEmail: operator,
        details: `Caption completo eliminado y propuesta marcada como purgada conservando dedupe_key para evitar reimportaciones.`,
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
    deferredR2PurgesCount,
    detachedEventImagesCount,
    archivedProposalsCount,
    errors,
    auditLog,
  };
}
