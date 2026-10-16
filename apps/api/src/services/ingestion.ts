import { createHash } from 'crypto';
import { query } from '@vayaplan/db';
import { computeEditorialDate } from '@vayaplan/shared';
import type { EventCategory } from '@vayaplan/types';

export const CULTURAL_AGENDA_DATASET_URL =
  'https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records';

export interface IngestionCollision {
  incoming_title: string;
  incoming_start_time: string;
  existing_event_id: number;
  existing_title: string;
  existing_start_time: string;
  venue_id: number;
  editorial_date: string;
  time_diff_minutes: number;
}

export interface IngestionSummary {
  source: string;
  queried: number;
  candidates: number;
  inserted: number;
  skipped_duplicate: number;
  potential_collisions: IngestionCollision[];
  errors: string[];
}

export interface IngestedEventResult {
  id: number;
  title: string;
  editorial_date: string;
  start_time: string;
  venue_id: number;
  status: string;
}

/**
 * Elimina etiquetas HTML y decodifica entidades básicas
 */
export function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Extrae hora y minutos de cadenas libres de la fuente (p.ej. "20:30", "19:00 h.", "09:00h.")
 * Si no viene o no es reconocible, asigna por defecto 10:00:00 Europe/Madrid (evitando 00:00:00).
 */
export function parseTime(horaInicio: string | null | undefined): { hours: string; minutes: string; isDefault: boolean } {
  if (!horaInicio) {
    return { hours: '10', minutes: '00', isDefault: true };
  }
  const match = horaInicio.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return {
        hours: String(h).padStart(2, '0'),
        minutes: String(m).padStart(2, '0'),
        isDefault: false,
      };
    }
  }
  return { hours: '10', minutes: '00', isDefault: true };
}

/**
 * Obtiene el offset GMT/UTC aplicable a Europe/Madrid para una fecha dada ('+02:00' o '+01:00')
 */
export function getMadridOffsetString(dateStr: string): string {
  try {
    const refDate = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid',
      timeZoneName: 'longOffset',
    }).formatToParts(refDate);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart && tzPart.startsWith('GMT')) {
      return tzPart.replace('GMT', '');
    }
  } catch {
    // fallback
  }
  return '+01:00';
}

/**
 * Normaliza y analiza el precio textual
 */
export function parsePrice(precioStr: string | null | undefined): { priceCents: number; isFree: boolean } {
  if (!precioStr || precioStr.trim().length === 0) {
    return { priceCents: 0, isFree: true };
  }
  const lower = precioStr.toLowerCase().trim();
  if (lower.includes('gratuito') || lower.includes('gratuita') || lower.includes('libre')) {
    return { priceCents: 0, isFree: true };
  }
  const match = lower.match(/(\d+([.,]\d+)?)/);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    if (!Number.isNaN(num) && num > 0) {
      return { priceCents: Math.round(num * 100), isFree: false };
    }
  }
  return { priceCents: 0, isFree: false };
}

/**
 * Infiere la categoría del evento según temática, categoría y título de la Junta
 */
export function inferCategoryFromRecord(
  categoriaStr: string | null | undefined,
  tematicaStr: string | null | undefined,
  tituloStr: string | null | undefined
): EventCategory {
  const combined = `${categoriaStr || ''} ${tematicaStr || ''} ${tituloStr || ''}`.toLowerCase();

  if (
    combined.includes('teatro') ||
    combined.includes('títeres') ||
    combined.includes('titeres') ||
    combined.includes('danza') ||
    combined.includes('escénica') ||
    combined.includes('escenica')
  ) {
    return 'teatro';
  }
  if (
    combined.includes('concierto') ||
    combined.includes('música') ||
    combined.includes('musica') ||
    combined.includes('recital') ||
    combined.includes('acústico') ||
    combined.includes('acustico') ||
    combined.includes('orquesta') ||
    combined.includes('banda')
  ) {
    return 'musica_directo';
  }
  if (combined.includes('dj') || combined.includes('tardeo') || combined.includes('electrónica') || combined.includes('electronica')) {
    return 'dj_tardeo';
  }
  if (combined.includes('monólogo') || combined.includes('monologo') || combined.includes('comedia') || combined.includes('stand up')) {
    return 'monologo';
  }
  if (combined.includes('cine') || combined.includes('película') || combined.includes('pelicula') || combined.includes('proyección') || combined.includes('proyeccion')) {
    return 'cine';
  }
  if (combined.includes('exposición') || combined.includes('exposicion') || combined.includes('fotografía') || combined.includes('fotografia') || combined.includes('arte')) {
    return 'exposicion';
  }
  return 'cultura';
}

/**
 * Empareja el texto de lugar_celebracion con un venue existente en BD, o 9999 si no coincide
 */
export function matchVenue(
  lugarStr: string | null | undefined,
  venues: Array<{ id: number; name: string; slug: string }>
): number {
  if (!lugarStr || lugarStr.trim().length === 0) {
    return 9999;
  }
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim();

  const normTarget = normalize(lugarStr);

  for (const v of venues) {
    if (v.id === 9999) continue;
    const normName = normalize(v.name);
    const normSlug = normalize(v.slug);

    if (normTarget === normName || normTarget === normSlug) {
      return v.id;
    }
    if (normTarget.length >= 6 && normName.includes(normTarget)) {
      return v.id;
    }
    if (normName.length >= 6 && normTarget.includes(normName)) {
      return v.id;
    }
    // Comprobación de palabras clave representativas
    if (normTarget.includes('teatro principal') && normName.includes('teatro principal')) {
      return v.id;
    }
    if (normTarget.includes('universonoro') && normName.includes('universonoro')) {
      return v.id;
    }
  }

  return 9999;
}

/**
 * Calcula un hash SHA-256 idempotente y determinista
 */
export function computeSourceHash(sourceUrl: string, title: string, startTimeIso: string): string {
  const normTitle = title.trim().toLowerCase().replace(/\s+/g, ' ');
  const payload = `${sourceUrl.trim()}|${normTitle}|${startTimeIso}`;
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Valida si una URL de imagen es utilizable
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

/**
 * Consulta la API de la Agenda Cultural de Castilla y León con timeout de 10 segundos
 */
export async function fetchCulturalAgendaRecords(options: {
  municipality?: string;
  minDate?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ total_count: number; results: any[] }> {
  const municipality = options.municipality || 'Palencia';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  let whereClause = `nombre_localidad = '${municipality}'`;
  if (options.minDate) {
    whereClause += ` and fecha_inicio >= '${options.minDate}'`;
  }

  const url = new URL(CULTURAL_AGENDA_DATASET_URL);
  url.searchParams.set('where', whereClause);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('order_by', 'fecha_inicio asc');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error en API Junta de CyL (${res.status} ${res.statusText})`);
    }

    const data = await res.json();
    return {
      total_count: typeof data.total_count === 'number' ? data.total_count : data.results?.length || 0,
      results: Array.isArray(data.results) ? data.results : [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Servicio principal de Ingesta para la Agenda Cultural de CyL
 * - Filtra por Palencia
 * - Resuelve locales (venues) o contingent 9999
 * - Calcula fecha editorial explícitamente en Europe/Madrid
 * - Detecta y descarta duplicados exactos por source_hash
 * - Detecta posibles colisiones horarias en el mismo venue (±2h) y las reporta
 * - Inserta exclusivamente con status = 'tentative' y source_type = 'api'
 */
export async function ingestCulturalAgenda(options: {
  minDate?: string;
  limit?: number;
} = {}): Promise<{
  summary: IngestionSummary;
  inserted_events: IngestedEventResult[];
}> {
  const summary: IngestionSummary = {
    source: 'Junta de Castilla y León - Agenda Cultural (Palencia)',
    queried: 0,
    candidates: 0,
    inserted: 0,
    skipped_duplicate: 0,
    potential_collisions: [],
    errors: [],
  };

  const inserted_events: IngestedEventResult[] = [];

  // 1. Cargar catálogo de locales para emparejamiento
  const venuesRes = await query(`SELECT id, name, slug FROM venues WHERE city_id = 1 AND is_active = true;`);
  const venues = venuesRes.rows.map((v) => ({
    id: Number(v.id),
    name: String(v.name),
    slug: String(v.slug),
  }));

  // 2. Consultar dataset público
  let fetchResult: { total_count: number; results: any[] };
  try {
    fetchResult = await fetchCulturalAgendaRecords({
      municipality: 'Palencia',
      minDate: options.minDate,
      limit: options.limit || 100,
    });
    summary.queried = fetchResult.total_count;
    summary.candidates = fetchResult.results.length;
  } catch (err: any) {
    const msg = `Fallo al consultar la fuente de datos: ${err.message}`;
    summary.errors.push(msg);
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'ingestion',
        message: msg,
      })
    );
    return { summary, inserted_events };
  }

  // 3. Procesar cada registro candidato
  for (const record of fetchResult.results) {
    try {
      const rawTitle = record.titulo?.trim();
      if (!rawTitle || rawTitle.length < 3) {
        summary.errors.push(`Evento descartado: sin título válido (id: ${record.id_evento || 'desconocido'})`);
        continue;
      }

      const dateStr = record.fecha_inicio;
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        summary.errors.push(`Evento descartado: fecha de inicio no válida '${dateStr}' (${rawTitle})`);
        continue;
      }

      // Horario y Timestamp con Offset de Madrid
      const timeParsed = parseTime(record.hora_inicio);
      const offset = getMadridOffsetString(dateStr);
      const startTimeIso = new Date(`${dateStr}T${timeParsed.hours}:${timeParsed.minutes}:00${offset}`).toISOString();
      const editorialDate = computeEditorialDate(startTimeIso);

      // Resolución de Venue
      const venueId = matchVenue(record.lugar_celebracion, venues);

      // Source URL y Hash
      const sourceUrl =
        (record.enlace_contenido && String(record.enlace_contenido).trim()) ||
        `https://cultura.jcyl.es/evento/${record.id_evento || ''}`;
      const sourceHash = computeSourceHash(sourceUrl, rawTitle, startTimeIso);

      // 4. Verificación de duplicado exacto por source_hash
      const dupCheck = await query(`SELECT id FROM events WHERE source_hash = $1 LIMIT 1;`, [sourceHash]);
      if (dupCheck.rows.length > 0) {
        summary.skipped_duplicate++;
        continue;
      }

      // 5. Detección de colisión horaria (mismo venue_id !== 9999, misma editorial_date, ±2 horas)
      if (venueId !== 9999) {
        const collisionCheck = await query(
          `SELECT id, title, start_time
           FROM events
           WHERE venue_id = $1
             AND editorial_date = $2
             AND status NOT IN ('cancelled', 'duplicate')
             AND ABS(EXTRACT(EPOCH FROM (start_time - $3::timestamptz))) <= 7200;`,
          [venueId, editorialDate, startTimeIso]
        );

        for (const cRow of collisionCheck.rows) {
          const existingStart = new Date(cRow.start_time).toISOString();
          const diffSeconds = Math.abs((new Date(startTimeIso).getTime() - new Date(existingStart).getTime()) / 1000);
          const diffMinutes = Math.round(diffSeconds / 60);

          const collision: IngestionCollision = {
            incoming_title: rawTitle,
            incoming_start_time: startTimeIso,
            existing_event_id: Number(cRow.id),
            existing_title: String(cRow.title),
            existing_start_time: existingStart,
            venue_id: venueId,
            editorial_date: editorialDate,
            time_diff_minutes: diffMinutes,
          };

          summary.potential_collisions.push(collision);

          console.warn(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'warn',
              service: 'ingestion',
              message: `Posible colisión horaria detectada con evento existente ${cRow.id}`,
              collision,
            })
          );
        }
      }

      // 6. Preparación de campos restantes
      const description = stripHtml(record.descripcion);
      const category = inferCategoryFromRecord(record.categoria, record.tematica, rawTitle);
      const priceParsed = parsePrice(record.precio);
      const imageUrl = sanitizeImageUrl(record.imagen_evento);
      const dedupeKey = `palencia-v${venueId}-${editorialDate}-${rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 35)}`;

      // 7. Inserción con status = 'tentative' y source_type = 'api'
      const insertSql = `
        INSERT INTO events (
          city_id, venue_id, title, description, category,
          start_time, editorial_date, price_cents, is_free,
          image_url, source_type, source_url, source_hash, dedupe_key,
          status, created_at, updated_at
        )
        VALUES (
          1, $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, 'api', $10, $11, $12,
          'tentative', now(), now()
        )
        RETURNING id, title, editorial_date, start_time, venue_id, status;
      `;

      const insertRes = await query(insertSql, [
        venueId,
        rawTitle.slice(0, 200),
        description,
        category,
        startTimeIso,
        editorialDate,
        priceParsed.priceCents,
        priceParsed.isFree,
        imageUrl,
        sourceUrl,
        sourceHash,
        dedupeKey,
      ]);

      const insertedRow = insertRes.rows[0];
      summary.inserted++;
      inserted_events.push({
        id: Number(insertedRow.id),
        title: String(insertedRow.title),
        editorial_date: typeof insertedRow.editorial_date === 'string'
          ? insertedRow.editorial_date
          : new Date(insertedRow.editorial_date).toISOString().split('T')[0],
        start_time: new Date(insertedRow.start_time).toISOString(),
        venue_id: Number(insertedRow.venue_id),
        status: String(insertedRow.status),
      });
    } catch (itemErr: any) {
      const errDetail = `Error procesando evento '${record.titulo || record.id_evento}': ${itemErr.message}`;
      summary.errors.push(errDetail);
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'ingestion',
          message: errDetail,
        })
      );
    }
  }

  return { summary, inserted_events };
}
