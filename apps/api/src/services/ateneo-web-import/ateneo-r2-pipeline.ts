/**
 * VayaPlan — Pipeline de Almacenamiento en Cloudflare R2 para Ateneo de Palencia
 *
 * Descarga y optimiza las imágenes oficiales del Ateneo a WebP, almacenándolas
 * bajo rutas trazables: ateneo/{event-slug}/{image-hash}.webp
 */

import sharp from 'sharp';
import crypto from 'crypto';
import { putR2Object, getPublicUrlForKey } from '../r2-client';
import type { AteneoR2UploadResult } from './ateneo-types';

export async function uploadAteneoImageToR2(params: {
  imageUrl: string;
  eventSlug: string;
  sourceEventUrl: string;
  credit?: string | null;
  fetchFn?: typeof fetch;
  mockBuffer?: Buffer;
}): Promise<AteneoR2UploadResult> {
  const { imageUrl, eventSlug, sourceEventUrl, credit } = params;
  const customFetch = params.fetchFn || fetch;
  const nowIso = new Date().toISOString();

  let originalBuffer: Buffer;

  if (params.mockBuffer) {
    originalBuffer = params.mockBuffer;
  } else {
    const res = await customFetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; VayaPlanBot/1.0; +https://vayaplan.com)',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Fallo al descargar imagen oficial del Ateneo desde ${imageUrl} (HTTP ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    originalBuffer = Buffer.from(arrayBuffer);
  }

  // 1. Validar formato y dimensiones con sharp
  const image = sharp(originalBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Dimensiones de imagen no válidas para ${imageUrl}`);
  }

  // 2. Optimizar a WebP de alta fidelidad (quality: 85)
  const webpBuffer = await image
    .webp({ quality: 85, effort: 4 })
    .toBuffer();

  const webpMeta = await sharp(webpBuffer).metadata();
  const width = webpMeta.width || metadata.width;
  const height = webpMeta.height || metadata.height;

  // 3. Generar hash trazable de contenido
  const imageHash = crypto.createHash('sha256').update(webpBuffer).digest('hex').substring(0, 12);
  const safeSlug = eventSlug.replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 40);
  const r2Key = `ateneo/${safeSlug}/${imageHash}.webp`;

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
    credit: credit || 'Ateneo de Palencia',
    sourceImageUrl: imageUrl,
    lastCheckedAt: nowIso,
  };
}
