import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import {
  resolveGoogleMapsUrl,
  formatDishPriceLabel,
  validateRoutePublication,
} from '@vayaplan/shared';
import type {
  City,
  GastronomicRoutesResponseContract,
  SingleGastronomicRouteResponseContract,
  PublicRouteSummary,
  PublicRouteParticipantItem,
  GastronomicRouteCategory,
} from '@vayaplan/types';

export const gastronomicRoutes = new Hono();

/**
 * GET /api/v1/cities/:citySlug/routes
 * Listado de rutas gastronómicas públicas activas en la ciudad
 */
gastronomicRoutes.get('/cities/:citySlug/routes', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();

  if (!citySlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El parámetro de ciudad es obligatorio.',
      },
      400
    );
  }

  // 1. Verificar existencia y estado censal de la ciudad
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

  // 2. Consultar rutas con status 'published' que cumplan defensivamente el mínimo de 2 participantes activos
  const routesResult = await query<{
    id: number;
    title: string;
    slug: string;
    summary: string;
    category: GastronomicRouteCategory;
    badge_label: string | null;
    start_date: string | null;
    end_date: string | null;
    approximate_price_cents: number | null;
    image_url: string | null;
    image_thumb_url: string | null;
    participants_count: string | number;
  }>(
    `SELECT 
       r.id,
       r.title,
       r.slug,
       r.summary,
       r.category,
       r.badge_label,
       r.start_date,
       r.end_date,
       r.approximate_price_cents,
       r.image_url,
       r.image_thumb_url,
       COUNT(p.id)::int AS participants_count
     FROM gastronomic_routes r
     JOIN gastronomic_route_participants p ON p.route_id = r.id AND p.is_active = true
     JOIN venues v ON v.id = p.venue_id AND v.is_active = true
     WHERE r.city_id = $1 AND r.status = 'published'
     GROUP BY r.id
     HAVING COUNT(p.id) >= 2
     ORDER BY r.id ASC;`,
    [city.id]
  );

  const routes: PublicRouteSummary[] = routesResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    category: row.category,
    badge_label: row.badge_label,
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    is_permanent: row.start_date === null && row.end_date === null,
    approximate_price_cents:
      row.approximate_price_cents !== null ? Number(row.approximate_price_cents) : null,
    participants_count: Number(row.participants_count),
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url,
  }));

  const response: GastronomicRoutesResponseContract = {
    city: {
      slug: city.slug,
      name: city.name,
    },
    routes,
  };

  return c.json(response, 200);
});

/**
 * GET /api/v1/cities/:citySlug/routes/:routeSlug
 * Detalle público de una ruta gastronómica y sus locales participantes
 */
gastronomicRoutes.get('/cities/:citySlug/routes/:routeSlug', async (c) => {
  const citySlug = c.req.param('citySlug')?.toLowerCase()?.trim();
  const routeSlug = c.req.param('routeSlug')?.toLowerCase()?.trim();

  if (!citySlug || !routeSlug) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'Los parámetros de ciudad y ruta son obligatorios.',
      },
      400
    );
  }

  // 1. Verificar existencia y estado censal de la ciudad
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

  // 2. Consultar la ruta (debe pertenecer a la ciudad y tener status 'published')
  const routeResult = await query<{
    id: number;
    city_id: number;
    title: string;
    slug: string;
    summary: string;
    description: string | null;
    category: GastronomicRouteCategory;
    status: string;
    badge_label: string | null;
    start_date: string | null;
    end_date: string | null;
    approximate_price_cents: number | null;
    image_url: string | null;
    image_thumb_url: string | null;
  }>(
    `SELECT 
       r.id,
       r.city_id,
       r.title,
       r.slug,
       r.summary,
       r.description,
       r.category,
       r.status,
       r.badge_label,
       r.start_date,
       r.end_date,
       r.approximate_price_cents,
       r.image_url,
       r.image_thumb_url
     FROM gastronomic_routes r
     WHERE r.city_id = $1 AND r.slug = $2 AND r.status = 'published'
     LIMIT 1;`,
    [city.id, routeSlug]
  );

  if (routeResult.rows.length === 0) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica '${routeSlug}' no fue encontrada o no está disponible en ${city.name}.`,
      },
      404
    );
  }

  const routeRow = routeResult.rows[0];

  // 3. Consultar todos los participantes y venues vinculados
  const participantsResult = await query<{
    participant_id: number;
    display_order: number;
    dish_name: string;
    dish_description: string | null;
    dish_price_cents: number | null;
    dish_image_url: string | null;
    is_optional: boolean;
    participant_is_active: boolean;
    venue_id: number;
    venue_name: string;
    venue_slug: string;
    venue_address: string | null;
    venue_latitude: number | null;
    venue_longitude: number | null;
    venue_google_maps_url: string | null;
    venue_is_active: boolean;
  }>(
    `SELECT 
       p.id AS participant_id,
       p.display_order,
       p.dish_name,
       p.dish_description,
       p.dish_price_cents,
       p.dish_image_url,
       p.is_optional,
       p.is_active AS participant_is_active,
       v.id AS venue_id,
       v.name AS venue_name,
       v.slug AS venue_slug,
       v.address AS venue_address,
       v.latitude AS venue_latitude,
       v.longitude AS venue_longitude,
       v.google_maps_url AS venue_google_maps_url,
       v.is_active AS venue_is_active
     FROM gastronomic_route_participants p
     JOIN venues v ON v.id = p.venue_id
     WHERE p.route_id = $1
     ORDER BY p.display_order ASC;`,
    [routeRow.id]
  );

  // 4. Validar defensivamente con validateRoutePublication (mínimo 2 activos con venue activo)
  const candidates = participantsResult.rows.map((row) => ({
    is_active: row.participant_is_active,
    venue_is_active: row.venue_is_active,
  }));

  const validation = validateRoutePublication(candidates);
  if (!validation.canPublish) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica '${routeSlug}' no cuenta con el mínimo de locales participantes activos para su visualización pública.`,
      },
      404
    );
  }

  // 5. Excluir participantes inactivos o con local inactivo en la respuesta pública
  const activeParticipants: PublicRouteParticipantItem[] = participantsResult.rows
    .filter((row) => row.participant_is_active === true && row.venue_is_active === true)
    .map((row) => ({
      id: row.participant_id,
      dish: {
        name: row.dish_name,
        description: row.dish_description,
        price_cents: row.dish_price_cents !== null ? Number(row.dish_price_cents) : null,
        price_label: formatDishPriceLabel(
          row.dish_price_cents !== null ? Number(row.dish_price_cents) : null
        ),
        image_url: row.dish_image_url,
      },
      venue: {
        id: row.venue_id,
        name: row.venue_name,
        slug: row.venue_slug,
        address: row.venue_address,
        latitude: row.venue_latitude !== null ? Number(row.venue_latitude) : null,
        longitude: row.venue_longitude !== null ? Number(row.venue_longitude) : null,
        google_maps_url: resolveGoogleMapsUrl(
          row.venue_google_maps_url,
          row.venue_latitude,
          row.venue_longitude
        ),
      },
      is_optional: row.is_optional,
    }));

  const response: SingleGastronomicRouteResponseContract = {
    route: {
      id: routeRow.id,
      title: routeRow.title,
      slug: routeRow.slug,
      summary: routeRow.summary,
      description: routeRow.description,
      category: routeRow.category,
      status: 'published',
      badge_label: routeRow.badge_label,
      start_date: routeRow.start_date ? String(routeRow.start_date) : null,
      end_date: routeRow.end_date ? String(routeRow.end_date) : null,
      is_permanent: routeRow.start_date === null && routeRow.end_date === null,
      approximate_price_cents:
        routeRow.approximate_price_cents !== null
          ? Number(routeRow.approximate_price_cents)
          : null,
      image_url: routeRow.image_url,
      image_thumb_url: routeRow.image_thumb_url,
      city: {
        slug: city.slug,
        name: city.name,
      },
      participants: activeParticipants,
    },
  };

  return c.json(response, 200);
});
