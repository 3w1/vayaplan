/**
 * VayaPlan — Pipeline de Almacenamiento en Cloudflare R2 para Biblioteca Pública de Palencia
 *
 * Descarga y optimiza a WebP las imágenes oficiales vinculadas a eventos de la biblioteca,
 * almacenándolas bajo rutas trazables:
 * biblioteca-publica/{event-slug-or-id}/{image-hash}.webp
 */

import sharp from 'sharp';
import crypto from 'crypto';
import { putR2Object, getPublicUrlForKey } from '../r2-client';

export interface ProcessBibliotecaImageParams {
  eventId: number;
  eventSlug: string;
  sourceImageUrl: string;
  sourcePageUrl: string;
  sourceName: string;
  credit: string;
  fetchFn?: typeof fetch;
  mockBuffer?: Buffer;
}

export interface ProcessBibliotecaImageResult {
  r2Key: string;
  finalUrl: string;
  width: number;
  height: number;
  contentType: 'image/webp';
  sizeBytes: number;
  imageHash: string;
  sourceImageUrl: string;
  sourcePageUrl: string;
  sourceName: string;
  credit: string;
  lastCheckedAt: string;
}

export async function processAndUploadBibliotecaImage(
  params: ProcessBibliotecaImageParams
): Promise<ProcessBibliotecaImageResult> {
  const { eventId, eventSlug, sourceImageUrl, sourcePageUrl, sourceName, credit } = params;
  const customFetch = params.fetchFn || fetch;
  const nowIso = new Date().toISOString();

  let originalBuffer: Buffer;

  if (params.mockBuffer) {
    originalBuffer = params.mockBuffer;
  } else {
    const res = await customFetch(sourceImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VayaPlanBot/1.0; +https://vayaplan.com)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Fallo al descargar imagen oficial de ${sourceImageUrl} (HTTP ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    originalBuffer = Buffer.from(arrayBuffer);
  }

  // 1. Validar formato y dimensiones con sharp
  const image = sharp(originalBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Dimensiones de imagen no válidas para ${sourceImageUrl}`);
  }

  // 2. Optimizar a WebP de alta fidelidad (quality: 85, effort: 4)
  const webpBuffer = await image
    .webp({ quality: 85, effort: 4 })
    .toBuffer();

  const webpMeta = await sharp(webpBuffer).metadata();
  const width = webpMeta.width || metadata.width;
  const height = webpMeta.height || metadata.height;

  // 3. Generar hash trazable de contenido
  const imageHash = crypto.createHash('sha256').update(webpBuffer).digest('hex').substring(0, 12);
  const safeSlug = (eventSlug || `event-${eventId}`).replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 40);
  const r2Key = `biblioteca-publica/${safeSlug}/${imageHash}.webp`;

  // 4. Subir a Cloudflare R2
  await putR2Object({
    key: r2Key,
    body: webpBuffer,
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const finalUrl = getPublicUrlForKey(r2Key);

  return {
    r2Key,
    finalUrl,
    width,
    height,
    contentType: 'image/webp',
    sizeBytes: webpBuffer.length,
    imageHash,
    sourceImageUrl,
    sourcePageUrl,
    sourceName,
    credit,
    lastCheckedAt: nowIso,
  };
}
