import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import {
  computeEditorialLabel,
  formatPriceLabel,
  resolveGoogleMapsUrl,
} from '@vayaplan/shared';
import type { PublicEventItem, SingleEventResponseContract } from '@vayaplan/types';
import { hasImageVariantsColumns } from '../services/image-storage';

export const singleEventRoutes = new Hono();

/**
 * GET /api/v1/events/:id
 * Consulta la ficha detallada de un evento por su identificador único
 */
singleEventRoutes.get('/events/:id', async (c) => {
  const rawId = c.req.param('id')?.trim();
  const eventId = Number(rawId);

  if (!rawId || Number.isNaN(eventId) || !Number.isInteger(eventId) || eventId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El ID del evento debe ser un número entero positivo.',
      },
      400
    );
  }

  const hasVariants = await hasImageVariantsColumns();
  const variantsEventCols = hasVariants
    ? 'e.image_thumb_url,'
    : 'NULL::text AS image_thumb_url,';

  const eventSql = `
    SELECT 
      e.id,
      e.title,
      e.description,
      e.category,
      COALESCE(e.time_status, 'confirmed') AS time_status,
      e.start_time,
      e.end_time,
      e.editorial_date,
      e.end_date,
      e.schedule_text,
      e.approximate_schedule,
      e.price_cents,
      e.is_free,
      e.image_url,
      ${variantsEventCols}
      e.source_type,
      e.source_url,
      e.status,
      e.verified_at,
      v.id AS venue_id,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.latitude AS venue_latitude,
      v.longitude AS venue_longitude,
      v.google_maps_url AS venue_google_maps_url,
      v.whatsapp_contact AS venue_whatsapp_contact,
      p.id AS promotion_id,
      p.price_cents AS promotion_price_cents,
      p.status AS promotion_status
    FROM events e
    INNER JOIN venues v ON e.venue_id = v.id
    LEFT JOIN promotions p ON p.event_id = e.id 
      AND p.city_id = e.city_id
      AND p.status IN ('active', 'scheduled')
      AND p.starts_at <= now()
      AND p.ends_at > now()
    WHERE e.id = $1 AND e.status IN ('published', 'cancelled')
    LIMIT 1;
  `;

  const result = await query(eventSql, [eventId]);

  if (result.rows.length === 0) {
    return c.json(
      {
        error: 'event_not_found',
        message: `El evento con ID ${eventId} no fue encontrado.`,
      },
      404
    );
  }

  const row = result.rows[0];

  const timeStatus = (row.time_status || 'confirmed') as any;
  const startTimeIso = (row.start_time && timeStatus === 'confirmed')
    ? new Date(row.start_time).toISOString()
    : null;
  const endTimeIso = row.end_time ? new Date(row.end_time).toISOString() : null;
  const editorialDateStr = typeof row.editorial_date === 'string'
    ? row.editorial_date
    : new Date(row.editorial_date).toISOString().split('T')[0];
  const endDateStr = row.end_date
    ? (typeof row.end_date === 'string' ? row.end_date : new Date(row.end_date).toISOString().split('T')[0])
    : null;

  const mapsUrl = resolveGoogleMapsUrl(
    row.venue_google_maps_url,
    row.venue_latitude,
    row.venue_longitude
  );

  let festivalsList: any[] = [];
  try {
    const festRes = await query(
      `SELECT f.id, f.name, f.edition, f.slug, f.official_url
       FROM event_festivals ef
       INNER JOIN festivals f ON ef.festival_id = f.id
       WHERE ef.event_id = $1 AND f.is_active = true
       ORDER BY f.name ASC`,
      [eventId]
    );
    festivalsList = festRes.rows.map((f: any) => ({
      id: Number(f.id),
      name: f.name,
      edition: f.edition || null,
      slug: f.slug,
      official_url: f.official_url || null,
    }));
  } catch (err: any) {
    console.error(`[GET /events/${eventId}] Error al consultar relaciones event_festivals:`, {
      message: err?.message,
      code: err?.code,
      eventId,
    });
  }

  const event: PublicEventItem = {
    id: Number(row.id),
    title: row.title,
    description: row.description || null,
    category: row.category,
    time_status: timeStatus,
    start_time: startTimeIso,
    end_time: endTimeIso,
    editorial_date: editorialDateStr,
    editorial_label: computeEditorialLabel(editorialDateStr, startTimeIso),
    end_date: endDateStr,
    schedule_text: row.schedule_text || null,
    approximate_schedule: row.approximate_schedule || null,
    price: {
      amount_cents: Number(row.price_cents),
      is_free: Boolean(row.is_free),
      label: formatPriceLabel(Number(row.price_cents), Boolean(row.is_free)),
    },
    status: row.status,
    venue: {
      id: Number(row.venue_id),
      name: row.venue_name,
      slug: row.venue_slug,
      latitude: row.venue_latitude !== null ? Number(row.venue_latitude) : null,
      longitude: row.venue_longitude !== null ? Number(row.venue_longitude) : null,
      google_maps_url: mapsUrl,
    },
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url || row.image_url,
    actions: {
      maps_url: mapsUrl,
      booking_url: null,
      tickets_url: row.source_type === 'web' ? row.source_url : null,
      whatsapp_url: null,
    },
    verification: {
      source: row.source_type,
      verified_at: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    },
    promotion: row.promotion_id
      ? {
          id: Number(row.promotion_id),
          price_cents: Number(row.promotion_price_cents),
          status: row.promotion_status,
        }
      : null,
    // festival representa la primera entrada según orden alfabético (f.name ASC) como fallback legado, no un festival principal editorial.
    festival: festivalsList[0] || null,
    festivals: festivalsList.length > 0 ? festivalsList : undefined,
  };

  const response: SingleEventResponseContract = {
    event,
  };

  return c.json(response);
});
