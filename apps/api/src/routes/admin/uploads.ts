import * as path from 'path';
import * as fs from 'fs';
import { Hono } from 'hono';
import { requireAdminAuth } from '../../middleware/auth';
import {
  MAX_UPLOAD_SIZE,
  validateImageMagicBytes,
  saveImageUpload,
  cleanupOrphanUploads,
  getPrivateUploadsDir,
  TransformQueueFullError,
  TransformQueueTimeoutError,
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

  try {
    const saved = await saveImageUpload(buffer, detected.ext);

    return c.json({
      status: 'ok',
      key: saved.key,
      filename: saved.filename,
      url: saved.url,
      thumb_url: saved.thumb_url,
      original_url: saved.original_url,
      size_bytes: saved.size,
      mime_type: saved.mimeType,
      provider: saved.provider,
      variants: saved.variants,
    }, 201);
  } catch (err: any) {
    if (err instanceof TransformQueueFullError || err.code === 'queue_full') {
      return c.json({
        error: 'queue_full',
        message: err.message,
      }, 503);
    }
    if (err instanceof TransformQueueTimeoutError || err.code === 'queue_timeout') {
      return c.json({
        error: 'queue_timeout',
        message: err.message,
      }, 504);
    }

    const isConfigError = err.message?.includes('no configurado') || err.message?.includes('R2_');
    const isValidationError =
      err.message?.includes('dañado') ||
      err.message?.includes('animadas') ||
      err.message?.includes('dimensiones máximas') ||
      err.message?.includes('no es una imagen válida') ||
      err.message?.includes('determinar las dimensiones');
    const statusCode = isValidationError ? 400 : (isConfigError ? 503 : 500);
    const errorCode = isValidationError ? 'invalid_image' : (isConfigError ? 'storage_unconfigured' : 'storage_error');
    return c.json({
      error: errorCode,
      message: err.message || 'Error al procesar o almacenar la imagen en Cloudflare R2.',
    }, statusCode as any);
  }
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

/**
 * GET /api/v1/admin/uploads/originals/:filename
 * Recupera el archivo original con metadatos de forma estrictamente autenticada
 */
adminUploadsRoutes.get('/uploads/originals/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!filename || !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return c.json({ error: 'invalid_filename', message: 'Nombre de archivo no válido.' }, 400);
  }

  const privateDir = getPrivateUploadsDir();
  const filePath = path.resolve(privateDir, filename);

  if (!filePath.startsWith(privateDir) || !fs.existsSync(filePath)) {
    return c.json({ error: 'not_found', message: 'Archivo original no encontrado.' }, 404);
  }

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';

  const fileBuffer = await fs.promises.readFile(filePath);

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
