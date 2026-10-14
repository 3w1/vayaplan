import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { resolveGoogleMapsUrl } from '@vayaplan/shared';
import type { City, PlaceItem, PlacesResponseContract } from '@vayaplan/types';

export const placesRoutes = new Hono();

/**
 * GET /api/v1/cities/:citySlug/places?category=...
 * Consulta el directorio de lugares y planes permanentes de la ciudad
 */
placesRoutes.get('/cities/:citySlug/places', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();
  const categoryFilter = c.req.query('category')?.toLowerCase()?.trim();

  if (!citySlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El parámetro de ciudad es obligatorio.',
      },
      400
    );
  }

  // 1. Verificar existencia y estado de la ciudad
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

  // 2. Consultar los lugares permanentes activos
  const queryParams: any[] = [city.id];
  let placesSql = `
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
  `;

  if (categoryFilter) {
    queryParams.push(categoryFilter);
    placesSql += ` AND p.category = $2`;
  }

  placesSql += ` ORDER BY p.name ASC;`;

  const placesResult = await query(placesSql, queryParams);

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

  const response: PlacesResponseContract = {
    city: {
      slug: city.slug,
      name: city.name,
    },
    category: categoryFilter || null,
    places,
  };

  return c.json(response);
});
