import { Hono } from 'hono';
import { requireAdminAuth } from '../../middleware/auth';
import {
  getBibliotecaEventsInventory,
  KNOWN_BIBLIOTECA_SOURCES,
  determineRecommendedAction,
  applyBibliotecaDecision,
} from '../../services/biblioteca-images/biblioteca-service';
import type {
  BibliotecaProposedImage,
  BibliotecaDecisionRecord,
} from '../../services/biblioteca-images/biblioteca-types';

export const bibliotecaImagesRoutes = new Hono();
bibliotecaImagesRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/biblioteca-images/proposals
 * Lista el inventario de eventos de la Biblioteca Pública con sus imágenes oficiales en R2 propuestas
 */
bibliotecaImagesRoutes.get('/biblioteca-images/proposals', async (c) => {
  try {
    const inventory = await getBibliotecaEventsInventory();

    // Mapas precomputados y subidos a R2 con hashes trazables
    const r2ProposalsMap: Record<number, { r2Key: string; finalUrl: string; width: number; height: number; sizeBytes: number }> = {
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

    const proposals: BibliotecaProposedImage[] = inventory.map((item) => {
      const known = KNOWN_BIBLIOTECA_SOURCES[item.id];
      const r2 = r2ProposalsMap[item.id];

      return {
        eventId: item.id,
        eventTitle: item.title,
        editorialDate: item.editorial_date,
        endDate: item.end_date,
        venueName: item.venue_name,
        currentImageStatus: item.current_image_status,
        currentImageUrl: item.current_image_url,
        proposedImageUrl: r2?.finalUrl || known?.sourceImageUrl || '',
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
      };
    });

    return c.json({
      success: true,
      totalPublished: inventory.length,
      sinImagenCount: inventory.filter((i) => i.current_image_status === 'SIN_IMAGEN').length,
      imagenGenericaCount: inventory.filter((i) => i.current_image_status === 'IMAGEN_GENERICA').length,
      imagenOficialCount: inventory.filter((i) => i.current_image_status === 'IMAGEN_OFICIAL_EXISTENTE').length,
      proposals,
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

  const { eventId, action, adoptedImageUrl, adoptedR2Key, adoptedCredit, notes } = body;
  if (!eventId || isNaN(Number(eventId))) {
    return c.json({ error: 'invalid_event_id', message: 'ID de evento no válido' }, 400);
  }

  const validActions = ['adopt', 'keep_current', 'discard', 'request_search'];
  if (!validActions.includes(action)) {
    return c.json({ error: 'invalid_action', message: `Acción no válida. Debe ser una de: ${validActions.join(', ')}` }, 400);
  }

  const userEmail = c.get('user')?.email || 'admin@vayaplan.com';

  try {
    const decisionRecord: BibliotecaDecisionRecord = {
      eventId: Number(eventId),
      action,
      operatorEmail: userEmail,
      decisionTimestamp: new Date().toISOString(),
      previousImageUrl: null,
      adoptedImageUrl: adoptedImageUrl || null,
      adoptedR2Key: adoptedR2Key || null,
      adoptedCredit: adoptedCredit || null,
      notes: notes || null,
    };

    const result = await applyBibliotecaDecision(decisionRecord);

    return c.json({
      success: true,
      message: `Decisión '${action}' aplicada correctamente al evento #${eventId}.`,
      event: {
        id: result.event.id,
        title: result.event.title,
        status: result.event.status,
        image_url: result.event.image_url,
        image_original_url: result.event.image_original_url,
        verified_by: result.event.verified_by,
        verified_at: result.event.verified_at,
      },
    });
  } catch (err: any) {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  }
});
