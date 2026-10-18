import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  validateImageMagicBytes,
  saveImageUpload,
  saveImageFromUrl,
  cleanupOrphanUploads,
  getPublicUrlForKey,
  getKeyFromPublicUrl,
  MAX_UPLOAD_SIZE,
} from '../image-storage';
import {
  setCustomR2S3Client,
  resetCustomR2S3Client,
  isR2Configured,
  getR2Config,
} from '../r2-client';

describe('Image Storage & Cloudflare R2 Adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetCustomR2S3Client();
    process.env.R2_ACCOUNT_ID = 'test-account-id';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET = 'vayaplan-media-test';
    process.env.R2_PUBLIC_URL = 'https://media.vayaplan.com';
  });

  afterEach(() => {
    resetCustomR2S3Client();
    process.env = { ...originalEnv };
  });

  describe('1. Validación de Formatos y Magic Bytes', () => {
    it('Valida correctamente cabeceras JPEG reales (FF D8 FF)', () => {
      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const detected = validateImageMagicBytes(validJpeg);
      expect(detected).not.toBeNull();
      expect(detected?.ext).toBe('jpg');
      expect(detected?.mime).toBe('image/jpeg');
    });

    it('Valida correctamente cabeceras PNG reales (89 50 4E 47 0D 0A 1A 0A)', () => {
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const detected = validateImageMagicBytes(validPng);
      expect(detected).not.toBeNull();
      expect(detected?.ext).toBe('png');
      expect(detected?.mime).toBe('image/png');
    });

    it('Valida correctamente cabeceras WebP reales (RIFF....WEBP)', () => {
      const validWebp = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00, // file size
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20, // VP8
      ]);
      const detected = validateImageMagicBytes(validWebp);
      expect(detected).not.toBeNull();
      expect(detected?.ext).toBe('webp');
      expect(detected?.mime).toBe('image/webp');
    });

    it('Rechaza ejecutables, PDFs o texto plano renombrado', () => {
      const textFile = Buffer.from('Hello World, this is not an image');
      expect(validateImageMagicBytes(textFile)).toBeNull();

      const pdfFile = Buffer.from('%PDF-1.4\n%...');
      expect(validateImageMagicBytes(pdfFile)).toBeNull();

      const elfFile = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(validateImageMagicBytes(elfFile)).toBeNull();

      const shortFile = Buffer.from([0xff, 0xd8, 0xff]);
      expect(validateImageMagicBytes(shortFile)).toBeNull();
    });

    it('Límite de tamaño máximo configurado en 5 MB', () => {
      expect(MAX_UPLOAD_SIZE).toBe(5 * 1024 * 1024);
    });
  });

  describe('2. Integración y Adaptador Cloudflare R2', () => {
    it('Identifica y deriva correctamente URLs públicas y claves canónicas', () => {
      const key = 'events/e7a63d91-49fa-47cb-bfdc-37d45763261a.jpg';
      const url = getPublicUrlForKey(key);
      expect(url).toBe('https://media.vayaplan.com/events/e7a63d91-49fa-47cb-bfdc-37d45763261a.jpg');

      const extractedKey = getKeyFromPublicUrl(url);
      expect(extractedKey).toBe(key);

      // URL externa no perteneciente a R2 retorna null
      expect(getKeyFromPublicUrl('https://images.unsplash.com/photo-123')).toBeNull();
    });

    it('Rechaza la subida si Cloudflare R2 no está configurado (sin fallback silencioso a disco)', async () => {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;

      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      await expect(saveImageUpload(validJpeg, 'jpg')).rejects.toThrow(
        /Almacenamiento Cloudflare R2 no configurado/i
      );
    });

    it('Sube archivo a Cloudflare R2 mediante PutObjectCommand con clave UUID y cabeceras inmutables', async () => {
      let sentCommand: any = null;
      const mockS3 = {
        send: async (cmd: any) => {
          sentCommand = cmd;
          return {};
        },
      };
      setCustomR2S3Client(mockS3);

      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xab]);
      const res = await saveImageUpload(validJpeg, 'jpg', { prefix: 'events' });

      expect(res.provider).toBe('cloudflare_r2');
      expect(res.key).toMatch(/^events\/[a-f0-9-]{36}\.jpg$/);
      expect(res.url).toBe(`https://media.vayaplan.com/${res.key}`);
      expect(res.filename).toMatch(/^[a-f0-9-]{36}\.jpg$/);
      expect(res.size).toBe(validJpeg.length);
      expect(res.mimeType).toBe('image/jpeg');

      // Verificar parámetros pasados al cliente S3
      expect(sentCommand).not.toBeNull();
      expect(sentCommand.input.Bucket).toBe('vayaplan-media-test');
      expect(sentCommand.input.Key).toBe(res.key);
      expect(sentCommand.input.ContentType).toBe('image/jpeg');
      expect(sentCommand.input.CacheControl).toBe('public, max-age=31536000, immutable');
    });

    it('Si Cloudflare R2 falla, lanza error descriptivo y NO guarda en disco local silenciosamente', async () => {
      const mockS3 = {
        send: async () => {
          throw new Error('NetworkingError: Cloudflare R2 connection timed out (504)');
        },
      };
      setCustomR2S3Client(mockS3);

      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      await expect(saveImageUpload(validJpeg, 'jpg')).rejects.toThrow(
        /Error al transferir la imagen a Cloudflare R2: NetworkingError/i
      );
    });

    it('Reutilización por importador (saveImageFromUrl): descarga, valida y almacena en R2', async () => {
      let sentCommand: any = null;
      const mockS3 = {
        send: async (cmd: any) => {
          sentCommand = cmd;
          return {};
        },
      };
      setCustomR2S3Client(mockS3);

      // Mock de fetch global para simular descarga desde CDN de Instagram
      const originalFetch = globalThis.fetch;
      const mockImageBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x22,
      ]);

      globalThis.fetch = async (url: any) => {
        return new Response(mockImageBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      };

      try {
        const importRes = await saveImageFromUrl('https://instagram.fmad3-1.fna.fbcdn.net/v/t51.2885-15/cartel.png', {
          prefix: 'imports',
          sourceUrl: 'https://www.instagram.com/p/DB123456/',
        });

        expect(importRes.provider).toBe('cloudflare_r2');
        expect(importRes.key).toMatch(/^imports\/[a-f0-9-]{36}\.png$/);
        expect(importRes.url).toBe(`https://media.vayaplan.com/${importRes.key}`);
        expect(sentCommand.input.Metadata?.source_url).toBe('https://www.instagram.com/p/DB123456/');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('3. Limpieza de Objetos Huérfanos en Cloudflare R2', () => {
    it('Preserva imágenes referenciadas en DB y protege subidas recientes dentro del periodo de gracia (24h)', async () => {
      const deletedKeys: string[] = [];
      const now = Date.now();

      // Objetos simulados en el bucket R2:
      // 1. events/referenced-1.jpg -> Referenciada en DB (debe preservarse)
      // 2. events/in-progress.jpg  -> Creada hace 1 hora (no en DB, pero en periodo de gracia; debe preservarse)
      // 3. events/orphan-old.jpg   -> Creada hace 48 horas (no en DB, fuera de gracia; debe eliminarse)
      const mockObjects = [
        { Key: 'events/referenced-1.jpg', Size: 1024, LastModified: new Date(now - 72 * 3600 * 1000) },
        { Key: 'events/in-progress.jpg', Size: 2048, LastModified: new Date(now - 1 * 3600 * 1000) },
        { Key: 'events/orphan-old.jpg', Size: 4096, LastModified: new Date(now - 48 * 3600 * 1000) },
      ];

      const mockS3 = {
        send: async (cmd: any) => {
          if (cmd.constructor.name === 'ListObjectsV2Command') {
            if (cmd.input.Prefix === 'events/') {
              return { Contents: mockObjects };
            }
            return { Contents: [] };
          }
          if (cmd.constructor.name === 'DeleteObjectCommand') {
            deletedKeys.push(cmd.input.Key);
            return {};
          }
          return {};
        },
      };
      setCustomR2S3Client(mockS3);

      const mockDbQuery = async (sql: string) => {
        if (sql.includes('events')) {
          return { rows: [{ image_url: 'https://media.vayaplan.com/events/referenced-1.jpg' }] };
        }
        return { rows: [] };
      };

      // Simular base de datos con referenced-1.jpg
      const result = await cleanupOrphanUploads({
        graceHours: 24,
        dryRun: false,
        dbQuery: mockDbQuery,
      });

      expect(result.storage_provider).toBe('cloudflare_r2');
      expect(result.grace_hours).toBe(24);
      // orphan-old debe ser eliminada
      expect(deletedKeys).toContain('events/orphan-old.jpg');
      // in-progress (reciente) y referenced-1 no deben eliminarse
      expect(deletedKeys).not.toContain('events/in-progress.jpg');
      expect(deletedKeys).not.toContain('events/referenced-1.jpg');
    });
  });

  describe('4. Prueba de Cloudflare R2 Real (Condicional)', () => {
    // Si existen credenciales reales en el entorno, ejecuta un ciclo completo contra el bucket real
    const hasRealCredentials = Boolean(
      process.env.TEST_REAL_R2 === 'true' &&
      originalEnv.R2_ACCOUNT_ID &&
      originalEnv.R2_ACCESS_KEY_ID &&
      originalEnv.R2_SECRET_ACCESS_KEY
    );

    it('Ejecuta subida y lectura en almacenamiento real solo cuando esté explícitamente configurado', async () => {
      if (!hasRealCredentials) {
        console.log('ℹ️  [TEST REAL CLOUDFLARE R2 OMITIDO] Credenciales de R2 no configuradas o TEST_REAL_R2 != true. Suite ejecutada con mocks aislados.');
        expect(true).toBe(true);
        return;
      }

      // Código de test real ejecutado únicamente bajo autorización
      process.env = { ...originalEnv };
      resetCustomR2S3Client();

      const testBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xcc]);
      const res = await saveImageUpload(testBuffer, 'jpg', { prefix: 'test-isolated' });
      expect(res.url).toContain('test-isolated/');

      // Limpieza inmediata del objeto de test
      const { deleteR2Object } = await import('../r2-client');
      await deleteR2Object(res.key);
    });
  });
});
