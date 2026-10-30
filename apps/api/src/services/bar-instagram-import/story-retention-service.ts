import crypto from 'node:crypto';
import { query } from '@vayaplan/db';
import { deleteR2Object } from '../r2-client';

/**
 * Parámetros temporales de la política de retención para historias de Instagram.
 * Concilian la efimeridad de origen con el ciclo de vida editorial de VayaPlan.
 */
export const STORY_PENDING_RETENTION_DAYS = 7;
export const STORY_REJECTED_RETENTION_DAYS = 7;
export const STORY_EVENT_MEDIA_GRACE_DAYS = 2; // 48h tras el término real del evento
export const STORY_MAX_ACQUISITION_RETENTION_DAYS = 30; // Límite general máximo desde adquisición
export const STORY_AUDIT_LOGS_RETENTION_DAYS = 365; // 1 año para auditoría contable de costes

export type StoryRetentionActionType =
  | 'keep_active'
  | 'already_substituted'
  | 'purge_proposal_r2_image'
  | 'archive_proposal_metadata'
  | 'detach_event_story_image';

export interface StorySharedReferenceTarget {
  targetType: 'proposal' | 'event' | 'image_decision';
  targetId: number;
  targetTitle: string;
  field: string;
}

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
  eventEndDate: string | null;
  eventCalculatedEndUtc: string | null;
  cityTimezone: string;
  r2Key: string | null;
  imageUrl: string | null;
  isImageSubstituted: boolean;
  substitutedImageUrl?: string | null;
  substitutedImageProvenance?: string;
  recommendedAction: StoryRetentionActionType;
  reason: string;
  crossReferenceCount: number;
  sharedReferenceDetails?: StorySharedReferenceTarget[];
  mediaPhysicalPurgeBlockedBySharedReferences?: boolean;
}

export interface StoryRetentionReport {
  evaluatedAt: string;
  previewToken: string;
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
  success: boolean;
  code?: string;
  error?: string;
  executedAt: string;
  previewTokenUsed?: string;
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
 * Comprueba si existen columnas añadidas por la migración 021 para garantizar
 * compatibilidad tanto antes como después de su ejecución en base de datos.
 */
async function checkSchemaProvenanceSupport(): Promise<{
  hasEventImageProvenance: boolean;
  hasProposalMediaSourceProvenance: boolean;
  hasMediaPurgedAt: boolean;
  hasStoryMediaDetachedAt: boolean;
}> {
  try {
    const res = await query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('curation_proposals', 'events') 
        AND column_name IN (
          'image_provenance', 
          'media_source_provenance', 
          'media_purged_at', 
          'story_media_detached_at'
        );
    `);
    const found = new Set(res.rows.map((r: any) => `${r.table_name}.${r.column_name}`));
    return {
      hasEventImageProvenance: found.has('events.image_provenance'),
      hasProposalMediaSourceProvenance: found.has('curation_proposals.media_source_provenance'),
      hasMediaPurgedAt: found.has('curation_proposals.media_purged_at'),
      hasStoryMediaDetachedAt: found.has('events.story_media_detached_at'),
    };
  } catch {
    return {
      hasEventImageProvenance: false,
      hasProposalMediaSourceProvenance: false,
      hasMediaPurgedAt: false,
      hasStoryMediaDetachedAt: false,
    };
  }
}

/**
 * Consulta en tiempo real si un activo gráfico efímero de historia (por r2_key o image_url)
 * está siendo utilizado por otras propuestas, eventos en catálogo o decisiones de imagen.
 * Se ejecuta tanto en la evaluación previa como inmediatamente antes (JIT) de cualquier purga física en R2.
 */
export async function getLiveStoryAssetReferences(
  r2Key: string | null,
  imageUrl: string | null,
  proposalId: number,
  eventId: number | null
): Promise<StorySharedReferenceTarget[]> {
  const sharedReferenceDetails: StorySharedReferenceTarget[] = [];
  if (!r2Key && !imageUrl) {
    return sharedReferenceDetails;
  }

  // 1. Otras propuestas que usen el mismo r2_key o image_url
  const propRefs = await query(
    `SELECT id, title, review_status 
     FROM curation_proposals 
     WHERE (r2_key = $1 OR (image_url = $2 AND $2 IS NOT NULL)) 
       AND id <> $3;`,
    [r2Key, imageUrl, proposalId]
  );
  for (const p of propRefs.rows) {
    sharedReferenceDetails.push({
      targetType: 'proposal',
      targetId: p.id,
      targetTitle: p.title,
      field: 'curation_proposals.r2_key/image_url',
    });
  }

  // 2. Otros eventos que usen el mismo image_url
  const evRefs = await query(
    `SELECT id, title, status 
     FROM events 
     WHERE (image_url = $1 OR image_thumb_url = $1 OR image_original_url = $1)
       AND id <> COALESCE($2, -1);`,
    [imageUrl, eventId]
  );
  for (const ev of evRefs.rows) {
    sharedReferenceDetails.push({
      targetType: 'event',
      targetId: ev.id,
      targetTitle: ev.title,
      field: 'events.image_url',
    });
  }

  // 3. Decisiones de imágenes adoptadas o archivadas
  try {
    const decRefs = await query(
      `SELECT id, event_id, action, notes 
       FROM event_image_decisions 
       WHERE (candidate_key = $1 OR candidate_url = $2)
         AND action IN ('adopt', 'keep_current');`,
      [r2Key, imageUrl]
    );
    for (const dec of decRefs.rows) {
      sharedReferenceDetails.push({
        targetType: 'image_decision',
        targetId: dec.id,
        targetTitle: `Decisión para evento #${dec.event_id}`,
        field: 'event_image_decisions.candidate_key',
      });
    }
  } catch {
    // Tabla opcional en entornos reducidos
  }

  return sharedReferenceDetails;
}

/**
 * Genera un token criptográfico determinista vinculado al lote exacto evaluado.
 * Actúa estrictamente como huella de control optimista (optimistic lock), NO como credencial de autorización.
 * Si cualquier registro, fecha, acción o referencia cambia entre la vista previa
 * y la ejecución, el token cambiará y el control optimista abortará la purga.
 */
function computePreviewToken(items: StoryRetentionItemEvaluation[]): string {
  const tokenItems = items
    .filter((i) => i.recommendedAction !== 'keep_active')
    .map(
      (i) =>
        `${i.proposalId}:${i.reviewStatus}:${i.expiresAt}:${i.r2Key || ''}:${i.recommendedAction}:${
          i.crossReferenceCount
        }:${i.eventId || ''}:${i.isImageSubstituted ? 'sub' : 'orig'}`
    )
    .sort()
    .join('||');

  return 'prv_' + crypto.createHash('sha256').update(tokenItems || 'empty_batch').digest('hex').slice(0, 32);
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
  const schemaSupport = await checkSchemaProvenanceSupport();

  const eventProvCol = schemaSupport.hasEventImageProvenance
    ? 'e.image_provenance AS event_image_provenance'
    : 'NULL::varchar AS event_image_provenance';

  const propProvCol = schemaSupport.hasProposalMediaSourceProvenance
    ? 'cp.media_source_provenance'
    : 'NULL::varchar AS media_source_provenance';

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
      ${propProvCol},
      e.id AS event_id,
      e.title AS event_title,
      e.editorial_date AS event_editorial_date,
      e.end_date AS event_end_date,
      e.start_time AS event_start_time,
      e.end_time AS event_end_time,
      e.time_status AS event_time_status,
      e.image_url AS event_image_url,
      ${eventProvCol},
      COALESCE(c.timezone, 'Europe/Madrid') AS city_timezone,
      CASE
        WHEN e.end_time IS NOT NULL THEN e.end_time
        WHEN e.end_date IS NOT NULL THEN (e.end_date || ' 23:59:59.999')::timestamp AT TIME ZONE COALESCE(c.timezone, 'Europe/Madrid')
        WHEN e.start_time IS NOT NULL AND e.start_time + INTERVAL '6 hours' > (e.editorial_date || ' 23:59:59.999')::timestamp AT TIME ZONE COALESCE(c.timezone, 'Europe/Madrid') 
          THEN e.start_time + INTERVAL '6 hours'
        WHEN e.editorial_date IS NOT NULL THEN (e.editorial_date || ' 23:59:59.999')::timestamp AT TIME ZONE COALESCE(c.timezone, 'Europe/Madrid')
        ELSE NULL
      END AS calculated_event_end_utc
    FROM curation_proposals cp
    LEFT JOIN events e ON cp.created_event_id = e.id
    LEFT JOIN cities c ON e.city_id = c.id
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
    const eventEndDate = row.event_end_date ? String(row.event_end_date).slice(0, 10) : null;
    const eventCalculatedEndUtc = row.calculated_event_end_utc ? new Date(row.calculated_event_end_utc).toISOString() : null;
    const cityTimezone = row.city_timezone || 'Europe/Madrid';
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

    // Comprobación exhaustiva de referencias cruzadas (propuestas, eventos y decisiones de imagen)
    const sharedReferenceDetails = await getLiveStoryAssetReferences(
      r2Key,
      imageUrl,
      proposalId,
      eventId
    );
    const crossReferenceCount = sharedReferenceDetails.length;

    if (eventId && row.calculated_event_end_utc) {
      // Caso 1: Propuesta aprobada y convertida en evento
      // Vencimiento calculado respecto al fin real del evento + 48h (topado a adquisición + 30d)
      const eventEndMs = new Date(row.calculated_event_end_utc).getTime();
      const eventGraceDate = new Date(eventEndMs + STORY_EVENT_MEDIA_GRACE_DAYS * 24 * 60 * 60 * 1000);
      expiresAtDate = new Date(Math.min(eventGraceDate.getTime(), maxAcquisitionCapDate.getTime()));

      // Comprobar si el evento ya sustituyó la imagen
      if (eventImageUrl && imageUrl && eventImageUrl !== imageUrl) {
        isImageSubstituted = true;
        substitutedImageUrl = eventImageUrl;
        // No deducir procedencia por la URL: usar procedencia explícita o 'unknown' si no hay evidencia
        substitutedImageProvenance = row.event_image_provenance || row.media_source_provenance || 'unknown';
        substitutedMediaCount++;
        recommendedAction = 'already_substituted';

        let purgeNotice = '';
        if (crossReferenceCount > 0) {
          sharedReferenceConflictCount++;
          mediaPhysicalPurgeBlockedBySharedReferences = true;
          purgeNotice = `El asset efímero original (${r2Key}) NO se puede purgar físicamente aún de R2 porque tiene ${crossReferenceCount} referencias compartidas (#${sharedReferenceDetails
            .map((s) => s.targetId)
            .join(', #')}). El nuevo archivo del evento (${eventImageUrl}) permanece intacto.`;
        } else {
          purgeNotice = `El asset efímero original (${r2Key}) puede purgarse de R2 sin afectar a la nueva imagen del evento (${eventImageUrl}), cuya procedencia explícitamente registrada es '${substitutedImageProvenance}'.`;
        }
        reason = `El evento (#${eventId}) cuenta con una imagen independiente. ${purgeNotice}`;
      } else if (nowMs > expiresAtDate.getTime()) {
        expiredEventMediaCount++;
        recommendedAction = 'detach_event_story_image';
        let detailNotice = `El evento (#${eventId}) finalizó (fin calculado: ${row.calculated_event_end_utc}) y ha alcanzado su límite de conservación (${expiresAtDate.toISOString().slice(0, 10)}). Procede desacoplar la imagen efímera del evento en base de datos.`;
        if (crossReferenceCount > 0) {
          sharedReferenceConflictCount++;
          mediaPhysicalPurgeBlockedBySharedReferences = true;
          detailNotice += ` ATENCIÓN: La purga física en R2 (${r2Key}) se bloquea temporalmente por ${crossReferenceCount} referencias compartidas activas (#${sharedReferenceDetails
            .map((s) => s.targetId)
            .join(', #')}).`;
        } else {
          detailNotice += ` Procede la purga física del archivo efímero en R2.`;
        }
        reason = detailNotice;
      } else {
        activeCount++;
        recommendedAction = 'keep_active';
        reason = `Evento futuro o en curso (#${eventId}, fin calculado: ${row.calculated_event_end_utc} en ${cityTimezone}). El cartel efímero permanece activo hasta ${expiresAtDate.toISOString().slice(0, 10)}.`;
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
          detailNotice += ` ATENCIÓN: El archivo en R2 se preserva temporalmente por ${crossReferenceCount} referencias compartidas (#${sharedReferenceDetails
            .map((s) => s.targetId)
            .join(', #')}).`;
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
      eventEndDate,
      eventCalculatedEndUtc,
      cityTimezone,
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

  const previewToken = computePreviewToken(items);

  return {
    evaluatedAt: now.toISOString(),
    previewToken,
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
 * Cuenta los elementos vencidos pendientes de purga o desacoplamiento.
 * Utilizado por el coordinador para bloquear nuevas importaciones si hay backlog acumulado.
 */
export async function countPendingExpiredStoryItems(options: { now?: Date } = {}): Promise<{
  totalExpired: number;
  expiredPending: number;
  expiredRejected: number;
  expiredEventMedia: number;
}> {
  const report = await evaluateStoryRetentionDryRun(options);
  const totalExpired =
    report.summary.expiredPendingCount +
    report.summary.expiredRejectedCount +
    report.summary.expiredEventMediaCount;

  return {
    totalExpired,
    expiredPending: report.summary.expiredPendingCount,
    expiredRejected: report.summary.expiredRejectedCount,
    expiredEventMedia: report.summary.expiredEventMediaCount,
  };
}

/**
 * Ejecución de la política de retención.
 * Por defecto opera estrictamente en MODO DRY-RUN sin alterar la base de datos ni R2.
 * Cuando dryRun === false, EXIGE confirmación explícita vinculada al previewToken revisado.
 */
export async function executeStoryRetentionPolicy(options: {
  dryRun?: boolean;
  now?: Date;
  targetProposalId?: number;
  operatorEmail?: string;
  previewToken?: string;
} = {}): Promise<StoryRetentionExecutionResult> {
  const isDryRun = options.dryRun !== false; // Default true
  const evaluation = await evaluateStoryRetentionDryRun({
    now: options.now,
    targetProposalId: options.targetProposalId,
  });

  const schemaSupport = await checkSchemaProvenanceSupport();

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
      success: true,
      executedAt: evaluation.evaluatedAt,
      previewTokenUsed: evaluation.previewToken,
      dryRun: true,
      purgedR2ObjectsCount,
      deferredR2PurgesCount,
      detachedEventImagesCount,
      archivedProposalsCount,
      errors,
      auditLog,
    };
  }

  // Validación de Control Optimista vinculada a previewToken (Requisito 4)
  if (!options.previewToken) {
    return {
      success: false,
      code: 'preview_token_required',
      error: 'Se requiere el previewToken obtenido en la vista previa (/preview) para confirmar la ejecución vinculada al lote revisado.',
      executedAt: evaluation.evaluatedAt,
      dryRun: false,
      purgedR2ObjectsCount: 0,
      deferredR2PurgesCount: 0,
      detachedEventImagesCount: 0,
      archivedProposalsCount: 0,
      errors: [],
      auditLog: [],
    };
  }

  if (options.previewToken !== evaluation.previewToken) {
    return {
      success: false,
      code: 'preview_state_conflict',
      error: 'El estado del catálogo, vencimientos o referencias cambió desde que se generó la vista previa (el previewToken no coincide). Genera una nueva vista previa antes de ejecutar.',
      executedAt: evaluation.evaluatedAt,
      dryRun: false,
      purgedR2ObjectsCount: 0,
      deferredR2PurgesCount: 0,
      detachedEventImagesCount: 0,
      archivedProposalsCount: 0,
      errors: [],
      auditLog: [],
    };
  }

  // Ejecución real autorizada (cuando dryRun === false y previewToken coincide)
  const nowIso = (options.now || new Date()).toISOString();
  const operator = options.operatorEmail || 'admin_manual_execution';

  for (const item of evaluation.items) {
    if (item.recommendedAction === 'keep_active') continue;

    try {
      // 1. Desacoplamiento seguro de imagen en el evento (NUNCA elimina el evento)
      if (item.recommendedAction === 'detach_event_story_image' && item.eventId) {
        let updateEvSql = `
          UPDATE events 
          SET image_url = NULL, 
              image_thumb_url = NULL, 
              image_original_url = NULL,
              updated_at = NOW()
        `;
        if (schemaSupport.hasStoryMediaDetachedAt) {
          updateEvSql += `, story_media_detached_at = NOW()`;
        }
        updateEvSql += ` WHERE id = $1;`;

        await query(updateEvSql, [item.eventId]);
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
      // REQUISITO CRÍTICO DE CONCURRENCIA: Comprobación JIT en vivo de referencias en base de datos.
      // Si el asset acaba de adquirir nuevas referencias (concurrencia tras la evaluación),
      // se bloquea y aplaza inmediatamente la purga física en R2 sin eliminar el archivo.
      let r2PhysicallyPurged = false;
      if (item.r2Key) {
        const liveReferences = await getLiveStoryAssetReferences(
          item.r2Key,
          item.imageUrl,
          item.proposalId,
          item.eventId
        );

        if (liveReferences.length === 0) {
          try {
            await deleteR2Object(item.r2Key);
            purgedR2ObjectsCount++;
            r2PhysicallyPurged = true;
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
            r2PhysicallyPurged = true; // Objeto ya no existe físicamente
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
            details: `Purga física en R2 aplazada porque el asset acaba de adquirir o mantiene ${liveReferences.length} referencias activas (#${liveReferences.map((s) => s.targetId).join(', #')}).`,
          });
        }
      } else {
        r2PhysicallyPurged = true; // No había r2Key que purgar
      }

      // 3. Purga y anonimización de propuesta en PostgreSQL (eliminando el caption completo)
      // media_purged_at SOLO se marca si la purga física en R2 se completó sin bloqueos
      let updatePropSql = `
        UPDATE curation_proposals 
        SET r2_key = NULL,
            image_url = 'placeholder://category/' || COALESCE(category, 'gastronomia'),
            caption = NULL,
            review_status = CASE 
              WHEN review_status = 'pending' THEN 'archived' 
              ELSE review_status 
            END,
            updated_at = NOW()
      `;

      if (schemaSupport.hasMediaPurgedAt && r2PhysicallyPurged) {
        updatePropSql += `, media_purged_at = NOW()`;
      }

      updatePropSql += ` WHERE id = $1;`;

      await query(updatePropSql, [item.proposalId]);
      archivedProposalsCount++;

      auditLog.push({
        targetType: 'proposal',
        targetId: item.proposalId,
        action: 'proposal_metadata_and_caption_purged',
        timestamp: nowIso,
        operatorEmail: operator,
        details: `Caption completo eliminado. media_purged_at: ${
          r2PhysicallyPurged ? 'marcado' : 'pendiente_por_referencias_compartidas'
        }. dedupe_key preservada.`,
      });
    } catch (itemErr: any) {
      errors.push({
        targetId: item.proposalId,
        error: itemErr.message || 'Error desconocido en ciclo de vida',
      });
    }
  }

  return {
    success: errors.length === 0,
    executedAt: nowIso,
    previewTokenUsed: options.previewToken,
    dryRun: false,
    purgedR2ObjectsCount,
    deferredR2PurgesCount,
    detachedEventImagesCount,
    archivedProposalsCount,
    errors,
    auditLog,
  };
}
