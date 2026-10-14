import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import type { Venue } from '@vayaplan/types';

export const adminVenuesRoutes = new Hono();

adminVenuesRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/venues
 * Listado de todos los locales censados
 */
adminVenuesRoutes.get('/venues', async (c) => {
  const result = await query<Venue>(
    `SELECT * FROM venues ORDER BY name ASC;`
  );
  return c.json({ total: result.rows.length, venues: result.rows });
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

  if (!name || name.length < 2) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre del local es obligatorio.' }, 400);
  }

  const slug = rawSlug || `local-${Date.now()}`;

  const insertSql = `
    INSERT INTO venues (
      city_id, name, slug, address, latitude, longitude,
      google_maps_url, instagram_handle, whatsapp_contact, website_url,
      is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
    RETURNING id, name, slug;
  `;

  try {
    const result = await query(insertSql, [
      cityId, name, slug, address, latitude, longitude,
      googleMapsUrl, instagramHandle, whatsappContact, websiteUrl, isActive
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
    'name', 'slug', 'address', 'latitude', 'longitude',
    'google_maps_url', 'instagram_handle', 'whatsapp_contact',
    'website_url', 'is_active'
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
