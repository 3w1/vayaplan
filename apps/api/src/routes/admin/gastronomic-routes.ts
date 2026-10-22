import { Hono } from 'hono';
import { query, getClient } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import {
  VALID_GASTRONOMIC_ROUTE_CATEGORIES,
  validateRoutePublication,
  resolveGoogleMapsUrl,
  formatDishPriceLabel,
  isValidDateString,
} from '@vayaplan/shared';
import type {
  AdminUser,
  City,
  GastronomicRoute,
  GastronomicRouteCategory,
  GastronomicRouteStatus,
  AdminRouteDetail,
  AdminRouteListResponseContract,
  SingleGastronomicRouteResponseContract,
  PublicRouteParticipantItem,
} from '@vayaplan/types';

export const adminGastronomicRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();

// Todas las rutas administrativas requieren autenticación de rol admin
adminGastronomicRoutes.use('*', requireAdminAuth);

/**
 * Consulta y devuelve el detalle administrativo completo de una ruta con sus participantes y locales
 */
async function fetchAdminRouteDetail(routeId: number): Promise<AdminRouteDetail | null> {
  const routeResult = await query<GastronomicRoute>(
    `SELECT 
       id, city_id, title, slug, summary, description, category, status,
       start_date, end_date, image_url, image_thumb_url, badge_label,
       approximate_price_cents, created_at, updated_at
     FROM gastronomic_routes
     WHERE id = $1
     LIMIT 1;`,
    [routeId]
  );

  if (routeResult.rows.length === 0) {
    return null;
  }

  const route = routeResult.rows[0];

  const participantsResult = await query<{
    id: number;
    route_id: number;
    venue_id: number;
    display_order: number;
    dish_name: string;
    dish_description: string | null;
    dish_price_cents: number | null;
    dish_image_url: string | null;
    is_optional: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    venue_name: string;
    venue_slug: string;
    venue_address: string | null;
    venue_latitude: number | null;
    venue_longitude: number | null;
    venue_google_maps_url: string | null;
  }>(
    `SELECT 
       p.id,
       p.route_id,
       p.venue_id,
       p.display_order,
       p.dish_name,
       p.dish_description,
       p.dish_price_cents,
       p.dish_image_url,
       p.is_optional,
       p.is_active,
       p.created_at,
       p.updated_at,
       v.name AS venue_name,
       v.slug AS venue_slug,
       v.address AS venue_address,
       v.latitude AS venue_latitude,
       v.longitude AS venue_longitude,
       v.google_maps_url AS venue_google_maps_url
     FROM gastronomic_route_participants p
     JOIN venues v ON v.id = p.venue_id
     WHERE p.route_id = $1
     ORDER BY p.display_order ASC;`,
    [routeId]
  );

  return {
    ...route,
    start_date: route.start_date ? String(route.start_date) : null,
    end_date: route.end_date ? String(route.end_date) : null,
    approximate_price_cents:
      route.approximate_price_cents !== null ? Number(route.approximate_price_cents) : null,
    participants: participantsResult.rows.map((row) => ({
      id: row.id,
      venue_id: row.venue_id,
      display_order: row.display_order,
      dish_name: row.dish_name,
      dish_description: row.dish_description,
      dish_price_cents: row.dish_price_cents !== null ? Number(row.dish_price_cents) : null,
      dish_image_url: row.dish_image_url,
      is_optional: row.is_optional,
      is_active: row.is_active,
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
    })),
  };
}

/**
 * 1. GET /api/v1/admin/cities/:cityId/routes
 * Listado administrativo de rutas para una ciudad, filtrable por estado.
 */
adminGastronomicRoutes.get('/cities/:cityId/routes', async (c) => {
  const cityIdParam = c.req.param('cityId');
  const cityId = parseInt(cityIdParam, 10);

  if (Number.isNaN(cityId) || cityId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ciudad debe ser un número entero positivo.',
      },
      400
    );
  }

  // Verificar que la ciudad existe
  const cityResult = await query<City>(
    `SELECT id, name, slug FROM cities WHERE id = $1 LIMIT 1;`,
    [cityId]
  );

  if (cityResult.rows.length === 0) {
    return c.json(
      {
        error: 'city_not_found',
        message: `La ciudad con ID ${cityId} no existe.`,
      },
      404
    );
  }

  const statusParam = c.req.query('status')?.toLowerCase()?.trim() || 'all';
  const allowedStatuses = ['draft', 'published', 'archived', 'all'];

  if (!allowedStatuses.includes(statusParam)) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: `El parámetro status debe ser uno de: ${allowedStatuses.join(', ')}.`,
      },
      400
    );
  }

  const routesResult = await query<
    GastronomicRoute & { participants_count: string | number }
  >(
    `SELECT 
       r.id,
       r.city_id,
       r.title,
       r.slug,
       r.summary,
       r.description,
       r.category,
       r.status,
       r.start_date,
       r.end_date,
       r.image_url,
       r.image_thumb_url,
       r.badge_label,
       r.approximate_price_cents,
       r.created_at,
       r.updated_at,
       COUNT(p.id)::int AS participants_count
     FROM gastronomic_routes r
     LEFT JOIN gastronomic_route_participants p ON p.route_id = r.id
     WHERE r.city_id = $1
       AND ($2 = 'all' OR r.status = $2)
     GROUP BY r.id
     ORDER BY r.updated_at DESC;`,
    [cityId, statusParam]
  );

  const routes = routesResult.rows.map((row) => ({
    id: row.id,
    city_id: row.city_id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    description: row.description,
    category: row.category as GastronomicRouteCategory,
    status: row.status as GastronomicRouteStatus,
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url,
    badge_label: row.badge_label,
    approximate_price_cents:
      row.approximate_price_cents !== null ? Number(row.approximate_price_cents) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    participants_count: Number(row.participants_count),
  }));

  const response: AdminRouteListResponseContract = {
    routes,
  };

  return c.json(response, 200);
});

/**
 * 2. POST /api/v1/admin/routes
 * Crear una nueva ruta gastronómica en estado borrador ('draft')
 */
adminGastronomicRoutes.post('/routes', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'invalid_json',
        message: 'El cuerpo de la solicitud no contiene un JSON válido.',
      },
      400
    );
  }

  const {
    city_id,
    title,
    slug,
    summary,
    description,
    category,
    badge_label,
    start_date,
    end_date,
    approximate_price_cents,
    image_url,
  } = body || {};

  // Validar campos obligatorios
  if (!city_id || typeof city_id !== 'number' || city_id <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El campo city_id es obligatorio y debe ser un número entero positivo.',
      },
      400
    );
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El campo title es obligatorio y no puede estar vacío.',
      },
      400
    );
  }

  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El campo slug es obligatorio y no puede estar vacío.',
      },
      400
    );
  }

  const normalizedSlug = slug.toLowerCase().trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El slug debe contener únicamente letras minúsculas, números y guiones simples.',
      },
      400
    );
  }

  if (!summary || typeof summary !== 'string' || !summary.trim()) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El campo summary es obligatorio y no puede estar vacío.',
      },
      400
    );
  }

  if (!category || typeof category !== 'string' || !VALID_GASTRONOMIC_ROUTE_CATEGORIES.includes(category as any)) {
    return c.json(
      {
        error: 'invalid_category',
        message: `La categoría '${category}' no es válida. Categorías permitidas: ${VALID_GASTRONOMIC_ROUTE_CATEGORIES.join(', ')}.`,
      },
      400
    );
  }

  // Verificar que la ciudad existe
  const cityResult = await query<City>(
    `SELECT id FROM cities WHERE id = $1 LIMIT 1;`,
    [city_id]
  );

  if (cityResult.rows.length === 0) {
    return c.json(
      {
        error: 'city_not_found',
        message: `La ciudad con ID ${city_id} no existe.`,
      },
      404
    );
  }

  // Validar unicidad de slug dentro de la ciudad
  const slugCheck = await query<{ id: number }>(
    `SELECT id FROM gastronomic_routes WHERE city_id = $1 AND slug = $2 LIMIT 1;`,
    [city_id, normalizedSlug]
  );

  if (slugCheck.rows.length > 0) {
    return c.json(
      {
        error: 'route_slug_conflict',
        message: `Ya existe una ruta gastronómica con el slug '${normalizedSlug}' en esta ciudad.`,
      },
      409
    );
  }

  // Validar fechas de temporada si se proporcionan
  if (start_date !== undefined && start_date !== null) {
    if (typeof start_date !== 'string' || !isValidDateString(start_date)) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El formato de start_date debe ser YYYY-MM-DD válido.',
        },
        400
      );
    }
  }

  if (end_date !== undefined && end_date !== null) {
    if (typeof end_date !== 'string' || !isValidDateString(end_date)) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El formato de end_date debe ser YYYY-MM-DD válido.',
        },
        400
      );
    }
  }

  if (start_date && end_date && end_date < start_date) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'La fecha de fin (end_date) no puede ser anterior a la fecha de inicio (start_date).',
      },
      400
    );
  }

  // Validar precio aproximado si se proporciona
  if (approximate_price_cents !== undefined && approximate_price_cents !== null) {
    if (
      typeof approximate_price_cents !== 'number' ||
      !Number.isInteger(approximate_price_cents) ||
      approximate_price_cents < 0
    ) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El campo approximate_price_cents debe ser un número entero mayor o igual a 0.',
        },
        400
      );
    }
  }

  // Insertar en estado 'draft' estrictamente
  const insertResult = await query<GastronomicRoute>(
    `INSERT INTO gastronomic_routes (
       city_id, title, slug, summary, description, category, status,
       badge_label, start_date, end_date, approximate_price_cents, image_url
     ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11)
     RETURNING *;`,
    [
      city_id,
      title.trim(),
      normalizedSlug,
      summary.trim(),
      description ? description.trim() : null,
      category,
      badge_label ? badge_label.trim() : null,
      start_date || null,
      end_date || null,
      approximate_price_cents !== undefined && approximate_price_cents !== null
        ? approximate_price_cents
        : null,
      image_url ? image_url.trim() : null,
    ]
  );

  const created = insertResult.rows[0];

  const response: AdminRouteDetail = {
    ...created,
    start_date: created.start_date ? String(created.start_date) : null,
    end_date: created.end_date ? String(created.end_date) : null,
    approximate_price_cents:
      created.approximate_price_cents !== null ? Number(created.approximate_price_cents) : null,
    participants: [],
  };

  return c.json(response, 201);
});

/**
 * 3. GET /api/v1/admin/routes/:id
 * Detalle administrativo completo de una ruta con participantes y venues
 */
adminGastronomicRoutes.get('/routes/:id', async (c) => {
  const idParam = c.req.param('id');
  const routeId = parseInt(idParam, 10);

  if (Number.isNaN(routeId) || routeId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ruta debe ser un número entero positivo.',
      },
      400
    );
  }

  const detail = await fetchAdminRouteDetail(routeId);

  if (!detail) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica con ID ${routeId} no existe.`,
      },
      404
    );
  }

  return c.json(detail, 200);
});

/**
 * 4. PATCH /api/v1/admin/routes/:id
 * Actualizar metadatos editables de una ruta gastronómica (prohibido cambiar status aquí)
 */
adminGastronomicRoutes.patch('/routes/:id', async (c) => {
  const idParam = c.req.param('id');
  const routeId = parseInt(idParam, 10);

  if (Number.isNaN(routeId) || routeId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ruta debe ser un número entero positivo.',
      },
      400
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'invalid_json',
        message: 'El cuerpo de la solicitud no contiene un JSON válido.',
      },
      400
    );
  }

  // Verificar existencia de la ruta
  const existingResult = await query<GastronomicRoute>(
    `SELECT * FROM gastronomic_routes WHERE id = $1 LIMIT 1;`,
    [routeId]
  );

  if (existingResult.rows.length === 0) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica con ID ${routeId} no existe.`,
      },
      404
    );
  }

  const existing = existingResult.rows[0];

  // Regla obligatoria: PATCH no permite cambiar status
  if ('status' in body && body.status !== undefined) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El estado de la ruta no se puede modificar mediante este endpoint. Utilice los endpoints de publicación o archivado.',
      },
      400
    );
  }

  const updates: { col: string; val: any }[] = [];

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El campo title no puede estar vacío.',
        },
        400
      );
    }
    updates.push({ col: 'title', val: body.title.trim() });
  }

  if (body.slug !== undefined) {
    if (typeof body.slug !== 'string' || !body.slug.trim()) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El campo slug no puede estar vacío.',
        },
        400
      );
    }
    const normalizedSlug = body.slug.toLowerCase().trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El slug debe contener únicamente letras minúsculas, números y guiones simples.',
        },
        400
      );
    }

    // Comprobar colisión de slug en la misma ciudad
    const slugCheck = await query<{ id: number }>(
      `SELECT id FROM gastronomic_routes WHERE city_id = $1 AND slug = $2 AND id != $3 LIMIT 1;`,
      [existing.city_id, normalizedSlug, routeId]
    );

    if (slugCheck.rows.length > 0) {
      return c.json(
        {
          error: 'route_slug_conflict',
          message: `Ya existe otra ruta gastronómica con el slug '${normalizedSlug}' en esta ciudad.`,
        },
        409
      );
    }

    updates.push({ col: 'slug', val: normalizedSlug });
  }

  if (body.summary !== undefined) {
    if (typeof body.summary !== 'string' || !body.summary.trim()) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El campo summary no puede estar vacío.',
        },
        400
      );
    }
    updates.push({ col: 'summary', val: body.summary.trim() });
  }

  if (body.description !== undefined) {
    updates.push({
      col: 'description',
      val: body.description ? String(body.description).trim() : null,
    });
  }

  if (body.category !== undefined) {
    if (
      typeof body.category !== 'string' ||
      !VALID_GASTRONOMIC_ROUTE_CATEGORIES.includes(body.category as any)
    ) {
      return c.json(
        {
          error: 'invalid_category',
          message: `La categoría '${body.category}' no es válida. Categorías permitidas: ${VALID_GASTRONOMIC_ROUTE_CATEGORIES.join(', ')}.`,
        },
        400
      );
    }
    updates.push({ col: 'category', val: body.category });
  }

  if (body.badge_label !== undefined) {
    updates.push({
      col: 'badge_label',
      val: body.badge_label ? String(body.badge_label).trim() : null,
    });
  }

  // Fechas y coherencia de intervalo
  const newStartDate =
    body.start_date !== undefined
      ? body.start_date
      : existing.start_date
      ? String(existing.start_date)
      : null;
  const newEndDate =
    body.end_date !== undefined
      ? body.end_date
      : existing.end_date
      ? String(existing.end_date)
      : null;

  if (body.start_date !== undefined) {
    if (body.start_date !== null && (typeof body.start_date !== 'string' || !isValidDateString(body.start_date))) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El formato de start_date debe ser YYYY-MM-DD válido.',
        },
        400
      );
    }
    updates.push({ col: 'start_date', val: body.start_date || null });
  }

  if (body.end_date !== undefined) {
    if (body.end_date !== null && (typeof body.end_date !== 'string' || !isValidDateString(body.end_date))) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'El formato de end_date debe ser YYYY-MM-DD válido.',
        },
        400
      );
    }
    updates.push({ col: 'end_date', val: body.end_date || null });
  }

  if (newStartDate && newEndDate && newEndDate < newStartDate) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'La fecha de fin (end_date) no puede ser anterior a la fecha de inicio (start_date).',
      },
      400
    );
  }

  if (body.approximate_price_cents !== undefined) {
    if (body.approximate_price_cents !== null) {
      if (
        typeof body.approximate_price_cents !== 'number' ||
        !Number.isInteger(body.approximate_price_cents) ||
        body.approximate_price_cents < 0
      ) {
        return c.json(
          {
            error: 'invalid_parameter',
            message: 'El campo approximate_price_cents debe ser un número entero mayor o igual a 0.',
          },
          400
        );
      }
    }
    updates.push({ col: 'approximate_price_cents', val: body.approximate_price_cents });
  }

  if (body.image_url !== undefined) {
    updates.push({
      col: 'image_url',
      val: body.image_url ? String(body.image_url).trim() : null,
    });
  }

  if (body.image_thumb_url !== undefined) {
    updates.push({
      col: 'image_thumb_url',
      val: body.image_thumb_url ? String(body.image_thumb_url).trim() : null,
    });
  }

  if (updates.length > 0) {
    const setClauses = updates.map((u, idx) => `${u.col} = $${idx + 2}`).join(', ');
    const values = [routeId, ...updates.map((u) => u.val)];

    await query(
      `UPDATE gastronomic_routes 
       SET ${setClauses}, updated_at = NOW() 
       WHERE id = $1;`,
      values
    );
  }

  const updatedDetail = await fetchAdminRouteDetail(routeId);
  return c.json(updatedDetail, 200);
});

/**
 * 5. PUT /api/v1/admin/routes/:id/participants
 * Reemplazo atómico integral de la lista de participantes en una transacción real
 */
adminGastronomicRoutes.put('/routes/:id/participants', async (c) => {
  const idParam = c.req.param('id');
  const routeId = parseInt(idParam, 10);

  if (Number.isNaN(routeId) || routeId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ruta debe ser un número entero positivo.',
      },
      400
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: 'invalid_json',
        message: 'El cuerpo de la solicitud no contiene un JSON válido.',
      },
      400
    );
  }

  const { participants } = body || {};

  if (!Array.isArray(participants)) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El campo participants debe ser un array.',
      },
      400
    );
  }

  // Verificar existencia de la ruta y obtener su city_id
  const routeResult = await query<{ id: number; city_id: number }>(
    `SELECT id, city_id FROM gastronomic_routes WHERE id = $1 LIMIT 1;`,
    [routeId]
  );

  if (routeResult.rows.length === 0) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica con ID ${routeId} no existe.`,
      },
      404
    );
  }

  const route = routeResult.rows[0];

  // Si hay participantes, validar cada elemento y sus restricciones antes de la transacción
  if (participants.length > 0) {
    const venueIds: number[] = [];
    const orders: number[] = [];

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p || typeof p !== 'object') {
        return c.json(
          {
            error: 'invalid_parameter',
            message: `El elemento de participante en índice ${i} es inválido.`,
          },
          400
        );
      }

      if (!p.venue_id || typeof p.venue_id !== 'number' || p.venue_id <= 0) {
        return c.json(
          {
            error: 'invalid_parameter',
            message: `El campo venue_id en participante ${i} es obligatorio y debe ser un entero positivo.`,
          },
          400
        );
      }

      if (
        p.display_order === undefined ||
        typeof p.display_order !== 'number' ||
        p.display_order <= 0 ||
        !Number.isInteger(p.display_order)
      ) {
        return c.json(
          {
            error: 'invalid_parameter',
            message: `El campo display_order en participante ${i} es obligatorio y debe ser un entero positivo.`,
          },
          400
        );
      }

      if (!p.dish_name || typeof p.dish_name !== 'string' || !p.dish_name.trim()) {
        return c.json(
          {
            error: 'invalid_parameter',
            message: `El campo dish_name en participante ${i} es obligatorio y no puede estar vacío.`,
          },
          400
        );
      }

      if (p.dish_price_cents !== undefined && p.dish_price_cents !== null) {
        if (
          typeof p.dish_price_cents !== 'number' ||
          !Number.isInteger(p.dish_price_cents) ||
          p.dish_price_cents < 0
        ) {
          return c.json(
            {
              error: 'invalid_parameter',
              message: `El campo dish_price_cents en participante ${i} debe ser un entero mayor o igual a 0.`,
            },
            400
          );
        }
      }

      venueIds.push(p.venue_id);
      orders.push(p.display_order);
    }

    // Validar unicidad de venue_id en el payload
    const uniqueVenues = new Set(venueIds);
    if (uniqueVenues.size !== venueIds.length) {
      return c.json(
        {
          error: 'invalid_parameter',
          message: 'No se permiten locales (venues) duplicados en la misma ruta.',
        },
        400
      );
    }

    // Validar unicidad y correlatividad estricta de display_order (1..N sin huecos)
    const sortedOrders = [...orders].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i + 1) {
        return c.json(
          {
            error: 'invalid_parameter',
            message: 'El campo display_order debe ser estrictamente correlativo del 1 al N sin duplicados ni saltos.',
          },
          400
        );
      }
    }
  }

  // Transacción real con getClient de @vayaplan/db
  const client = await getClient();

  try {
    await client.query('BEGIN');

    if (participants.length > 0) {
      const venueIds = participants.map((p) => p.venue_id);

      // Validar que todos los venues existen y pertenecen a la ciudad de la ruta
      const venuesResult = await client.query<{ id: number; city_id: number }>(
        `SELECT id, city_id FROM venues WHERE id = ANY($1::int[]);`,
        [venueIds]
      );

      if (venuesResult.rows.length !== venueIds.length) {
        await client.query('ROLLBACK');
        return c.json(
          {
            error: 'invalid_parameter',
            message: 'Uno o más locales participantes especificados no existen.',
          },
          400
        );
      }

      for (const vRow of venuesResult.rows) {
        if (vRow.city_id !== route.city_id) {
          await client.query('ROLLBACK');
          return c.json(
            {
              error: 'invalid_parameter',
              message: 'Todos los locales participantes deben pertenecer a la misma ciudad de la ruta.',
            },
            400
          );
        }
      }
    }

    // Eliminar participantes anteriores de la ruta
    await client.query(
      `DELETE FROM gastronomic_route_participants WHERE route_id = $1;`,
      [route.id]
    );

    // Insertar los nuevos participantes
    for (const p of participants) {
      await client.query(
        `INSERT INTO gastronomic_route_participants (
           route_id, venue_id, display_order, dish_name, dish_description,
           dish_price_cents, dish_image_url, is_optional, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          route.id,
          p.venue_id,
          p.display_order,
          p.dish_name.trim(),
          p.dish_description ? p.dish_description.trim() : null,
          p.dish_price_cents !== undefined && p.dish_price_cents !== null
            ? Number(p.dish_price_cents)
            : null,
          p.dish_image_url ? p.dish_image_url.trim() : null,
          p.is_optional === true,
          p.is_active !== false, // Por defecto true
        ]
      );
    }

    // Actualizar updated_at de la ruta
    await client.query(
      `UPDATE gastronomic_routes SET updated_at = NOW() WHERE id = $1;`,
      [route.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updatedDetail = await fetchAdminRouteDetail(routeId);
  return c.json(updatedDetail, 200);
});

/**
 * 6. POST /api/v1/admin/routes/:id/publish
 * Publicar una ruta gastronómica en borrador ('draft' -> 'published')
 * Exige al menos 2 participantes activos con venue activo mediante validateRoutePublication.
 */
adminGastronomicRoutes.post('/routes/:id/publish', async (c) => {
  const idParam = c.req.param('id');
  const routeId = parseInt(idParam, 10);

  if (Number.isNaN(routeId) || routeId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ruta debe ser un número entero positivo.',
      },
      400
    );
  }

  const routeResult = await query<GastronomicRoute>(
    `SELECT * FROM gastronomic_routes WHERE id = $1 LIMIT 1;`,
    [routeId]
  );

  if (routeResult.rows.length === 0) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica con ID ${routeId} no existe.`,
      },
      404
    );
  }

  const route = routeResult.rows[0];

  if (route.status === 'published') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: 'La ruta gastronómica ya se encuentra publicada.',
      },
      400
    );
  }

  if (route.status === 'archived') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: 'No se puede publicar directamente una ruta archivada.',
      },
      400
    );
  }

  if (route.status !== 'draft') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: 'Solo se pueden publicar rutas que estén en estado borrador (draft).',
      },
      400
    );
  }

  // Consultar estado de los participantes y sus locales
  const participantsResult = await query<{
    participant_is_active: boolean;
    venue_is_active: boolean;
  }>(
    `SELECT 
       p.is_active AS participant_is_active,
       v.is_active AS venue_is_active
     FROM gastronomic_route_participants p
     JOIN venues v ON v.id = p.venue_id
     WHERE p.route_id = $1;`,
    [routeId]
  );

  const candidates = participantsResult.rows.map((row) => ({
    is_active: row.participant_is_active,
    venue_is_active: row.venue_is_active,
  }));

  const validation = validateRoutePublication(candidates);

  if (!validation.canPublish) {
    return c.json(
      {
        error: 'insufficient_stops',
        message:
          validation.reason ||
          'La ruta requiere al menos 2 locales participantes activos con local activo para ser publicada.',
      },
      422
    );
  }

  // Transicionar a 'published'
  await query(
    `UPDATE gastronomic_routes 
     SET status = 'published', updated_at = NOW() 
     WHERE id = $1;`,
    [routeId]
  );

  const updatedDetail = await fetchAdminRouteDetail(routeId);
  return c.json(updatedDetail, 200);
});

/**
 * 7. POST /api/v1/admin/routes/:id/archive
 * Archivar una ruta gastronómica publicada ('published' -> 'archived')
 * No elimina participantes ni locales asociados.
 */
adminGastronomicRoutes.post('/routes/:id/archive', async (c) => {
  const idParam = c.req.param('id');
  const routeId = parseInt(idParam, 10);

  if (Number.isNaN(routeId) || routeId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ruta debe ser un número entero positivo.',
      },
      400
    );
  }

  const routeResult = await query<GastronomicRoute>(
    `SELECT * FROM gastronomic_routes WHERE id = $1 LIMIT 1;`,
    [routeId]
  );

  if (routeResult.rows.length === 0) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica con ID ${routeId} no existe.`,
      },
      404
    );
  }

  const route = routeResult.rows[0];

  if (route.status === 'draft') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: 'Solo se pueden archivar rutas que estén actualmente publicadas (published).',
      },
      400
    );
  }

  if (route.status === 'archived') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: 'La ruta gastronómica ya se encuentra archivada.',
      },
      400
    );
  }

  if (route.status !== 'published') {
    return c.json(
      {
        error: 'invalid_status_transition',
        message: 'Solo se pueden archivar rutas que estén actualmente publicadas (published).',
      },
      400
    );
  }

  // Transicionar a 'archived'
  await query(
    `UPDATE gastronomic_routes 
     SET status = 'archived', updated_at = NOW() 
     WHERE id = $1;`,
    [routeId]
  );

  const updatedDetail = await fetchAdminRouteDetail(routeId);
  return c.json(updatedDetail, 200);
});

/**
 * 8. GET /api/v1/admin/routes/:id/preview
 * Previsualización fiel con el contrato público exacto (SingleGastronomicRouteResponseContract)
 * Permite previsualizar rutas en draft, published o archived sin exigir mínimo de 2 participantes.
 * Filtra participantes inactivos y locales inactivos.
 * No expone display_order, distancias ni orden de visita.
 * Devuelve el status real de la ruta.
 */
adminGastronomicRoutes.get('/routes/:id/preview', async (c) => {
  const idParam = c.req.param('id');
  const routeId = parseInt(idParam, 10);

  if (Number.isNaN(routeId) || routeId <= 0) {
    return c.json(
      {
        error: 'invalid_parameter',
        message: 'El identificador de ruta debe ser un número entero positivo.',
      },
      400
    );
  }

  // 1. Consultar la ruta y su ciudad (sin filtrar por status)
  const routeResult = await query<{
    id: number;
    city_id: number;
    title: string;
    slug: string;
    summary: string;
    description: string | null;
    category: GastronomicRouteCategory;
    status: GastronomicRouteStatus;
    badge_label: string | null;
    start_date: string | null;
    end_date: string | null;
    approximate_price_cents: number | null;
    image_url: string | null;
    image_thumb_url: string | null;
    city_slug: string;
    city_name: string;
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
       r.image_thumb_url,
       c.slug AS city_slug,
       c.name AS city_name
     FROM gastronomic_routes r
     JOIN cities c ON c.id = r.city_id
     WHERE r.id = $1
     LIMIT 1;`,
    [routeId]
  );

  if (routeResult.rows.length === 0) {
    return c.json(
      {
        error: 'route_not_found',
        message: `La ruta gastronómica con ID ${routeId} no existe.`,
      },
      404
    );
  }

  const routeRow = routeResult.rows[0];

  // 2. Consultar todos los participantes y venues vinculados
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

  // 3. Filtrar participantes activos con local activo (sin exigir mínimo de 2 en preview)
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
      status: routeRow.status,
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
        slug: routeRow.city_slug,
        name: routeRow.city_name,
      },
      participants: activeParticipants,
    },
  };

  return c.json(response, 200);
});
