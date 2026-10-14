import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import {
  VALID_EVENT_CATEGORIES,
  VALID_EVENT_SOURCES,
  VALID_EVENT_STATUSES,
  isValidDateString,
  getCurrentDateInTimezone,
} from '@vayaplan/shared';
import type { AdminEventItem, AdminUser, EventCategory, EventSourceType, EventStatus } from '@vayaplan/types';

export const adminEventsRoutes = new Hono();

// Proteger todas las rutas administrativas de eventos
adminEventsRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/events
 * Lista todos los eventos para el panel de curación con filtros por estado, fecha y local
 */
adminEventsRoutes.get('/events', async (c) => {
  const statusFilter = c.req.query('status')?.trim();
  const dateFilter = c.req.query('date')?.trim();
  const venueIdFilter = c.req.query('venue_id')?.trim();

  const queryParams: any[] = [];
  let sql = `
    SELECT 
      e.*,
      v.name AS venue_name,
      v.slug AS venue_slug,
      p.id AS promotion_id
    FROM events e
    INNER JOIN venues v ON e.venue_id = v.id
    LEFT JOIN promotions p ON p.event_id = e.id AND p.status = 'active'
    WHERE 1=1
  `;

  if (statusFilter && VALID_EVENT_STATUSES.includes(statusFilter as EventStatus)) {
    queryParams.push(statusFilter);
    sql += ` AND e.status = $${queryParams.length}`;
  }

  if (dateFilter && isValidDateString(dateFilter)) {
    queryParams.push(dateFilter);
    sql += ` AND e.editorial_date = $${queryParams.length}`;
  }

  if (venueIdFilter && !Number.isNaN(Number(venueIdFilter))) {
    queryParams.push(Number(venueIdFilter));
    sql += ` AND e.venue_id = $${queryParams.length}`;
  }

  // Ordenar priorizando estado 'tentative', seguido de fecha y hora
  sql += `
    ORDER BY 
      CASE WHEN e.status = 'tentative' THEN 0 ELSE 1 END ASC,
      e.editorial_date DESC,
      e.start_time ASC
    LIMIT 200;
  `;

  const result = await query(sql, queryParams);

  const events: AdminEventItem[] = result.rows.map((row) => ({
    id: Number(row.id),
    city_id: Number(row.city_id),
    venue_id: Number(row.venue_id),
    title: row.title,
    description: row.description,
    category: row.category,
    start_time: new Date(row.start_time).toISOString(),
    end_time: row.end_time ? new Date(row.end_time).toISOString() : null,
    editorial_date: typeof row.editorial_date === 'string'
      ? row.editorial_date
      : new Date(row.editorial_date).toISOString().split('T')[0],
    price_cents: Number(row.price_cents),
    is_free: Boolean(row.is_free),
    image_url: row.image_url,
    source_type: row.source_type,
    source_url: row.source_url,
    source_hash: row.source_hash,
    dedupe_key: row.dedupe_key,
    status: row.status,
    verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    verified_by: row.verified_by,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    venue_name: row.venue_name,
    venue_slug: row.venue_slug,
    promotion_id: row.promotion_id ? Number(row.promotion_id) : null,
  }));

  return c.json({
    total: events.length,
    events,
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
      p.id AS promotion_id
    FROM events e
    INNER JOIN venues v ON e.venue_id = v.id
    LEFT JOIN promotions p ON p.event_id = e.id AND p.status = 'active'
    WHERE e.id = $1
    LIMIT 1;
  `;

  const result = await query(sql, [id]);
  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento con ID ${id} no encontrado.` }, 404);
  }

  const row = result.rows[0];
  const event: AdminEventItem = {
    id: Number(row.id),
    city_id: Number(row.city_id),
    venue_id: Number(row.venue_id),
    title: row.title,
    description: row.description,
    category: row.category,
    start_time: new Date(row.start_time).toISOString(),
    end_time: row.end_time ? new Date(row.end_time).toISOString() : null,
    editorial_date: typeof row.editorial_date === 'string'
      ? row.editorial_date
      : new Date(row.editorial_date).toISOString().split('T')[0],
    price_cents: Number(row.price_cents),
    is_free: Boolean(row.is_free),
    image_url: row.image_url,
    source_type: row.source_type,
    source_url: row.source_url,
    source_hash: row.source_hash,
    dedupe_key: row.dedupe_key,
    status: row.status,
    verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    verified_by: row.verified_by,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    venue_name: row.venue_name,
    venue_slug: row.venue_slug,
    promotion_id: row.promotion_id ? Number(row.promotion_id) : null,
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
  const startTime = body.start_time;
  const endTime = body.end_time || null;
  const editorialDate = body.editorial_date?.trim() || (startTime ? startTime.split('T')[0] : null);
  const priceCents = Number(body.price_cents || 0);
  const isFree = body.is_free !== undefined ? Boolean(body.is_free) : priceCents === 0;
  const description = body.description?.trim() || null;
  const imageUrl = body.image_url?.trim() || null;
  const sourceType = (body.source_type as EventSourceType) || 'manual';
  const sourceUrl = body.source_url?.trim() || null;
  const status = (body.status as EventStatus) || 'published';

  // Validaciones
  if (!title || title.length < 3) {
    return c.json({ error: 'invalid_parameter', message: 'El título es obligatorio (mínimo 3 caracteres).' }, 400);
  }
  if (!venueId || Number.isNaN(venueId) || venueId <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'El local (venue_id) es obligatorio.' }, 400);
  }
  if (!category || !VALID_EVENT_CATEGORIES.includes(category)) {
    return c.json({ error: 'invalid_parameter', message: `Categoría inválida. Valores: ${VALID_EVENT_CATEGORIES.join(', ')}` }, 400);
  }
  if (!startTime) {
    return c.json({ error: 'invalid_parameter', message: 'La hora de inicio (start_time) es obligatoria.' }, 400);
  }
  if (!editorialDate || !isValidDateString(editorialDate)) {
    return c.json({ error: 'invalid_parameter', message: 'La fecha editorial debe tener formato YYYY-MM-DD.' }, 400);
  }

  // Generar dedupe_key básico
  const dedupeKey = `palencia-${venueId}-${editorialDate}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;

  const insertSql = `
    INSERT INTO events (
      city_id, venue_id, title, description, category,
      start_time, end_time, editorial_date, price_cents, is_free,
      image_url, source_type, source_url, dedupe_key,
      status, verified_at, verified_by, created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, now(), $16, now(), now()
    )
    RETURNING id;
  `;

  const result = await query(insertSql, [
    cityId,
    venueId,
    title,
    description,
    category,
    startTime,
    endTime,
    editorialDate,
    priceCents,
    isFree,
    imageUrl,
    sourceType,
    sourceUrl,
    dedupeKey,
    status,
    admin?.email || 'Curador',
  ]);

  return c.json({ status: 'ok', event_id: Number(result.rows[0].id) }, 201);
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

  const cityId = Number(body.city_id || 1);
  const venueId = Number(body.venue_id || 9999); // 9999 = Local por verificar si no viene definido
  const title = body.title?.trim() || 'Borrador sin título';
  const category = (body.category as EventCategory) || 'cultura';
  const startTime = body.start_time || new Date().toISOString();
  const editorialDate = body.editorial_date || startTime.split('T')[0];
  const priceCents = Number(body.price_cents || 0);
  const isFree = body.is_free !== undefined ? Boolean(body.is_free) : priceCents === 0;
  const sourceType = (body.source_type as EventSourceType) || 'whatsapp';
  const sourceUrl = body.source_url?.trim() || null;
  const description = body.description?.trim() || null;
  const imageUrl = body.image_url?.trim() || null;

  const insertSql = `
    INSERT INTO events (
      city_id, venue_id, title, description, category,
      start_time, editorial_date, price_cents, is_free,
      image_url, source_type, source_url,
      status, created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12,
      'tentative', now(), now()
    )
    RETURNING id;
  `;

  const result = await query(insertSql, [
    cityId,
    venueId,
    title,
    description,
    category,
    startTime,
    editorialDate,
    priceCents,
    isFree,
    imageUrl,
    sourceType,
    sourceUrl,
  ]);

  return c.json({ status: 'ok', event_id: Number(result.rows[0].id), event_status: 'tentative' }, 201);
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
  const check = await query(`SELECT id FROM events WHERE id = $1 LIMIT 1;`, [id]);
  if (check.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

  const allowedFields = [
    'title', 'description', 'category', 'venue_id', 'start_time',
    'end_time', 'editorial_date', 'price_cents', 'is_free', 'image_url',
    'source_type', 'source_url', 'status'
  ];

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      values.push(body[field]);
      updates.push(`${field} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'no_fields_to_update', message: 'No se enviaron campos válidos para actualizar.' }, 400);
  }

  values.push(id);
  const sql = `
    UPDATE events
    SET ${updates.join(', ')}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING id, status;
  `;

  const result = await query(sql, values);
  return c.json({ status: 'ok', event: result.rows[0] });
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
 * POST /api/v1/admin/events/:id/publish
 * Valida y publica un borrador tentativo
 */
adminEventsRoutes.post('/events/:id/publish', async (c) => {
  const id = Number(c.req.param('id'));
  const admin = c.get('user') as AdminUser;

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

  if (result.rows.length === 0) {
    return c.json({ error: 'event_not_found', message: `Evento ${id} no encontrado.` }, 404);
  }

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
