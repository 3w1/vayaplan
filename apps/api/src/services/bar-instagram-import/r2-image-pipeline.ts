import sharp from 'sharp';
import { putR2Object, getPublicUrlForKey } from '../r2-client';
import type { ApifyInstagramRawPost, UploadedR2Image } from './bar-types';

/**
 * Descarga y almacena en Cloudflare R2 las imágenes originales de los posts de Instagram,
 * evitando URLs externas de CDN efímeras.
 */
export async function uploadPostImageToR2(
  post: ApifyInstagramRawPost,
  venueSlug: string
): Promise<UploadedR2Image> {
  const shortCode = post.shortCode || post.id || 'unknown';
  const r2Key = `bars/${venueSlug}/${shortCode}.jpg`;
  const postUrl = post.url || `https://www.instagram.com/p/${shortCode}/`;

  if (!post.displayUrl) {
    throw new Error(`El post ${shortCode} no contiene displayUrl.`);
  }

  // 1. Descargar la imagen original una sola vez
  const res = await fetch(post.displayUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Fallo al descargar imagen de ${post.displayUrl} (HTTP ${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 2. Extraer metadatos de dimensiones y tamaño con sharp
  let width = post.dimensionsWidth || 0;
  let height = post.dimensionsHeight || 0;
  let format = 'jpeg';

  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width) width = meta.width;
    if (meta.height) height = meta.height;
    if (meta.format) format = meta.format;
  } catch {
    // Si sharp falla en algún formato exótico, conservar dimensiones del scraper
  }

  const contentType = format === 'png' ? 'image/png' : 'image/jpeg';

  // 3. Subir a Cloudflare R2
  await putR2Object({
    key: r2Key,
    body: buffer,
    contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const finalUrl = getPublicUrlForKey(r2Key);

  return {
    postUrl,
    shortCode,
    r2Key,
    finalUrl,
    sizeBytes: buffer.length,
    width,
    height,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
}
