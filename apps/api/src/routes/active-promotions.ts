import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import {
  VALID_EVENT_CATEGORIES,
  computeEditorialLabel,
  formatPriceLabel,
  resolveGoogleMapsUrl,
  serializeEventImageAttribution,
} from '@vayaplan/shared';
import type {
  ActivePromotionsResponseContract,
  EventCategory,
  PublicActivePromotionItem,
} from '@vayaplan/types';
import { hasEventAttributionColumns } from '../services/image-storage';

export const activePromotionsRoutes = new Hono();

/**
 * GET /cities/:citySlug/promotions/active
 * Consulta las campañas promocionales vigentes en una ciudad independientemente de la fecha del evento
 */
activePromotionsRoutes.get('/cities/:citySlug/promotions/active', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();
  const categoryParam = c.req.query('category')?.trim();
  const limitParam = c.req.query('limit')?.trim();
  const offsetParam = c.req.query('offset')?.trim();

  // 1. Validar parámetro de ciudad
  if (!citySlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El parámetro de ciudad es obligatorio.',
      },
      400
    );
  }

  // 2. Validar parámetro de categoría si se proporciona
  let categoryFilter: EventCategory | undefined;
  if (categoryParam) {
    if (!VALID_EVENT_CATEGORIES.includes(categoryParam as EventCategory)) {
      return c.json(
        {
          error: 'invalid_category',
          message: `Categoría inválida '${categoryParam}'. Valores permitidos: ${VALID_EVENT_CATEGORIES.join(', ')}`,
        },
        400
      );
    }
    categoryFilter = categoryParam as EventCategory;
  }

  // 3. Validar paginación explícita
  let limit = 20;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      return c.json(
        {
          error: 'invalid_pagination',
          message: 'El parámetro limit debe ser un número entero mayor o igual a 1.',
        },
        400
      );
    }
    limit = Math.min(parsedLimit, 50); // Máximo 50 por página
  }

  let offset = 0;
  if (offsetParam) {
    const parsedOffset = parseInt(offsetParam, 10);
    if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
      return c.json(
        {
          error: 'invalid_pagination',
          message: 'El parámetro offset debe ser un número entero mayor o igual a 0.',
        },
        400
      );
    }
    offset = parsedOffset;
  }

  // 4. Verificar existencia de la ciudad
  const cityResult = await query<{ id: number; name: string; slug: string; timezone: string }>(
    `SELECT id, name, slug, timezone 
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

  // 5. Consulta de conteo total (para paginación explícita)
  const countParams: any[] = [city.id];
  let countSql = `
    SELECT COUNT(*)::int AS total
    FROM promotions p
    INNER JOIN events e ON p.event_id = e.id
    INNER JOIN venues v ON e.venue_id = v.id
    WHERE p.city_id = $1
      AND p.status IN ('active', 'scheduled')
      AND p.starts_at <= now()
      AND p.ends_at > now()
      AND e.status = 'published'
      AND v.id != 9999
      AND v.slug != 'local-por-verificar-borrador'
      AND v.is_active = true
      AND e.city_id = $1
      AND v.city_id = $1
  `;

  if (categoryFilter) {
    countParams.push(categoryFilter);
    countSql += ` AND e.category = $${countParams.length}`;
  }

  const countResult = await query<{ total: number }>(countSql, countParams);
  const total = countResult.rows[0]?.total || 0;

  // 6. Consulta de datos con ordenación estable y paginación
  const hasAttribution = await hasEventAttributionColumns();
  const attributionEventCols = hasAttribution
    ? 'e.image_source_url AS event_image_source_url, e.image_source_title AS event_image_source_title, e.image_author AS event_image_author, e.image_license AS event_image_license, e.image_license_url AS event_image_license_url,'
    : 'NULL::text AS event_image_source_url, NULL::text AS event_image_source_title, NULL::text AS event_image_author, NULL::text AS event_image_license, NULL::text AS event_image_license_url,';

  const dataParams: any[] = [city.id];
  let dataSql = `
    SELECT 
      p.id AS promotion_id,
      p.starts_at AS promotion_starts_at,
      p.ends_at AS promotion_ends_at,
      e.id AS event_id,
      e.title AS event_title,
      e.description AS event_description,
      e.category AS event_category,
      e.start_time AS event_start_time,
      e.end_time AS event_end_time,
      e.editorial_date AS event_editorial_date,
      e.price_cents AS event_price_cents,
      e.is_free AS event_is_free,
      e.image_url AS event_image_url,
      ${attributionEventCols}
      e.source_type AS event_source_type,
      e.source_url AS event_source_url,
      e.status AS event_status,
      e.verified_at AS event_verified_at,
      v.id AS venue_id,
      v.name AS venue_name,
      v.slug AS venue_slug,
      v.latitude AS venue_latitude,
      v.longitude AS venue_longitude,
      v.google_maps_url AS venue_google_maps_url,
      v.whatsapp_contact AS venue_whatsapp_contact
    FROM promotions p
    INNER JOIN events e ON p.event_id = e.id
    INNER JOIN venues v ON e.venue_id = v.id
    WHERE p.city_id = $1
      AND p.status IN ('active', 'scheduled')
      AND p.starts_at <= now()
      AND p.ends_at > now()
      AND e.status = 'published'
      AND v.id != 9999
      AND v.slug != 'local-por-verificar-borrador'
      AND v.is_active = true
      AND e.city_id = $1
      AND v.city_id = $1
  `;

  if (categoryFilter) {
    dataParams.push(categoryFilter);
    dataSql += ` AND e.category = $${dataParams.length}`;
  }

  // Orden estable: evento más cercano primero, fecha de inicio de campaña, ID de promoción
  dataSql += ` ORDER BY e.start_time ASC, p.starts_at ASC, p.id ASC`;

  dataParams.push(limit);
  dataSql += ` LIMIT $${dataParams.length}`;

  dataParams.push(offset);
  dataSql += ` OFFSET $${dataParams.length};`;

  const result = await query(dataSql, dataParams);

  // 7. Mapear resultados a la estructura pública de evento sin datos privados de campaña
  const promotions: PublicActivePromotionItem[] = result.rows.map((row) => {
    const startTimeIso = new Date(row.event_start_time).toISOString();
    const endTimeIso = row.event_end_time ? new Date(row.event_end_time).toISOString() : null;
    const editorialDateStr = typeof row.event_editorial_date === 'string'
      ? row.event_editorial_date
      : new Date(row.event_editorial_date).toISOString().split('T')[0];

    const mapsUrl = resolveGoogleMapsUrl(
      row.venue_google_maps_url,
      row.venue_latitude,
      row.venue_longitude
    );

    return {
      promotion_id: Number(row.promotion_id),
      starts_at: new Date(row.promotion_starts_at).toISOString(),
      ends_at: new Date(row.promotion_ends_at).toISOString(),
      event: {
        id: Number(row.event_id),
        title: row.event_title,
        description: row.event_description,
        category: row.event_category,
        start_time: startTimeIso,
        end_time: endTimeIso,
        editorial_date: editorialDateStr,
        editorial_label: computeEditorialLabel(editorialDateStr, startTimeIso),
        price: {
          amount_cents: Number(row.event_price_cents),
          is_free: Boolean(row.event_is_free),
          label: formatPriceLabel(Number(row.event_price_cents), Boolean(row.event_is_free)),
        },
        status: row.event_status,
        venue: {
          id: Number(row.venue_id),
          name: row.venue_name,
          slug: row.venue_slug,
          latitude: row.venue_latitude !== null ? Number(row.venue_latitude) : null,
          longitude: row.venue_longitude !== null ? Number(row.venue_longitude) : null,
          google_maps_url: mapsUrl,
        },
        image_url: row.event_image_url,
        image_attribution: serializeEventImageAttribution({
          image_source_url: row.event_image_source_url,
          image_source_title: row.event_image_source_title,
          image_author: row.event_image_author,
          image_license: row.event_image_license,
          image_license_url: row.event_image_license_url,
        }),
        actions: {
          maps_url: mapsUrl,
          booking_url: null,
          tickets_url: row.event_source_type === 'web' ? row.event_source_url : null,
          whatsapp_url: null,
        },
        verification: {
          source: row.event_source_type,
          verified_at: row.event_verified_at ? new Date(row.event_verified_at).toISOString() : null,
        },
        promotion: {
          id: Number(row.promotion_id),
          price_cents: 0,
          status: 'active',
        },
      },
    };
  });

  return c.json<ActivePromotionsResponseContract>(
    {
      city: {
        slug: city.slug,
        name: city.name,
        timezone: city.timezone,
      },
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + promotions.length < total,
      },
      promotions,
    },
    200
  );
});
