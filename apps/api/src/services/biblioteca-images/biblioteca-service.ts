/**
 * Servicio de Inventario y Carga Editorial de Imágenes para Biblioteca Pública de Palencia
 */

import { query, getClient } from '@vayaplan/db';
import {
  BibliotecaEventInventoryItem,
  BibliotecaImageStatus,
  BibliotecaProposedImage,
  BibliotecaRecommendedAction,
  BibliotecaDecisionRecord,
} from './biblioteca-types';
import {
  processAndUploadBibliotecaImage,
  ProcessBibliotecaImageParams,
} from './biblioteca-r2-pipeline';

export interface KnownOfficialSource {
  eventId: number;
  slug: string;
  sourceImageUrl: string;
  sourcePageUrl: string;
  sourceName: string;
  credit: string;
}

export const KNOWN_BIBLIOTECA_SOURCES: Record<number, KnownOfficialSource> = {
  9: {
    eventId: 9,
    slug: 'exposicion-agustin-hernandez',
    sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/35/937/BPA%20AG%20Exposicion%20Mirada%20Sincera%20Cartel.jpg',
    sourcePageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/BibliotecaPalencia/es/Plantilla100Detalle/1284355840201/Evento/1285184301373/Comunicacion',
    sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
    credit: 'Biblioteca Pública de Palencia / Agustín Hernández',
  },
  14: {
    eventId: 14,
    slug: 'mujeres-en-el-romanico-palentino',
    sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/852/925/bpa_ag_conferencia_promotoras_benfactoras_romanico_cartel.jpg',
    sourcePageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/BibliotecaPalencia/es/Plantilla100Detalle/1284355840201/Evento/1285036534512/Comunicacion',
    sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
    credit: 'Biblioteca Pública de Palencia / Cristina Párbole Martín',
  },
  16: {
    eventId: 16,
    slug: 'club-lectura-presas-faciles',
    sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/957/549/bpa_ag_club_comic_presas_faciles_cartel.jpg',
    sourcePageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/BibliotecaPalencia/es/Plantilla100Detalle/1284355840201/Evento/1285067578232/Comunicacion',
    sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
    credit: 'Biblioteca Pública de Palencia / Miguelanxo Prado',
  },
  19: {
    eventId: 19,
    slug: 'el-jazz-esta-en-los-libros',
    sourceImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2025/09/biblioteca-palencia.webp',
    sourcePageUrl: 'https://jazzpalencia.es/actividades/exposicion-el-jazz-esta-en-los-libros',
    sourceName: 'Festival Jazz Palencia / Biblioteca Pública de Palencia',
    credit: 'Jazz Palencia / Biblioteca Pública de Palencia',
  },
  35: {
    eventId: 35,
    slug: 'escucha-jazz-biblioteca-sesion-1',
    sourceImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2023/10/WhatsApp-Image-2023-10-24-at-13.06.17.jpeg',
    sourcePageUrl: 'https://jazzpalencia.es/actividades/exposicion-escucha-jazz-en-la-biblioteca',
    sourceName: 'Festival Jazz Palencia / Biblioteca Pública de Palencia',
    credit: 'Jazz Palencia / Biblioteca Pública de Palencia',
  },
  44: {
    eventId: 44,
    slug: 'zo-brinviyer-lachy-torriente',
    sourceImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2025/10/zo-brinviyer-2-819x1024.jpg',
    sourcePageUrl: 'https://jazzpalencia.es/actividades/zo-brinviyer-con-lachy-torriente',
    sourceName: 'Festival Jazz Palencia / Biblioteca Pública de Palencia',
    credit: 'Jazz Palencia / Lachy Torriente',
  },
  46: {
    eventId: 46,
    slug: 'escucha-jazz-biblioteca-sesion-2',
    sourceImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2023/10/WhatsApp-Image-2023-10-24-at-13.06.17.jpeg',
    sourcePageUrl: 'https://jazzpalencia.es/actividades/exposicion-escucha-jazz-en-la-biblioteca',
    sourceName: 'Festival Jazz Palencia / Biblioteca Pública de Palencia',
    credit: 'Jazz Palencia / Biblioteca Pública de Palencia',
  },
};

/**
 * Clasifica el estado de imagen de un evento
 */
export function classifyImageStatus(imageUrl: string | null | undefined): BibliotecaImageStatus {
  if (!imageUrl || imageUrl.trim() === '') {
    return 'SIN_IMAGEN';
  }
  const lower = imageUrl.toLowerCase();
  // Cartel genérico del festival de jazz reutilizado para todas las actividades
  if (lower.includes('cartel-jazz-2026') || lower.includes('logo') || lower.includes('generica')) {
    return 'IMAGEN_GENERICA';
  }
  // Imagen alojada en R2 con ruta específica oficial de la biblioteca
  if (lower.includes('media.vayaplan.com/biblioteca-publica/')) {
    return 'IMAGEN_OFICIAL_EXISTENTE';
  }
  // En cualquier otro caso con imagen preexistente no genérica
  return 'IMAGEN_OFICIAL_EXISTENTE';
}

/**
 * Determina la acción recomendada según las reglas de sustitución
 */
export function determineRecommendedAction(status: BibliotecaImageStatus): BibliotecaRecommendedAction {
  switch (status) {
    case 'SIN_IMAGEN':
      return 'ADOPTAR_IMAGEN_OFICIAL';
    case 'IMAGEN_GENERICA':
      return 'PROPONER_ALTERNATIVA';
    case 'IMAGEN_OFICIAL_EXISTENTE':
      return 'MANTENER_IMAGEN_ACTUAL';
    default:
      return 'REQUIERE_REVISION';
  }
}

/**
 * Obtiene el inventario de eventos publicados vinculados a la Biblioteca Pública de Palencia
 */
export async function getBibliotecaEventsInventory(
  currentDate = '2026-10-24'
): Promise<BibliotecaEventInventoryItem[]> {
  const sql = `
    SELECT 
      e.id, 
      e.title, 
      e.editorial_date, 
      e.end_date, 
      e.start_time, 
      e.time_status, 
      e.schedule_text, 
      e.venue_id, 
      v.name AS venue_name, 
      e.image_url, 
      e.source_type, 
      e.source_url
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    WHERE e.venue_id = 10127
      AND e.status = 'published'
      AND (e.editorial_date >= $1 OR (e.end_date IS NOT NULL AND e.end_date >= $1))
    ORDER BY e.editorial_date ASC, e.id ASC;
  `;

  const res = await query(sql, [currentDate]);

  return res.rows.map((row) => ({
    id: row.id,
    title: row.title,
    editorial_date: row.editorial_date instanceof Date ? row.editorial_date.toISOString().slice(0, 10) : String(row.editorial_date),
    end_date: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date)) : null,
    start_time: row.start_time ? String(row.start_time) : null,
    schedule_text: row.schedule_text || null,
    time_status: row.time_status || 'confirmed',
    venue_id: row.venue_id,
    venue_name: row.venue_name || 'Biblioteca Pública de Palencia',
    current_image_status: classifyImageStatus(row.image_url),
    current_image_url: row.image_url || null,
    source_type: row.source_type || 'api',
    source_url: row.source_url || '',
  }));
}

/**
 * Procesa un lote controlado de eventos de la biblioteca: localiza, descarga,
 * genera WebP con Sharp, sube a Cloudflare R2 y construye la propuesta editorial.
 */
export async function processBibliotecaBatch(params?: {
  fetchFn?: typeof fetch;
  mockBuffers?: Record<number, Buffer>;
  currentDate?: string;
}): Promise<BibliotecaProposedImage[]> {
  const inventory = await getBibliotecaEventsInventory(params?.currentDate);
  const proposals: BibliotecaProposedImage[] = [];

  for (const item of inventory) {
    const knownSource = KNOWN_BIBLIOTECA_SOURCES[item.id];
    if (!knownSource) {
      continue;
    }

    const r2Result = await processAndUploadBibliotecaImage({
      eventId: item.id,
      eventSlug: knownSource.slug,
      sourceImageUrl: knownSource.sourceImageUrl,
      sourcePageUrl: knownSource.sourcePageUrl,
      sourceName: knownSource.sourceName,
      credit: knownSource.credit,
      fetchFn: params?.fetchFn,
      mockBuffer: params?.mockBuffers?.[item.id],
    });

    proposals.push({
      eventId: item.id,
      eventTitle: item.title,
      editorialDate: item.editorial_date,
      endDate: item.end_date,
      venueName: item.venue_name,
      currentImageStatus: item.current_image_status,
      currentImageUrl: item.current_image_url,
      proposedImageUrl: r2Result.finalUrl,
      r2Key: r2Result.r2Key,
      sourceImageUrl: r2Result.sourceImageUrl,
      sourcePageUrl: r2Result.sourcePageUrl,
      sourceName: r2Result.sourceName,
      credit: r2Result.credit,
      imageWidth: r2Result.width,
      imageHeight: r2Result.height,
      contentType: r2Result.contentType,
      sizeBytes: r2Result.sizeBytes,
      lastCheckedAt: r2Result.lastCheckedAt,
      recommendedAction: determineRecommendedAction(item.current_image_status),
    });
  }

  return proposals;
}

/**
 * Aplica una decisión editorial humana sobre un evento específico:
 * - Si se adopta la imagen oficial, actualiza image_url, image_thumb_url y guarda la anterior en image_original_url como histórico.
 * - Registra verified_by y verified_at.
 * - No modifica fecha, hora, status (permanece 'published') ni precio.
 */
export async function applyBibliotecaDecision(decision: BibliotecaDecisionRecord): Promise<{ success: boolean; event: any }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const evRes = await client.query(`SELECT * FROM events WHERE id = $1;`, [decision.eventId]);
    if (evRes.rows.length === 0) {
      throw new Error(`Evento con ID ${decision.eventId} no encontrado.`);
    }
    const currentEvent = evRes.rows[0];

    if (decision.action === 'adopt') {
      if (!decision.adoptedImageUrl) {
        throw new Error('adoptedImageUrl es obligatorio para la acción adopt.');
      }

      // Guardar imagen anterior como histórico en image_original_url si no tenía otra o preservarla
      const previousImageHistory = currentEvent.image_url || currentEvent.image_original_url || null;

      const updateSql = `
        UPDATE events
        SET
          image_url = $1,
          image_thumb_url = $1,
          image_original_url = COALESCE($2, image_original_url),
          verified_by = $3,
          verified_at = NOW(),
          updated_at = NOW()
        WHERE id = $4
        RETURNING *;
      `;

      const updateRes = await client.query(updateSql, [
        decision.adoptedImageUrl,
        previousImageHistory,
        decision.operatorEmail,
        decision.eventId,
      ]);

      await client.query('COMMIT');
      return { success: true, event: updateRes.rows[0] };
    } else {
      // Registrar solo auditoría de verificación
      const auditSql = `
        UPDATE events
        SET
          verified_by = $1,
          verified_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
        RETURNING *;
      `;
      const updateRes = await client.query(auditSql, [decision.operatorEmail, decision.eventId]);
      await client.query('COMMIT');
      return { success: true, event: updateRes.rows[0] };
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
