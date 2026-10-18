import { Hono } from 'hono';
import { query, getClient } from '@vayaplan/db';
import type { PoolClient, QueryResultRow } from 'pg';
import { requireAdminAuth } from '../../middleware/auth';
import type { Venue, AdminUser } from '@vayaplan/types';

export const adminVenuesRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();

adminVenuesRoutes.use('*', requireAdminAuth);

/**
 * Comprueba las dependencias activas asociadas a un local
 */
export async function checkVenueDependencies(
  venueId: number,
  client?: PoolClient
): Promise<{
  hasDependencies: boolean;
  dependencies: string[];
}> {
  const queryFn = client
    ? <T extends QueryResultRow>(sql: string, params?: any[]) => client.query<T>(sql, params)
    : query;

  const dependencies: string[] = [];

  // 1. Eventos asociados
  const eventsRes = await queryFn<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM events WHERE venue_id = $1`,
    [venueId]
  );
  const eventCount = parseInt(eventsRes.rows[0]?.count || '0', 10);
  if (eventCount > 0) {
    dependencies.push(`Tiene ${eventCount} evento(s) asociado(s) en la agenda.`);
  }

  // 2. Promociones asociadas
  const promoRes = await queryFn<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM promotions WHERE venue_id = $1`,
    [venueId]
  );
  const promoCount = parseInt(promoRes.rows[0]?.count || '0', 10);
  if (promoCount > 0) {
    dependencies.push(`Tiene ${promoCount} promoción(es) asociada(s).`);
  }

  // 3. Recurrencias semanales asociadas
  const recurRes = await queryFn<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM recurrences WHERE venue_id = $1`,
    [venueId]
  );
  const recurCount = parseInt(recurRes.rows[0]?.count || '0', 10);
  if (recurCount > 0) {
    dependencies.push(`Tiene ${recurCount} actividad(es) periódica(s) recurrente(s).`);
  }

  // 4. Lugares permanentes (places)
  const placesRes = await queryFn<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM places WHERE venue_id = $1`,
    [venueId]
  );
  const placeCount = parseInt(placesRes.rows[0]?.count || '0', 10);
  if (placeCount > 0) {
    dependencies.push(`Está referenciado en ${placeCount} lugar(es) permanente(s) (places).`);
  }

  // 5. Identificadores externos del importador (Google Maps placeId, etc.)
  const extRes = await queryFn<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM venue_external_ids WHERE venue_id = $1`,
    [venueId]
  );
  const extCount = parseInt(extRes.rows[0]?.count || '0', 10);
  if (extCount > 0) {
    dependencies.push(`Tiene ${extCount} identificador(es) externo(s) asociado(s) en venue_external_ids.`);
  }

  // 6. Lotes de importación donde fue creado
  const batchRes = await queryFn<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM venue_import_batches WHERE $1 = ANY(created_venue_ids) AND status = 'applied'`,
    [venueId]
  );
  const batchCount = parseInt(batchRes.rows[0]?.count || '0', 10);
  if (batchCount > 0) {
    dependencies.push(`Consta en ${batchCount} lote(s) de importación activo(s) en venue_import_batches.`);
  }

  return {
    hasDependencies: dependencies.length > 0,
    dependencies,
  };
}

/**
 * GET /api/v1/admin/venues
 * Listado paginado de locales con búsqueda, filtros y ordenación server-side
 */
adminVenuesRoutes.get('/venues', async (c) => {
  const queryParams = c.req.query();
  const search = (queryParams.q || queryParams.search || '').trim();
  const category = (queryParams.category || '').trim();
  const cityParam = (queryParams.city || '').trim();
  const cityIdParam = queryParams.city_id ? parseInt(queryParams.city_id, 10) : undefined;
  const status = (queryParams.status || 'all').toLowerCase().trim();
  const hasWhatsapp = (queryParams.has_whatsapp || 'all').toLowerCase().trim();
  const isAll = queryParams.all === 'true';

  // Paginación server-side validada
  const page = Math.max(1, parseInt(queryParams.page || '1', 10) || 1);
  const maxLimit = isAll ? 250 : 100;
  const defaultLimit = isAll ? 250 : 20;
  const limit = Math.min(maxLimit, Math.max(1, parseInt(queryParams.limit || String(defaultLimit), 10) || defaultLimit));
  const offset = (page - 1) * limit;

  // Ordenación segura
  const sortBy = (queryParams.sort_by || 'name').toLowerCase().trim();
  const sortOrder = (queryParams.sort_order || 'asc').toLowerCase().trim() === 'desc' ? 'DESC' : 'ASC';

  let orderCol = 'v.name';
  if (sortBy === 'city') {
    orderCol = 'c.name';
  } else if (sortBy === 'created_at') {
    orderCol = 'v.created_at';
  } else {
    orderCol = 'v.name';
  }

  const conditions: string[] = [];
  const values: any[] = [];

  // Búsqueda por nombre, ciudad, teléfono y dirección
  if (search.length > 0) {
    values.push(`%${search.toLowerCase()}%`);
    const idx = values.length;
    conditions.push(
      `(LOWER(v.name) LIKE $${idx} OR LOWER(c.name) LIKE $${idx} OR LOWER(COALESCE(v.phone, '')) LIKE $${idx} OR LOWER(COALESCE(v.address, '')) LIKE $${idx})`
    );
  }

  // Filtro por categoría
  if (category && category !== 'all') {
    values.push(category.toLowerCase());
    conditions.push(`LOWER(COALESCE(v.category, 'general')) = $${values.length}`);
  }

  // Filtro por ciudad
  if (cityIdParam && !Number.isNaN(cityIdParam)) {
    values.push(cityIdParam);
    conditions.push(`v.city_id = $${values.length}`);
  } else if (cityParam && cityParam !== 'all') {
    values.push(cityParam.toLowerCase());
    conditions.push(`LOWER(c.slug) = $${values.length}`);
  }

  // Filtro por estado activo/inactivo
  if (status === 'active') {
    conditions.push(`v.is_active = true`);
  } else if (status === 'inactive') {
    conditions.push(`v.is_active = false`);
  }

  // Filtro por presencia de WhatsApp
  if (hasWhatsapp === 'yes') {
    conditions.push(`v.whatsapp_contact IS NOT NULL AND TRIM(v.whatsapp_contact) != ''`);
  } else if (hasWhatsapp === 'no') {
    conditions.push(`(v.whatsapp_contact IS NULL OR TRIM(v.whatsapp_contact) = '')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Conteo total con filtros
  const countSql = `
    SELECT COUNT(*)::int as total
    FROM venues v
    JOIN cities c ON v.city_id = c.id
    ${whereClause}
  `;
  const countRes = await query<{ total: number }>(countSql, values);
  const total = countRes.rows[0]?.total || 0;

  // 2. Consulta paginada de locales
  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const dataSql = `
    SELECT
      v.id,
      v.city_id,
      c.name as city_name,
      c.slug as city_slug,
      v.name,
      v.slug,
      v.address,
      v.latitude,
      v.longitude,
      v.google_maps_url,
      v.instagram_handle,
      v.whatsapp_contact,
      v.website_url,
      v.facebook_url,
      v.is_active,
      v.created_at,
      v.updated_at,
      v.zone,
      v.category,
      v.phone
    FROM venues v
    JOIN cities c ON v.city_id = c.id
    ${whereClause}
    ORDER BY ${orderCol} ${sortOrder}, v.id ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const dataRes = await query<Venue & { city_name: string; city_slug: string }>(dataSql, values);

  // 3. Metadatos de filtros auxiliares para selectores de la interfaz
  const categoriesRes = await query<{ category: string }>(
    `SELECT DISTINCT COALESCE(category, 'general') as category FROM venues ORDER BY category ASC;`
  );
  const citiesRes = await query<{ id: number; name: string; slug: string }>(
    `SELECT id, name, slug FROM cities ORDER BY name ASC;`
  );

  return c.json({
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
    venues: dataRes.rows,
    filters: {
      categories: categoriesRes.rows.map((r) => r.category),
      cities: citiesRes.rows,
    },
  });
});

/**
 * GET /api/v1/admin/venues/:id/dependencies
 * Inspecciona las relaciones de un local antes de solicitar confirmación de borrado
 */
adminVenuesRoutes.get('/venues/:id/dependencies', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de local inválido.' }, 400);
  }

  const venueRes = await query<{ id: number; name: string; city_id: number; city_name: string }>(
    `SELECT v.id, v.name, v.city_id, c.name as city_name
     FROM venues v
     JOIN cities c ON v.city_id = c.id
     WHERE v.id = $1`,
    [id]
  );

  if (venueRes.rows.length === 0) {
    return c.json({ error: 'venue_not_found', message: `Local #${id} no encontrado.` }, 404);
  }

  const venue = venueRes.rows[0];
  const depCheck = await checkVenueDependencies(id);

  return c.json({
    venue: {
      id: venue.id,
      name: venue.name,
      city_id: venue.city_id,
      city_name: venue.city_name,
    },
    is_protected: false,
    can_delete: !depCheck.hasDependencies,
    has_dependencies: depCheck.hasDependencies,
    dependencies: depCheck.dependencies,
  });
});

/**
 * DELETE /api/v1/admin/venues/:id
 * Borrado seguro y transaccional con comprobación exhaustiva de dependencias y auditoría
 */
adminVenuesRoutes.delete('/venues/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user') as AdminUser | undefined;
  const userEmail = user?.email || 'admin@vayaplan.com';

  if (Number.isNaN(id) || id <= 0) {
    return c.json({ error: 'invalid_parameter', message: 'ID de local inválido.' }, 400);
  }

  // 1. Borrado transaccional protegido con bloqueo de fila frente a condiciones de carrera
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Bloqueo exclusivo de fila (FOR UPDATE OF v) para prevenir carreras con inserciones o eliminaciones concurrentes
    const venueRes = await client.query<{ id: number; name: string; city_id: number; city_name: string }>(
      `SELECT v.id, v.name, v.city_id, c.name as city_name
       FROM venues v
       JOIN cities c ON v.city_id = c.id
       WHERE v.id = $1
       FOR UPDATE OF v`,
      [id]
    );

    if (venueRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return c.json({ error: 'venue_not_found', message: `Local #${id} no encontrado.` }, 404);
    }
    const venue = venueRes.rows[0];

    // 3. Comprobación exhaustiva de dependencias dentro de la misma transacción
    const depCheck = await checkVenueDependencies(id, client);
    if (depCheck.hasDependencies) {
      await client.query('ROLLBACK');
      console.warn(
        `[AUDIT_VENUE_DELETE] User: ${userEmail} | VenueID: ${id} ("${venue.name}") | Result: BLOCKED | Dependencies: ${depCheck.dependencies.join('; ')} | Timestamp: ${new Date().toISOString()}`
      );
      return c.json(
        {
          error: 'venue_has_dependencies',
          message: `No se puede eliminar el local "${venue.name}" (#${id}) porque tiene dependencias activas.`,
          dependencies: depCheck.dependencies,
        },
        409
      );
    }

    // 4. Borrado transaccional limpio
    const delRes = await client.query<{ id: number; name: string }>(
      `DELETE FROM venues WHERE id = $1 RETURNING id, name;`,
      [id]
    );
    await client.query('COMMIT');

    console.log(
      `[AUDIT_VENUE_DELETE] User: ${userEmail} | VenueID: ${id} ("${venue.name}") | Result: DELETED | Timestamp: ${new Date().toISOString()}`
    );

    return c.json({
      status: 'ok',
      message: `Local #${id} ("${venue.name}") eliminado con éxito de forma definitiva.`,
      deleted_venue: delRes.rows[0],
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    // Salvaguarda frente a condición de carrera: si otra transacción creó una FK concurrente
    if (err.code === '23503') {
      console.warn(
        `[AUDIT_VENUE_DELETE] User: ${userEmail} | VenueID: ${id} | Result: BLOCKED | Reason: Foreign key constraint violation (23503) | Timestamp: ${new Date().toISOString()}`
      );
      return c.json(
        {
          error: 'venue_has_dependencies',
          message: `No se puede eliminar el local #${id} porque existen referencias activas de clave foránea en otras tablas.`,
          dependencies: ['Existen referencias foráneas concurrentes que impiden el borrado.'],
        },
        409
      );
    }

    console.error(
      `[AUDIT_VENUE_DELETE] User: ${userEmail} | VenueID: ${id} | Result: ERROR | Error: ${err.message} | Timestamp: ${new Date().toISOString()}`
    );
    return c.json({ error: 'db_error', message: err.message || 'Error al eliminar el local.' }, 500);
  } finally {
    client.release();
  }
});

/**
 * Normaliza y valida la URL de Facebook.
 * Acepta URLs completas pertenecientes al dominio facebook.com.
 * Normaliza m.facebook.com a www.facebook.com.
 * Convierte valores vacíos a NULL. Rechaza texto libre e identificadores sueltos.
 */
export function normalizeFacebookUrl(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') {
    throw new Error('invalid_facebook_url');
  }
  const trimmed = input.trim();
  if (trimmed === '') return null;

  let parsed: URL;
  try {
    const urlToParse = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(urlToParse);
  } catch {
    throw new Error('invalid_facebook_url');
  }

  const host = parsed.hostname.toLowerCase();
  const isFacebookHost = host === 'facebook.com' || host.endsWith('.facebook.com');
  if (!isFacebookHost) {
    throw new Error('invalid_facebook_url');
  }

  if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.trim() === '') {
    throw new Error('invalid_facebook_url');
  }

  // Normaliza cualquier subdominio (m., es-la., es-es., etc.) o facebook.com a www.facebook.com
  parsed.hostname = 'www.facebook.com';

  if (parsed.pathname && parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  parsed.protocol = 'https:';
  return parsed.toString();
}

/**
 * Normaliza y valida website_url.
 * Rechaza URLs pertenecientes a Facebook (facebook.com y sus subdominios) con error 'facebook_url_required'.
 * Convierte valores vacíos a NULL.
 */
export function normalizeWebsiteUrl(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') {
    throw new Error('invalid_website_url');
  }
  const trimmed = input.trim();
  if (trimmed === '') return null;

  let parsed: URL;
  try {
    const urlToParse = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(urlToParse);
  } catch {
    throw new Error('invalid_website_url');
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'facebook.com' || host.endsWith('.facebook.com')) {
    const err = new Error('Las URLs de Facebook deben guardarse en el campo facebook_url.');
    err.name = 'facebook_url_required';
    throw err;
  }

  parsed.protocol = 'https:';
  return parsed.toString();
}

/**
 * Normaliza instagram_handle eliminando '@', espacios y URLs completas.
 * Convierte valores vacíos a NULL.
 */
export function normalizeInstagramHandle(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') return null;
  let val = input.trim();
  if (val === '') return null;

  const match = val.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/i);
  if (match) {
    val = match[1];
  }
  val = val.replace(/@+/g, '').trim();
  return val === '' ? null : val;
}

/**
 * Valida coordenadas geográficas (latitud / longitud).
 */
export function validateCoordinate(input: unknown, type: 'latitude' | 'longitude'): number | null {
  if (input === undefined) return null;
  if (input === null || input === '') return null;
  const num = Number(input);
  if (Number.isNaN(num)) {
    throw new Error(`invalid_${type}`);
  }
  if (type === 'latitude' && (num < -90 || num > 90)) {
    throw new Error('invalid_latitude');
  }
  if (type === 'longitude' && (num < -180 || num > 180)) {
    throw new Error('invalid_longitude');
  }
  return num;
}

/**
 * Valida campo is_active como booleano.
 */
export function validateIsActive(input: unknown): boolean {
  if (typeof input === 'boolean') return input;
  if (input === 'true' || input === '1' || input === 1) return true;
  if (input === 'false' || input === '0' || input === 0) return false;
  throw new Error('invalid_is_active');
}

/**
 * POST /api/v1/admin/venues
 * Crear un nuevo local
 */
adminVenuesRoutes.post('/venues', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const cityId = Number(body.city_id || 1);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length < 2) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre del local es obligatorio y debe tener al menos 2 caracteres.' }, 400);
  }

  const rawSlug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const slug = rawSlug || name.toLowerCase().replace(/[^a-z0-9]/g, '-') || `local-${Date.now()}`;
  const address = typeof body.address === 'string' ? body.address.trim() || null : null;
  const googleMapsUrl = typeof body.google_maps_url === 'string' ? body.google_maps_url.trim() || null : null;
  const whatsappContact = typeof body.whatsapp_contact === 'string' ? body.whatsapp_contact.trim() || null : null;
  const zone = typeof body.zone === 'string' ? body.zone.trim() || null : null;
  const category = typeof body.category === 'string' ? body.category.trim() || 'general' : 'general';
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  try {
    latitude = validateCoordinate(body.latitude, 'latitude');
    longitude = validateCoordinate(body.longitude, 'longitude');
  } catch {
    return c.json({ error: 'invalid_parameter', message: 'Coordenadas geográficas inválidas (latitud: -90 a 90, longitud: -180 a 180).' }, 400);
  }

  let isActive = true;
  if (body.is_active !== undefined) {
    try {
      isActive = validateIsActive(body.is_active);
    } catch {
      return c.json({ error: 'invalid_parameter', message: 'El campo is_active debe ser un booleano.' }, 400);
    }
  }

  let websiteUrl: string | null = null;
  try {
    websiteUrl = normalizeWebsiteUrl(body.website_url);
  } catch (err: any) {
    if (err.name === 'facebook_url_required') {
      return c.json({ error: 'facebook_url_required', message: err.message }, 400);
    }
    return c.json({ error: 'invalid_parameter', message: 'URL de sitio web oficial inválida.' }, 400);
  }

  let facebookUrl: string | null = null;
  try {
    facebookUrl = normalizeFacebookUrl(body.facebook_url);
  } catch {
    return c.json({ error: 'invalid_parameter', message: 'URL de Facebook inválida. Debe ser una URL completa de Facebook (ej: https://www.facebook.com/pagina).' }, 400);
  }

  const instagramHandle = normalizeInstagramHandle(body.instagram_handle);

  const insertSql = `
    INSERT INTO venues (
      city_id, name, slug, address, latitude, longitude,
      google_maps_url, instagram_handle, whatsapp_contact, website_url, facebook_url,
      is_active, zone, category, phone, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), now())
    RETURNING *;
  `;

  try {
    const result = await query(insertSql, [
      cityId,
      name,
      slug,
      address,
      latitude,
      longitude,
      googleMapsUrl,
      instagramHandle,
      whatsappContact,
      websiteUrl,
      facebookUrl,
      isActive,
      zone,
      category,
      phone,
    ]);

    return c.json({ status: 'ok', venue: result.rows[0] }, 201);
  } catch (err: any) {
    return c.json({ error: 'db_error', message: err?.message || 'Error al guardar el local.' }, 500);
  }
});

/**
 * PATCH /api/v1/admin/venues/:id
 * Modificar datos de un local existente
 */
adminVenuesRoutes.patch('/venues/:id', async (c) => {
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
    'name',
    'slug',
    'address',
    'latitude',
    'longitude',
    'google_maps_url',
    'instagram_handle',
    'whatsapp_contact',
    'website_url',
    'facebook_url',
    'is_active',
    'zone',
    'category',
    'phone',
  ];

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      let normalizedValue: any = body[field];

      if (field === 'name') {
        const trimmed = typeof body.name === 'string' ? body.name.trim() : '';
        if (trimmed.length < 2) {
          return c.json({ error: 'invalid_parameter', message: 'El nombre del local debe tener al menos 2 caracteres.' }, 400);
        }
        normalizedValue = trimmed;
      } else if (field === 'slug') {
        const trimmed = typeof body.slug === 'string' ? body.slug.trim() : '';
        if (trimmed.length === 0) {
          return c.json({ error: 'invalid_parameter', message: 'El slug no puede estar vacío.' }, 400);
        }
        normalizedValue = trimmed;
      } else if (field === 'website_url') {
        try {
          normalizedValue = normalizeWebsiteUrl(body.website_url);
        } catch (err: any) {
          if (err.name === 'facebook_url_required') {
            return c.json({ error: 'facebook_url_required', message: err.message }, 400);
          }
          return c.json({ error: 'invalid_parameter', message: 'URL de sitio web oficial inválida.' }, 400);
        }
      } else if (field === 'facebook_url') {
        try {
          normalizedValue = normalizeFacebookUrl(body.facebook_url);
        } catch {
          return c.json({ error: 'invalid_parameter', message: 'URL de Facebook inválida. Debe ser una URL completa de Facebook (ej: https://www.facebook.com/pagina).' }, 400);
        }
      } else if (field === 'instagram_handle') {
        normalizedValue = normalizeInstagramHandle(body.instagram_handle);
      } else if (field === 'latitude') {
        try {
          normalizedValue = validateCoordinate(body.latitude, 'latitude');
        } catch {
          return c.json({ error: 'invalid_parameter', message: 'Latitud inválida (debe estar entre -90 y 90).' }, 400);
        }
      } else if (field === 'longitude') {
        try {
          normalizedValue = validateCoordinate(body.longitude, 'longitude');
        } catch {
          return c.json({ error: 'invalid_parameter', message: 'Longitud inválida (debe estar entre -180 y 180).' }, 400);
        }
      } else if (field === 'is_active') {
        try {
          normalizedValue = validateIsActive(body.is_active);
        } catch {
          return c.json({ error: 'invalid_parameter', message: 'El campo is_active debe ser un booleano.' }, 400);
        }
      } else if (typeof normalizedValue === 'string') {
        const trimmed = normalizedValue.trim();
        normalizedValue = trimmed === '' ? null : trimmed;
      }

      values.push(normalizedValue);
      updates.push(`${field} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'no_fields_to_update', message: 'No se enviaron campos válidos.' }, 400);
  }

  values.push(id);
  const sql = `
    UPDATE venues
    SET ${updates.join(', ')}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const result = await query(sql, values);
  if (result.rows.length === 0) {
    return c.json({ error: 'venue_not_found', message: `Local ${id} no encontrado.` }, 404);
  }

  return c.json({ status: 'ok', venue: result.rows[0] });
});
