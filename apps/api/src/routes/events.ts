import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import {
  computeEditorialLabel,
  formatPriceLabel,
  getCurrentDateInTimezone,
  isValidDateString,
  resolveGoogleMapsUrl,
} from '@vayaplan/shared';
import type {
  City,
  EventsResponseContract,
  PlaceItem,
  PublicEventItem,
  RecurrenceItem,
} from '@vayaplan/types';
import { hasImageVariantsColumns } from '../services/image-storage';

export const eventsRoutes = new Hono();

/**
 * GET /api/v1/cities/:citySlug/events
 * Consulta la agenda de eventos para una ciudad y fecha editorial determinada
 */
eventsRoutes.get('/cities/:citySlug/events', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();
  const requestedDate = c.req.query('date')?.trim();
  const categoryFilter = c.req.query('category')?.trim();

  if (!citySlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El parámetro de ciudad es obligatorio.',
      },
      400
    );
  }

  // 1. Verificar existencia de la ciudad
  const cityResult = await query<City>(
    `SELECT id, name, slug, timezone, is_active 
     FROM cities 
     WHERE slug = $1 AND is_active = true 
     LIMIT 1;`,
    [citySlug]
  );

  if (cityResult.rows.length === 0) {
    return c.json(
      {
        error: 'city_not_found',
        message: `La ciudad '${citySlug}' no fue encontrada o está inactiva.`,
      },
      404
    );
  }

  const city = cityResult.rows[0];

  // 2. Determinar la fecha objetivo
  let targetDate = requestedDate;
  if (!targetDate) {
    targetDate = getCurrentDateInTimezone(city.timezone);
  } else if (!isValidDateString(targetDate)) {
    return c.json(
      {
        error: 'invalid_date_format',
        message: 'El formato de fecha no es válido. Debe ser YYYY-MM-DD.',
      },
      400
    );
  }

  // 3. Consultar eventos publicados para la ciudad y fecha
  const hasVariants = await hasImageVariantsColumns();
  const variantsEventCols = hasVariants
    ? 'e.image_thumb_url,'
    : 'NULL::text AS image_thumb_url,';

  const eventQueryParams: any[] = [city.id, targetDate];
  let eventsSql = `
    SELECT 
      e.id,
      e.title,
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
      p.status AS promotion_status,
      fest.id AS festival_id,
      fest.name AS festival_name,
      fest.edition AS festival_edition,
      fest.slug AS festival_slug,
      fest.official_url AS festival_official_url
    FROM events e
    INNER JOIN venues v ON e.venue_id = v.id
    LEFT JOIN festivals fest ON e.festival_id = fest.id
    LEFT JOIN promotions p ON p.event_id = e.id 
      AND p.city_id = e.city_id
      AND p.status IN ('active', 'scheduled')
      AND p.starts_at <= now()
      AND p.ends_at > now()
    WHERE e.city_id = $1 
      AND e.status = 'published'
      AND (
        (e.end_date IS NULL AND e.editorial_date = $2) OR
        (e.end_date IS NOT NULL AND e.editorial_date <= $2 AND e.end_date >= $2)
      )
  `;

  if (categoryFilter) {
    eventQueryParams.push(categoryFilter);
    eventsSql += ` AND e.category = $3`;
  }

  eventsSql += ` ORDER BY 
    (CASE WHEN p.id IS NOT NULL THEN 0 ELSE 1 END) ASC, 
    (CASE WHEN COALESCE(e.time_status, 'confirmed') = 'confirmed' THEN 0 ELSE 1 END) ASC, 
    e.start_time ASC;`;

  const eventsResult = await query(eventsSql, eventQueryParams);

  const events: PublicEventItem[] = eventsResult.rows.map((row) => {
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

    return {
      id: Number(row.id),
      title: row.title,
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
      festival: row.festival_id
        ? {
            id: Number(row.festival_id),
            name: row.festival_name,
            edition: row.festival_edition || null,
            slug: row.festival_slug,
            official_url: row.festival_official_url || null,
          }
        : null,
    };
  });

  // 4. Consultar recurrencias aplicables para el día de la semana
  const recurrencesSql = `
    SELECT 
      r.id,
      r.title,
      r.category,
      r.day_of_week,
      r.start_time,
      r.end_time,
      r.price_cents,
      r.is_free,
      v.id AS venue_id,
      v.name AS venue_name
    FROM recurrences r
    INNER JOIN venues v ON r.venue_id = v.id
    WHERE r.city_id = $1 
      AND r.is_active = true
      AND r.day_of_week = EXTRACT(DOW FROM $2::date)
      AND NOT EXISTS (
        SELECT 1 FROM recurrence_exceptions re
        WHERE re.recurrence_id = r.id 
          AND re.exception_date = $2::date
          AND re.status = 'cancelled'
      )
    ORDER BY r.start_time ASC;
  `;

  const recurrencesResult = await query(recurrencesSql, [city.id, targetDate]);

  const recurrences: RecurrenceItem[] = recurrencesResult.rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    category: row.category,
    day_of_week: Number(row.day_of_week),
    start_time: String(row.start_time),
    end_time: row.end_time ? String(row.end_time) : null,
    venue_id: Number(row.venue_id),
    venue_name: row.venue_name,
    is_free: Boolean(row.is_free),
    price_cents: Number(row.price_cents),
  }));

  // 5. Consultar lugares permanentes (places) de la ciudad
  const placesSql = `
    SELECT 
      p.id,
      p.name,
      p.slug,
      p.category,
      p.highlight_text,
      p.description,
      p.opening_hours_text,
      p.price_text,
      p.latitude,
      p.longitude,
      p.google_maps_url,
      p.image_url
    FROM places p
    WHERE p.city_id = $1 AND p.is_active = true
    ORDER BY p.name ASC;
  `;

  const placesResult = await query(placesSql, [city.id]);

  const places: PlaceItem[] = placesResult.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    category: row.category,
    highlight_text: row.highlight_text,
    description: row.description,
    opening_hours_text: row.opening_hours_text,
    price_text: row.price_text,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    google_maps_url: resolveGoogleMapsUrl(row.google_maps_url, row.latitude, row.longitude),
    image_url: row.image_url,
  }));

  const response: EventsResponseContract = {
    city: {
      slug: city.slug,
      name: city.name,
    },
    date: targetDate,
    events,
    recurrences,
    places,
  };

  return c.json(response);
});
