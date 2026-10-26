import { describe, expect, test, beforeAll } from 'bun:test';
import sharp from 'sharp';

process.env.MOCK_R2 = 'true';

import {
  isPrivateOrReservedIp,
  isSafeImageUrl,
  fetchSafeImageBuffer,
  downloadAndUploadPostImageToR2,
  MAX_SINGLE_POST_IMAGE_SIZE_BYTES,
  MAX_IMAGE_INPUT_PIXELS,
  ALLOWED_IMAGE_FORMATS,
} from '../single-post-importer';

describe('Descarga Segura y Normalización de Imágenes (single-post-importer)', () => {
  test('1. isPrivateOrReservedIp bloquea exhaustivamente IPv4 privadas, loopback, link-local y CGNAT', () => {
    // Loopback y cero
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('127.0.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrReservedIp('0.1.2.3')).toBe(true);

    // Privadas RFC 1918
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.255.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.24.10.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.100.200')).toBe(true);

    // Link-local / Cloud metadata (RFC 3927)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.1.1')).toBe(true);

    // CGNAT (RFC 6598 - 100.64.0.0/10)
    expect(isPrivateOrReservedIp('100.64.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('100.127.255.255')).toBe(true);

    // Multicast y broadcast
    expect(isPrivateOrReservedIp('224.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('240.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('255.255.255.255')).toBe(true);

    // IPs públicas válidas
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIp('104.20.23.154')).toBe(false);
    expect(isPrivateOrReservedIp('151.101.65.140')).toBe(false);
  });

  test('2. isPrivateOrReservedIp bloquea IPv6 privadas, loopback, ULA, link-local y mapeadas IPv4', () => {
    // Loopback y sin especificar
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::')).toBe(true);

    // ULA (fc00::/7)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd12:3456:789a::1')).toBe(true);

    // Link-local (fe80::/10)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('febf::ffff')).toBe(true);

    // Multicast (ff00::/8)
    expect(isPrivateOrReservedIp('ff02::1')).toBe(true);

    // IPv4 mapeada en IPv6 (::ffff:0:0/96)
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:192.168.1.1')).toBe(true);

    // IPv4 pública mapeada en IPv6
    expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('::ffff:104.20.23.154')).toBe(false);
  });

  test('3. isSafeImageUrl valida esquema, credenciales, puertos y hostnames locales', () => {
    // Permitidos
    expect(isSafeImageUrl('https://cdn.instagram.com/pic.jpg')).toBe(true);
    expect(isSafeImageUrl('http://images.vayaplan.com/photo.webp')).toBe(true);

    // Esquemas prohibidos
    expect(isSafeImageUrl('ftp://example.com/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);

    // Credenciales embebidas
    expect(isSafeImageUrl('https://admin:secret@cdn.instagram.com/pic.jpg')).toBe(false);

    // Puertos no estándar
    expect(isSafeImageUrl('https://example.com:8080/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('https://example.com:3000/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('http://example.com:22/pic.jpg')).toBe(false);

    // Hostnames locales
    expect(isSafeImageUrl('http://localhost/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('http://api.internal/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('http://server.local/pic.jpg')).toBe(false);
    expect(isSafeImageUrl('http://mytest.localhost/pic.jpg')).toBe(false);
  });

  test('4. fetchSafeImageBuffer aborta de inmediato ante URLs no seguras sin abrir conexiones', async () => {
    const dangerousUrls = [
      'http://127.0.0.1:8080/secret.jpg',
      'http://169.254.169.254/latest/meta-data/',
      'https://admin:1234@example.com/pic.jpg',
      'ftp://ftp.example.com/pic.jpg',
      'http://localhost/pic.jpg',
      'http://::1/pic.jpg',
    ];

    for (const u of dangerousUrls) {
      expect(fetchSafeImageBuffer(u)).rejects.toThrow('SSRF guard');
    }
  });

  test('5. downloadAndUploadPostImageToR2 rechaza formatos prohibidos como SVG o GIF animado', async () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>');

    const mockPost = {
      id: 'TEST_FORMAT_SVG',
      shortCode: 'TEST_FORMAT_SVG',
      displayUrl: 'https://cdn.instagram.com/test.svg',
    };

    expect(
      downloadAndUploadPostImageToR2(mockPost as any, 'test-venue', async () => svgBuffer)
    ).rejects.toThrow('Formato de imagen no permitido');
  });

  test('6. downloadAndUploadPostImageToR2 rechaza buffers binarios corruptos', async () => {
    const corruptBuffer = Buffer.from([0x00, 0xff, 0xde, 0xad, 0xbe, 0xef, 0x12, 0x34]);

    const mockPost = {
      id: 'TEST_CORRUPT_BIN',
      shortCode: 'TEST_CORRUPT_BIN',
      displayUrl: 'https://cdn.instagram.com/corrupt.jpg',
    };

    expect(
      downloadAndUploadPostImageToR2(mockPost as any, 'test-venue', async () => corruptBuffer)
    ).rejects.toThrow('Archivo de imagen corrupto o inválido');
  });

  test('7. downloadAndUploadPostImageToR2 transcodifica y normaliza imágenes a JPEG progresivo dentro de 1440x1440', async () => {
    // Imagen PNG de 2000 x 1500 con transparencia
    const inputPng = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 4,
        background: { r: 255, g: 100, b: 50, alpha: 0.6 },
      },
    })
      .png()
      .toBuffer();

    const mockPost = {
      id: 'TEST_NORM_SUCCESS',
      shortCode: 'TEST_NORM_SUCCESS',
      displayUrl: 'https://cdn.instagram.com/large.png',
      dimensionsWidth: 2000,
      dimensionsHeight: 1500,
    };

    const res = await downloadAndUploadPostImageToR2(
      mockPost as any,
      'bar-palencia',
      async () => inputPng
    );

    // Verificaciones de normalización:
    expect(res.contentType).toBe('image/jpeg');
    expect(res.r2Key).toBe('bars/bar-palencia/TEST_NORM_SUCCESS.jpg');
    expect(res.width).toBeLessThanOrEqual(1440);
    expect(res.height).toBeLessThanOrEqual(1440);
    expect(res.sizeBytes).toBeGreaterThan(0);

    // No ampliar imágenes que ya sean pequeñas (p. ej. 400x300)
    const smallJpg = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 50, g: 200, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const smallRes = await downloadAndUploadPostImageToR2(
      { id: 'TEST_SMALL', shortCode: 'TEST_SMALL', displayUrl: 'https://cdn.instagram.com/small.jpg' } as any,
      'standalone',
      async () => smallJpg
    );

    expect(smallRes.width).toBe(400); // withoutEnlargement: no ampliado
    expect(smallRes.height).toBe(300);
    expect(smallRes.r2Key).toBe('bars/standalone/TEST_SMALL.jpg');
  });
});
