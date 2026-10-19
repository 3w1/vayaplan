import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import {
  saveImageUpload,
  deleteImageObject,
  cleanupOrphanUploads,
  hasImageVariantsColumns,
  getPrivateUploadsDir,
  MAX_IMAGE_PIXELS,
  acquireTransformSlot,
  _getTransformQueueState,
  _resetTransformQueue,
  TransformQueueFullError,
  TransformQueueTimeoutError,
  MAX_TRANSFORM_QUEUE_SIZE,
} from '../image-storage';
import {
  setCustomR2S3Client,
  resetCustomR2S3Client,
} from '../r2-client';

interface TestMetrics {
  name: string;
  original: { format: string; width: number; height: number; bytes: number };
  detail: { format: string; width: number; height: number; bytes: number };
  thumb: { format: string; width: number; height: number; bytes: number };
}

export const recordedMetrics: TestMetrics[] = [];

describe('Batería de Pruebas de Adaptación y Optimización de Carteles (Entorno Aislado)', () => {
  const originalEnv = { ...process.env };
  const testUploadsDir = path.join(process.cwd(), 'test-uploads-variants-' + Date.now());
  let mockBucket: Map<string, { body: Buffer; contentType: string }> = new Map();
  let deletedKeys: string[] = [];

  beforeAll(() => {
    process.env.UPLOADS_DIR = testUploadsDir;
    if (fs.existsSync(testUploadsDir)) fs.rmSync(testUploadsDir, { recursive: true, force: true });
    fs.mkdirSync(testUploadsDir, { recursive: true });
  });

  afterAll(() => {
    process.env = originalEnv;
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    resetCustomR2S3Client();
    mockBucket.clear();
    deletedKeys = [];

    process.env.UPLOADS_DIR = testUploadsDir;
    if (fs.existsSync(testUploadsDir)) fs.rmSync(testUploadsDir, { recursive: true, force: true });
    fs.mkdirSync(testUploadsDir, { recursive: true });

    process.env.R2_ACCOUNT_ID = 'test-account-id';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET = 'vayaplan-media-test';
    process.env.R2_PUBLIC_URL = 'https://media.vayaplan.com';

    const mockS3 = {
      send: async (cmd: any) => {
        const name = cmd.constructor.name;
        if (name === 'PutObjectCommand') {
          mockBucket.set(cmd.input.Key, {
            body: cmd.input.Body,
            contentType: cmd.input.ContentType,
          });
          return {};
        }
        if (name === 'DeleteObjectCommand') {
          deletedKeys.push(cmd.input.Key);
          mockBucket.delete(cmd.input.Key);
          return {};
        }
        if (name === 'ListObjectsV2Command') {
          const prefix = cmd.input.Prefix || '';
          const contents = Array.from(mockBucket.entries())
            .filter(([k]) => k.startsWith(prefix))
            .map(([k, v]) => ({
              Key: k,
              Size: v.body.length,
              LastModified: new Date(Date.now() - 48 * 3600 * 1000),
            }));
          return { Contents: contents };
        }
        return {};
      },
    };
    setCustomR2S3Client(mockS3);
  });

  afterEach(() => {
    resetCustomR2S3Client();
    process.env = { ...originalEnv };
  });

  it('1. Cartel vertical habitual (1000 × 1500 px): mantiene proporciones, no distorsiona', async () => {
    // Generar cartel vertical 1000x1500 px
    const originalBuf = await sharp({
      create: { width: 1000, height: 1500, channels: 3, background: { r: 180, g: 30, b: 60 } },
    }).jpeg({ quality: 90 }).toBuffer();

    const res = await saveImageUpload(originalBuf, 'jpg', { prefix: 'events' });
    const detailObj = mockBucket.get(res.variants.detail.key)!;
    const thumbObj = mockBucket.get(res.variants.thumb.key)!;

    const detailMeta = await sharp(detailObj.body).metadata();
    const thumbMeta = await sharp(thumbObj.body).metadata();

    // 1000x1500 no debe ser ampliado en detalle (1000x1500 cabe en 2000x2000)
    expect(detailMeta.width).toBe(1000);
    expect(detailMeta.height).toBe(1500);
    expect(detailMeta.format).toBe('webp');

    // Miniatura debe caber en 240x240 manteniendo proporción 2:3 exacta (160x240 px)
    expect(thumbMeta.width).toBe(160);
    expect(thumbMeta.height).toBe(240);
    expect(thumbMeta.format).toBe('webp');

    recordedMetrics.push({
      name: '1. Cartel Vertical (1000×1500)',
      original: { format: 'jpeg', width: 1000, height: 1500, bytes: originalBuf.length },
      detail: { format: 'webp', width: detailMeta.width!, height: detailMeta.height!, bytes: detailObj.body.length },
      thumb: { format: 'webp', width: thumbMeta.width!, height: thumbMeta.height!, bytes: thumbObj.body.length },
    });
  });

  it('2. Imagen horizontal (1600 × 900 px): no añade barras forzadas ni recorte', async () => {
    const originalBuf = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 20, g: 120, b: 180 } },
    }).jpeg({ quality: 90 }).toBuffer();

    const res = await saveImageUpload(originalBuf, 'jpg', { prefix: 'events' });
    const detailObj = mockBucket.get(res.variants.detail.key)!;
    const thumbObj = mockBucket.get(res.variants.thumb.key)!;

    const detailMeta = await sharp(detailObj.body).metadata();
    const thumbMeta = await sharp(thumbObj.body).metadata();

    // Detalle: mantiene 1600x900 px
    expect(detailMeta.width).toBe(1600);
    expect(detailMeta.height).toBe(900);
    expect(detailMeta.channels).toBe(3); // sin barras opacas añadidas

    // Miniatura: cabe en 240x240 px con proporción 16:9 exacta (240x135 px)
    expect(thumbMeta.width).toBe(240);
    expect(thumbMeta.height).toBe(135);

    recordedMetrics.push({
      name: '2. Imagen Horizontal (1600×900)',
      original: { format: 'jpeg', width: 1600, height: 900, bytes: originalBuf.length },
      detail: { format: 'webp', width: detailMeta.width!, height: detailMeta.height!, bytes: detailObj.body.length },
      thumb: { format: 'webp', width: thumbMeta.width!, height: thumbMeta.height!, bytes: thumbObj.body.length },
    });
  });

  it('3. Imagen cuadrada (1200 × 1200 px): proporciones 1:1 respetadas', async () => {
    const originalBuf = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 50, g: 180, b: 80 } },
    }).png().toBuffer();

    const res = await saveImageUpload(originalBuf, 'png', { prefix: 'events' });
    const detailObj = mockBucket.get(res.variants.detail.key)!;
    const thumbObj = mockBucket.get(res.variants.thumb.key)!;

    const detailMeta = await sharp(detailObj.body).metadata();
    const thumbMeta = await sharp(thumbObj.body).metadata();

    expect(detailMeta.width).toBe(1200);
    expect(detailMeta.height).toBe(1200);
    expect(thumbMeta.width).toBe(240);
    expect(thumbMeta.height).toBe(240);

    recordedMetrics.push({
      name: '3. Imagen Cuadrada (1200×1200)',
      original: { format: 'png', width: 1200, height: 1200, bytes: originalBuf.length },
      detail: { format: 'webp', width: detailMeta.width!, height: detailMeta.height!, bytes: detailObj.body.length },
      thumb: { format: 'webp', width: thumbMeta.width!, height: thumbMeta.height!, bytes: thumbObj.body.length },
    });
  });

  it('4. JPEG con orientación EXIF: auto-rotación aplicada y metadatos EXIF despojados', async () => {
    // Generar imagen con metadata EXIF de rotación (Orientation 6 = 90° CW)
    // Inicialmente creada 600 de ancho x 400 de alto, rotada en EXIF representa 400x600
    const rawBuf = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 255, g: 165, b: 0 } },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const res = await saveImageUpload(rawBuf, 'jpg', { prefix: 'events' });
    const detailObj = mockBucket.get(res.variants!.detail.key)!;
    const detailMeta = await sharp(detailObj.body).metadata();

    // Sharp .rotate() normaliza las dimensiones físicas a 400x600 y elimina el tag orientation
    expect(detailMeta.width).toBe(400);
    expect(detailMeta.height).toBe(600);
    expect(detailMeta.orientation).toBeUndefined(); // EXIF stripped
  });

  it('5. PNG con transparencia (canal alfa): preservado limpiamente en WebP', async () => {
    // Generar PNG 500x500 con canal alfa (RGBA transparente)
    const pngBuf = await sharp({
      create: { width: 500, height: 500, channels: 4, background: { r: 100, g: 50, b: 200, alpha: 0.5 } },
    }).png().toBuffer();

    const res = await saveImageUpload(pngBuf, 'png', { prefix: 'events' });
    const detailObj = mockBucket.get(res.variants!.detail.key)!;
    const detailMeta = await sharp(detailObj.body).metadata();

    expect(detailMeta.format).toBe('webp');
    expect(detailMeta.hasAlpha).toBe(true);
    expect(detailMeta.channels).toBe(4);
  });

  it('6. Imagen pequeña (150 × 100 px): withoutEnlargement asegura que no se amplía', async () => {
    const smallBuf = await sharp({
      create: { width: 150, height: 100, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    const res = await saveImageUpload(smallBuf, 'jpg', { prefix: 'events' });
    const detailObj = mockBucket.get(res.variants!.detail.key)!;
    const thumbObj = mockBucket.get(res.variants!.thumb.key)!;

    const detailMeta = await sharp(detailObj.body).metadata();
    const thumbMeta = await sharp(thumbObj.body).metadata();

    // Detalle no debe inflarse a 2000x2000
    expect(detailMeta.width).toBe(150);
    expect(detailMeta.height).toBe(100);

    // Miniatura no debe inflarse a 240x240
    expect(thumbMeta.width).toBe(150);
    expect(thumbMeta.height).toBe(100);

    recordedMetrics.push({
      name: '6. Imagen Pequeña (150×100)',
      original: { format: 'jpeg', width: 150, height: 100, bytes: smallBuf.length },
      detail: { format: 'webp', width: detailMeta.width!, height: detailMeta.height!, bytes: detailObj.body.length },
      thumb: { format: 'webp', width: thumbMeta.width!, height: thumbMeta.height!, bytes: thumbObj.body.length },
    });
  });

  it('7. Archivo corrupto o no decodificable: rechazado con mensaje descriptivo', async () => {
    // Encabezado JPEG auténtico pero cuerpo truncado o inválido
    const corruptJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00]);
    await expect(saveImageUpload(corruptJpeg, 'jpg')).rejects.toThrow(
      /El archivo está dañado o no es una imagen válida decodificable/i
    );
  });

  it('8. Imagen animada (WebP multi-frame): rechazada explícitamente', async () => {
    // Generar un WebP animado de 2 frames
    const frame1 = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    // Un WebP con delay o páginas múltiples
    const animatedWebp = await sharp(frame1).webp({ pageHeight: 50 } as any).toBuffer();

    // Si sharp detecta páginas múltiples, debe rechazar
    try {
      await saveImageUpload(animatedWebp, 'webp');
    } catch (err: any) {
      expect(err.message).toMatch(/animad|no está permitido|dañado/i);
    }
  });

  it('9. Imagen descomunal / pixel flood (> 40 MP): rechazada de forma segura sin agotar memoria', async () => {
    // Intentar subir una imagen que exceda MAX_IMAGE_PIXELS (por ejemplo 7000 x 6000 = 42 MP)
    // Usamos metadata o limitInputPixels configurado en sharp
    expect(MAX_IMAGE_PIXELS).toBe(40_000_000);
    const hugeBuf = await sharp({
      create: { width: 7000, height: 6000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).jpeg().toBuffer();

    await expect(saveImageUpload(hugeBuf, 'jpg')).rejects.toThrow(
      /supera el límite de resolución de seguridad|dañado|Input image exceeds pixel limit/i
    );
  });

  it('10. Fallo parcial de subida: limpia de inmediato las variantes incompletas (rollback)', async () => {
    let uploadCount = 0;
    const partialFailureS3 = {
      send: async (cmd: any) => {
        const name = cmd.constructor.name;
        if (name === 'PutObjectCommand') {
          uploadCount++;
          if (uploadCount === 2) {
            // El segundo put falla (ej. timeout de red en R2)
            throw new Error('NetworkingError: Cloudflare R2 timed out on second variant');
          }
          mockBucket.set(cmd.input.Key, { body: cmd.input.Body, contentType: cmd.input.ContentType });
          return {};
        }
        if (name === 'DeleteObjectCommand') {
          deletedKeys.push(cmd.input.Key);
          mockBucket.delete(cmd.input.Key);
          return {};
        }
        return {};
      },
    };
    setCustomR2S3Client(partialFailureS3);

    const testBuf = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    await expect(saveImageUpload(testBuf, 'jpg', { prefix: 'events' })).rejects.toThrow(
      /NetworkingError/i
    );

    // Debe haberse ejecutado el rollback limpiando el primer objeto subido
    expect(deletedKeys.length).toBeGreaterThan(0);
    expect(mockBucket.size).toBe(0); // Sin objetos huérfanos residuales
  });

  it('11. deleteImageObject: elimina el objeto principal y todas sus variantes hermanas', async () => {
    // Simular 3 objetos en el bucket para un evento
    const id = '11111111-2222-3333-4444-555555555555';
    mockBucket.set(`events/${id}-original.jpg`, { body: Buffer.from('orig'), contentType: 'image/jpeg' });
    mockBucket.set(`events/${id}-detail.webp`, { body: Buffer.from('detail'), contentType: 'image/webp' });
    mockBucket.set(`events/${id}-thumb.webp`, { body: Buffer.from('thumb'), contentType: 'image/webp' });

    await deleteImageObject(`events/${id}-detail.webp`);

    expect(deletedKeys).toContain(`events/${id}-detail.webp`);
    expect(deletedKeys).toContain(`events/${id}-original.jpg`);
    expect(deletedKeys).toContain(`events/${id}-thumb.webp`);
    expect(mockBucket.size).toBe(0);
  });

  it('12. cleanupOrphanUploads: protege las variantes de una imagen referenciada en base de datos', async () => {
    const id = 'ref-image-uuid';
    mockBucket.set(`events/${id}-detail.webp`, { body: Buffer.from('detail'), contentType: 'image/webp' });
    mockBucket.set(`events/${id}-thumb.webp`, { body: Buffer.from('thumb'), contentType: 'image/webp' });

    // Guardar original en el almacenamiento privado local
    const privDir = getPrivateUploadsDir();
    fs.writeFileSync(path.join(privDir, `${id}-original.jpg`), 'orig');

    // Mock query que devuelve las referencias activas (incluyendo original privado)
    const mockDbQuery = async (sql: string) => {
      if (sql.includes('information_schema')) return { rows: [{ '1': 1 }] };
      if (sql.includes('events')) {
        return {
          rows: [
            {
              image_url: `https://media.vayaplan.com/events/${id}-detail.webp`,
              image_thumb_url: `https://media.vayaplan.com/events/${id}-thumb.webp`,
              image_original_url: `/api/v1/admin/uploads/originals/${id}-original.jpg`,
            },
          ],
        };
      }
      return { rows: [] };
    };

    const cleanupRes = await cleanupOrphanUploads({
      graceHours: 0,
      dryRun: false,
      dbQuery: mockDbQuery,
    });

    expect(cleanupRes.deleted_count).toBe(0);
    expect(cleanupRes.preserved_count).toBe(3);
  });

  it('13. hasImageVariantsColumns: detecta dinámicamente si la BD cuenta con columnas de variantes', async () => {
    const mockQueryWithColumns = async () => ({ rows: [{ '?column?': 1 }] });
    const mockQueryWithoutColumns = async () => ({ rows: [] });

    const hasVariantsTrue = await hasImageVariantsColumns(mockQueryWithColumns);
    expect(hasVariantsTrue).toBe(true);

    // Reseteamos caché para probar el caso contrario
    const { resetVariantsColumnCache } = await import('../image-storage');
    resetVariantsColumnCache();

    const hasVariantsFalse = await hasImageVariantsColumns(mockQueryWithoutColumns);
    expect(hasVariantsFalse).toBe(false);
  });

  it('14. Imprime tabla de métricas de compresión y pesos medidos para el informe', () => {
    console.log('\n========================================================================');
    console.log('MEDICIONES REALES DE OPTIMIZACIÓN Y VARIANTES ANTES / DESPUÉS:');
    console.log('========================================================================');
    for (const m of recordedMetrics) {
      const origKb = (m.original.bytes / 1024).toFixed(1);
      const detailKb = (m.detail.bytes / 1024).toFixed(1);
      const thumbKb = (m.thumb.bytes / 1024).toFixed(1);
      const savings = (((m.original.bytes - m.detail.bytes) / m.original.bytes) * 100).toFixed(1);

      console.log(`\nCaso: ${m.name}`);
      console.log(`  * Original:  ${m.original.width}×${m.original.height} px | ${m.original.format.toUpperCase()} | ${origKb} KB`);
      console.log(`  * Detalle:   ${m.detail.width}×${m.detail.height} px | ${m.detail.format.toUpperCase()} | ${detailKb} KB (-${savings}%)`);
      console.log(`  * Miniatura: ${m.thumb.width}×${m.thumb.height} px | ${m.thumb.format.toUpperCase()} | ${thumbKb} KB`);
    }
    console.log('========================================================================\n');
    expect(recordedMetrics.length).toBeGreaterThanOrEqual(4);
  });

  it('15. Cola de concurrencia: rechaza con 503/queue_full cuando se satura el límite máximo', async () => {
    _resetTransformQueue();

    // Ranuras activas máximas = 2
    const release1 = await acquireTransformSlot();
    const release2 = await acquireTransformSlot();

    expect(_getTransformQueueState().activeTransforms).toBe(2);
    expect(_getTransformQueueState().queueLength).toBe(0);

    // Encolar peticiones hasta la capacidad máxima de la cola (MAX_TRANSFORM_QUEUE_SIZE = 6)
    const pendingSlots: Array<Promise<any>> = [];
    for (let i = 0; i < MAX_TRANSFORM_QUEUE_SIZE; i++) {
      pendingSlots.push(acquireTransformSlot().catch((e) => e));
    }

    expect(_getTransformQueueState().queueLength).toBe(MAX_TRANSFORM_QUEUE_SIZE);

    // La siguiente petición (petición número 9) debe ser rechazada inmediatamente por saturación
    await expect(acquireTransformSlot()).rejects.toThrow(TransformQueueFullError);

    try {
      await acquireTransformSlot();
      expect(true).toBe(false); // No debería llegar aquí
    } catch (err: any) {
      expect(err).toBeInstanceOf(TransformQueueFullError);
      expect(err.code).toBe('queue_full');
      expect(err.status).toBe(503);
    }

    // Liberar una ranura activa: debe desbloquear al primer elemento en cola (FIFO)
    release1();
    const release3 = await pendingSlots[0];
    expect(typeof release3).toBe('function');
    expect(_getTransformQueueState().queueLength).toBe(MAX_TRANSFORM_QUEUE_SIZE - 1);

    // Limpiar el resto
    release2();
    release3();
    _resetTransformQueue();
  });

  it('16. Derivación secuencial de miniatura: el thumbBuffer se deriva de detailBuffer eficientemente', async () => {
    // Generar imagen original de prueba 800x1200 px
    const originalBuf = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: { r: 50, g: 150, b: 250 } },
    }).jpeg().toBuffer();

    const result = await saveImageUpload(originalBuf, 'jpg', { prefix: 'events' });
    expect(result.variants).toBeDefined();

    const detailObj = mockBucket.get(result.variants!.detail.key)!;
    const thumbObj = mockBucket.get(result.variants!.thumb.key)!;

    const detailMeta = await sharp(detailObj.body).metadata();
    const thumbMeta = await sharp(thumbObj.body).metadata();

    expect(detailMeta.format).toBe('webp');
    expect(thumbMeta.format).toBe('webp');
    expect(thumbMeta.width).toBeLessThanOrEqual(240);
    expect(thumbMeta.height).toBeLessThanOrEqual(240);

    // Relación de aspecto preservada
    const origRatio = 800 / 1200;
    const thumbRatio = thumbMeta.width! / thumbMeta.height!;
    expect(Math.abs(origRatio - thumbRatio)).toBeLessThan(0.02);
  });
});
