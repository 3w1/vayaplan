import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { query } from '@vayaplan/db';
import {
  isR2Configured,
  getR2Config,
  getPublicUrlForKey,
  getKeyFromPublicUrl,
  putR2Object,
  deleteR2Object,
  listR2Objects,
  R2StorageConfig,
} from './r2-client';

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

export interface DetectedImageFormat {
  ext: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface SavedImageResult {
  key: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  provider: 'cloudflare_r2';
}

export interface SaveImageOptions {
  prefix?: string;
  metadata?: Record<string, string>;
  sourceUrl?: string;
}

// Re-exportar funciones de configuración y URLs para consumidores externos e importadores
export { isR2Configured, getR2Config, getPublicUrlForKey, getKeyFromPublicUrl };
export type { R2StorageConfig };

/**
 * Valida el contenido real de los bytes de cabecera (magic bytes).
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
 * Obtiene la ruta del directorio local (utilizado solo para compatibilidad y archivos temporales)
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
 * Ejecuta una operación con un archivo temporal en disco garantizando su borrado en finally.
 */
export async function withTempFile<T>(
  filenamePrefix: string,
  ext: string,
  action: (tempFilePath: string) => Promise<T>
): Promise<T> {
  const tempName = `${filenamePrefix}-${Date.now()}-${crypto.randomUUID()}.${ext.replace(/^\./, '')}`;
  const tempPath = path.join(os.tmpdir(), tempName);
  try {
    return await action(tempPath);
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch {
      // Ignorar error al limpiar temporal
    }
  }
}

/**
 * Guarda una imagen validada en almacenamiento persistente Cloudflare R2 con nombre UUID seguro.
 * NO usa el disco local como fallback silencioso: si Cloudflare falla o no está configurado, lanza un error explícito.
 */
export async function saveImageUpload(
  buffer: Buffer,
  ext: string,
  options: SaveImageOptions = {}
): Promise<SavedImageResult> {
  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error(
      `El archivo supera el tamaño máximo permitido de 5 MB (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  const detected = validateImageMagicBytes(buffer);
  if (!detected) {
    throw new Error('Formato no admitido. La imagen debe ser un archivo auténtico JPEG, PNG o WebP.');
  }

  const prefix = (options.prefix || 'events').replace(/^\/+|\/+$/g, '');
  const filename = `${crypto.randomUUID()}.${detected.ext}`;
  const key = `${prefix}/${filename}`;

  const metadata = { ...(options.metadata || {}) };
  if (options.sourceUrl) {
    metadata.source_url = options.sourceUrl;
  }

  try {
    await putR2Object({
      key,
      body: buffer,
      contentType: detected.mime,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata,
    });

    // En modo de desarrollo o tests sintéticos locales, mantener copia para servirla por /media
    if (process.env.SERVE_DEV_MEDIA === 'true') {
      const devPath = path.join(getUploadsDir(), key);
      const devDir = path.dirname(devPath);
      if (!fs.existsSync(devDir)) fs.mkdirSync(devDir, { recursive: true });
      await fs.promises.writeFile(devPath, buffer);
    }
  } catch (err: any) {
    // Error explícito de Cloudflare R2 sin fallback silencioso al disco
    throw new Error(`Error al transferir la imagen a Cloudflare R2: ${err.message || 'Fallo de conexión o autorización.'}`);
  }

  const publicUrl = getPublicUrlForKey(key);

  return {
    key,
    filename,
    url: publicUrl,
    size: buffer.length,
    mimeType: detected.mime,
    provider: 'cloudflare_r2',
  };
}

/**
 * Descarga y almacena en Cloudflare R2 una imagen desde una URL externa (ej. importador de Instagram).
 * Punto de entrada compartido para importaciones automatizadas.
 */
export async function saveImageFromUrl(
  imageUrl: string,
  options: SaveImageOptions & { timeoutMs?: number } = {}
): Promise<SavedImageResult> {
  const timeoutMs = options.timeoutMs || 15000;

  let response: Response;
  try {
    response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'VayaPlan-MediaImporter/1.0 (+https://vayaplan.com)',
      },
    });
  } catch (err: any) {
    throw new Error(`No se pudo descargar la imagen desde la fuente externa (${imageUrl}): ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`La fuente externa devolvió un estado HTTP no válido (${response.status} ${response.statusText}) para ${imageUrl}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const detected = validateImageMagicBytes(buffer);
  if (!detected) {
    throw new Error(`El archivo descargado desde ${imageUrl} no tiene formato válido JPEG, PNG o WebP.`);
  }

  return saveImageUpload(buffer, detected.ext, {
    prefix: options.prefix || 'imports',
    sourceUrl: options.sourceUrl || imageUrl,
    metadata: options.metadata,
  });
}

/**
 * Elimina un objeto de imagen de Cloudflare R2 mediante su clave o URL pública.
 */
export async function deleteImageObject(keyOrUrl: string): Promise<boolean> {
  const key = getKeyFromPublicUrl(keyOrUrl) || keyOrUrl;
  try {
    await deleteR2Object(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpieza de objetos huérfanos en Cloudflare R2:
 * - Identifica imágenes en el bucket no asociadas a ningún evento (`events.image_url`) ni lugar (`places.image_url`).
 * - Conserva objetos compartidos por múltiples eventos.
 * - Protege imágenes en curso dentro del periodo de gracia (por defecto 24 horas), impidiendo que se borren
 *   durante la edición o subida de formularios en proceso.
 * - Limpia también archivos huérfanos legacy en almacenamiento local si existieran.
 */
export async function cleanupOrphanUploads(options: {
  graceHours?: number;
  dryRun?: boolean;
  dbQuery?: (sql: string) => Promise<{ rows: any[] }>;
} = {}) {
  const graceHours = options.graceHours !== undefined ? options.graceHours : 24;
  const dryRun = options.dryRun ?? false;
  const queryFn = options.dbQuery || query;
  const cutoffTime = Date.now() - graceHours * 3600 * 1000;

  // Consultar todas las imágenes referenciadas en base de datos
  const eventsResult = await queryFn('SELECT image_url FROM events WHERE image_url IS NOT NULL');
  const placesResult = await queryFn('SELECT image_url FROM places WHERE image_url IS NOT NULL');

  const referencedKeys = new Set<string>();
  const referencedBasenames = new Set<string>();

  const registerReferencedUrl = (url: string | null) => {
    if (!url) return;
    const key = getKeyFromPublicUrl(url);
    if (key) {
      referencedKeys.add(key);
    }
    const base = path.basename(url);
    if (base) {
      referencedBasenames.add(base);
    }
  };

  for (const row of eventsResult.rows) {
    registerReferencedUrl(row.image_url);
  }
  for (const row of placesResult.rows) {
    registerReferencedUrl(row.image_url);
  }

  let totalObjects = 0;
  let deletedCount = 0;
  let preservedCount = 0;

  // 1. Limpieza en Cloudflare R2
  try {
    const prefixes = ['events/', 'imports/'];
    const r2Items: Array<{ key: string; size: number; lastModified?: Date }> = [];

    for (const p of prefixes) {
      try {
        const items = await listR2Objects(p);
        r2Items.push(...items);
      } catch {
        // Si el prefijo no existe o R2 no está configurado, continuar
      }
    }

    totalObjects += r2Items.length;

    for (const item of r2Items) {
      const base = path.basename(item.key);
      const isReferenced = referencedKeys.has(item.key) || referencedBasenames.has(base);

      if (isReferenced) {
        // Imagen asociada a uno o más eventos: se preserva siempre
        preservedCount++;
        continue;
      }

      // Protección durante subida o edición activa: si fue modificado dentro de las graceHours, no se toca
      const modifiedTime = item.lastModified ? item.lastModified.getTime() : Date.now();
      if (modifiedTime >= cutoffTime) {
        preservedCount++;
        continue;
      }

      // Huérfana confirmada fuera del periodo de gracia
      if (!dryRun) {
        try {
          await deleteR2Object(item.key);
        } catch {
          preservedCount++;
          continue;
        }
      }
      deletedCount++;
    }
  } catch {
    // Si R2 no está configurado, la sección R2 se omite
  }

  // 2. Limpieza de compatibilidad en disco local (archivos legacy si los hubiera)
  const uploadsDir = getUploadsDir();
  if (fs.existsSync(uploadsDir)) {
    try {
      const localFiles = fs.readdirSync(uploadsDir);
      for (const file of localFiles) {
        totalObjects++;
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
    } catch {
      // Ignorar fallos de lectura en directorio local
    }
  }

  return {
    total_objects: totalObjects,
    deleted_count: deletedCount,
    preserved_count: preservedCount,
    grace_hours: graceHours,
    storage_provider: 'cloudflare_r2',
  };
}
