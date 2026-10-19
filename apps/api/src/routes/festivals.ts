import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import {
  computeEditorialLabel,
  formatPriceLabel,
  resolveGoogleMapsUrl,
} from '@vayaplan/shared';
import type {
  City,
  PublicEventItem,
  Festival,
} from '@vayaplan/types';
import { hasImageVariantsColumns } from '../services/image-storage';

export const festivalsRoutes = new Hono();

export interface FestivalResponseContract {
  festival: {
    id: number;
    name: string;
    edition: string | null;
    slug: string;
    description: string | null;
    start_date: string;
    end_date: string;
    official_url: string | null;
  };
  city: {
    id: number;
    name: string;
    slug: string;
  };
  events: PublicEventItem[];
}

/**
 * GET /api/v1/cities/:citySlug/festivals/:festivalSlug
 * Consulta el programa de un festival o ciclo cultural en una ciudad concreta
 */
festivalsRoutes.get('/cities/:citySlug/festivals/:festivalSlug', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();
  const festivalSlug = c.req.param('festivalSlug')?.toLowerCase()?.trim();

  if (!citySlug || !festivalSlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'Los parámetros de ciudad y festival son obligatorios.',
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

  // 2. Consultar el festival
  const festivalResult = await query<Festival>(
    `SELECT id, city_id, name, edition, slug, description, start_date, end_date, official_url, is_active
     FROM festivals
     WHERE city_id = $1 AND slug = $2 AND is_active = true
     LIMIT 1;`,
    [city.id, festivalSlug]
  );

  if (festivalResult.rows.length === 0) {
    return c.json(
      {
        error: 'festival_not_found',
        message: `El festival '${festivalSlug}' no fue encontrado en ${city.name}.`,
      },
      404
    );
  }

  const festivalRow = festivalResult.rows[0];

  // 3. Consultar las actividades individuales vinculadas a este festival
  const hasVariants = await hasImageVariantsColumns();
  const variantsEventCols = hasVariants
    ? 'e.image_thumb_url,'
    : 'NULL::text AS image_thumb_url,';

  const eventsSql = `
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
      v.whatsapp_contact AS venue_whatsapp_contact
    FROM events e
    INNER JOIN venues v ON e.venue_id = v.id
    WHERE e.city_id = $1 
      AND EXISTS (SELECT 1 FROM event_festivals ef WHERE ef.event_id = e.id AND ef.festival_id = $2)
      AND e.status = 'published'
    ORDER BY 
      e.editorial_date ASC,
      (CASE WHEN COALESCE(e.time_status, 'confirmed') = 'confirmed' THEN 0 ELSE 1 END) ASC,
      e.start_time ASC;
  `;

  const eventsResult = await query(eventsSql, [city.id, festivalRow.id]);

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
      promotion: null,
      festival: {
        id: Number(festivalRow.id),
        name: festivalRow.name,
        edition: festivalRow.edition || null,
        slug: festivalRow.slug,
        official_url: festivalRow.official_url || null,
      },
    };
  });

  const startDateStr = typeof festivalRow.start_date === 'string'
    ? festivalRow.start_date
    : new Date(festivalRow.start_date).toISOString().split('T')[0];
  const endDateStr = typeof festivalRow.end_date === 'string'
    ? festivalRow.end_date
    : new Date(festivalRow.end_date).toISOString().split('T')[0];

  const response: FestivalResponseContract = {
    festival: {
      id: Number(festivalRow.id),
      name: festivalRow.name,
      edition: festivalRow.edition || null,
      slug: festivalRow.slug,
      description: festivalRow.description || null,
      start_date: startDateStr,
      end_date: endDateStr,
      official_url: festivalRow.official_url || null,
    },
    city: {
      id: Number(city.id),
      name: city.name,
      slug: city.slug,
    },
    events,
  };

  return c.json(response);
});
