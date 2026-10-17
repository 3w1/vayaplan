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
  const isProtected = id === 9999;
  const depCheck = await checkVenueDependencies(id);

  return c.json({
    venue: {
      id: venue.id,
      name: venue.name,
      city_id: venue.city_id,
      city_name: venue.city_name,
    },
    is_protected: isProtected,
    can_delete: !isProtected && !depCheck.hasDependencies,
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

  // 1. Protección estricta del local provisional ID 9999
  if (id === 9999) {
    console.warn(
      `[AUDIT_VENUE_DELETE] User: ${userEmail} | VenueID: 9999 | Result: BLOCKED | Reason: Local provisional protegido | Timestamp: ${new Date().toISOString()}`
    );
    return c.json(
      {
        error: 'forbidden',
        message: 'El local provisional ID 9999 es un recurso esencial protegido del sistema y no puede eliminarse.',
      },
      403
    );
  }

  // 2. Borrado transaccional protegido con bloqueo de fila frente a condiciones de carrera
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
  const name = body.name?.trim();
  const rawSlug = body.slug?.trim() || name?.toLowerCase()?.replace(/[^a-z0-9]/g, '-');
  const address = body.address?.trim() || null;
  const latitude = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
  const longitude = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;
  const googleMapsUrl = body.google_maps_url?.trim() || null;
  const instagramHandle = body.instagram_handle?.trim()?.replace('@', '') || null;
  const whatsappContact = body.whatsapp_contact?.trim() || null;
  const websiteUrl = body.website_url?.trim() || null;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;
  const zone = body.zone?.trim() || null;
  const category = body.category?.trim() || 'general';
  const phone = body.phone?.trim() || null;

  if (!name || name.length < 2) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre del local es obligatorio.' }, 400);
  }

  const slug = rawSlug || `local-${Date.now()}`;

  const insertSql = `
    INSERT INTO venues (
      city_id, name, slug, address, latitude, longitude,
      google_maps_url, instagram_handle, whatsapp_contact, website_url,
      is_active, zone, category, phone, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
    RETURNING id, name, slug;
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
    'is_active',
    'zone',
    'category',
    'phone',
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
