/**
 * Servicio de Inventario y Carga Editorial de Imágenes para Biblioteca Pública de Palencia
 */

import crypto from 'node:crypto';
import { query, getClient } from '@vayaplan/db';
import {
  BibliotecaEventInventoryItem,
  BibliotecaImageStatus,
  BibliotecaProposedImage,
  BibliotecaRecommendedAction,
  BibliotecaDecisionRecord,
  EventImageDecisionEntity,
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
  currentDate = '2026-10-24',
  customQueryFn?: (sql: string, params: any[]) => Promise<any>
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
      e.source_url,
      e.verified_at,
      e.verified_by
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    WHERE e.venue_id = 10127
      AND e.status = 'published'
      AND (e.editorial_date >= $1 OR (e.end_date IS NOT NULL AND e.end_date >= $1))
    ORDER BY e.editorial_date ASC, e.id ASC;
  `;

  const res = await (customQueryFn || query)(sql, [currentDate]);

  return res.rows.map((row: any) => ({
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
    verified_at: row.verified_at instanceof Date ? row.verified_at.toISOString() : (row.verified_at ? String(row.verified_at) : null),
    verified_by: row.verified_by ? String(row.verified_by) : null,
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
      isPending: true,
      activeDecision: null,
    });
  }

  return proposals;
}

/**
 * Recupera la decisión editorial activa más reciente para cada par (evento, candidata).
 * Orden determinista: id DESC (secuencia monótona autoincremental de PostgreSQL bajo bloqueo FOR UPDATE, sin suposiciones de reloj).
 */
export async function getLatestEventImageDecisions(
  eventIds: number[],
  customQueryFn?: (sql: string, params: any[]) => Promise<any>
): Promise<Map<string, EventImageDecisionEntity>> {
  if (!eventIds || eventIds.length === 0) return new Map();

  const sql = `
    SELECT DISTINCT ON (event_id, candidate_key)
      id,
      event_id,
      candidate_key,
      candidate_url,
      action,
      operator_email,
      notes,
      idempotency_key,
      payload_hash,
      created_at
    FROM event_image_decisions
    WHERE event_id = ANY($1::int[])
    ORDER BY event_id, candidate_key, id DESC;
  `;

  try {
    const res = await (customQueryFn || query)(sql, [eventIds]);
    const map = new Map<string, EventImageDecisionEntity>();
    for (const row of res.rows) {
      map.set(`${row.event_id}:${row.candidate_key}`, {
        id: row.id,
        eventId: row.event_id,
        candidateKey: row.candidate_key,
        candidateUrl: row.candidate_url,
        action: row.action,
        operatorEmail: row.operator_email,
        notes: row.notes,
        idempotencyKey: row.idempotency_key,
        payloadHash: row.payload_hash,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      });
    }
    return map;
  } catch (err: any) {
    // Si la tabla no existe en entornos no migrados, devolver mapa vacío defensivamente
    return new Map();
  }
}

/**
 * Aplica una decisión editorial humana sobre un evento específico de forma atómica e idempotente:
 * - Serializa concurrentes con bloqueo pesimista de fila (FOR UPDATE) en el evento.
 * - Idempotencia: reintentos con misma idempotencyKey y mismo payload retornan el resultado sin duplicar.
 *   Reutilizar idempotencyKey con payload divergente lanza error 409 (idempotency_conflict).
 * - Verificación de candidata: no adopta silenciosamente si la candidata cambió durante la revisión.
 * - Si es 'adopt': actualiza image_url, image_thumb_url y preserva histórico en image_original_url.
 * - Si es 'keep_current', 'discard' o 'request_search': NO modifica la tabla events.
 * - NO altera ni borra jamás verified_at ni verified_by editoriales generales.
 */
export async function applyBibliotecaDecision(
  decision: BibliotecaDecisionRecord,
  customClient?: any
): Promise<{ success: boolean; idempotent?: boolean; event: any; decision: any }> {
  const client = customClient || (await getClient());
  const shouldRelease = !customClient;

  const validActions = ['adopt', 'keep_current', 'discard', 'request_search'];
  if (!validActions.includes(decision.action)) {
    throw new Error(`Acción no reconocida: ${decision.action}`);
  }

  // Identidad canónica y estable de la candidata
  const candidateKey = decision.candidateKey || decision.adoptedR2Key || ('event-' + decision.eventId);
  const candidateUrl = decision.candidateUrl || decision.adoptedImageUrl || '';

  // Cálculo determinista del hash de carga útil para validación de idempotencia
  const canonicalPayload = JSON.stringify({
    eventId: decision.eventId,
    candidateKey,
    candidateUrl,
    action: decision.action,
    notes: (decision.notes || '').trim(),
  });
  const payloadHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

  try {
    await client.query('BEGIN');

    // Detección defensiva de la columna image_detail_url en events
    let hasDetailCol = false;
    try {
      const colRes = await client.query(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'image_detail_url' LIMIT 1;
      `);
      hasDetailCol = colRes && colRes.rows && colRes.rows.length > 0;
    } catch {
      hasDetailCol = false;
    }

    // 1. Serialización concurrente con bloqueo de fila en events
    const evSql = hasDetailCol
      ? `SELECT id, image_url, image_thumb_url, image_detail_url, image_original_url, verified_at, verified_by, updated_at FROM events WHERE id = $1 FOR UPDATE;`
      : `SELECT id, image_url, image_thumb_url, image_original_url, verified_at, verified_by, updated_at FROM events WHERE id = $1 FOR UPDATE;`;

    const evRes = await client.query(evSql, [decision.eventId]);

    if (evRes.rows.length === 0) {
      throw new Error(`Evento con ID ${decision.eventId} no encontrado.`);
    }
    const currentEvent = evRes.rows[0];

    // 2. Control de idempotencia por operación
    if (decision.idempotencyKey) {
      const existingRes = await client.query(
        `SELECT * FROM event_image_decisions WHERE idempotency_key = $1;`,
        [decision.idempotencyKey]
      );

      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        if (existing.payload_hash && existing.payload_hash !== payloadHash) {
          throw new Error('idempotency_conflict: La clave de idempotencia ya fue utilizada con una carga de datos divergente.');
        }
        await client.query('COMMIT');
        return {
          success: true,
          idempotent: true,
          event: currentEvent,
          decision: existing,
        };
      }
    }

    // 3. Control de estado previo (optimistic concurrency guard)
    // Previene sobreescrituras silenciosas si otro operador ya decidió sobre esta candidata
    if (decision.expectedPreviousDecisionId !== undefined) {
      const lastDecRes = await client.query(
        `SELECT id, action, candidate_key, operator_email, created_at
         FROM event_image_decisions
         WHERE event_id = $1 AND candidate_key = $2
         ORDER BY id DESC
         LIMIT 1;`,
        [decision.eventId, candidateKey]
      );
      const latestDecision = lastDecRes.rows[0] || null;
      const latestDecisionId = latestDecision ? latestDecision.id : null;

      if (decision.expectedPreviousDecisionId === null && latestDecisionId !== null) {
        throw new Error(
          `stale_decision_state: El estado de revisión ha cambiado (el operador '${latestDecision.operator_email}' aplicó la decisión #${latestDecision.id} '${latestDecision.action}'). Actualiza la lista antes de decidir.`
        );
      } else if (
        decision.expectedPreviousDecisionId !== null &&
        latestDecisionId !== decision.expectedPreviousDecisionId
      ) {
        const op = latestDecision ? latestDecision.operator_email : 'desconocido';
        const act = latestDecision ? latestDecision.action : 'ninguna';
        throw new Error(
          `stale_decision_state: El estado de revisión ha cambiado (la última decisión es #${latestDecisionId} '${act}' por '${op}', se esperaba #${decision.expectedPreviousDecisionId}). Actualiza la lista antes de decidir.`
        );
      }
    }

    // 4. Ejecutar efectos específicos según la acción
    let updatedEvent = currentEvent;

    if (decision.action === 'adopt') {
      if (!candidateUrl) {
        throw new Error('candidateUrl es obligatorio para la acción adopt.');
      }

      // Preservar la referencia original o previa en image_original_url:
      // 1. Si ya existe image_original_url, se conserva intacto.
      // 2. Si no tiene image_original_url, se guarda la imagen previa solo si es distinta de la candidata que se adopta.
      // 3. Si la imagen actual ya era la candidata (adopción repetida), no se sustituye ni se crea auto-referencia.
      const previousDistinctImage =
        (currentEvent.image_url && currentEvent.image_url !== candidateUrl)
          ? currentEvent.image_url
          : ((currentEvent.image_detail_url && currentEvent.image_detail_url !== candidateUrl)
              ? currentEvent.image_detail_url
              : null);

      // Se actualizan todas las variantes públicas (image_url, image_thumb_url y image_detail_url si existe)
      // para que ningún listado, detalle o visor retenga una variante antigua
      const updateSql = hasDetailCol
        ? `
          UPDATE events
          SET
            image_url = $1,
            image_thumb_url = $1,
            image_detail_url = $1,
            image_original_url = COALESCE(image_original_url, $2),
            updated_at = clock_timestamp()
          WHERE id = $3
          RETURNING *;
        `
        : `
          UPDATE events
          SET
            image_url = $1,
            image_thumb_url = $1,
            image_original_url = COALESCE(image_original_url, $2),
            updated_at = clock_timestamp()
          WHERE id = $3
          RETURNING *;
        `;

      const updateRes = await client.query(updateSql, [
        candidateUrl,
        previousDistinctImage,
        decision.eventId,
      ]);
      updatedEvent = updateRes.rows[0];
    }

    // 5. Inserción atómica en la tabla dedicada de auditoría event_image_decisions
    let decisionRow: any = null;
    try {
      const insertDecisionSql = `
        INSERT INTO event_image_decisions (
          event_id,
          candidate_key,
          candidate_url,
          action,
          operator_email,
          notes,
          idempotency_key,
          payload_hash,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp()
        )
        RETURNING *;
      `;

      const decRes = await client.query(insertDecisionSql, [
        decision.eventId,
        candidateKey,
        candidateUrl,
        decision.action,
        decision.operatorEmail,
        decision.notes || null,
        decision.idempotencyKey || null,
        payloadHash,
      ]);
      decisionRow = decRes.rows[0];
    } catch (insertErr: any) {
      // Manejar colisión de clave de idempotencia en caso de carrera
      if (insertErr.code === '23505' && insertErr.constraint === 'idx_event_image_decisions_idempotency') {
        const raceRes = await client.query(
          `SELECT * FROM event_image_decisions WHERE idempotency_key = $1;`,
          [decision.idempotencyKey]
        );
        if (raceRes.rows.length > 0) {
          const existing = raceRes.rows[0];
          if (existing.payload_hash && existing.payload_hash !== payloadHash) {
            throw new Error('idempotency_conflict: La clave de idempotencia ya fue utilizada con una carga de datos divergente.');
          }
          await client.query('COMMIT');
          return { success: true, idempotent: true, event: updatedEvent, decision: existing };
        }
      }
      throw insertErr;
    }

    await client.query('COMMIT');
    return { success: true, event: updatedEvent, decision: decisionRow };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    if (shouldRelease && client && typeof client.release === 'function') {
      client.release();
    }
  }
}
