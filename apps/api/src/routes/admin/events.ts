import { Hono } from 'hono';
import { query, getClient } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import { ingestCulturalAgenda } from '../../services/ingestion';
import {
  VALID_EVENT_CATEGORIES,
  VALID_EVENT_SOURCES,
  VALID_EVENT_STATUSES,
  isValidDateString,
  getCurrentDateInTimezone,
} from '@vayaplan/shared';
import type { AdminEventItem, AdminUser, EventCategory, EventSourceType, EventStatus, EventTimeStatus, FestivalSummary } from '@vayaplan/types';
import { hasImageVariantsColumns } from '../../services/image-storage';

export const VALID_EVENT_TIME_STATUSES: readonly EventTimeStatus[] = [
  'confirmed',
  'pending_time',
  'tentative_date',
  'continuous',
];

export const adminEventsRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();

// Proteger todas las rutas administrativas de eventos
adminEventsRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/festivals
 * Lista los festivales / programas marco para selector en el formulario
 */
adminEventsRoutes.get('/festivals', async (c) => {
  const result = await query(
    `SELECT id, city_id, name, edition, slug, description, start_date, end_date, official_url, is_active
     FROM festivals
     WHERE city_id = 1
     ORDER BY is_active DESC, start_date ASC;`
  );
  return c.json({ festivals: result.rows });
});

/**
 * POST /api/v1/admin/festivals
 * Crea un nuevo festival o programa marco desde el panel
 */
adminEventsRoutes.post('/festivals', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }
  const name = body.name?.trim();
  const edition = body.edition?.trim() || null;
  const startDate = body.start_date?.trim();
  const endDate = body.end_date?.trim();
  const officialUrl = body.official_url?.trim() || null;
  const description = body.description?.trim() || null;
  if (!name || name.length < 3) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre del programa marco debe tener al menos 3 caracteres.' }, 400);
  }
  if (!startDate || !isValidDateString(startDate) || !endDate || !isValidDateString(endDate)) {
    return c.json({ error: 'invalid_parameter', message: 'Fechas de inicio y fin válidas obligatorias (YYYY-MM-DD).' }, 400);
  }
  if (endDate < startDate) {
    return c.json({ error: 'invalid_parameter', message: 'La fecha de fin no puede ser anterior a la de inicio.' }, 400);
  }
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `festival-${Date.now()}`;

  const existing = await query(
    `SELECT id FROM festivals WHERE city_id = 1 AND slug = $1 LIMIT 1;`,
    [slug]
  );
  if (existing.rows.length > 0) {
    return c.json({
      error: 'festival_already_exists',
      message: `Ya existe un festival o programa marco con el identificador (slug) '${slug}' en esta ciudad.`,
    }, 409);
  }

  try {
    const res = await query(
      `INSERT INTO festivals (city_id, name, edition, slug, description, start_date, end_date, official_url, is_active)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, name, edition, slug, start_date, end_date, official_url, is_active;`,
      [name, edition, slug, description, startDate, endDate, officialUrl]
    );
    return c.json({ status: 'ok', festival: res.rows[0] }, 201);
  } catch (err: any) {
    if (err?.code === '23505') {
      return c.json({
        error: 'festival_already_exists',
        message: `Ya existe un festival o programa marco con el identificador (slug) '${slug}' en esta ciudad.`,
      }, 409);
    }
    throw err;
  }
});

/**
 * GET /api/v1/admin/events
 * Lista todos los eventos para el panel de curación con filtros por estado, categoría, búsqueda por texto, fecha y local
 */
adminEventsRoutes.get('/events', async (c) => {
  const statusFilter = c.req.query('status')?.trim();
  const dateFilter = c.req.query('date')?.trim();
  const venueIdFilter = c.req.query('venue_id')?.trim();
  const hasCollision = c.req.query('has_collision')?.trim() === 'true';
  const categoryFilter = c.req.query('category')?.trim()?.toLowerCase();
  const searchFilter = c.req.query('q')?.trim();
  const pageParam = Number(c.req.query('page'));
  const limitParam = Number(c.req.query('limit'));
  const page = !Number.isNaN(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit = !Number.isNaN(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 200;
  const offset = (page - 1) * limit;

  const queryParams: any[] = [];
  const whereClauses: string[] = ['1=1'];

  if (statusFilter === 'draft' || statusFilter === 'tentative') {
    whereClauses.push(`e.status IN ('draft', 'tentative')`);
  } else if (statusFilter && VALID_EVENT_STATUSES.includes(statusFilter as EventStatus)) {
    queryParams.push(statusFilter);
    whereClauses.push(`e.status = $${queryParams.length}`);
  }

  if (dateFilter && isValidDateString(dateFilter)) {
    queryParams.push(dateFilter);
    whereClauses.push(`e.editorial_date = $${queryParams.length}`);
  }

  if (venueIdFilter === 'unassigned' || venueIdFilter === 'null' || venueIdFilter === '9999') {
    whereClauses.push(`(e.venue_id IS NULL OR e.venue_id = 9999)`);
  } else if (venueIdFilter && !Number.isNaN(Number(venueIdFilter))) {
    queryParams.push(Number(venueIdFilter));
    whereClauses.push(`e.venue_id = $${queryParams.length}`);
  }

  // Filtro por tipo de actividad / categoría
  if (categoryFilter) {
    if (categoryFilter === 'deporte') {
      whereClauses.push(`e.category IN ('baloncesto', 'futbol', 'rugby', 'deporte')`);
    } else if (categoryFilter === 'musica') {
      whereClauses.push(`e.category IN ('musica_directo', 'dj_tardeo', 'musica')`);
    } else if (categoryFilter === 'cultura') {
      whereClauses.push(`e.category IN ('cultura', 'teatro', 'exposicion', 'monologo', 'conferencia')`);
    } else if (categoryFilter === 'gastronomia') {
      whereClauses.push(`e.category IN ('gastronomia', 'cata')`);
    } else if (categoryFilter === 'familia') {
      whereClauses.push(`e.category IN ('familia', 'infantil')`);
    } else if (categoryFilter === 'ocio') {
      whereClauses.push(`e.category IN ('ocio', 'dj_tardeo')`);
    } else if (categoryFilter === 'otros') {
      whereClauses.push(`e.category NOT IN ('musica_directo', 'dj_tardeo', 'baloncesto', 'futbol', 'rugby', 'deporte', 'cultura', 'teatro', 'exposicion', 'monologo', 'cine', 'conferencia')`);
    } else if (VALID_EVENT_CATEGORIES.includes(categoryFilter as EventCategory)) {
      queryParams.push(categoryFilter);
      whereClauses.push(`e.category = $${queryParams.length}`);
    }
  }

  // Búsqueda insensible a mayúsculas multi-término
  if (searchFilter) {
    const qClean = searchFilter.slice(0, 100).trim();
    if (qClean) {
      const tokens = qClean.split(/\s+/).filter(Boolean).slice(0, 5);
      for (const token of tokens) {
        queryParams.push(`%${token}%`);
        const pIdx = queryParams.length;
        whereClauses.push(`(
          e.title ILIKE $${pIdx} OR 
          v.name ILIKE $${pIdx} OR 
          e.category ILIKE $${pIdx} OR 
          EXISTS (
            SELECT 1 FROM event_festivals ef 
            INNER JOIN festivals f ON ef.festival_id = f.id 
            WHERE ef.event_id = e.id AND f.name ILIKE $${pIdx}
          )
        )`);
      }
    }
  }

  if (hasCollision) {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM events c
      WHERE c.venue_id = e.venue_id
        AND c.editorial_date = e.editorial_date
        AND c.id != e.id
        AND c.status NOT IN ('cancelled', 'duplicate')
        AND e.venue_id IS NOT NULL
        AND e.venue_id != 9999
        AND e.start_time IS NOT NULL
        AND c.start_time IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (c.start_time - e.start_time))) <= 7200
    )`);
  }

  const whereSql = whereClauses.join(' AND ');

  // Conteo total para paginación
  const countRes = await query(
    `SELECT count(DISTINCT e.id) AS total
     FROM events e
     LEFT JOIN venues v ON e.venue_id = v.id
     WHERE ${whereSql}`,
    queryParams
  );
  const totalCount = Number(countRes.rows[0]?.total || 0);

  // Orden cronológico
  let orderSql = '';
  if (statusFilter === 'tentative' || statusFilter === 'draft') {
    orderSql = `ORDER BY e.start_time ASC NULLS LAST, e.id ASC`;
  } else {
    orderSql = `ORDER BY CASE WHEN e.status IN ('tentative', 'draft') THEN 0 ELSE 1 END ASC, e.editorial_date DESC, e.start_time ASC NULLS LAST`;
  }

  const paginationParams = [...queryParams];
  paginationParams.push(limit);
  paginationParams.push(offset);
  const limitIdx = paginationParams.length - 1;
  const offsetIdx = paginationParams.length;

  const selectSql = `
    SELECT 
      e.*,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.zone AS venue_zone,
      v.category AS venue_category,
      v.address AS venue_address,
      p.id AS promotion_id,
      (
        SELECT json_build_object(
          'colliding_event_id', c.id,
          'colliding_title', c.title,
          'colliding_start_time', c.start_time,
          'diff_minutes', ROUND(ABS(EXTRACT(EPOCH FROM (c.start_time - e.start_time))) / 60)
        )
        FROM events c
        WHERE c.venue_id = e.venue_id
          AND c.editorial_date = e.editorial_date
          AND c.id != e.id
          AND c.status NOT IN ('cancelled', 'duplicate')
          AND e.venue_id IS NOT NULL
          AND e.venue_id != 9999
          AND e.start_time IS NOT NULL
          AND c.start_time IS NOT NULL
          AND ABS(EXTRACT(EPOCH FROM (c.start_time - e.start_time))) <= 7200
        LIMIT 1
      ) AS collision_alert,
      (
        SELECT json_agg(json_build_object(
          'id', f.id,
          'name', f.name,
          'edition', f.edition,
          'slug', f.slug,
          'official_url', f.official_url
        ))
        FROM event_festivals ef
        INNER JOIN festivals f ON ef.festival_id = f.id
        WHERE ef.event_id = e.id
      ) AS festivals_json
    FROM events e
    LEFT JOIN venues v ON e.venue_id = v.id
    LEFT JOIN promotions p ON p.event_id = e.id AND p.status = 'active'
    WHERE ${whereSql}
    ${orderSql}
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const result = await query(selectSql, paginationParams);

  const events: AdminEventItem[] = result.rows.map((row) => ({
    id: Number(row.id),
    city_id: Number(row.city_id),
    venue_id: row.venue_id !== null && row.venue_id !== undefined ? Number(row.venue_id) : null,
    title: row.title,
    description: row.description,
    category: row.category,
    start_time: row.start_time ? new Date(row.start_time).toISOString() : null,
    end_time: row.end_time ? new Date(row.end_time).toISOString() : null,
    editorial_date: typeof row.editorial_date === 'string'
      ? row.editorial_date
      : new Date(row.editorial_date).toISOString().split('T')[0],
    time_status: (row.time_status as EventTimeStatus) || 'confirmed',
    end_date: row.end_date || null,
    schedule_text: row.schedule_text || null,
    approximate_schedule: row.approximate_schedule || null,
    price_cents: Number(row.price_cents),
    is_free: Boolean(row.is_free),
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url || row.image_url,
    image_original_url: row.image_original_url || row.image_url,
    source_type: row.source_type,
    source_url: row.source_url,
    source_hash: row.source_hash,
    dedupe_key: row.dedupe_key,
    status: row.status,
    verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    verified_by: row.verified_by,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    venue_name: row.venue_name || null,
    venue_slug: row.venue_slug || null,
    venue_zone: row.venue_zone || null,
    venue_category: row.venue_category || null,
    venue_address: row.venue_address || null,
    promotion_id: row.promotion_id ? Number(row.promotion_id) : null,
    collision_alert: row.collision_alert || null,
    festivals: row.festivals_json || [],
    festival_ids: (row.festivals_json || []).map((f: any) => Number(f.id)),
  }));

  return c.json({
    total: totalCount,
    events,
    pagination: {
      page,
      limit,
      total: totalCount,
      total_pages: Math.ceil(totalCount / limit) || 1,
    },
  });
});

/**
 * GET /api/v1/admin/events/:id
 * Consulta el detalle administrativo de un evento
 */
adminEventsRoutes.get('/events/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de evento inválido.' }, 400);
  }

  const sql = `
    SELECT 
      e.*,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.zone AS venue_zone,
      v.category AS venue_category,
      v.address AS venue_address,
      p.id AS promotion_id,
      (
        SELECT json_build_object(
          'colliding_event_id', c.id,
          'colliding_title', c.title,
          'colliding_start_time', c.start_time,
          'diff_minutes', ROUND(ABS(EXTRACT(EPOCH FROM (c.start_time - e.start_time))) / 60)
        )
        FROM events c
        WHERE c.venue_id = e.venue_id
          AND c.editorial_date = e.editorial_date
          AND c.id != e.id
          AND c.status NOT IN ('cancelled', 'duplicate')
          AND e.venue_id IS NOT NULL
          AND e.venue_id != 9999
          AND ABS(EXTRACT(EPOCH FROM (c.start_time - e.start_time))) <= 7200
        LIMIT 1
      ) AS collision_alert
    FROM events e
    LEFT JOIN venues v ON e.venue_id = v.id
    LEFT JOIN promotions p ON p.event_id = e.id AND p.status = 'active'
    WHERE e.id = $1
    LIMIT 1;
  `;

  const result = await query(sql, [id]);
  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento con ID ${id} no encontrado.` }, 404);
  }

  const row = result.rows[0];

  // Consultar festivales asociados en event_festivals
  const festRes = await query(
    `SELECT f.id, f.name, f.edition, f.slug, f.official_url
     FROM event_festivals ef
     INNER JOIN festivals f ON ef.festival_id = f.id
     WHERE ef.event_id = $1
     ORDER BY f.name ASC;`,
    [id]
  );
  const festivals: FestivalSummary[] = festRes.rows.map((f: any) => ({
    id: Number(f.id),
    name: f.name,
    edition: f.edition || null,
    slug: f.slug,
    official_url: f.official_url || null,
  }));
  const festivalIds: number[] = festivals.map((f) => f.id);

  const event: AdminEventItem = {
    id: Number(row.id),
    city_id: Number(row.city_id),
    venue_id: row.venue_id !== null && row.venue_id !== undefined ? Number(row.venue_id) : null,
    title: row.title,
    description: row.description,
    category: row.category,
    start_time: row.start_time ? new Date(row.start_time).toISOString() : null,
    end_time: row.end_time ? new Date(row.end_time).toISOString() : null,
    editorial_date: typeof row.editorial_date === 'string'
      ? row.editorial_date
      : new Date(row.editorial_date).toISOString().split('T')[0],
    time_status: (row.time_status as EventTimeStatus) || 'confirmed',
    end_date: row.end_date || null,
    schedule_text: row.schedule_text || null,
    approximate_schedule: row.approximate_schedule || null,
    price_cents: Number(row.price_cents),
    is_free: Boolean(row.is_free),
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url || row.image_url,
    image_original_url: row.image_original_url || row.image_url,
    source_type: row.source_type,
    source_url: row.source_url,
    source_hash: row.source_hash,
    dedupe_key: row.dedupe_key,
    status: row.status,
    verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    verified_by: row.verified_by,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    venue_name: row.venue_name || null,
    venue_slug: row.venue_slug || null,
    venue_zone: row.venue_zone || null,
    venue_category: row.venue_category || null,
    venue_address: row.venue_address || null,
    promotion_id: row.promotion_id ? Number(row.promotion_id) : null,
    collision_alert: row.collision_alert || null,
    festivals,
    festival_ids: festivalIds,
  };

  return c.json({ event });
});

/**
 * POST /api/v1/admin/events
 * Crear un nuevo evento desde el panel de administración
 */
adminEventsRoutes.post('/events', async (c) => {
  const admin = c.get('user') as AdminUser;
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const cityId = Number(body.city_id || 1);
  const venueId = Number(body.venue_id);
  const title = body.title?.trim();
  const category = body.category as EventCategory;
  const timeStatus = (body.time_status as EventTimeStatus) || 'confirmed';
  const startTime = timeStatus === 'confirmed' ? (body.start_time || null) : null;
  const endTime = timeStatus === 'confirmed' ? (body.end_time || null) : null;
  const editorialDate = body.editorial_date?.trim() || (body.start_time ? body.start_time.split('T')[0] : null);
  const endDate = body.end_date?.trim() || null;
  const scheduleText = body.schedule_text?.trim() || null;
  const approximateSchedule = body.approximate_schedule?.trim() || null;
  const priceCents = Number(body.price_cents || 0);
  const isFree = body.is_free !== undefined ? Boolean(body.is_free) : priceCents === 0;
  const description = body.description?.trim() || null;
  const imageUrl = body.image_url?.trim() || null;
  const imageThumbUrl = body.image_thumb_url?.trim() || null;
  const imageOriginalUrl = body.image_original_url?.trim() || null;
  const sourceType = (body.source_type as EventSourceType) || 'manual';
  const sourceUrl = body.source_url?.trim() || null;
  const status = (body.status as EventStatus) || 'published';
  const festivalIds: number[] = Array.isArray(body.festival_ids)
    ? body.festival_ids.map(Number).filter((n: number) => !Number.isNaN(n) && n > 0)
    : [];

  // Validaciones
  if (body.time_status !== undefined && !VALID_EVENT_TIME_STATUSES.includes(body.time_status)) {
    return c.json({
      error: 'invalid_parameter',
      message: `Estado temporal (time_status) inválido: '${body.time_status}'. Valores permitidos: ${VALID_EVENT_TIME_STATUSES.join(', ')}`,
    }, 400);
  }
  if (!title || title.length < 3) {
    return c.json({ error: 'invalid_parameter', message: 'El título es obligatorio (mínimo 3 caracteres).' }, 400);
  }
  if (!venueId || Number.isNaN(venueId) || venueId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'El local (venue_id) es obligatorio.' }, 400);
  }
  if (!category || !VALID_EVENT_CATEGORIES.includes(category)) {
    return c.json({ error: 'invalid_parameter', message: `Categoría inválida. Valores: ${VALID_EVENT_CATEGORIES.join(', ')}` }, 400);
  }
  if (timeStatus === 'confirmed' && !startTime) {
    return c.json({ error: 'invalid_parameter', message: 'La hora de inicio (start_time) es obligatoria para eventos confirmados.' }, 400);
  }
  if (timeStatus === 'tentative_date' && status === 'published') {
    return c.json({ error: 'tentative_date_cannot_be_published', message: 'Un evento con fecha orientativa o tentativa no puede publicarse directamente a la agenda pública.' }, 400);
  }
  if (timeStatus === 'continuous' && status === 'published' && !endDate) {
    return c.json({ error: 'continuous_end_date_required', message: 'Para publicar una exposición continuada es obligatorio indicar la fecha final de periodo.' }, 400);
  }
  if (!editorialDate || !isValidDateString(editorialDate)) {
    return c.json({ error: 'invalid_parameter', message: 'La fecha editorial debe tener formato YYYY-MM-DD.' }, 400);
  }
  if (endDate && !isValidDateString(endDate)) {
    return c.json({ error: 'invalid_parameter', message: 'La fecha final de periodo debe tener formato YYYY-MM-DD.' }, 400);
  }
  if (endDate && editorialDate && endDate < editorialDate) {
    return c.json({ error: 'invalid_parameter', message: 'La fecha final de periodo no puede ser anterior a la de inicio.' }, 400);
  }

  // Generar dedupe_key básico
  const dedupeKey = `palencia-${venueId}-${editorialDate}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;

  const hasVariants = await hasImageVariantsColumns();
  const insertCols = hasVariants
    ? `city_id, venue_id, title, description, category,
       time_status, start_time, end_time, editorial_date, end_date, schedule_text, approximate_schedule,
       price_cents, is_free, image_url, image_thumb_url, image_original_url,
       source_type, source_url, dedupe_key, status, verified_at, verified_by, created_at, updated_at`
    : `city_id, venue_id, title, description, category,
       time_status, start_time, end_time, editorial_date, end_date, schedule_text, approximate_schedule,
       price_cents, is_free, image_url, source_type, source_url, dedupe_key,
       status, verified_at, verified_by, created_at, updated_at`;

  const insertVals = hasVariants
    ? `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), $22, now(), now()`
    : `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), $20, now(), now()`;

  const insertParams: any[] = [
    cityId,
    venueId,
    title,
    description,
    category,
    timeStatus,
    startTime,
    endTime,
    editorialDate,
    endDate,
    scheduleText,
    approximateSchedule,
    priceCents,
    isFree,
    imageUrl,
  ];

  if (hasVariants) {
    insertParams.push(imageThumbUrl, imageOriginalUrl);
  }

  insertParams.push(sourceType, sourceUrl, dedupeKey, status, admin?.email || 'Curador');

  const insertSql = `
    INSERT INTO events (${insertCols})
    VALUES (${insertVals})
    RETURNING id;
  `;

  const result = await query(insertSql, insertParams);
  const newEventId = Number(result.rows[0].id);

  // Asociar a festivales N:M si corresponde
  if (festivalIds.length > 0) {
    for (const fId of festivalIds) {
      await query(
        `INSERT INTO event_festivals (event_id, festival_id)
         VALUES ($1, $2)
         ON CONFLICT (event_id, festival_id) DO NOTHING;`,
        [newEventId, fId]
      );
    }
  }

  return c.json({ status: 'ok', event_id: newEventId }, 201);
});

/**
 * POST /api/v1/admin/events/draft
 * Crear un borrador rápido con status 'tentative' (según contrato docs/02-data-model.md)
 */
adminEventsRoutes.post('/events/draft', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  if (body.time_status !== undefined && !VALID_EVENT_TIME_STATUSES.includes(body.time_status)) {
    return c.json({
      error: 'invalid_parameter',
      message: `Estado temporal (time_status) inválido: '${body.time_status}'. Valores permitidos: ${VALID_EVENT_TIME_STATUSES.join(', ')}`,
    }, 400);
  }

  const cityId = Number(body.city_id || 1);
  const venueId = body.venue_id !== undefined && body.venue_id !== null ? Number(body.venue_id) : null;
  const title = body.title?.trim() || 'Borrador sin título';
  const category = (body.category as EventCategory) || 'cultura';
  const timeStatus = (body.time_status as EventTimeStatus) || 'confirmed';
  const startTime = timeStatus === 'confirmed' ? (body.start_time || new Date().toISOString()) : null;
  const editorialDate = body.editorial_date || (startTime ? startTime.split('T')[0] : new Date().toISOString().split('T')[0]);
  const endDate = body.end_date?.trim() || null;
  const scheduleText = body.schedule_text?.trim() || null;
  const approximateSchedule = body.approximate_schedule?.trim() || null;
  const priceCents = Number(body.price_cents || 0);
  const isFree = body.is_free !== undefined ? Boolean(body.is_free) : priceCents === 0;
  const sourceType = (body.source_type as EventSourceType) || 'whatsapp';
  const sourceUrl = body.source_url?.trim() || null;
  const description = body.description?.trim() || null;
  const imageUrl = body.image_url?.trim() || null;
  const imageThumbUrl = body.image_thumb_url?.trim() || null;
  const imageOriginalUrl = body.image_original_url?.trim() || null;
  const festivalIds: number[] = Array.isArray(body.festival_ids)
    ? body.festival_ids.map(Number).filter((n: number) => !Number.isNaN(n) && n > 0)
    : [];

  const hasVariants = await hasImageVariantsColumns();
  const insertCols = hasVariants
    ? `city_id, venue_id, title, description, category,
       time_status, start_time, editorial_date, end_date, schedule_text, approximate_schedule,
       price_cents, is_free, image_url, image_thumb_url, image_original_url, source_type, source_url,
       status, created_at, updated_at`
    : `city_id, venue_id, title, description, category,
       time_status, start_time, editorial_date, end_date, schedule_text, approximate_schedule,
       price_cents, is_free, image_url, source_type, source_url,
       status, created_at, updated_at`;

  const insertVals = hasVariants
    ? `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'tentative', now(), now()`
    : `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'tentative', now(), now()`;

  const insertParams: any[] = [
    cityId,
    venueId,
    title,
    description,
    category,
    timeStatus,
    startTime,
    editorialDate,
    endDate,
    scheduleText,
    approximateSchedule,
    priceCents,
    isFree,
    imageUrl,
  ];

  if (hasVariants) {
    insertParams.push(imageThumbUrl, imageOriginalUrl);
  }

  insertParams.push(sourceType, sourceUrl);

  const insertSql = `
    INSERT INTO events (${insertCols})
    VALUES (${insertVals})
    RETURNING id;
  `;

  const result = await query(insertSql, insertParams);
  const newEventId = Number(result.rows[0].id);

  if (festivalIds.length > 0) {
    for (const fId of festivalIds) {
      await query(
        `INSERT INTO event_festivals (event_id, festival_id)
         VALUES ($1, $2)
         ON CONFLICT (event_id, festival_id) DO NOTHING;`,
        [newEventId, fId]
      );
    }
  }

  return c.json({ status: 'ok', event_id: newEventId, event_status: 'tentative' }, 201);
});

/**
 * PATCH /api/v1/admin/events/:id
 * Modificar campos de un evento existente
 */
adminEventsRoutes.patch('/events/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de evento inválido.' }, 400);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  // Comprobar que existe
  const check = await query(`SELECT id, venue_id, status, time_status, start_time, end_date FROM events WHERE id = $1 LIMIT 1;`, [id]);
  if (check.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  const existing = check.rows[0];
  const targetStatus = body.status !== undefined ? body.status : existing.status;
  const targetVenueId = body.venue_id !== undefined ? body.venue_id : existing.venue_id;

  if (targetStatus === 'published' && (!targetVenueId || Number(targetVenueId) === 9999)) {
    return c.json({
      error: 'venue_not_assigned',
      message: 'No se puede publicar un evento sin local asignado del censo.',
    }, 400);
  }

  // Validaciones del contrato temporal
  if (body.time_status !== undefined && !VALID_EVENT_TIME_STATUSES.includes(body.time_status)) {
    return c.json({
      error: 'invalid_parameter',
      message: `Estado temporal (time_status) inválido: '${body.time_status}'. Valores permitidos: ${VALID_EVENT_TIME_STATUSES.join(', ')}`,
    }, 400);
  }

  const effectiveTimeStatus = (body.time_status !== undefined ? body.time_status : existing.time_status) as EventTimeStatus || 'confirmed';

  if (effectiveTimeStatus === 'pending_time' || effectiveTimeStatus === 'continuous' || effectiveTimeStatus === 'tentative_date') {
    body.start_time = null;
    body.end_time = null;
  } else if (effectiveTimeStatus === 'confirmed') {
    const finalStart = body.start_time !== undefined ? body.start_time : existing.start_time;
    if (!finalStart) {
      return c.json({ error: 'invalid_parameter', message: 'La hora de inicio es obligatoria para eventos confirmados.' }, 400);
    }
  }

  if (effectiveTimeStatus === 'tentative_date' && targetStatus === 'published') {
    return c.json({
      error: 'tentative_date_cannot_be_published',
      message: 'Un evento con fecha tentativa no puede publicarse en la agenda pública.',
    }, 400);
  }

  const finalEndDate = body.end_date !== undefined ? body.end_date : existing.end_date;
  if (effectiveTimeStatus === 'continuous' && targetStatus === 'published' && !finalEndDate) {
    return c.json({
      error: 'continuous_end_date_required',
      message: 'Para publicar una exposición continuada es obligatorio indicar la fecha final de periodo.',
    }, 400);
  }

  const hasVariants = await hasImageVariantsColumns();
  const allowedFields = [
    'title', 'description', 'category', 'venue_id', 'start_time',
    'end_time', 'editorial_date', 'price_cents', 'is_free', 'image_url',
    'source_type', 'source_url', 'status',
    'time_status', 'end_date', 'schedule_text', 'approximate_schedule'
  ];
  if (hasVariants) {
    allowedFields.push('image_thumb_url', 'image_original_url');
  }

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      values.push(body[field]);
      updates.push(`${field} = $${values.length}`);
    }
  }

  // Validación y parseo de festival_ids si se proporcionó
  let parsedFestivalIds: number[] | null = null;
  if (body.festival_ids !== undefined) {
    if (!Array.isArray(body.festival_ids)) {
      return c.json({ error: 'invalid_parameter', message: 'festival_ids debe ser un arreglo de identificadores.' }, 400);
    }
    parsedFestivalIds = [];
    for (const fId of body.festival_ids) {
      const numFid = Number(fId);
      if (Number.isNaN(numFid) || numFid <= 0) {
        return c.json({ error: 'invalid_parameter', message: `Identificador de festival inválido: ${fId}` }, 400);
      }
      parsedFestivalIds.push(numFid);
    }
  }

  if (updates.length === 0 && parsedFestivalIds === null) {
    return c.json({ error: 'no_fields_to_update', message: 'No se enviaron campos válidos para actualizar.' }, 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (parsedFestivalIds !== null) {
      if (parsedFestivalIds.length > 0) {
        const checkFestivalsRes = await client.query(
          `SELECT id FROM festivals WHERE id = ANY($1::int[])`,
          [parsedFestivalIds]
        );
        const existingIds = new Set(checkFestivalsRes.rows.map((r: { id: number }) => Number(r.id)));
        for (const reqId of parsedFestivalIds) {
          if (!existingIds.has(reqId)) {
            await client.query('ROLLBACK');
            return c.json({
              error: 'festival_not_found',
              message: `El festival con ID ${reqId} no existe. No se modificaron las relaciones del evento.`,
            }, 400);
          }
        }
      }

      await client.query(`DELETE FROM event_festivals WHERE event_id = $1;`, [id]);
      for (const fId of parsedFestivalIds) {
        await client.query(
          `INSERT INTO event_festivals (event_id, festival_id)
           VALUES ($1, $2)
           ON CONFLICT (event_id, festival_id) DO NOTHING;`,
          [id, fId]
        );
      }
    }

    let updatedEvent = { id, status: existing.status };
    if (updates.length > 0) {
      values.push(id);
      const sql = `
        UPDATE events
        SET ${updates.join(', ')}, updated_at = now()
        WHERE id = $${values.length}
        RETURNING id, status;
      `;
      const result = await client.query(sql, values);
      updatedEvent = result.rows[0];
    }

    await client.query('COMMIT');
    return c.json({ status: 'ok', event: updatedEvent });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error(`[PATCH /events/${id}] Error en la transacción de actualización:`, err);
    return c.json({ error: 'internal_error', message: 'Error interno al actualizar el evento.' }, 500);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/admin/events/:id
 * Eliminar un evento definitivamente
 */
adminEventsRoutes.delete('/events/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID inválido.' }, 400);
  }

  const result = await query(`DELETE FROM events WHERE id = $1 RETURNING id;`, [id]);
  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  return c.json({ status: 'ok', deleted_id: id });
});

/**
 * POST /api/v1/admin/ingest/cultural-agenda
 * Ejecuta bajo demanda la ingesta de eventos de la Agenda Cultural de Castilla y León para Palencia
 */
adminEventsRoutes.post('/ingest/cultural-agenda', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Body opcional
  }

  const minDate = typeof body?.min_date === 'string' && isValidDateString(body.min_date) ? body.min_date : undefined;
  const limit = typeof body?.limit === 'number' && body.limit > 0 ? body.limit : undefined;

  const result = await ingestCulturalAgenda({
    minDate,
    limit,
  });

  return c.json({
    status: 'ok',
    summary: result.summary,
    inserted_events: result.inserted_events,
  });
});

/**
 * POST /api/v1/admin/events/:id/publish
 * Valida y publica un borrador tentativo con verificación estricta de precondiciones
 */
adminEventsRoutes.post('/events/:id/publish', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de evento inválido.' }, 400);
  }
  const admin = c.get('user') as AdminUser;

  // 1. Verificar existencia y asignación de venue válido
  const check = await query(`SELECT id, venue_id, status, time_status, start_time, end_date FROM events WHERE id = $1 LIMIT 1;`, [id]);
  if (check.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  const currentEvent = check.rows[0];
  if (!currentEvent.venue_id || Number(currentEvent.venue_id) === 9999) {
    return c.json({
      error: 'venue_not_assigned',
      message: 'No se puede publicar un evento sin local asignado del censo. Asigna un local válido antes de publicar.',
    }, 400);
  }

  // 2. Comprobación del contrato temporal
  if (currentEvent.time_status === 'tentative_date') {
    return c.json({
      error: 'tentative_date_cannot_be_published',
      message: 'No se puede publicar un evento con fecha tentativa. Confirma la fecha exacta antes de publicar.',
    }, 400);
  }

  if (currentEvent.time_status === 'continuous' && !currentEvent.end_date) {
    return c.json({
      error: 'continuous_end_date_required',
      message: 'Para publicar una exposición continuada es obligatorio indicar la fecha final de periodo.',
    }, 400);
  }

  if (currentEvent.time_status === 'confirmed' && !currentEvent.start_time) {
    return c.json({
      error: 'start_time_required',
      message: 'Para publicar un evento puntual confirmado es obligatoria la hora de inicio.',
    }, 400);
  }

  const result = await query(
    `UPDATE events
     SET status = 'published',
         verified_at = now(),
         verified_by = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING id, status, verified_at;`,
    [id, admin?.email || 'Curador']
  );

  return c.json({ status: 'ok', message: 'Evento publicado correctamente.', event: result.rows[0] });
});

/**
 * POST /api/v1/admin/events/:id/cancel
 * Marca un evento como cancelado
 */
adminEventsRoutes.post('/events/:id/cancel', async (c) => {
  const id = Number(c.req.param('id'));

  const result = await query(
    `UPDATE events
     SET status = 'cancelled',
         updated_at = now()
     WHERE id = $1
     RETURNING id, status;`,
    [id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  return c.json({ status: 'ok', message: 'Evento cancelado.', event: result.rows[0] });
});

/**
 * POST /api/v1/admin/events/:id/archive
 * Archiva un evento
 */
adminEventsRoutes.post('/events/:id/archive', async (c) => {
  const id = Number(c.req.param('id'));

  const result = await query(
    `UPDATE events
     SET status = 'archived',
         updated_at = now()
     WHERE id = $1
     RETURNING id, status;`,
    [id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  return c.json({ status: 'ok', message: 'Evento archivado.', event: result.rows[0] });
});

/**
 * POST /api/v1/admin/events/:id/duplicate
 * Marca un evento como duplicado
 */
adminEventsRoutes.post('/events/:id/duplicate', async (c) => {
  const id = Number(c.req.param('id'));

  const result = await query(
    `UPDATE events
     SET status = 'duplicate',
         updated_at = now()
     WHERE id = $1
     RETURNING id, status;`,
    [id]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  return c.json({ status: 'ok', message: 'Evento marcado como duplicado.', event: result.rows[0] });
});
