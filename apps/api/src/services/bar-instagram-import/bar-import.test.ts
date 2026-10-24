import { describe, expect, test } from 'bun:test';
import { classifyBarPost } from './bar-classifier';
import { PILOT_VENUES_CONFIG } from './bar-importer';
import type { ApifyInstagramRawPost } from './bar-types';

describe('Piloto de Actividad de Bares en Instagram (bar-instagram-import)', () => {
  describe('1. Verificación de los 5 Locales Curados del Piloto', () => {
    test('Contiene exclusivamente los 5 locales autorizados con IDs reales en VayaPlan', () => {
      expect(PILOT_VENUES_CONFIG.length).toBe(5);

      const salvaje = PILOT_VENUES_CONFIG.find((v) => v.username === 'salvajepalencia');
      expect(salvaje).toBeDefined();
      expect(salvaje?.venueId).toBe(10019);
      expect(salvaje?.status).toBe('VERIFICADO');

      const malhablada = PILOT_VENUES_CONFIG.find((v) => v.username === 'lamalhabladapalencia');
      expect(malhablada).toBeDefined();
      expect(malhablada?.venueId).toBe(10011);
      expect(malhablada?.status).toBe('VERIFICADO');

      const infinity = PILOT_VENUES_CONFIG.find((v) => v.username === 'sala.infinity');
      expect(infinity).toBeDefined();
      expect(infinity?.venueId).toBe(10052);
      expect(infinity?.status).toBe('VERIFICADO');

      const universonoro = PILOT_VENUES_CONFIG.find((v) => v.username === 'universonoro');
      expect(universonoro).toBeDefined();
      expect(universonoro?.venueId).toBe(1);
      expect(universonoro?.status).toBe('VERIFICADO');

      const portal = PILOT_VENUES_CONFIG.find((v) => v.username === 'portal1986');
      expect(portal).toBeDefined();
      expect(portal?.venueId).toBe(10040);
      expect(portal?.status).toBe('VERIFICADO');
    });
  });

  describe('2. Clasificación de Posts y Detección de Señales', () => {
    test('Clasifica como EVENTO_POSIBLE un concierto con fecha, hora, artista y sala (Héroes El Culto)', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DeJb8ZgIlA0',
        caption: `🔥 PALENCIA, PREPÁRATE 🔥\nPor primera vez en concierto en Palencia…\n⚡ HÉROES EL CULTO ⚡\nEl mejor tributo a Héroes del Silencio.\n📍 Sala Infinity – Palencia\n📅 24 DE OCTUBRE\n🕥 22:30 H\n🎟️ ENTRADAS YA A LA VENTA`,
        timestamp: '2026-10-06T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'Sala Infinity');
      expect(res.classification).toBe('EVENTO_POSIBLE');
      expect(res.detectedDate).toBe('2026-10-24');
      expect(res.detectedTime).toBe('22:30');
      expect(res.provisionalCategory).toBe('musica_directo');
      expect(res.confidence).toBe('ALTA');
    });

    test('Clasifica como EVENTO_POSIBLE una sesión DJ con fecha, hora y artista (Gómez Palentino)', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DersOuAuW_H',
        caption: `Te esperamos este sábado 24 de octubre a partir de las 18.00 en bar Portal con @djgomezpalentino para empezar con buen pie la noche previa al partido… 🏀💚🦁`,
        timestamp: '2026-10-19T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'El Portal');
      expect(res.classification).toBe('EVENTO_POSIBLE');
      expect(res.detectedDate).toBe('2026-10-24');
      expect(res.detectedTime).toBe('18:00');
      expect(res.provisionalCategory).toBe('dj_tardeo');
    });

    test('Clasifica como EVENTO_POSIBLE una sesión de Drum and Bass gratuita con horario a cierre', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DeUSyCQMemI',
        caption: `Primera edición de Drum and Bass Sessions en @lamalhabladapalencia con un lineup de auténticas bestias del bass nacional.\n📅 17 de octubre\n📍Calle de la mujer palentina 3\n💵 Gratuita\n⏱️ 23:30 a cierre`,
        timestamp: '2026-10-10T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'Bar La Malhablada');
      expect(res.classification).toBe('EVENTO_POSIBLE');
      expect(res.detectedDate).toBe('2026-10-17');
      expect(res.detectedTime).toBe('23:30');
      expect(res.confidence).toBe('ALTA');
    });

    test('Clasifica como PROMOCION el servicio de alquiler de sala para celebraciones privadas', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'Dehx2nYRynR',
        caption: `🎉 ¿NO SABÉS DÓNDE CELEBRAR TU PRÓXIMO EVENTO? 👀🥂 ¡EN LA MALHABLADA TENEMOS EL LUGAR PARA VOS! Alquiler del local con o sin catering... WhatsApp 617 91 80 42 reservá tu fecha!`,
        timestamp: '2026-10-15T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'Bar La Malhablada');
      expect(res.classification).toBe('PROMOCION');
    });

    test('Clasifica como CONTENIDO_GENERAL un recap/agradecimiento de un concierto pasado', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DeZMbwfiMp3',
        caption: `♥️ El viernes nos visitaron nuestros queridos @levitants_ y qué gusto compartir una noche así con ellos. ¡Muchas gracias por dejarnos ser parte de vuestra gira!`,
        timestamp: '2026-10-12T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'Bar Universonoro');
      expect(res.classification).toBe('CONTENIDO_GENERAL');
    });

    test('Identifica falsos positivos de ocio nocturno (copy genérico de ambientación sin cartel ni hora)', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DePMkCuOJ_R',
        caption: `La letra pequeña de este fin de semana: puede contener música alta, decisiones improvisadas y una preocupante tendencia a decir “la última” 🤪 Los DJs ya están avisados. Nos vemos en Salvaje 🦁📍C. Alfonso VIII, 10`,
        timestamp: '2026-10-08T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'Bar Salvaje');
      expect(res.classification).toBe('CONTENIDO_VENUE');
    });

    test('Clasifica como REQUIERE_REVISION la presentación de un headliner sin fecha en el post', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DeROqdTDMWu',
        caption: `Presentamos a nuestro segundo headliner, 💣🔥Réplicant🔥💣, talento, disciplina y genética Techno para nuestro 1er Aniversario Genetic ( Sala Infinity ). 🎟️ENTRADAS ANTICIPADAS🎟️`,
        timestamp: '2026-10-09T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'Sala Infinity');
      expect(res.classification).toBe('REQUIERE_REVISION');
    });

    test('Clasifica como NO_RELEVANTE una felicitación festiva sin agenda', () => {
      const mockPost: ApifyInstagramRawPost = {
        shortCode: 'DTBuhh7iKoX',
        caption: `!Feliz Año! Por muchos más momentos juntos Portaleando💚`,
        timestamp: '2026-01-02T10:00:00Z',
      };
      const res = classifyBarPost(mockPost, 'El Portal');
      expect(res.classification).toBe('NO_RELEVANTE');
    });
  });

  describe('3. Normalización Editorial de Propuestas', () => {
    const { normalizeBarProposals } = require('./normalize-proposals');

    test('Archiva como PAST_EVENT propuestas con fecha anterior a hoy', () => {
      const proposals = [
        {
          provisionalTitle: 'Tardón de San Valentín',
          proposedDate: '2026-02-14',
          proposedTime: null,
          proposedVenueId: 10040,
          proposedVenueName: 'El Portal',
          proposedVenueSlug: 'portal-cafe-copas',
          provisionalCategory: 'musica_directo',
          price: null,
          sourceUrl: 'https://instagram.com/p/test1/',
          sourceType: 'instagram',
          imageUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/test1.jpg',
          r2Key: 'bars/portal-cafe-copas/test1.jpg',
          instagramImageSourceUrl: 'https://instagram.com/test1.jpg',
          dedupeKey: 'portal1986#2026-02-14#sin-hora#tardon',
          confidence: 'MEDIA',
          classification: 'EVENTO_POSIBLE',
          requiresManualReview: true,
          reviewStatus: 'pending',
          caption: 'San Valentin',
          postPublishedAt: '2026-02-12',
          signals: ['Fecha'],
          classificationReason: 'Señales detectadas',
        },
      ];

      const res = normalizeBarProposals(proposals, '2026-10-24');
      expect(res[0].classification).toBe('PAST_EVENT');
      expect(res[0].reviewStatus).toBe('archived');
      expect(res[0].requiresManualReview).toBe(false);
      expect(res[0].statusReason).toContain('Fecha pasada');
      expect(res[0].proposedVenueId).toBe(10040);
      expect(res[0].imageUrl).toBe('https://media.vayaplan.com/bars/portal-cafe-copas/test1.jpg');
    });

    test('Mantiene como EVENTO_POSIBLE propuestas con fecha de hoy o futura', () => {
      const proposals = [
        {
          provisionalTitle: 'Tardeo Basket',
          proposedDate: '2026-10-24',
          proposedTime: '18:00',
          proposedVenueId: 10040,
          proposedVenueName: 'El Portal',
          proposedVenueSlug: 'portal-cafe-copas',
          provisionalCategory: 'dj_tardeo',
          price: null,
          sourceUrl: 'https://instagram.com/p/test2/',
          sourceType: 'instagram',
          imageUrl: 'https://media.vayaplan.com/bars/portal-cafe-copas/test2.jpg',
          r2Key: 'bars/portal-cafe-copas/test2.jpg',
          instagramImageSourceUrl: 'https://instagram.com/test2.jpg',
          dedupeKey: 'portal1986#2026-10-24#1800#tardeo',
          confidence: 'ALTA',
          classification: 'EVENTO_POSIBLE',
          requiresManualReview: true,
          reviewStatus: 'pending',
          caption: 'Tardeo Basket hoy',
          postPublishedAt: '2026-10-19',
          signals: ['Fecha'],
          classificationReason: 'Señales detectadas',
        },
        {
          provisionalTitle: 'Halloween Genetic',
          proposedDate: '2026-10-31',
          proposedTime: null,
          proposedVenueId: 10052,
          proposedVenueName: 'Sala Infinity',
          proposedVenueSlug: 'sala-infinity',
          provisionalCategory: 'dj_tardeo',
          price: null,
          sourceUrl: 'https://instagram.com/p/test3/',
          sourceType: 'instagram',
          imageUrl: 'https://media.vayaplan.com/bars/sala-infinity/test3.jpg',
          r2Key: 'bars/sala-infinity/test3.jpg',
          instagramImageSourceUrl: 'https://instagram.com/test3.jpg',
          dedupeKey: 'sala.infinity#2026-10-31#sin-hora#halloween',
          confidence: 'MEDIA',
          classification: 'EVENTO_POSIBLE',
          requiresManualReview: true,
          reviewStatus: 'pending',
          caption: 'Halloween futuro',
          postPublishedAt: '2026-09-22',
          signals: ['Fecha'],
          classificationReason: 'Señales detectadas',
        },
      ];

      const res = normalizeBarProposals(proposals, '2026-10-24');

      // Propuesta de hoy
      expect(res[0].classification).toBe('EVENTO_POSIBLE');
      expect(res[0].reviewStatus).toBe('pending');
      expect(res[0].requiresManualReview).toBe(true);
      expect(res[0].proposedTime).toBe('18:00');

      // Propuesta futura sin hora confirmada -> EVENTO_POSIBLE_SIN_HORA
      expect(res[1].classification).toBe('EVENTO_POSIBLE_SIN_HORA');
      expect(res[1].reviewStatus).toBe('pending');
      expect(res[1].requiresManualReview).toBe(true);
      expect(res[1].proposedTime).toBeNull();
    });

    test('Clasifica como REQUIERE_REVISION si no hay fecha fiable', () => {
      const proposals = [
        {
          provisionalTitle: 'Sesión sin fecha',
          proposedDate: null,
          proposedTime: null,
          proposedVenueId: 1,
          proposedVenueName: 'Bar Universonoro',
          proposedVenueSlug: 'universonoro',
          provisionalCategory: 'dj_tardeo',
          price: null,
          sourceUrl: 'https://instagram.com/p/test4/',
          sourceType: 'instagram',
          imageUrl: 'https://media.vayaplan.com/bars/universonoro/test4.jpg',
          r2Key: 'bars/universonoro/test4.jpg',
          instagramImageSourceUrl: 'https://instagram.com/test4.jpg',
          dedupeKey: 'universonoro#sin-fecha#sin-hora#sesion',
          confidence: 'BAJA',
          classification: 'EVENTO_POSIBLE',
          requiresManualReview: true,
          reviewStatus: 'pending',
          caption: 'Sin fecha',
          postPublishedAt: '2026-10-20',
          signals: [],
          classificationReason: 'Sin fecha',
        },
      ];

      const res = normalizeBarProposals(proposals, '2026-10-24');
      expect(res[0].classification).toBe('REQUIERE_REVISION');
      expect(res[0].reviewStatus).toBe('pending');
      expect(res[0].requiresManualReview).toBe(true);
      expect(res[0].statusReason).toContain('Sin fecha fiable');
    });
  });
});
