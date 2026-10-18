import { Hono } from 'hono';
import { requireAdminAuth } from '../../middleware/auth';
import {
  MAX_UPLOAD_SIZE,
  validateImageMagicBytes,
  saveImageUpload,
  cleanupOrphanUploads,
} from '../../services/image-storage';
import type { AdminUser } from '@vayaplan/types';

export const adminUploadsRoutes = new Hono<{
  Variables: {
    user?: AdminUser;
  };
}>();

// Proteger todas las rutas administrativas de subida con autenticación JWT
adminUploadsRoutes.use('*', requireAdminAuth);

/**
 * POST /api/v1/admin/uploads
 * Sube y almacena una imagen de cartel tras validar tamaño y magic bytes reales en servidor
 */
adminUploadsRoutes.post('/uploads', async (c) => {
  let file: any;
  try {
    const body = await c.req.parseBody();
    file = body['file'] || body['image'];
  } catch (err) {
    return c.json({ error: 'invalid_multipart', message: 'Cuerpo de petición multipart no válido.' }, 400);
  }

  if (!file || !(file instanceof Blob)) {
    return c.json({ error: 'invalid_parameter', message: 'No se ha seleccionado ningún archivo para subir.' }, 400);
  }

  if (file.size === 0) {
    return c.json({ error: 'invalid_file', message: 'El archivo está vacío.' }, 400);
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return c.json({
      error: 'file_too_large',
      message: 'El archivo supera el tamaño máximo permitido de 5 MB. Optimiza o reduce la imagen antes de subirla.',
    }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validación estricta del contenido real (magic bytes)
  const detected = validateImageMagicBytes(buffer);
  if (!detected) {
    return c.json({
      error: 'unsupported_format',
      message: 'Formato no admitido. El archivo debe ser una imagen real en formato JPEG, PNG o WebP.',
    }, 400);
  }

  const saved = await saveImageUpload(buffer, detected.ext);

  return c.json({
    status: 'ok',
    filename: saved.filename,
    url: saved.url,
    size_bytes: saved.size,
    mime_type: detected.mime,
  }, 201);
});

/**
 * POST /api/v1/admin/uploads/cleanup
 * Limpia imágenes huérfanas en el almacenamiento persistente
 */
adminUploadsRoutes.post('/uploads/cleanup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const graceHours = typeof body.grace_hours === 'number' ? body.grace_hours : 24;
  const dryRun = Boolean(body.dry_run);

  const result = await cleanupOrphanUploads({ graceHours, dryRun });

  return c.json({
    status: 'ok',
    ...result,
  }, 200);
});
