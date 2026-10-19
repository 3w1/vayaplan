import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { app } from '../../../index';
import { setCustomR2S3Client, resetCustomR2S3Client } from '../../../services/r2-client';

import sharp from 'sharp';

async function makeJpegBuffer(w = 100, h = 100) {
  return await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 50, b: 50 } },
  }).jpeg().toBuffer();
}

async function makeWebpBuffer(w = 100, h = 100) {
  return await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 50, g: 200, b: 50 } },
  }).webp().toBuffer();
}

describe('Uploads API Routes (POST /api/v1/admin/uploads & GET /api/v1/uploads/:filename)', () => {
  const originalEnv = { ...process.env };
  const testUploadsDir = path.join(process.cwd(), 'test-uploads-api-' + Date.now());
  let adminToken = '';
  let mockUploadedObjects: Map<string, { body: Buffer; contentType: string }> = new Map();

  beforeEach(async () => {
    resetCustomR2S3Client();
    mockUploadedObjects.clear();

    process.env.R2_ACCOUNT_ID = 'test-account-id';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET = 'vayaplan-media-test';
    process.env.R2_PUBLIC_URL = 'https://media.vayaplan.com';
    process.env.UPLOADS_DIR = testUploadsDir;

    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testUploadsDir, { recursive: true });

    // Mock de cliente S3 para Cloudflare R2
    const mockS3 = {
      send: async (cmd: any) => {
        if (cmd.constructor.name === 'PutObjectCommand') {
          mockUploadedObjects.set(cmd.input.Key, {
            body: cmd.input.Body,
            contentType: cmd.input.ContentType,
          });
          return {};
        }
        return {};
      },
    };
    setCustomR2S3Client(mockS3);

    // Iniciar sesión para obtener token de admin válido
    const loginRes = await app.request('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@vayaplan.com',
        password: 'vayaplan2026!',
      }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      adminToken = data.token;
    }
  });

  afterEach(() => {
    resetCustomR2S3Client();
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    process.env = { ...originalEnv };
  });

  it('1. Rechaza peticiones sin autenticación administrativa (401)', async () => {
    const formData = new FormData();
    const fakeFile = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])], { type: 'image/jpeg' });
    formData.append('file', fakeFile, 'cartel.jpg');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(401);
  });

  it('2. Sube correctamente un archivo JPEG auténtico a Cloudflare R2 y devuelve la URL canónica', async () => {
    const validJpegBytes = await makeJpegBuffer(120, 160);
    const formData = new FormData();
    const file = new Blob([validJpegBytes], { type: 'image/jpeg' });
    formData.append('file', file, 'concierto.jpg');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.key).toMatch(/^events\/[a-f0-9-]{36}-detail\.webp$/);
    expect(data.url).toBe(`https://media.vayaplan.com/${data.key}`);
    expect(data.thumb_url).toBe(`https://media.vayaplan.com/${data.variants.thumb.key}`);
    expect(data.original_url).toMatch(/^\/api\/v1\/admin\/uploads\/originals\/[a-f0-9-]{36}-original\.jpg$/);
    expect(data.provider).toBe('cloudflare_r2');
    expect(data.mime_type).toBe('image/webp');
    expect(data.variants).toBeDefined();

    // Verificar que las variantes públicas fueron transferidas a R2
    expect(mockUploadedObjects.has(data.variants.detail.key)).toBe(true);
    expect(mockUploadedObjects.has(data.variants.thumb.key)).toBe(true);
    // El original no se sube al bucket público de R2
    expect(mockUploadedObjects.has(data.variants.original.key)).toBe(false);

    // Acceso anónimo al original: denegado (401)
    const anonRes = await app.request(data.original_url);
    expect(anonRes.status).toBe(401);

    // Recuperación administrativa: permitida con autorización (200)
    const authRes = await app.request(data.original_url, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(authRes.status).toBe(200);
    const downloadedOrig = Buffer.from(await authRes.arrayBuffer());
    expect(downloadedOrig.equals(validJpegBytes)).toBe(true);
  });

  it('3. Sube correctamente un archivo WebP auténtico a Cloudflare R2', async () => {
    const validWebpBytes = await makeWebpBuffer(100, 100);
    const formData = new FormData();
    const file = new Blob([validWebpBytes], { type: 'image/webp' });
    formData.append('file', file, 'teatro.webp');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.key).toMatch(/^events\/[a-f0-9-]{36}-detail\.webp$/);
    expect(data.url).toBe(`https://media.vayaplan.com/${data.key}`);
    expect(data.mime_type).toBe('image/webp');
    expect(data.variants.original.key).toMatch(/^originals\/[a-f0-9-]{36}-original\.webp$/);
    expect(data.original_url).toMatch(/^\/api\/v1\/admin\/uploads\/originals\/[a-f0-9-]{36}-original\.webp$/);
  });

  it('4. Retorna error 503 si Cloudflare R2 no está configurado (sin fallback silencioso a disco)', async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    resetCustomR2S3Client();

    const validJpegBytes = await makeJpegBuffer(50, 50);
    const formData = new FormData();
    const file = new Blob([validJpegBytes], { type: 'image/jpeg' });
    formData.append('file', file, 'prueba.jpg');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('storage_unconfigured');
    expect(data.message).toContain('Almacenamiento Cloudflare R2 no configurado');
  });

  it('5. Retorna error 500 si la transferencia a Cloudflare R2 falla (sin fallback silencioso)', async () => {
    const failingMockS3 = {
      send: async () => {
        throw new Error('S3 Connection Timed Out (504 Gateway Timeout)');
      },
    };
    setCustomR2S3Client(failingMockS3);

    const validJpegBytes = await makeJpegBuffer(50, 50);
    const formData = new FormData();
    const file = new Blob([validJpegBytes], { type: 'image/jpeg' });
    formData.append('file', file, 'prueba.jpg');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('storage_error');
    expect(data.message).toContain('Error al transferir la imagen a Cloudflare R2');
  });

  it('6. Rechaza archivos con extensión .jpg pero contenido fraudulento (no JPEG)', async () => {
    const fakeFileBytes = Buffer.from('Este es un archivo de texto con extensión cambiada a .jpg');
    const formData = new FormData();
    const file = new Blob([fakeFileBytes], { type: 'image/jpeg' });
    formData.append('file', file, 'virus_disfrazado.jpg');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('unsupported_format');
    expect(data.message).toContain('JPEG, PNG o WebP');
  });

  it('7. Rechaza archivos que superen 5 MB', async () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    largeBuffer[0] = 0xff;
    largeBuffer[1] = 0xd8;
    largeBuffer[2] = 0xff;
    largeBuffer[3] = 0xe0;

    const formData = new FormData();
    const file = new Blob([largeBuffer], { type: 'image/jpeg' });
    formData.append('file', file, 'enorme.jpg');

    const res = await app.request('/api/v1/admin/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('file_too_large');
    expect(data.message).toContain('5 MB');
  });

  it('8. Mantiene compatibilidad hacia atrás en GET /api/v1/uploads/:filename y protección directory traversal', async () => {
    // Si existe un archivo local previo, lo sirve correctamente
    const legacyBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    fs.writeFileSync(path.join(testUploadsDir, 'legacy.jpg'), legacyBytes);

    const getRes = await app.request('/api/v1/uploads/legacy.jpg');
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    // Intentos de directory traversal son bloqueados
    const res1 = await app.request('/api/v1/uploads/../../etc/passwd');
    expect(res1.status).toBe(404);

    const res2 = await app.request('/api/v1/uploads/inexistente.jpg');
    expect(res2.status).toBe(404);
  });
});
