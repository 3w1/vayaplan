import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import { VALID_EVENT_CATEGORIES, isValidDateString } from '@vayaplan/shared';
import type { EventCategory } from '@vayaplan/types';

export const adminRecurrencesRoutes = new Hono();

adminRecurrencesRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/recurrences
 * Listado de todas las recurrencias semanales y sus excepciones activas
 */
adminRecurrencesRoutes.get('/recurrences', async (c) => {
  const sql = `
    SELECT 
      r.*,
      v.name AS venue_name,
      v.slug AS venue_slug,
      COALESCE(
        json_agg(
          json_build_object(
            'id', re.id,
            'exception_date', re.exception_date,
            'status', re.status,
            'reason', re.note
          )
        ) FILTER (WHERE re.id IS NOT NULL),
        '[]'
      ) AS exceptions
    FROM recurrences r
    INNER JOIN venues v ON r.venue_id = v.id
    LEFT JOIN recurrence_exceptions re ON re.recurrence_id = r.id
    GROUP BY r.id, v.id
    ORDER BY r.day_of_week ASC, r.start_time ASC;
  `;

  const result = await query(sql);
  return c.json({ total: result.rows.length, recurrences: result.rows });
});

/**
 * POST /api/v1/admin/recurrences
 * Crear una nueva actividad periódica semanal
 */
adminRecurrencesRoutes.post('/recurrences', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const cityId = Number(body.city_id || 1);
  const venueId = Number(body.venue_id);
  const dayOfWeek = Number(body.day_of_week);
  const title = body.title?.trim();
  const description = body.description?.trim() || null;
  const category = (body.category as EventCategory) || 'dj_tardeo';
  const startTime = body.start_time?.trim();
  const endTime = body.end_time?.trim() || null;
  const priceCents = Number(body.price_cents || 0);
  const isFree = body.is_free !== undefined ? Boolean(body.is_free) : priceCents === 0;
  const requiresBooking = Boolean(body.requires_booking);
  const bookingUrl = body.booking_url?.trim() || null;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;

  if (!title || title.length < 3) {
    return c.json({ error: 'invalid_parameter', message: 'El título es obligatorio.' }, 400);
  }
  if (!venueId || Number.isNaN(venueId)) {
    return c.json({ error: 'invalid_parameter', message: 'El local (venue_id) es obligatorio.' }, 400);
  }
  if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return c.json({ error: 'invalid_parameter', message: 'day_of_week debe ser entre 0 (domingo) y 6 (sábado).' }, 400);
  }
  if (!startTime) {
    return c.json({ error: 'invalid_parameter', message: 'start_time es obligatorio (HH:MM:SS).' }, 400);
  }

  const insertSql = `
    INSERT INTO recurrences (
      city_id, venue_id, day_of_week, title, description,
      category, start_time, end_time, price_cents, is_free,
      requires_booking, booking_url, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
    RETURNING id, title;
  `;

  const result = await query(insertSql, [
    cityId, venueId, dayOfWeek, title, description,
    category, startTime, endTime, priceCents, isFree,
    requiresBooking, bookingUrl, isActive
  ]);

  return c.json({ status: 'ok', recurrence: result.rows[0] }, 201);
});

/**
 * PATCH /api/v1/admin/recurrences/:id
 * Modificar una recurrencia existente
 */
adminRecurrencesRoutes.patch('/recurrences/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID inválido.' }, 400);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const allowedFields = [
    'title', 'description', 'category', 'venue_id', 'day_of_week',
    'start_time', 'end_time', 'price_cents', 'is_free', 'requires_booking',
    'booking_url', 'is_active'
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
    return c.json({ error: 'no_fields_to_update', message: 'No se enviaron campos válidos.' }, 400);
  }

  values.push(id);
  const sql = `
    UPDATE recurrences
    SET ${updates.join(', ')}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const result = await query(sql, values);
  if (result.rows.length === 0) {
    return c.json({ error: 'recurrence_not_found', message: `Recurrencia ${id} no encontrada.` }, 404);
  }

  return c.json({ status: 'ok', recurrence: result.rows[0] });
});

/**
 * POST /api/v1/admin/recurrences/:id/exceptions
 * Registrar una excepción puntual por fecha (ej: cancelación por festivo o vacaciones)
 */
adminRecurrencesRoutes.post('/recurrences/:id/exceptions', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de recurrencia inválido.' }, 400);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const exceptionDate = body.exception_date?.trim();
  const status = body.status?.trim() || 'cancelled';
  const note = body.note?.trim() || body.reason?.trim() || 'Cancelación puntual de actividad periódica';
  const modifiedStartTime = body.modified_start_time?.trim() || body.override_start_time?.trim() || null;
  const modifiedEndTime = body.modified_end_time?.trim() || body.override_end_time?.trim() || null;

  if (!exceptionDate || !isValidDateString(exceptionDate)) {
    return c.json({ error: 'invalid_parameter', message: 'exception_date debe tener formato YYYY-MM-DD.' }, 400);
  }

  // Verificar que la recurrencia existe
  const check = await query(`SELECT id FROM recurrences WHERE id = $1 LIMIT 1;`, [id]);
  if (check.rows.length === 0) {
    return c.json({ error: 'recurrence_not_found', message: `Recurrencia ${id} no encontrada.` }, 404);
  }

  const sql = `
    INSERT INTO recurrence_exceptions (
      recurrence_id, exception_date, status, modified_start_time,
      modified_end_time, note, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (recurrence_id, exception_date) DO UPDATE
    SET status = EXCLUDED.status,
        note = EXCLUDED.note,
        modified_start_time = EXCLUDED.modified_start_time,
        modified_end_time = EXCLUDED.modified_end_time
    RETURNING *;
  `;

  const result = await query(sql, [
    id, exceptionDate, status, modifiedStartTime, modifiedEndTime, note
  ]);

  return c.json({ status: 'ok', exception: result.rows[0] }, 201);
});
