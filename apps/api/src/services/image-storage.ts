import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp, { type Metadata as SharpMetadata } from 'sharp';
import { query } from '@vayaplan/db';
import type { ImageVariantInfo, ImageVariantsMap } from '@vayaplan/types';
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

// Límites de seguridad y capacidad para decodificación y transformación en servidor
// Adecuados a la memoria disponible (servidor VPS 8 GB RAM / 4 vCPUs):
// - 40 Megapíxeles previene descompresiones maliciosas (decompression bombs / pixel flood)
// - 8192 px de dimensión máxima rechaza coordenadas absurdas
// - Concurrencia máxima = 2 procesos simultáneos de transformación para garantizar estabilidad
export const MAX_IMAGE_WIDTH = 8192;
export const MAX_IMAGE_HEIGHT = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000; // 40 Megapixels
export const MAX_CONCURRENT_IMAGE_TRANSFORMS = 2;
export const MAX_TRANSFORM_QUEUE_SIZE = 6;
export const TRANSFORM_QUEUE_TIMEOUT_MS = 25000; // 25 segundos

export class TransformQueueFullError extends Error {
  status = 503;
  code = 'queue_full';
  constructor(msg = 'Servidor ocupado procesando imágenes. La cola de transformación está completa; por favor, reintenta en unos instantes.') {
    super(msg);
    this.name = 'TransformQueueFullError';
  }
}

export class TransformQueueTimeoutError extends Error {
  status = 504;
  code = 'queue_timeout';
  constructor(msg = 'Tiempo de espera en cola de procesamiento de imagen excedido. Por favor, reintenta.') {
    super(msg);
    this.name = 'TransformQueueTimeoutError';
  }
}

// Límites y calidades de variantes WebP
export const THUMB_MAX_WIDTH = 240;
export const THUMB_MAX_HEIGHT = 240;
export const THUMB_WEBP_QUALITY = 80;

export const DETAIL_MAX_WIDTH = 2000;
export const DETAIL_MAX_HEIGHT = 2000;
export const DETAIL_WEBP_QUALITY = 84;

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
  thumb_url?: string;
  original_url?: string;
  variants?: ImageVariantsMap;
}

export interface SaveImageOptions {
  prefix?: string;
  metadata?: Record<string, string>;
  sourceUrl?: string;
}

interface QueuedTransform {
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  timer: any;
}

// Semáforo y cola acotada de concurrencia para transformaciones con sharp
let activeTransforms = 0;
const waitingQueue: QueuedTransform[] = [];

export async function acquireTransformSlot(): Promise<() => void> {
  if (activeTransforms < MAX_CONCURRENT_IMAGE_TRANSFORMS) {
    activeTransforms++;
    return () => releaseTransformSlot();
  }

  if (waitingQueue.length >= MAX_TRANSFORM_QUEUE_SIZE) {
    throw new TransformQueueFullError();
  }

  return new Promise<() => void>((resolve, reject) => {
    let queuedItem: QueuedTransform;
    const timer = setTimeout(() => {
      const idx = waitingQueue.indexOf(queuedItem);
      if (idx !== -1) {
        waitingQueue.splice(idx, 1);
      }
      reject(new TransformQueueTimeoutError());
    }, TRANSFORM_QUEUE_TIMEOUT_MS);

    queuedItem = {
      resolve: (releaseFn) => {
        clearTimeout(timer);
        resolve(releaseFn);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
      timer,
    };

    waitingQueue.push(queuedItem);
  });
}

function releaseTransformSlot(): void {
  activeTransforms--;
  while (waitingQueue.length > 0) {
    const next = waitingQueue.shift();
    if (next) {
      activeTransforms++;
      next.resolve(() => releaseTransformSlot());
      return;
    }
  }
}

export function _getTransformQueueState() {
  return { activeTransforms, queueLength: waitingQueue.length };
}

export function _resetTransformQueue() {
  while (waitingQueue.length > 0) {
    const q = waitingQueue.shift();
    if (q) {
      clearTimeout(q.timer);
      q.reject(new Error('Queue reset'));
    }
  }
  activeTransforms = 0;
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
 * Obtiene la ruta del subdirectorio privado para originales preservados fuera del alcance público
 */
export function getPrivateUploadsDir(): string {
  const dir = path.join(getUploadsDir(), 'private-originals');
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

// Caché de detección de columnas de variantes en la base de datos conectada
let _hasVariantsColumnCached: boolean | null = null;

export async function hasImageVariantsColumns(dbQuery: (sql: string, params?: any[]) => Promise<any> = query): Promise<boolean> {
  if (_hasVariantsColumnCached === true) return true;
  try {
    const res = await dbQuery(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'image_thumb_url' LIMIT 1"
    );
    if (res.rows.length > 0) {
      _hasVariantsColumnCached = true;
      return true;
    }
  } catch {
    // ignorar error puntual
  }
  return false;
}

export function resetVariantsColumnCache(): void {
  _hasVariantsColumnCached = null;
}

// Caché de detección de columnas de atribución de imagen en la tabla events
let _hasAttributionColumnCached: boolean | null = null;

export async function hasEventAttributionColumns(dbQuery: (sql: string, params?: any[]) => Promise<any> = query): Promise<boolean> {
  if (_hasAttributionColumnCached === true) return true;
  try {
    const res = await dbQuery(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'image_source_url' LIMIT 1"
    );
    if (res.rows.length > 0) {
      _hasAttributionColumnCached = true;
      return true;
    }
  } catch {
    // ignorar error puntual
  }
  return false;
}

export function resetAttributionColumnCache(): void {
  _hasAttributionColumnCached = null;
}


/**
 * Guarda una imagen en Cloudflare R2 generando automáticamente sus variantes responsivas:
 * 1. Original preservado (formato recibido, sin transcodificar).
 * 2. Detalle WebP (máx. 2000 × 2000 px, rotado según EXIF, calidad 84, sin EXIF, sin ampliar).
 * 3. Miniatura WebP (máx. 240 × 240 px, rotado según EXIF, calidad 80, sin EXIF, sin ampliar).
 *
 * Cumple con:
 * - Mantener siempre las proporciones sin recorte ni bandas forzadas.
 * - Rechazar archivos corruptos o imágenes animadas (múltiples frames).
 * - Control estricto de concurrencia y límites de píxeles (40 MP).
 * - Subida atómica con limpieza de objetos parciales si falla cualquier operación.
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

  // Adquirir ranura en semáforo para no saturar memoria VPS
  const releaseSlot = await acquireTransformSlot();

  try {
    // 1. Decodificación y validación estricta con sharp
    let meta: SharpMetadata;
    try {
      meta = await sharp(buffer, {
        failOn: 'error',
        limitInputPixels: MAX_IMAGE_PIXELS,
      }).metadata();
    } catch (err: any) {
      throw new Error(`El archivo está dañado o no es una imagen válida decodificable: ${err.message || 'Error de decodificación'}`);
    }

    // 2. Rechazo explícito de imágenes animadas (múltiples páginas o frames)
    if ((meta.pages && meta.pages > 1) || (meta.delay && meta.delay.length > 0)) {
      throw new Error('No se admiten imágenes animadas (archivos con múltiples fotogramas). Sube un cartel estático en formato JPEG, PNG o WebP.');
    }

    // 3. Validación de dimensiones y número de píxeles
    const rawWidth = meta.width || 0;
    const rawHeight = meta.height || 0;
    const totalPixels = rawWidth * rawHeight;

    if (rawWidth <= 0 || rawHeight <= 0) {
      throw new Error('No se pudieron determinar las dimensiones de la imagen.');
    }

    if (rawWidth > MAX_IMAGE_WIDTH || rawHeight > MAX_IMAGE_HEIGHT || totalPixels > MAX_IMAGE_PIXELS) {
      throw new Error(
        `La imagen excede las dimensiones máximas permitidas (${rawWidth}×${rawHeight} px, máx. ${MAX_IMAGE_WIDTH}×${MAX_IMAGE_HEIGHT} px o 40 megapíxeles).`
      );
    }

    // 4. Generación de variante de detalle (WebP, máx 2000x2000, sin ampliar, respetando proporción y orientación, sin EXIF)
    const detailBuffer = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate() // Auto-orientación según EXIF
      .resize(DETAIL_MAX_WIDTH, DETAIL_MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: DETAIL_WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer();

    const detailMeta = await sharp(detailBuffer).metadata();

    // 5. Generación de variante de miniatura (WebP, máx 240x240, sin ampliar, respetando proporción y orientación, sin EXIF)
    // OPTIMIZACIÓN SECUENCIAL: Se deriva de detailBuffer (ya orientado y con máx 2000 px),
    // evitando una segunda decodificación de la imagen completa de 40 MP y reduciendo drásticamente
    // el pico de memoria simultáneo y el tiempo de CPU en el servidor.
    const thumbBuffer = await sharp(detailBuffer)
      .resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: THUMB_WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer();

    const thumbMeta = await sharp(thumbBuffer).metadata();

    // Dimensiones efectivas del original orientadas
    const isRotated90 = meta.orientation && [5, 6, 7, 8].includes(meta.orientation);
    const origWidth = isRotated90 ? rawHeight : rawWidth;
    const origHeight = isRotated90 ? rawWidth : rawHeight;

    const prefix = (options.prefix || 'events').replace(/^\/+|\/+$/g, '');
    const id = crypto.randomUUID();

    const originalFilename = `${id}-original.${detected.ext}`;
    const originalFilePath = path.join(getPrivateUploadsDir(), originalFilename);
    const detailKey = `${prefix}/${id}-detail.webp`;
    const thumbKey = `${prefix}/${id}-thumb.webp`;

    const metadata = { ...(options.metadata || {}) };
    if (options.sourceUrl) {
      metadata.source_url = options.sourceUrl;
    }

    const uploadedKeys: string[] = [];
    let originalWritten = false;

    try {
      // 1. Preservación del original con metadatos intactos en almacenamiento privado (fuera del bucket público)
      await fs.promises.writeFile(originalFilePath, buffer);
      originalWritten = true;

      // 2. Subida a Cloudflare R2 de la variante de detalle WebP (saneada, sin EXIF)
      await putR2Object({
        key: detailKey,
        body: detailBuffer,
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { ...metadata, variant: 'detail' },
      });
      uploadedKeys.push(detailKey);

      // 3. Subida a Cloudflare R2 de la variante de miniatura WebP (saneada, sin EXIF)
      await putR2Object({
        key: thumbKey,
        body: thumbBuffer,
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { ...metadata, variant: 'thumb' },
      });
      uploadedKeys.push(thumbKey);

      // En modo de desarrollo o tests locales, mantener copia para servirla por /media (solo variantes públicas)
      if (process.env.SERVE_DEV_MEDIA === 'true') {
        const devDir = getUploadsDir();
        for (const [k, buf] of [
          [detailKey, detailBuffer],
          [thumbKey, thumbBuffer],
        ] as const) {
          const devPath = path.join(devDir, k);
          const parentDir = path.dirname(devPath);
          if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
          await fs.promises.writeFile(devPath, buf);
        }
      }
    } catch (err: any) {
      // Limpieza atómica de subidas parciales si cualquiera falla
      for (const k of uploadedKeys) {
        await deleteR2Object(k).catch(() => {});
      }
      if (originalWritten) {
        try {
          if (fs.existsSync(originalFilePath)) {
            await fs.promises.unlink(originalFilePath);
          }
        } catch {}
      }
      throw new Error(`Error al transferir la imagen a Cloudflare R2: ${err.message || 'Fallo de conexión o autorización.'}`);
    }

    const originalUrl = `/api/v1/admin/uploads/originals/${originalFilename}`;
    const detailUrl = getPublicUrlForKey(detailKey);
    const thumbUrl = getPublicUrlForKey(thumbKey);

    return {
      key: detailKey,
      filename: `${id}-detail.webp`,
      url: detailUrl,
      size: detailBuffer.length,
      mimeType: 'image/webp',
      provider: 'cloudflare_r2',
      thumb_url: thumbUrl,
      original_url: originalUrl,
      variants: {
        original: {
          key: `originals/${originalFilename}`,
          url: originalUrl,
          width: origWidth,
          height: origHeight,
          size_bytes: buffer.length,
          mime_type: detected.mime,
        },
        detail: {
          key: detailKey,
          url: detailUrl,
          width: detailMeta.width || origWidth,
          height: detailMeta.height || origHeight,
          size_bytes: detailBuffer.length,
          mime_type: 'image/webp',
        },
        thumb: {
          key: thumbKey,
          url: thumbUrl,
          width: thumbMeta.width || 0,
          height: thumbMeta.height || 0,
          size_bytes: thumbBuffer.length,
          mime_type: 'image/webp',
        },
      },
    };
  } finally {
    releaseSlot();
  }
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
 * Si pertenece a un conjunto de variantes (-detail.webp, -thumb.webp, -original.*),
 * limpia también todas las variantes asociadas.
 */
export async function deleteImageObject(keyOrUrl: string): Promise<boolean> {
  const key = getKeyFromPublicUrl(keyOrUrl) || keyOrUrl;
  try {
    await deleteR2Object(key);

    // Si la clave tiene patrón de variante (ej. events/<uuid>-detail.webp),
    // borrar también las variantes hermanas
    const variantMatch = key.match(/^(.+)-(detail\.webp|thumb\.webp|original\.[a-zA-Z0-9]+)$/);
    if (variantMatch) {
      const baseKey = variantMatch[1];
      const siblingKeys = [
        `${baseKey}-detail.webp`,
        `${baseKey}-thumb.webp`,
        `${baseKey}-original.webp`,
        `${baseKey}-original.jpg`,
        `${baseKey}-original.png`,
      ];
      for (const sib of siblingKeys) {
        if (sib !== key) {
          await deleteR2Object(sib).catch(() => {});
        }
      }

      // Limpiar también copia privada del original si existe en disco
      const idMatch = baseKey.split('/').pop();
      if (idMatch) {
        const privDir = getPrivateUploadsDir();
        for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
          const p = path.join(privDir, `${idMatch}-original.${ext}`);
          if (fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch {}
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpieza de objetos huérfanos en Cloudflare R2:
 * - Identifica imágenes en el bucket no asociadas a ningún evento (`events.image_url`, `image_thumb_url`, `image_original_url`)
 *   ni lugar (`places.image_url`).
 * - Conserva objetos compartidos por múltiples eventos y todas sus variantes hermanas.
 * - Protege imágenes en curso dentro del periodo de gracia (por defecto 24 horas), impidiendo que se borren
 *   durante la edición o subida de formularios en proceso.
 * - Limpia también archivos huérfanos legacy en almacenamiento local si existieran.
 */
export async function cleanupOrphanUploads(options: {
  graceHours?: number;
  dryRun?: boolean;
  dbQuery?: (sql: string, params?: any[]) => Promise<any>;
} = {}) {
  const graceHours = options.graceHours !== undefined ? options.graceHours : 24;
  const dryRun = options.dryRun ?? false;
  const queryFn = options.dbQuery || query;
  const cutoffTime = Date.now() - graceHours * 3600 * 1000;

  // Consultar todas las imágenes referenciadas en base de datos considerando columnas de variantes si existen
  const hasVariants = await hasImageVariantsColumns(queryFn);
  const eventsSql = hasVariants
    ? 'SELECT image_url, image_thumb_url, image_original_url FROM events'
    : 'SELECT image_url FROM events WHERE image_url IS NOT NULL';
  const placesSql = 'SELECT image_url FROM places WHERE image_url IS NOT NULL';

  const eventsResult = await queryFn(eventsSql);
  const placesResult = await queryFn(placesSql);

  const referencedKeys = new Set<string>();
  const referencedBasenames = new Set<string>();
  const referencedBasePrefixes = new Set<string>();

  const registerReferencedUrl = (url: string | null) => {
    if (!url) return;
    const key = getKeyFromPublicUrl(url);
    if (key) {
      referencedKeys.add(key);
      const match = key.match(/^(.+)-(detail\.webp|thumb\.webp|original\.[a-zA-Z0-9]+)$/);
      if (match) {
        referencedBasePrefixes.add(match[1]);
      }
    }
    const base = path.basename(url);
    if (base) {
      referencedBasenames.add(base);
      const matchBase = base.match(/^(.+)-(detail\.webp|thumb\.webp|original\.[a-zA-Z0-9]+)$/);
      if (matchBase) {
        referencedBasePrefixes.add(matchBase[1]);
      }
    }
  };

  for (const row of eventsResult.rows) {
    registerReferencedUrl(row.image_url);
    if (row.image_thumb_url) registerReferencedUrl(row.image_thumb_url);
    if (row.image_original_url) registerReferencedUrl(row.image_original_url);
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
      const base = item.key.split('/').pop() || item.key;
      const itemPrefixMatch = item.key.match(/^(.+)-(detail\.webp|thumb\.webp|original\.[a-zA-Z0-9]+)$/);
      const isVariantOfReferenced = itemPrefixMatch && referencedBasePrefixes.has(itemPrefixMatch[1]);
      const isReferenced = referencedKeys.has(item.key) || referencedBasenames.has(base) || Boolean(isVariantOfReferenced);

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

  // 2. Limpieza de originales en almacenamiento privado local
  const privateDir = getPrivateUploadsDir();
  if (fs.existsSync(privateDir)) {
    try {
      const privateFiles = fs.readdirSync(privateDir);
      for (const file of privateFiles) {
        const fullPath = path.join(privateDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (!stats.isFile()) continue;
          totalObjects++;
          const match = file.match(/^(.+)-original\.[a-zA-Z0-9]+$/);
          const isReferenced = referencedBasenames.has(file) || Boolean(match && referencedBasePrefixes.has(match[1]));
          if (isReferenced) {
            preservedCount++;
            continue;
          }
          if (stats.mtimeMs < cutoffTime) {
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
      // Ignorar fallos de lectura en directorio privado
    }
  }

  // 3. Limpieza de compatibilidad en disco local (archivos legacy si los hubiera en raíz)
  const uploadsDir = getUploadsDir();
  if (fs.existsSync(uploadsDir)) {
    try {
      const localFiles = fs.readdirSync(uploadsDir);
      for (const file of localFiles) {
        if (file === 'private-originals') continue;
        const fullPath = path.join(uploadsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (!stats.isFile()) continue;
          totalObjects++;
          if (referencedBasenames.has(file)) {
            preservedCount++;
            continue;
          }
          if (stats.mtimeMs < cutoffTime) {
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
