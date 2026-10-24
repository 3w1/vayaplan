import { describe, expect, test, beforeAll } from 'bun:test';
import sharp from 'sharp';
import {
  classifyImageStatus,
  determineRecommendedAction,
  KNOWN_BIBLIOTECA_SOURCES,
} from '../biblioteca-service';
import { processAndUploadBibliotecaImage } from '../biblioteca-r2-pipeline';

describe('Servicio de Imágenes Oficiales — Biblioteca Pública de Palencia', () => {
  beforeAll(() => {
    process.env.MOCK_R2 = 'true';
    process.env.R2_PUBLIC_URL = 'https://media.vayaplan.com';
  });

  describe('1. Clasificación de Estado de Imagen y Reglas de Sustitución', () => {
    test('Identifica SIN_IMAGEN ante valores nulos, vacíos o indefinidos', () => {
      expect(classifyImageStatus(null)).toBe('SIN_IMAGEN');
      expect(classifyImageStatus('')).toBe('SIN_IMAGEN');
      expect(classifyImageStatus('   ')).toBe('SIN_IMAGEN');
      expect(classifyImageStatus(undefined)).toBe('SIN_IMAGEN');
    });

    test('Identifica IMAGEN_GENERICA ante carteles generales o logos', () => {
      expect(
        classifyImageStatus(
          'https://jazzpalencia.es/wp-content/uploads/2026/09/Cartel-Jazz-2026.webp'
        )
      ).toBe('IMAGEN_GENERICA');
      expect(
        classifyImageStatus('https://example.com/logo-ayuntamiento.png')
      ).toBe('IMAGEN_GENERICA');
    });

    test('Identifica IMAGEN_OFICIAL_EXISTENTE ante imágenes trazables en R2 de la biblioteca', () => {
      expect(
        classifyImageStatus(
          'https://media.vayaplan.com/biblioteca-publica/exposicion/7f4561578072.webp'
        )
      ).toBe('IMAGEN_OFICIAL_EXISTENTE');
    });

    test('Reglas de sustitución asignan la acción recomendada correcta', () => {
      expect(determineRecommendedAction('SIN_IMAGEN')).toBe('ADOPTAR_IMAGEN_OFICIAL');
      expect(determineRecommendedAction('IMAGEN_GENERICA')).toBe('PROPONER_ALTERNATIVA');
      expect(determineRecommendedAction('IMAGEN_OFICIAL_EXISTENTE')).toBe('MANTENER_IMAGEN_ACTUAL');
      expect(determineRecommendedAction('REQUIERE_REVISION')).toBe('REQUIERE_REVISION');
    });
  });

  describe('2. Pipeline de Optimización WebP y Subida a Cloudflare R2', () => {
    test('Procesa y convierte a WebP una imagen JPEG con hash trazable', async () => {
      // Crear un buffer JPEG sintético válido con sharp (100x100)
      const mockJpeg = await sharp({
        create: {
          width: 200,
          height: 300,
          channels: 3,
          background: { r: 50, g: 100, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processAndUploadBibliotecaImage({
        eventId: 9,
        eventSlug: 'exposicion-agustin-hernandez',
        sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/35/937/BPA_AG_Exposicion_Mirada_Sincera_Cartel.jpg',
        sourcePageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/BibliotecaPalencia/es/Plantilla100Detalle/1284355840201/Evento/1285184301373/Comunicacion',
        sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
        credit: 'Biblioteca Pública de Palencia / Agustín Hernández',
        mockBuffer: mockJpeg,
      });

      expect(result.contentType).toBe('image/webp');
      expect(result.width).toBe(200);
      expect(result.height).toBe(300);
      expect(result.r2Key).toStartWith('biblioteca-publica/exposicion-agustin-hernandez/');
      expect(result.r2Key).toEndWith('.webp');
      expect(result.finalUrl).toBe(`https://media.vayaplan.com/${result.r2Key}`);
      expect(result.credit).toBe('Biblioteca Pública de Palencia / Agustín Hernández');
      expect(result.imageHash).toBeDefined();
      expect(result.imageHash.length).toBe(12);
    });

    test('Lanza excepción descriptiva si el buffer no es una imagen válida', async () => {
      const invalidBuffer = Buffer.from('not an image content at all');

      expect(
        processAndUploadBibliotecaImage({
          eventId: 14,
          eventSlug: 'mujeres-romanico',
          sourceImageUrl: 'https://example.com/bad.jpg',
          sourcePageUrl: 'https://example.com',
          sourceName: 'Test',
          credit: 'Test',
          mockBuffer: invalidBuffer,
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Verificación de Fuentes Oficiales Preconfiguradas', () => {
    test('El catálogo de fuentes oficiales incluye los 7 eventos del lote sin duplicados ni URLs no oficiales', () => {
      const keys = Object.keys(KNOWN_BIBLIOTECA_SOURCES).map(Number);
      expect(keys.length).toBe(7);
      expect(keys).toContain(9);
      expect(keys).toContain(14);
      expect(keys).toContain(16);
      expect(keys).toContain(19);
      expect(keys).toContain(35);
      expect(keys).toContain(44);
      expect(keys).toContain(46);

      keys.forEach((id) => {
        const item = KNOWN_BIBLIOTECA_SOURCES[id];
        expect(item.eventId).toBe(id);
        expect(item.sourceImageUrl).toMatch(/^https:\/\/(bibliotecas\.jcyl\.es|jazzpalencia\.es)\//);
        expect(item.sourcePageUrl).toMatch(/^https:\/\/(bibliotecas\.jcyl\.es|jazzpalencia\.es)\//);
        expect(item.credit).toBeDefined();
        expect(item.slug).toBeDefined();
      });
    });
  });
});
