import { Hono } from 'hono';
import { query } from '@vayaplan/db';

export const adminPlacesRoutes = new Hono();

function isValidHttpUrl(str: string): boolean {
  try {
    const parsed = new URL(str);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface PlaceAttributionFields {
  imageUrl: string | null;
  imageAuthor: string | null;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  imageModifications: string | null;
}

function validatePlaceAttribution(fields: PlaceAttributionFields): { valid: boolean; error?: string } {
  const { imageUrl, imageAuthor, imageSourceUrl, imageLicense, imageLicenseUrl, imageModifications } = fields;

  const hasAnyAttribution = Boolean(
    (imageAuthor && imageAuthor.length > 0) ||
    (imageSourceUrl && imageSourceUrl.length > 0) ||
    (imageLicense && imageLicense.length > 0) ||
    (imageLicenseUrl && imageLicenseUrl.length > 0) ||
    (imageModifications && imageModifications.length > 0)
  );

  if (!hasAnyAttribution) {
    return { valid: true };
  }

  // Si hay atribución, se exige obligatoriamente image_url no vacía
  if (!imageUrl || imageUrl.length === 0) {
    return {
      valid: false,
      error: 'La atribución requiere que el lugar tenga una imagen válida asignada (image_url).',
    };
  }

  // Autor obligatorio, máx 150 caracteres
  if (!imageAuthor || imageAuthor.length === 0) {
    return { valid: false, error: 'El autor de la fotografía es obligatorio cuando se indica atribución.' };
  }
  if (imageAuthor.length > 150) {
    return { valid: false, error: 'El nombre del autor no puede superar 150 caracteres.' };
  }

  // Fuente original obligatoria y URL válida (http o https)
  if (!imageSourceUrl || imageSourceUrl.length === 0) {
    return { valid: false, error: 'La URL de la fuente original es obligatoria cuando se indica atribución.' };
  }
  if (!isValidHttpUrl(imageSourceUrl)) {
    return { valid: false, error: 'La URL de la fuente original no es válida. Debe comenzar por http:// o https://.' };
  }

  // Licencia obligatoria, máx 50 caracteres
  if (!imageLicense || imageLicense.length === 0) {
    return { valid: false, error: 'La licencia de la fotografía es obligatoria cuando se indica atribución.' };
  }
  if (imageLicense.length > 50) {
    return { valid: false, error: 'El identificador de licencia no puede superar 50 caracteres.' };
  }

  // URL de licencia obligatoria y URL válida (http o https)
  if (!imageLicenseUrl || imageLicenseUrl.length === 0) {
    return { valid: false, error: 'La URL de la licencia es obligatoria cuando se indica atribución.' };
  }
  if (!isValidHttpUrl(imageLicenseUrl)) {
    return { valid: false, error: 'La URL de la licencia no es válida. Debe comenzar por http:// o https://.' };
  }

  // Modificaciones opcionales, máx 255 caracteres
  if (imageModifications && imageModifications.length > 255) {
    return { valid: false, error: 'La descripción de modificaciones no puede superar 255 caracteres.' };
  }

  return { valid: true };
}

/**
 * GET /api/v1/admin/places
 * Listar todos los lugares permanentes
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
  const description = normalizeString(body.description);
  const openingHoursText = normalizeString(body.opening_hours_text);
  const priceText = normalizeString(body.price_text);
  const latitude = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
  const longitude = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;
  const googleMapsUrl = normalizeString(body.google_maps_url);
  const imageUrl = normalizeString(body.image_url);
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;

  const imageAuthor = normalizeString(body.image_author);
  const imageSourceUrl = normalizeString(body.image_source_url);
  const imageLicense = normalizeString(body.image_license);
  const imageLicenseUrl = normalizeString(body.image_license_url);
  const imageModifications = normalizeString(body.image_modifications);

  if (!name || name.length < 2) {
    return c.json({ error: 'invalid_parameter', message: 'El nombre es obligatorio.' }, 400);
  }
  if (!highlightText) {
    return c.json({ error: 'invalid_parameter', message: 'highlight_text es obligatorio.' }, 400);
  }

  const attributionValidation = validatePlaceAttribution({
    imageUrl,
    imageAuthor,
    imageSourceUrl,
    imageLicense,
    imageLicenseUrl,
    imageModifications,
  });

  if (!attributionValidation.valid) {
    return c.json({ error: 'invalid_attribution', message: attributionValidation.error }, 400);
  }

  const slug = rawSlug || `lugar-${Date.now()}`;

  const sql = `
    INSERT INTO places (
      city_id, venue_id, name, slug, category,
      highlight_text, description, opening_hours_text, price_text,
      latitude, longitude, google_maps_url, image_url,
      image_author, image_source_url, image_license, image_license_url, image_modifications,
      is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now())
    RETURNING *;
  `;

  try {
    const result = await query(sql, [
      cityId, venueId, name, slug, category,
      highlightText, description, openingHoursText, priceText,
      latitude, longitude, googleMapsUrl, imageUrl,
      imageAuthor, imageSourceUrl, imageLicense, imageLicenseUrl, imageModifications,
      isActive,
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

  // 1. Obtener registro actual para combinar estados
  const currentResult = await query(`SELECT * FROM places WHERE id = $1;`, [id]);
  if (currentResult.rows.length === 0) {
    return c.json({ error: 'place_not_found', message: `Lugar ${id} no encontrado.` }, 404);
  }
  const current = currentResult.rows[0];

  // 2. Resolver valores combinados para imagen y atribución
  let finalImageUrl = body.image_url !== undefined
    ? normalizeString(body.image_url)
    : normalizeString(current.image_url);

  let finalAuthor = body.image_author !== undefined
    ? normalizeString(body.image_author)
    : normalizeString(current.image_author);

  let finalSourceUrl = body.image_source_url !== undefined
    ? normalizeString(body.image_source_url)
    : normalizeString(current.image_source_url);

  let finalLicense = body.image_license !== undefined
    ? normalizeString(body.image_license)
    : normalizeString(current.image_license);

  let finalLicenseUrl = body.image_license_url !== undefined
    ? normalizeString(body.image_license_url)
    : normalizeString(current.image_license_url);

  let finalModifications = body.image_modifications !== undefined
    ? normalizeString(body.image_modifications)
    : normalizeString(current.image_modifications);

  // 3. Gestión explícita de eliminación de imagen
  // Si se elimina la imagen (image_url = null)
  if (body.image_url !== undefined && finalImageUrl === null) {
    const explicitAttributionInBody = Boolean(
      normalizeString(body.image_author) ||
      normalizeString(body.image_source_url) ||
      normalizeString(body.image_license) ||
      normalizeString(body.image_license_url)
    );
    if (explicitAttributionInBody) {
      return c.json(
        {
          error: 'invalid_attribution',
          message: 'No se pueden asignar créditos de fotografía si se elimina la imagen del lugar.',
        },
        400
      );
    }
    // Si no se enviaron créditos contradictorios, limpiar automáticamente la atribución
    finalAuthor = null;
    finalSourceUrl = null;
    finalLicense = null;
    finalLicenseUrl = null;
    finalModifications = null;
  }

  // 4. Validar integridad del estado final resultante
  const attributionValidation = validatePlaceAttribution({
    imageUrl: finalImageUrl,
    imageAuthor: finalAuthor,
    imageSourceUrl: finalSourceUrl,
    imageLicense: finalLicense,
    imageLicenseUrl: finalLicenseUrl,
    imageModifications: finalModifications,
  });

  if (!attributionValidation.valid) {
    return c.json({ error: 'invalid_attribution', message: attributionValidation.error }, 400);
  }

  const allowedFields = [
    'name', 'slug', 'category', 'highlight_text', 'description',
    'opening_hours_text', 'price_text', 'latitude', 'longitude',
    'google_maps_url', 'image_url', 'is_active', 'venue_id',
    'image_author', 'image_source_url', 'image_license', 'image_license_url', 'image_modifications'
  ];

  // Preparar payload normalizado para actualización
  const normalizedPayload: Record<string, any> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (['description', 'opening_hours_text', 'price_text', 'google_maps_url', 'image_url', 'image_author', 'image_source_url', 'image_license', 'image_license_url', 'image_modifications'].includes(field)) {
        normalizedPayload[field] = normalizeString(body[field]);
      } else if (field === 'latitude' || field === 'longitude') {
        normalizedPayload[field] = body[field] !== null && body[field] !== '' ? Number(body[field]) : null;
      } else if (field === 'venue_id') {
        normalizedPayload[field] = body[field] !== null && body[field] !== '' ? Number(body[field]) : null;
      } else if (field === 'is_active') {
        normalizedPayload[field] = Boolean(body[field]);
      } else if (typeof body[field] === 'string') {
        normalizedPayload[field] = body[field].trim();
      } else {
        normalizedPayload[field] = body[field];
      }
    }
  }

  // Si se eliminó la imagen y auto-limpiamos atribución, sincronizar en el payload
  if (body.image_url !== undefined && finalImageUrl === null) {
    normalizedPayload.image_author = null;
    normalizedPayload.image_source_url = null;
    normalizedPayload.image_license = null;
    normalizedPayload.image_license_url = null;
    normalizedPayload.image_modifications = null;
  }

  const updates: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (normalizedPayload[field] !== undefined) {
      values.push(normalizedPayload[field]);
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

  try {
    const result = await query(sql, values);
    return c.json({ status: 'ok', place: result.rows[0] });
  } catch (err: any) {
    return c.json({ error: 'db_error', message: err?.message || 'Error al actualizar el lugar.' }, 500);
  }
});
