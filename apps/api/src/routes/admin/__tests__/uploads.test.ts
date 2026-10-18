import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { app } from '../../../index';

describe('Uploads API Routes (POST /api/v1/admin/uploads & GET /api/v1/uploads/:filename)', () => {
  const testUploadsDir = path.join(process.cwd(), 'test-uploads-api-' + Date.now());
  let adminToken = '';

  beforeEach(async () => {
    process.env.UPLOADS_DIR = testUploadsDir;
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testUploadsDir, { recursive: true });

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
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    delete process.env.UPLOADS_DIR;
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

  it('2. Sube correctamente un archivo JPEG auténtico y devuelve la URL accesible', async () => {
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
    expect(data.url).toMatch(/^\/api\/v1\/uploads\/[a-f0-9-]{36}\.jpg$/);
    expect(data.mime_type).toBe('image/jpeg');
    expect(data.size_bytes).toBe(validJpegBytes.length);

    // Comprobar que la URL devuelta puede servirse públicamente por GET /api/v1/uploads/:filename
    const getRes = await app.request(data.url);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('Content-Type')).toBe('image/jpeg');
    expect(getRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const getBuffer = Buffer.from(await getRes.arrayBuffer());
    expect(getBuffer.equals(validJpegBytes)).toBe(true);
  });

  it('3. Sube correctamente un archivo WebP auténtico', async () => {
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
    expect(data.url).toMatch(/\.webp$/);
    expect(data.mime_type).toBe('image/webp');
  });

  it('4. Rechaza archivos con extensión .jpg pero contenido fraudulento (no JPEG)', async () => {
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

  it('5. Rechaza archivos que superen 5 MB', async () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    // Añadir cabecera JPEG al principio para que pase la validación de formato
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

  it('6. Protege contra directory traversal en GET /api/v1/uploads/:filename', async () => {
    const res1 = await app.request('/api/v1/uploads/../../etc/passwd');
    expect(res1.status).toBe(404);

    const res2 = await app.request('/api/v1/uploads/inexistente.jpg');
    expect(res2.status).toBe(404);
  });
});
