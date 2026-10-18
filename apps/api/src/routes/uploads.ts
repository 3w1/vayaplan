import { Hono } from 'hono';
import * as path from 'path';
import * as fs from 'fs';
import { getUploadsDir } from '../services/image-storage';

export const publicUploadsRoutes = new Hono();

/**
 * GET /api/v1/uploads/:filename
 * Sirve imágenes de eventos y locales de forma pública con caché inmutable
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
  if (!filePath.startsWith(uploadsDir)) {
    return c.notFound();
  }

  if (!fs.existsSync(filePath)) {
    return c.notFound();
  }

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
});
