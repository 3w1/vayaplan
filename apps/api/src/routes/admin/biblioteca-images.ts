import { Hono } from 'hono';
import type { AdminUser } from '@vayaplan/types';
import { requireAdminAuth } from '../../middleware/auth';
import {
  getBibliotecaEventsInventory,
  KNOWN_BIBLIOTECA_SOURCES,
  determineRecommendedAction,
  applyBibliotecaDecision,
  getLatestEventImageDecisions,
} from '../../services/biblioteca-images/biblioteca-service';
import type {
  BibliotecaProposedImage,
  BibliotecaDecisionRecord,
} from '../../services/biblioteca-images/biblioteca-types';

export const bibliotecaImagesRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();
bibliotecaImagesRoutes.use('*', requireAdminAuth);

// Mapas precomputados y subidos a R2 con hashes trazables
export const R2_PROPOSALS_MAP: Record<number, { r2Key: string; finalUrl: string; width: number; height: number; sizeBytes: number }> = {
  9: {
    r2Key: 'biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
    width: 530,
    height: 750,
    sizeBytes: 42892,
  },
  14: {
    r2Key: 'biblioteca-publica/mujeres-en-el-romanico-palentino/89e991502115.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/mujeres-en-el-romanico-palentino/89e991502115.webp',
    width: 535,
    height: 750,
    sizeBytes: 70356,
  },
  16: {
    r2Key: 'biblioteca-publica/club-lectura-presas-faciles/8597bacb791e.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/club-lectura-presas-faciles/8597bacb791e.webp',
    width: 530,
    height: 750,
    sizeBytes: 59798,
  },
  19: {
    r2Key: 'biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
    width: 1360,
    height: 1020,
    sizeBytes: 141078,
  },
  35: {
    r2Key: 'biblioteca-publica/escucha-jazz-biblioteca-sesion-1/927980595fc0.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/escucha-jazz-biblioteca-sesion-1/927980595fc0.webp',
    width: 1024,
    height: 768,
    sizeBytes: 88248,
  },
  44: {
    r2Key: 'biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer-lachy-torriente/a0b7decbdbfa.webp',
    width: 819,
    height: 1024,
    sizeBytes: 193466,
  },
  46: {
    r2Key: 'biblioteca-publica/escucha-jazz-biblioteca-sesion-2/927980595fc0.webp',
    finalUrl: 'https://media.vayaplan.com/biblioteca-publica/escucha-jazz-biblioteca-sesion-2/927980595fc0.webp',
    width: 1024,
    height: 768,
    sizeBytes: 88248,
  },
};

/**
 * GET /api/v1/admin/biblioteca-images/proposals
 * Lista el inventario de eventos de la Biblioteca Pública con sus imágenes oficiales en R2 propuestas
 */
bibliotecaImagesRoutes.get('/biblioteca-images/proposals', async (c) => {
  try {
    const inventory = await getBibliotecaEventsInventory();
    const eventIds = inventory.map((i) => i.id);
    const decisionsMap = await getLatestEventImageDecisions(eventIds);

    const validStatuses = ['pending', 'resolved', 'all'];
    const statusParam = c.req.query('status') || 'pending';
    if (!validStatuses.includes(statusParam)) {
      return c.json({
        error: 'invalid_status',
        message: `Estado no válido. Debe ser uno de: ${validStatuses.join(', ')}`,
      }, 400);
    }

    const proposals: BibliotecaProposedImage[] = inventory.map((item) => {
      const known = KNOWN_BIBLIOTECA_SOURCES[item.id];
      const r2 = R2_PROPOSALS_MAP[item.id];
      const candidateKey = r2?.r2Key || known?.slug || ('event-' + item.id);
      const candidateUrl = r2?.finalUrl || known?.sourceImageUrl || '';

      const activeDecision = decisionsMap.get(`${item.id}:${candidateKey}`) || null;

      // Estado pendiente/resuelto:
      // - Si no existe decisión explícita en la tabla dedicada event_image_decisions, permanece PENDIENTE.
      // - Si la última decisión fue 'request_search', permanece PENDIENTE (búsqueda pendiente).
      // - Si la última decisión fue 'adopt', 'keep_current' o 'discard', pasa a RESUELTO.
      const isPending = !activeDecision || activeDecision.action === 'request_search';

      return {
        eventId: item.id,
        eventTitle: item.title,
        editorialDate: item.editorial_date,
        endDate: item.end_date,
        venueName: item.venue_name,
        currentImageStatus: item.current_image_status,
        currentImageUrl: item.current_image_url,
        proposedImageUrl: candidateUrl,
        r2Key: r2?.r2Key || '',
        sourceImageUrl: known?.sourceImageUrl || '',
        sourcePageUrl: known?.sourcePageUrl || item.source_url,
        sourceName: known?.sourceName || 'Biblioteca Pública de Palencia',
        credit: known?.credit || 'Biblioteca Pública de Palencia',
        imageWidth: r2?.width || 0,
        imageHeight: r2?.height || 0,
        contentType: 'image/webp',
        sizeBytes: r2?.sizeBytes || 0,
        lastCheckedAt: new Date().toISOString(),
        recommendedAction: determineRecommendedAction(item.current_image_status),
        verifiedAt: item.verified_at || null,
        verifiedBy: item.verified_by || null,
        isPending,
        activeDecision: activeDecision
          ? {
              id: activeDecision.id,
              action: activeDecision.action,
              candidateKey: activeDecision.candidateKey,
              operatorEmail: activeDecision.operatorEmail,
              createdAt: activeDecision.createdAt,
              notes: activeDecision.notes,
            }
          : null,
      };
    });

    const pendingProposals = proposals.filter((p) => p.isPending);
    const resolvedProposals = proposals.filter((p) => !p.isPending);

    let filteredProposals = pendingProposals;
    if (statusParam === 'resolved') {
      filteredProposals = resolvedProposals;
    } else if (statusParam === 'all') {
      filteredProposals = proposals;
    }

    return c.json({
      success: true,
      totalPublished: inventory.length,
      totalPending: pendingProposals.length,
      totalResolved: resolvedProposals.length,
      sinImagenCount: inventory.filter((i) => i.current_image_status === 'SIN_IMAGEN').length,
      imagenGenericaCount: inventory.filter((i) => i.current_image_status === 'IMAGEN_GENERICA').length,
      imagenOficialCount: inventory.filter((i) => i.current_image_status === 'IMAGEN_OFICIAL_EXISTENTE').length,
      proposals: filteredProposals,
    });
  } catch (err: any) {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  }
});

/**
 * POST /api/v1/admin/biblioteca-images/decision
 * Aplica la decisión editorial humana sobre una propuesta de imagen
 */
bibliotecaImagesRoutes.post('/biblioteca-images/decision', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo JSON inválido' }, 400);
  }

  const {
    eventId,
    action,
    candidateKey,
    candidateUrl,
    adoptedImageUrl,
    adoptedR2Key,
    adoptedCredit,
    notes,
    idempotencyKey,
    expectedPreviousDecisionId: rawExpectedPrevId,
  } = body;

  const expectedPreviousDecisionId =
    rawExpectedPrevId !== undefined
      ? (rawExpectedPrevId === null || rawExpectedPrevId === '' ? null : Number(rawExpectedPrevId))
      : undefined;

  if (!eventId || isNaN(Number(eventId))) {
    return c.json({ error: 'invalid_event_id', message: 'ID de evento no válido' }, 400);
  }

  const numericEventId = Number(eventId);
  const validActions = ['adopt', 'keep_current', 'discard', 'request_search'];
  if (!validActions.includes(action)) {
    return c.json({ error: 'invalid_action', message: `Acción no válida. Debe ser una de: ${validActions.join(', ')}` }, 400);
  }

  // Comprobar si la candidata coincide con la versión activa conocida
  const known = KNOWN_BIBLIOTECA_SOURCES[numericEventId];
  const r2 = R2_PROPOSALS_MAP[numericEventId];
  const activeExpectedKey = r2?.r2Key || known?.slug || ('event-' + numericEventId);
  const resolvedCandidateKey = candidateKey || adoptedR2Key || activeExpectedKey;

  // Si la petición envía una candidateKey explícita que no coincide con la versión activa del evento,
  // rechazar como stale_candidate para no adoptar a ciegas tras un cambio
  if (candidateKey && candidateKey !== activeExpectedKey) {
    return c.json({
      error: 'stale_candidate',
      message: `La candidata indicada ('${candidateKey}') ya no coincide con la versión activa ('${activeExpectedKey}').`,
    }, 409);
  }

  const resolvedCandidateUrl = candidateUrl || adoptedImageUrl || r2?.finalUrl || known?.sourceImageUrl || '';

  // Identidad de auditoría: debe proceder exclusivamente del usuario autenticado real
  const authUser = c.get('user');
  const operatorEmail = authUser && typeof authUser.email === 'string' ? authUser.email.trim() : '';

  if (!operatorEmail) {
    return c.json(
      {
        error: 'unauthorized',
        message: 'No se pudo determinar la identidad del operador autenticado.',
      },
      401
    );
  }

  try {
    const decisionRecord: BibliotecaDecisionRecord = {
      eventId: numericEventId,
      candidateKey: resolvedCandidateKey,
      candidateUrl: resolvedCandidateUrl,
      action,
      operatorEmail,
      decisionTimestamp: new Date().toISOString(),
      previousImageUrl: null,
      adoptedImageUrl: resolvedCandidateUrl || null,
      adoptedR2Key: resolvedCandidateKey || null,
      adoptedCredit: adoptedCredit || null,
      notes: notes || null,
      idempotencyKey: idempotencyKey || null,
      expectedPreviousDecisionId,
    };

    const result = await applyBibliotecaDecision(decisionRecord);

    return c.json({
      success: true,
      idempotent: Boolean(result.idempotent),
      message: `Decisión '${action}' aplicada correctamente al evento #${numericEventId}.`,
      event: {
        id: result.event.id,
        title: result.event.title,
        status: result.event.status,
        image_url: result.event.image_url,
        image_original_url: result.event.image_original_url,
        verified_by: result.event.verified_by,
        verified_at: result.event.verified_at,
      },
      decision: {
        id: result.decision?.id || null,
        action: result.decision?.action || action,
        candidate_key: result.decision?.candidate_key || resolvedCandidateKey,
        operator_email: result.decision?.operator_email || userEmail,
        created_at: result.decision?.created_at || new Date().toISOString(),
      },
    });
  } catch (err: any) {
    if (err.message?.includes('idempotency_conflict')) {
      return c.json({ error: 'idempotency_conflict', message: err.message }, 409);
    }
    if (err.message?.includes('stale_candidate')) {
      return c.json({ error: 'stale_candidate', message: err.message }, 409);
    }
    if (err.message?.includes('stale_decision_state')) {
      return c.json({ error: 'stale_decision_state', message: err.message }, 409);
    }
    return c.json({ error: 'internal_error', message: err.message }, 500);
  }
});
