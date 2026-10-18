import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateImageMagicBytes,
  saveImageUpload,
  getUploadsDir,
  MAX_UPLOAD_SIZE,
} from '../image-storage';

describe('Image Storage & Magic Bytes Validation', () => {
  const testUploadsDir = path.join(process.cwd(), 'test-uploads-' + Date.now());

  beforeEach(() => {
    process.env.UPLOADS_DIR = testUploadsDir;
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testUploadsDir)) {
      fs.rmSync(testUploadsDir, { recursive: true, force: true });
    }
    delete process.env.UPLOADS_DIR;
  });

  it('1. Valida correctamente cabeceras JPEG reales (FF D8 FF)', () => {
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const detected = validateImageMagicBytes(validJpeg);
    expect(detected).not.toBeNull();
    expect(detected?.ext).toBe('jpg');
    expect(detected?.mime).toBe('image/jpeg');
  });

  it('2. Valida correctamente cabeceras PNG reales (89 50 4E 47 0D 0A 1A 0A)', () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const detected = validateImageMagicBytes(validPng);
    expect(detected).not.toBeNull();
    expect(detected?.ext).toBe('png');
    expect(detected?.mime).toBe('image/png');
  });

  it('3. Valida correctamente cabeceras WebP reales (RIFF....WEBP)', () => {
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

  it('4. Rechaza archivos no válidos, ejecutables, PDFs o texto plano renombrado', () => {
    // Archivo de texto que empieza por "Hello World"
    const textFile = Buffer.from('Hello World, this is not an image');
    expect(validateImageMagicBytes(textFile)).toBeNull();

    // Archivo PDF que empieza por %PDF
    const pdfFile = Buffer.from('%PDF-1.4\n%...');
    expect(validateImageMagicBytes(pdfFile)).toBeNull();

    // Archivo ejecutable ELF
    const elfFile = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(validateImageMagicBytes(elfFile)).toBeNull();

    // Archivo demasiado corto (< 12 bytes)
    const shortFile = Buffer.from([0xff, 0xd8, 0xff]);
    expect(validateImageMagicBytes(shortFile)).toBeNull();
  });

  it('5. Guarda imagen con nombre UUID único y ruta accesible', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xaa, 0xbb]);
    const saved = await saveImageUpload(jpegBuffer, 'jpg');

    expect(saved.filename).toMatch(/^[a-f0-9-]{36}\.jpg$/);
    expect(saved.url).toBe(`/api/v1/uploads/${saved.filename}`);
    expect(saved.size).toBe(jpegBuffer.length);

    // Verificar existencia física en disco
    const fullPath = path.join(testUploadsDir, saved.filename);
    expect(fs.existsSync(fullPath)).toBe(true);
    const readBack = fs.readFileSync(fullPath);
    expect(readBack.equals(jpegBuffer)).toBe(true);
  });

  it('6. Límite de tamaño máximo configurado en 5 MB', () => {
    expect(MAX_UPLOAD_SIZE).toBe(5 * 1024 * 1024);
  });
});
