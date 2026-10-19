import { createHash } from 'crypto';
import { query } from '@vayaplan/db';
import type { JcylApiResponse, JcylRecordRaw, NormalizedJcylEvent } from './jcyl-types';
import { normalizeJcylRecord } from './jcyl-normalizer';

const JCYL_API_BASE =
  'https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records';

/**
 * Calcula un hash criptográfico determinista del contenido normalizado de un evento.
 * Se utiliza para detectar con precisión si un borrador ha recibido modificaciones
 * manuales de un editor humano o si permanece idéntico a la versión importada.
 */
export function computeEventContentHash(fields: {
  title: string;
  description?: string | null;
  category: string;
  timeStatus: string;
  startTimeIso?: string | null;
  endTimeIso?: string | null;
  editorialDate: string;
  endDate?: string | null;
  scheduleText?: string | null;
  priceCents: number;
  isFree: boolean;
  venueId?: number | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
}): string {
  const normalized = {
    title: (fields.title || '').trim(),
    description: (fields.description || '').trim(),
    category: fields.category,
    timeStatus: fields.timeStatus,
    startTimeIso: fields.startTimeIso || null,
    endTimeIso: fields.endTimeIso || null,
    editorialDate: fields.editorialDate,
    endDate: fields.endDate || null,
    scheduleText: fields.scheduleText || null,
    priceCents: fields.priceCents,
    isFree: fields.isFree,
    venueId: fields.venueId || null,
    sourceUrl: fields.sourceUrl || null,
    imageUrl: fields.imageUrl || null,
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export interface SyncOptions {
  dryRun?: boolean;
  cityId?: number;
  limit?: number;
  fetchFn?: typeof fetch;
}

export interface SyncResult {
  dryRun: boolean;
  timestamp: string;
  totalApiRecords: number;
  libraryCandidates: number;
  inserted: number;
  updated: number;
  preservedEditorial: number;
  events: NormalizedJcylEvent[];
  errors: string[];
}

/**
 * Consulta registros oficiales desde la API de Datos Abiertos de la JCyL
 */
export async function fetchJcylPalenciaRecords(
  limit = 50,
  customFetch: typeof fetch = fetch
): Promise<JcylRecordRaw[]> {
  const url = `${JCYL_API_BASE}?where=nombre_localidad%3D%27Palencia%27&order_by=fecha_inicio%20asc&limit=${limit}`;

  const response = await customFetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'VayaPlan-Agenda-Sync/1.0 (https://vayaplan.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`Error en API Datos Abiertos JCyL: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as JcylApiResponse;
  return data.results || [];
}

/**
 * Busca el venue censado de la Biblioteca Pública de Palencia por su slug canónico.
 * Por política de seguridad censal, NO crea registros de locales automáticamente bajo ninguna circunstancia.
 */
export async function findLibraryVenue(cityId: number): Promise<number | null> {
  const findRes = await query<{ id: number }>(
    `SELECT id FROM venues WHERE city_id = $1 AND slug = 'biblioteca-publica-de-palencia' LIMIT 1;`,
    [cityId]
  );

  if (findRes.rows.length > 0) {
    return findRes.rows[0].id;
  }

  return null;
}

/**
 * Alias de compatibilidad hacia findLibraryVenue. No inserta locales.
 */
export async function ensureLibraryVenue(cityId: number): Promise<number | null> {
  return findLibraryVenue(cityId);
}

/**
 * Sincroniza actividades culturales de la Biblioteca Pública de Palencia hacia borradores
 */
export async function syncJcylLibraryActivities(options: SyncOptions = {}): Promise<SyncResult> {
  const dryRun = options.dryRun ?? true;
  const cityId = options.cityId || 1;
  const limit = options.limit || 50;
  const customFetch = options.fetchFn || fetch;

  const result: SyncResult = {
    dryRun,
    timestamp: new Date().toISOString(),
    totalApiRecords: 0,
    libraryCandidates: 0,
    inserted: 0,
    updated: 0,
    preservedEditorial: 0,
    events: [],
    errors: [],
  };

  let rawRecords: JcylRecordRaw[] = [];
  try {
    rawRecords = await fetchJcylPalenciaRecords(limit, customFetch);
    result.totalApiRecords = rawRecords.length;
  } catch (err: any) {
    result.errors.push(`Fallo al consultar la API de JCyL: ${err.message}`);
    return result;
  }

  // Filtrar estrictamente actividades de la Biblioteca Pública de Palencia
  const normalizedList = rawRecords
    .map(normalizeJcylRecord)
    .filter((e) => e.isLibrary);

  result.libraryCandidates = normalizedList.length;
  result.events = normalizedList;

  // El modo dry-run retorna antes de cualquier acceso a base de datos:
  // cero escrituras y cero acceso a base de datos. No ejecuta SELECT, INSERT, UPDATE, BEGIN ni ROLLBACK.
  if (dryRun) {
    return result;
  }

  // Si no es dry-run, buscar el venue censado de la Biblioteca Pública
  const libraryVenueId = await findLibraryVenue(cityId);
  if (!libraryVenueId) {
    result.errors.push(
      'El recinto Biblioteca Pública de Palencia no está censado en la base de datos. Debe ser dado de alta mediante migración censal autorizada antes de sincronizar eventos.'
    );
    return result;
  }

  for (const item of normalizedList) {
    try {
      // 1. Comprobar si ya existe por su dedupeKey estable
      const existingRes = await query<{
        id: number;
        title: string;
        description: string | null;
        category: string;
        time_status: string;
        start_time: string | null;
        end_time: string | null;
        editorial_date: string;
        end_date: string | null;
        schedule_text: string | null;
        price_cents: number;
        is_free: boolean;
        venue_id: number | null;
        source_url: string | null;
        image_url: string | null;
        status: string;
        verified_at: string | null;
        source_hash: string | null;
      }>(
        `SELECT id, venue_id, title, description, category, time_status, start_time, end_time,
                editorial_date, end_date, schedule_text, price_cents, is_free,
                venue_id, source_url, image_url,
                status, verified_at, source_hash
         FROM events
         WHERE city_id = $1 AND dedupe_key = $2
         LIMIT 1;`,
        [cityId, item.dedupeKey]
      );

      const incomingHash = computeEventContentHash({
        ...item,
        venueId: libraryVenueId,
      });

      if (existingRes.rows.length === 0) {
        // Insertar nuevo borrador (status = 'tentative') registrando su source_hash.
        // Política de imágenes: image_url público permanece estrictamente NULL para usar fallback
        // de marca/categoría sin publicar imágenes externas ni usarlas en og:image.
        // Se preserva la URL externa únicamente en image_original_url para revisión editorial en /admin.
        await query(
          `INSERT INTO events (
             city_id, venue_id, title, description, category,
             time_status, start_time, end_time, editorial_date, end_date,
             schedule_text, price_cents, is_free, image_url, image_original_url, status,
             source_type, source_url, source_hash, dedupe_key, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10,
             $11, $12, $13, NULL, $14, 'tentative',
             'api', $15, $16, $17, now(), now()
           );`,
          [
            cityId,
            libraryVenueId,
            item.title,
            item.description,
            item.category,
            item.timeStatus,
            item.startTimeIso,
            item.endTimeIso,
            item.editorialDate,
            item.endDate,
            item.scheduleText,
            item.priceCents,
            item.isFree,
            item.imageUrl,
            item.sourceUrl,
            incomingHash,
            item.dedupeKey,
          ]
        );
        result.inserted++;
      } else {
        const existing = existingRes.rows[0];

        // Regla 1: Si ya fue verificado o publicado, jamás se sobrescribe
        if (existing.verified_at !== null || existing.status !== 'tentative') {
          result.preservedEditorial++;
          continue;
        }

        // Regla 2: Comprobar si el borrador fue modificado manualmente por un editor humano.
        // Se calcula el hash del contenido actual en base de datos cubriendo todos los campos overwritable.
        const currentDbHash = computeEventContentHash({
          title: existing.title,
          description: existing.description,
          category: existing.category,
          timeStatus: existing.time_status,
          startTimeIso: existing.start_time ? new Date(existing.start_time).toISOString() : null,
          endTimeIso: existing.end_time ? new Date(existing.end_time).toISOString() : null,
          editorialDate: existing.editorial_date,
          endDate: existing.end_date,
          scheduleText: existing.schedule_text,
          priceCents: existing.price_cents,
          isFree: existing.is_free,
          venueId: existing.venue_id,
          sourceUrl: existing.source_url,
          imageUrl: existing.image_url || existing.image_original_url,
        });

        // Si existe un source_hash anterior y difiere del contenido actual de la BD,
        // significa que un humano editó el borrador. Se preserva y no se altera.
        const isHumanEdited = Boolean(existing.source_hash && existing.source_hash !== currentDbHash);
        if (isHumanEdited) {
          result.preservedEditorial++;
          continue;
        }

        // Regla 3: Si no ha sido editado por humanos y el feed entrante es idéntico, es idempotente (no-op)
        if (currentDbHash === incomingHash) {
          continue;
        }

        // Regla 4: Si no fue editado por humanos y el feed oficial actualizó datos, se actualiza el borrador.
        // Se conserva image_url en NULL y se refresca image_original_url con la URL de origen.
        await query(
          `UPDATE events SET
             venue_id = $1,
             title = $2,
             description = $3,
             category = $4,
             time_status = $5,
             start_time = $6,
             end_time = $7,
             editorial_date = $8,
             end_date = $9,
             schedule_text = $10,
             price_cents = $11,
             is_free = $12,
             image_original_url = $13,
             source_url = $14,
             source_hash = $15,
             updated_at = now()
           WHERE id = $16;`,
          [
            libraryVenueId,
            item.title,
            item.description,
            item.category,
            item.timeStatus,
            item.startTimeIso,
            item.endTimeIso,
            item.editorialDate,
            item.endDate,
            item.scheduleText,
            item.priceCents,
            item.isFree,
            item.imageUrl,
            item.sourceUrl,
            incomingHash,
            existing.id,
          ]
        );
        result.updated++;
      }
    } catch (dbErr: any) {
      result.errors.push(`Error al sincronizar evento ${item.dedupeKey}: ${dbErr.message}`);
    }
  }

  return result;
}
