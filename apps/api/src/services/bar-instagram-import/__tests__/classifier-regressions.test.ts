import { describe, test, expect } from 'bun:test';
import { classifyBarPost } from '../bar-classifier';
import type { ApifyInstagramRawPost } from '../bar-types';

describe('Regresiones del clasificador de publicaciones de Instagram (bar-classifier)', () => {
  const basePost: ApifyInstagramRawPost = {
    id: 'post_regression_test',
    shortCode: 'post_reg_1',
    type: 'Image',
    url: 'https://www.instagram.com/p/post_reg_1/',
    displayUrl: 'https://media.vayaplan.com/test.jpg',
    caption: '',
    timestamp: '2026-10-20T12:00:00.000Z',
    likesCount: 10,
    commentsCount: 2,
    dimensionsWidth: 1080,
    dimensionsHeight: 1080,
    ownerUsername: 'testvenue',
    taggedUsers: [],
  };

  describe('Corrección de ReferenceError: signalCount', () => {
    test('Un post con solo hora (exactamente 1 señal de hora sin fecha ni actividad) clasifica como CONTENIDO_GENERAL sin lanzar ReferenceError', () => {
      // Un post que solo contiene hora (sin fecha y sin actividad de evento)
      // Antes de la corrección, al llegar a la evaluación caía en: if (signalCount === 1) -> ReferenceError
      const postWithOnlyTime: ApifyInstagramRawPost = {
        ...basePost,
        caption: 'Os esperamos esta noche a partir de las 21:00h con el mejor servicio.',
      };

      expect(() => {
        const result = classifyBarPost(postWithOnlyTime);
        expect(result.classification).toBe('CONTENIDO_GENERAL');
        expect(result.reason).toContain('sin convocatoria de evento específico');
      }).not.toThrow();
    });

    test('Un post sin ninguna señal clasifica como CONTENIDO_VENUE', () => {
      const postWithoutSignals: ApifyInstagramRawPost = {
        ...basePost,
        caption: 'Disfruta de nuestra terraza en el centro de Palencia con el mejor ambiente.',
      };

      const result = classifyBarPost(postWithoutSignals);
      expect(result.classification).toBe('CONTENIDO_VENUE');
    });
  });

  describe('Manejo de fechas ISO (dateIso)', () => {
    test('Detecta correctamente fechas en formato ISO YYYY-MM-DD sin confundirlas con día/mes', () => {
      const postWithIsoDate: ApifyInstagramRawPost = {
        ...basePost,
        caption: 'Concierto especial este 2026-10-31 a las 21:00h en directo con tributo acústico',
      };

      const result = classifyBarPost(postWithIsoDate);
      expect(result.classification).toBe('EVENTO_POSIBLE');
      expect(result.detectedDate).toBe('2026-10-31');
      expect(result.detectedTime).toBe('21:00');
    });

    test('Mantiene compatibilidad con fechas en formato español natural (DD de Mes)', () => {
      const postWithNaturalDate: ApifyInstagramRawPost = {
        ...basePost,
        caption: 'Concierto acústico el 31 de octubre a las 21:00h en directo',
      };

      const result = classifyBarPost(postWithNaturalDate);
      expect(result.classification).toBe('EVENTO_POSIBLE');
      expect(result.detectedDate).toBe('2026-10-31');
      expect(result.detectedTime).toBe('21:00');
    });

    test('Mantiene compatibilidad con fechas numéricas DD/MM', () => {
      const postWithSlashDate: ApifyInstagramRawPost = {
        ...basePost,
        caption: 'Fiesta de disfraces el 31/10 a partir de las 23:00 con DJ residente',
      };

      const result = classifyBarPost(postWithSlashDate);
      expect(result.classification).toBe('EVENTO_POSIBLE');
      expect(result.detectedDate).toBe('2026-10-31');
      expect(result.detectedTime).toBe('23:00');
    });

    test('Mantiene compatibilidad con fechas relativas (este sábado)', () => {
      const postWithRelativeDate: ApifyInstagramRawPost = {
        ...basePost,
        caption: 'Tributo de rock este sábado a las 22:00h',
      };

      const result = classifyBarPost(postWithRelativeDate);
      expect(result.classification).toBe('EVENTO_POSIBLE');
      expect(result.detectedTime).toBe('22:00');
      expect(result.detectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
