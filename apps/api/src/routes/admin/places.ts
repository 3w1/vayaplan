import { Hono } from 'hono';
import { query } from '@vayaplan/db';
import { requireAdminAuth } from '../../middleware/auth';
import type { PlaceItem } from '@vayaplan/types';

export const adminPlacesRoutes = new Hono();

adminPlacesRoutes.use('*', requireAdminAuth);

/**
 * GET /api/v1/admin/places
 * Lista de todos los lugares y planes permanentes
 */
adminPlacesRoutes.get('/places', async (c) => {
  const result = await query(
    `SELECT * FROM places ORDER BY name ASC;`
  );
  return c.json({ total: result.rows.length, places: result.rows });
});

/**
 * POST /api/v1/admin/places
 * Crear un nuevo lugar o plan permanente
 */
adminPlacesRoutes.post('/places', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json', message: 'Cuerpo de petición inválido.' }, 400);
  }

  const cityId = Number(body.city_id || 1);
  const venueId = body.venue_id ? Number(body.venue_id) : null;
  const name = body.name?.trim();
  const rawSlug = body.slug?.trim() || name?.toLowerCase()?.replace(/[^a-z0-9]/g, '-');
  const category = body.category?.trim() || 'cultura';
  const highlightText = body.highlight_text?.trim() || '';
  const description = body.description?.trim() || null;
  const openingHoursText = body.opening_hours_text?.trim() || null;
  const priceText = body.price_text?.trim() || null;
  const latitude = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
  const longitude = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;
  const googleMapsUrl = body.google_maps_url?.trim() || null;
  const imageUrl = body.image_url?.trim() || null;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;

  if (!name || name.length < 2) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre es obligatorio.' }, 400);
  }
  if (!highlightText) {
    return c.json({ error: 'invalid_parameter', message: 'highlight_text es obligatorio.' }, 400);
  }

  const slug = rawSlug || `lugar-${Date.now()}`;

  const sql = `
    INSERT INTO places (
      city_id, venue_id, name, slug, category,
      highlight_text, description, opening_hours_text, price_text,
      latitude, longitude, google_maps_url, image_url, is_active,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
    RETURNING id, name, slug;
  `;

  try {
    const result = await query(sql, [
      cityId, venueId, name, slug, category,
      highlightText, description, openingHoursText, priceText,
      latitude, longitude, googleMapsUrl, imageUrl, isActive
    ]);

    return c.json({ status: 'ok', place: result.rows[0] }, 201);
  } catch (err: any) {
    return c.json({ error: 'db_error', message: err?.message || 'Error al guardar el lugar.' }, 500);
  }
});

/**
 * PATCH /api/v1/admin/places/:id
 * Modificar un lugar permanente existente
 */
adminPlacesRoutes.patch('/places/:id', async (c) => {
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
    'name', 'slug', 'category', 'highlight_text', 'description',
    'opening_hours_text', 'price_text', 'latitude', 'longitude',
    'google_maps_url', 'image_url', 'is_active', 'venue_id'
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
    UPDATE places
    SET ${updates.join(', ')}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING *;
  `;

  const result = await query(sql, values);
  if (result.rows.length === 0) {
    return c.json({ error: 'place_not_found', message: `Lugar ${id} no encontrado.` }, 404);
  }

  return c.json({ status: 'ok', place: result.rows[0] });
});
