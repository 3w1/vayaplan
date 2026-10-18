import * as fs from 'fs';
import * as path from 'path';
import { query } from '@vayaplan/db';

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

export interface DetectedImageFormat {
  ext: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Valida el contenido real de los bytes de cabecera (magic bytes)
 * Admite exclusivamente JPEG, PNG y WebP.
 */
export function validateImageMagicBytes(buffer: Buffer): DetectedImageFormat | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // WebP: RIFF (bytes 0-3) + bytes 4-7 size + WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }

  return null;
}

/**
 * Obtiene la ruta del directorio de almacenamiento persistente de imágenes
 */
export function getUploadsDir(): string {
  const dir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Guarda una imagen validada en almacenamiento persistente con nombre UUID seguro
 */
export async function saveImageUpload(buffer: Buffer, ext: string): Promise<{ filename: string; url: string; size: number }> {
  const uploadsDir = getUploadsDir();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(uploadsDir, filename);

  await fs.promises.writeFile(filePath, buffer);

  return {
    filename,
    url: `/api/v1/uploads/${filename}`,
    size: buffer.length,
  };
}

/**
 * Limpieza de subidas huérfanas:
 * Elimina imágenes no asociadas a ningún evento o lugar cuya antigüedad supere el periodo de gracia.
 * No borra imágenes compartidas o referenciadas en base de datos.
 */
export async function cleanupOrphanUploads(options: { graceHours?: number; dryRun?: boolean } = {}) {
  const graceHours = options.graceHours !== undefined ? options.graceHours : 24;
  const dryRun = options.dryRun ?? false;
  const uploadsDir = getUploadsDir();

  if (!fs.existsSync(uploadsDir)) {
    return { total_files: 0, deleted_count: 0, preserved_count: 0, grace_hours: graceHours };
  }

  const files = fs.readdirSync(uploadsDir);
  const totalFiles = files.length;

  // Consultar todas las imágenes referenciadas en events y places
  const eventsResult = await query('SELECT image_url FROM events WHERE image_url IS NOT NULL');
  const placesResult = await query('SELECT image_url FROM places WHERE image_url IS NOT NULL');

  const referencedBasenames = new Set<string>();
  for (const row of eventsResult.rows) {
    if (row.image_url) {
      referencedBasenames.add(path.basename(row.image_url));
    }
  }
  for (const row of placesResult.rows) {
    if (row.image_url) {
      referencedBasenames.add(path.basename(row.image_url));
    }
  }

  const cutoffTime = Date.now() - graceHours * 3600 * 1000;
  let deletedCount = 0;
  let preservedCount = 0;

  for (const file of files) {
    if (referencedBasenames.has(file)) {
      preservedCount++;
      continue;
    }

    const fullPath = path.join(uploadsDir, file);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.isFile() && stats.mtimeMs < cutoffTime) {
        if (!dryRun) {
          fs.unlinkSync(fullPath);
        }
        deletedCount++;
      } else {
        preservedCount++;
      }
    } catch {
      preservedCount++;
    }
  }

  return {
    total_files: totalFiles,
    deleted_count: deletedCount,
    preserved_count: preservedCount,
    grace_hours: graceHours,
  };
}
