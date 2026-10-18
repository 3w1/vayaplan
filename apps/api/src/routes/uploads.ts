import { Hono } from 'hono';
import * as path from 'path';
import * as fs from 'fs';
import { getUploadsDir } from '../services/image-storage';

export const publicUploadsRoutes = new Hono();

function sendFileResponse(filePath: string, filename: string): Response {
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';

  const fileBuffer = fs.readFileSync(filePath);

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * GET /api/v1/uploads/:filename
 * Sirve imágenes locales legacy con compatibilidad hacia atrás y caché inmutable
 */
publicUploadsRoutes.get('/uploads/:filename', async (c) => {
  const filename = c.req.param('filename');

  // Validar formato estricto del nombre de archivo (evita directory traversal y caracteres peligrosos)
  if (!filename || !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return c.notFound();
  }

  const uploadsDir = getUploadsDir();
  const filePath = path.resolve(uploadsDir, filename);

  // Garantizar que la ruta resuelta permanezca dentro del directorio de subidas
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return c.notFound();
  }

  return sendFileResponse(filePath, filename);
});

/**
 * GET /media/:prefix/:filename
 * Servidor de desarrollo/test local para simular la entrega de Cloudflare R2 (media.vayaplan.com)
 */
publicUploadsRoutes.get('/media/:prefix/:filename', async (c) => {
  const prefix = c.req.param('prefix');
  const filename = c.req.param('filename');

  if (
    !prefix ||
    !filename ||
    !/^[a-zA-Z0-9_-]+$/i.test(prefix) ||
    !/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)
  ) {
    return c.notFound();
  }

  const uploadsDir = getUploadsDir();
  const filePath = path.resolve(uploadsDir, prefix, filename);

  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    return c.notFound();
  }

  return sendFileResponse(filePath, filename);
});
