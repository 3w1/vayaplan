/**
 * VayaPlan — Orquestador de Ingesta Web: Ateneo de Palencia
 *
 * Ejecuta el pipeline de extracción, clasificación, subida de imagen R2 y
 * creación de propuestas en curation_proposals bajo lock persistente.
 * No crea ni publica eventos automáticamente.
 */

import { query } from '@vayaplan/db';
import {
  ATENEO_VENUE_ID,
  ATENEO_SOURCE_TYPE,
  ATENEO_LOCK_KEY,
  ATENEO_MAX_PILOT_ITEMS,
  type AteneoIngestionReport,
  type AteneoRawEvent,
} from './ateneo-types';
import { fetchAteneoProgramacionEvents } from './ateneo-extractor';
import { classifyAteneoEvent } from './ateneo-classifier';
import { uploadAteneoImageToR2 } from './ateneo-r2-pipeline';
import { matchPostWithPublishedEvents, type ExistingEventRecord } from '../bar-instagram-import/event-matcher';
import {
  acquirePersistentLock,
  releasePersistentLock,
} from '../bar-instagram-import/persistent-lock';

const TODAY_EDITORIAL = '2026-10-24';

export async function runAteneoPilotIngestion(options?: {
  maxItems?: number;
  mockRawEvents?: AteneoRawEvent[];
  fetchFn?: typeof fetch;
  skipR2Upload?: boolean;
}): Promise<AteneoIngestionReport> {
  const maxItems = Math.min(options?.maxItems || ATENEO_MAX_PILOT_ITEMS, 5);
  const executionId = `ateneo_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const startedAt = new Date().toISOString();

  // 1. Adquisición atómica de lock persistente en PostgreSQL
  const lockAcquire = await acquirePersistentLock({
    lockKey: ATENEO_LOCK_KEY,
    lockedBy: executionId,
    ttlMinutes: 10,
    executionDetails: {
      source: 'Ateneo de Palencia',
      venueId: ATENEO_VENUE_ID,
      maxItems,
      startedAt,
    },
  });

  if (!lockAcquire.success) {
    const error: any = new Error(
      `Ya existe una ejecución de ingesta de Ateneo en curso (${lockAcquire.lockInfo?.lockedBy}).`
    );
    error.status = 409;
    throw error;
  }

  const report: AteneoIngestionReport = {
    executionId,
    startedAt,
    completedAt: '',
    durationMs: 0,
    itemsExtracted: 0,
    proposalsCreated: 0,
    duplicatesSkipped: 0,
    errors: [],
    proposals: [],
  };

  try {
    // 2. Cargar eventos existentes del Ateneo para cotejo defensivo
    let existingEvents: ExistingEventRecord[] = [];
    try {
      const evRes = await query(
        `SELECT id, venue_id, editorial_date, start_time, title, description, status, image_url
         FROM events
         WHERE venue_id = $1 AND status IN ('published', 'draft', 'tentative');`,
        [ATENEO_VENUE_ID]
      );
      existingEvents = evRes.rows;
    } catch (evErr) {
      console.warn('[Ateneo Ingestion] No se pudieron cargar eventos existentes para matching:', evErr);
    }

    // 3. Extraer eventos de la programación web (máximo 5)
    let rawEvents: AteneoRawEvent[] = [];
    if (options?.mockRawEvents) {
      rawEvents = options.mockRawEvents.slice(0, maxItems);
    } else {
      rawEvents = await fetchAteneoProgramacionEvents({
        maxItems,
        fetchFn: options?.fetchFn,
        futureOnly: true,
        minDate: TODAY_EDITORIAL,
      });
    }

    report.itemsExtracted = rawEvents.length;

    for (const raw of rawEvents) {
      try {
        // 4. Matching defensivo contra eventos existentes del catálogo en Europe/Madrid
        const isNoDateTime = !raw.date && !raw.time;
        const matchEval = matchPostWithPublishedEvents(
          {
            venueId: ATENEO_VENUE_ID,
            proposedDate: raw.date,
            proposedTime: raw.time,
            title: raw.title,
            caption: raw.description,
            imageUrl: raw.imageUrl || undefined,
            hasNoDateAndTime: isNoDateTime,
          },
          existingEvents
        );

        const hasDuplicateMatch =
          matchEval.matchLevel === 'MATCH_EXACTO' ||
          matchEval.matchLevel === 'MATCH_ALTO' ||
          matchEval.matchLevel === 'MATCH_POSIBLE';

        // 5. Clasificación editorial estricta
        const classificationResult = classifyAteneoEvent(raw, hasDuplicateMatch);

        // 6. Dedupe key canónica para Ateneo
        const normTitle = (classificationResult.suggestedTitle || raw.slug || 'evento')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .slice(0, 35);
        const dedupeKey = `web_ateneo#${ATENEO_VENUE_ID}#${raw.date || 'sin-fecha'}#${raw.time || 'sin-hora'}#${normTitle}`;

        // 7. Comprobación de duplicados en curation_proposals y events
        const dupProp = await query(
          `SELECT id FROM curation_proposals WHERE dedupe_key = $1 OR source_url = $2 LIMIT 1;`,
          [dedupeKey, raw.eventUrl]
        );
        const dupEv = await query(
          `SELECT id FROM events WHERE dedupe_key = $1 LIMIT 1;`,
          [dedupeKey]
        );

        if (dupProp.rows.length > 0 || dupEv.rows.length > 0) {
          report.duplicatesSkipped++;
          continue;
        }

        // 8. Pipeline de imagen oficial en R2 (si existe)
        let r2Key = raw.imageUrl ? `ateneo/${raw.slug}/placeholder.webp` : '';
        let finalImageUrl = raw.imageUrl || 'https://media.vayaplan.com/defaults/ateneo-placeholder.jpg';
        let imgWidth = 1080;
        let imgHeight = 1350;
        let imgContentType = 'image/webp';
        let imgSizeBytes = 0;

        if (raw.imageUrl && !options?.skipR2Upload) {
          try {
            const r2Result = await uploadAteneoImageToR2({
              imageUrl: raw.imageUrl,
              eventSlug: raw.slug,
              sourceEventUrl: raw.eventUrl,
              credit: raw.credit || 'Ateneo de Palencia',
              fetchFn: options?.fetchFn,
            });
            r2Key = r2Result.r2Key;
            finalImageUrl = r2Result.finalUrl;
            imgWidth = r2Result.width;
            imgHeight = r2Result.height;
            imgContentType = r2Result.contentType;
            imgSizeBytes = r2Result.sizeBytes;
          } catch (imgErr: any) {
            console.warn(`[Ateneo Ingestion] Fallo en R2 para imagen de ${raw.slug}:`, imgErr.message);
            // Conservar URL original si R2 falla temporalmente
          }
        }

        // 9. Determinar review_status
        let reviewStatus = 'pending';
        let requiresManualReview = true;
        let effectiveClassification = classificationResult.classification;

        const isEventActiveOrFuture =
          (raw.date && raw.date >= TODAY_EDITORIAL) ||
          (raw.endDate && raw.endDate >= TODAY_EDITORIAL);

        if (!isEventActiveOrFuture) {
          effectiveClassification = 'CONTENIDO_VENUE'; // o archivo histórico
          reviewStatus = 'archived';
          requiresManualReview = false;
        }

        let effectiveCaption = raw.description;
        if (raw.endDate && raw.endDate !== raw.date) {
          effectiveCaption = `[Exposición / Actividad del ${raw.date} al ${raw.endDate}] ${raw.description}`;
        }

        // 10. Inserción de la propuesta en curation_proposals
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
            proposed_end_date,
            proposed_end_time,
            price_status,
            price_note,
            price_source,
            price_checked_at,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23,
            $24, $25, $26, $27, $28, NOW(),
            NOW(), NOW()
          ) RETURNING id;
        `;

        const insertRes = await query(insertSql, [
          classificationResult.suggestedTitle,
          classificationResult.suggestedDate,
          classificationResult.suggestedTime,
          ATENEO_VENUE_ID,
          classificationResult.suggestedCategory,
          classificationResult.suggestedPrice,
          effectiveCaption,
          raw.eventUrl,
          ATENEO_SOURCE_TYPE,
          r2Key,
          finalImageUrl,
          imgWidth,
          imgHeight,
          imgContentType,
          imgSizeBytes,
          classificationResult.confidence,
          dedupeKey,
          effectiveClassification,
          reviewStatus,
          requiresManualReview,
          matchEval.matchedEvent?.id || null,
          matchEval.matchLevel !== 'SIN_MATCH' ? matchEval.matchLevel : null,
          matchEval.signals.length > 0 ? matchEval.signals.join('; ') : null,
          classificationResult.suggestedEndDate || null,
          classificationResult.suggestedEndTime || null,
          classificationResult.suggestedPriceStatus || 'NOT_INFORMED',
          classificationResult.suggestedPriceNote || null,
          'ateneo_web',
        ]);

        const proposalId = insertRes.rows[0].id;
        report.proposalsCreated++;
        report.proposals.push({
          id: proposalId,
          title: classificationResult.suggestedTitle,
          date: classificationResult.suggestedDate,
          time: classificationResult.suggestedTime,
          classification: effectiveClassification,
          sourceUrl: raw.eventUrl,
          imageUrl: finalImageUrl,
        });
      } catch (itemErr: any) {
        report.errors.push({
          eventId: raw.sourceId,
          error: itemErr.message || String(itemErr),
        });
      }
    }
  } finally {
    report.completedAt = new Date().toISOString();
    report.durationMs = new Date(report.completedAt).getTime() - new Date(startedAt).getTime();
    try {
      await releasePersistentLock(ATENEO_LOCK_KEY, executionId);
    } catch (relErr) {
      console.error('[Ateneo Ingestion] Error al liberar lock persistente:', relErr);
    }
  }

  return report;
}
