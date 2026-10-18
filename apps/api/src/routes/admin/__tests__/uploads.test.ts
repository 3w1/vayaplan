import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { app } from '../../../index';
import { setCustomR2S3Client, resetCustomR2S3Client } from '../../../services/r2-client';

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
    const validJpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    ]);
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
    expect(data.key).toMatch(/^events\/[a-f0-9-]{36}\.jpg$/);
    expect(data.url).toBe(`https://media.vayaplan.com/${data.key}`);
    expect(data.provider).toBe('cloudflare_r2');
    expect(data.mime_type).toBe('image/jpeg');
    expect(data.size_bytes).toBe(validJpegBytes.length);

    // Verificar que el objeto fue transferido a R2
    expect(mockUploadedObjects.has(data.key)).toBe(true);
    const stored = mockUploadedObjects.get(data.key)!;
    expect(stored.contentType).toBe('image/jpeg');
    expect(stored.body.equals(validJpegBytes)).toBe(true);
  });

  it('3. Sube correctamente un archivo WebP auténtico a Cloudflare R2', async () => {
    const validWebpBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x14, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]);
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
    expect(data.key).toMatch(/^events\/[a-f0-9-]{36}\.webp$/);
    expect(data.url).toBe(`https://media.vayaplan.com/${data.key}`);
    expect(data.mime_type).toBe('image/webp');
  });

  it('4. Retorna error 503 si Cloudflare R2 no está configurado (sin fallback silencioso a disco)', async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    resetCustomR2S3Client();

    const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
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
    expect(data.error).toBe('storage_error');
    expect(data.message).toContain('Almacenamiento Cloudflare R2 no configurado');
  });

  it('5. Retorna error 500 si la transferencia a Cloudflare R2 falla (sin fallback silencioso)', async () => {
    const failingMockS3 = {
      send: async () => {
        throw new Error('S3 Connection Timed Out (504 Gateway Timeout)');
      },
    };
    setCustomR2S3Client(failingMockS3);

    const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
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
