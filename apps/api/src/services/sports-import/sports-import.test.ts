import { describe, expect, test } from 'bun:test';
import { normalizeSportsEvent, matchSportsVenue } from './sports-normalizer';
import { SportsDeduplicator } from './sports-deduplicator';
import { SportsChangeDetector } from './sports-change-detector';
import { SportsImporter } from './sports-importer';
import type { RawSportsEvent } from './sports-types';

describe('Servicio de Importación Deportiva de Palencia (sports-import)', () => {
  const mockExistingVenues = [
    { id: 1, name: 'Bar Universonoro', slug: 'bar-universonoro' },
    { id: 2, name: 'Teatro Principal de Palencia', slug: 'teatro-principal' },
    { id: 10127, name: 'Biblioteca Pública de Palencia', slug: 'biblioteca-publica-de-palencia' },
  ];

  describe('1. Cruce y Clasificación de Venues Deportivos', () => {
    test('Identifica Pabellón Municipal como VENUE_NUEVO_PROPUESTO con dirección oficial', () => {
      const match = matchSportsVenue('Pabellón Municipal de Deportes de Palencia', mockExistingVenues);
      expect(match.venueClassification).toBe('VENUE_NUEVO_PROPUESTO');
      expect(match.venueName).toBe('Pabellón Municipal de Deportes de Palencia');
      expect(match.venueAddress).toBe('Avenida del Obispo Barberá, s/n, 34005 Palencia');
      expect(match.matchedVenueId).toBeNull();
    });

    test('Identifica Nueva Balastera como VENUE_NUEVO_PROPUESTO para fútbol', () => {
      const match = matchSportsVenue('Estadio Nueva Balastera', mockExistingVenues);
      expect(match.venueClassification).toBe('VENUE_NUEVO_PROPUESTO');
      expect(match.venueName).toBe('Estadio Municipal Nueva Balastera');
      expect(match.venueAddress).toBe('Calle Lola de la Fuente, s/n, 34004 Palencia');
    });

    test('Asocia rugby en Balastera con el Estadio Municipal Nueva Balastera', () => {
      const match = matchSportsVenue('Campos de Rugby Balastera', mockExistingVenues);
      expect(match.venueClassification).toBe('VENUE_NUEVO_PROPUESTO');
      expect(match.venueName).toBe('Estadio Municipal Nueva Balastera');
    });

    test('Asocia rugby en Balastera como VENUE_EXISTENTE cuando Estadio Municipal Nueva Balastera está en el catálogo', () => {
      const venuesWithBalastera = [
        ...mockExistingVenues,
        { id: 10158, name: 'Estadio Municipal Nueva Balastera', slug: 'estadio-municipal-nueva-balastera' },
      ];
      const match = matchSportsVenue('Campos de Rugby Balastera', venuesWithBalastera);
      expect(match.venueClassification).toBe('VENUE_EXISTENTE');
      expect(match.matchedVenueId).toBe(10158);
      expect(match.venueName).toBe('Estadio Municipal Nueva Balastera');
    });

    test('Clasifica recinto ya existente en el catálogo como VENUE_EXISTENTE', () => {
      const match = matchSportsVenue('Teatro Principal de Palencia', mockExistingVenues);
      expect(match.venueClassification).toBe('VENUE_EXISTENTE');
      expect(match.matchedVenueId).toBe(2);
    });

    test('Clasifica recinto desconocido como VENUE_SIN_IDENTIFICAR', () => {
      const match = matchSportsVenue('Pista Polideportiva Desconocida San Juan', mockExistingVenues);
      expect(match.venueClassification).toBe('VENUE_SIN_IDENTIFICAR');
      expect(match.matchedVenueId).toBeNull();
    });
  });

  describe('2. Normalización de Eventos Deportivos', () => {
    test('Normaliza partido de Baloncesto Primera FEB con horario peninsular a UTC', () => {
      const rawBasket: RawSportsEvent = {
        sourceId: 'feb_primera_feb',
        externalId: '102948',
        title: 'Súper Agropal Palencia vs. Club Ourense Baloncesto',
        sport: 'baloncesto',
        competition: 'Primera FEB',
        round: 'Jornada 5',
        homeTeam: 'Súper Agropal Palencia',
        awayTeam: 'Club Ourense Baloncesto',
        rawDate: '2026-10-24',
        rawTime: '19:00',
        venueName: 'Pabellón Municipal de Palencia',
        city: 'Palencia',
        isFree: false,
        priceCents: 0,
        officialSourceUrl: 'https://palenciabaloncesto.com/partidos/jornada-5',
        status: 'confirmed',
      };

      const norm = normalizeSportsEvent(rawBasket, mockExistingVenues);
      expect(norm.category).toBe('baloncesto');
      expect(norm.editorialDate).toBe('2026-10-24');
      // 19:00 CEST (UTC+2 antes del cambio) = 17:00 UTC
      expect(norm.startTimeIso).toBe('2026-10-24T17:00:00.000Z');
      expect(norm.timeStatus).toBe('confirmed');
      expect(norm.priceLabel).toBe('Entradas en taquilla / festival');
      expect(norm.venueClassification).toBe('VENUE_NUEVO_PROPUESTO');
      expect(norm.status).toBe('draft');
    });

    test('Normaliza derbi de Fútbol con hora por confirmar a pending_time', () => {
      const rawDerbi: RawSportsEvent = {
        sourceId: 'fcylf_futbol',
        title: 'Palencia Cristo Atlético vs. Palencia CF',
        sport: 'futbol',
        competition: 'Tercera Federación Grupo VIII',
        homeTeam: 'Palencia Cristo Atlético',
        awayTeam: 'Palencia CF',
        rawDate: '2026-11-01',
        rawTime: null,
        venueName: 'Estadio Municipal Nueva Balastera',
        city: 'Palencia',
        officialSourceUrl: 'https://www.fcylf.es/competiciones',
        status: 'pending_time',
      };

      const norm = normalizeSportsEvent(rawDerbi, mockExistingVenues);
      expect(norm.category).toBe('futbol');
      expect(norm.timeStatus).toBe('pending_time');
      expect(norm.startTimeIso).toBeNull();
      expect(norm.editorialDate).toBe('2026-11-01');
      expect(norm.dedupeKey).toContain('palencia-deporte-futbol');
    });

    test('Normaliza San Silvestre Palentina como carrera popular gratuita', () => {
      const rawSanSilvestre: RawSportsEvent = {
        sourceId: 'sansilvestre_palentina',
        title: 'XLV San Silvestre Palentina 2026',
        sport: 'cultura',
        competition: 'Circuito Popular PMD',
        rawDate: '2026-12-31',
        rawTime: '18:00',
        venueName: 'Circuito Urbano San Silvestre Palentina',
        city: 'Palencia',
        isFree: true,
        priceCents: 0,
        officialSourceUrl: 'http://sansilvestrepalentina.com/',
        status: 'confirmed',
      };

      const norm = normalizeSportsEvent(rawSanSilvestre, mockExistingVenues);
      expect(norm.isFree).toBe(true);
      expect(norm.priceLabel).toBe('Entrada libre');
      expect(norm.status).toBe('draft');
    });
  });

  describe('3. Deduplicación y Detección de Cambios', () => {
    test('Ignora duplicado cuando ya existe por dedupeKey', () => {
      const existingEvents = [
        {
          id: 501,
          dedupeKey: 'palencia-deporte-feb_primera_feb-102948',
          title: 'Súper Agropal Palencia vs. Ourense',
          editorialDate: '2026-10-24',
          startTime: '2026-10-24T17:00:00.000Z',
          venueId: 999,
          status: 'tentative',
          priceCents: 0,
          isFree: false,
        },
      ];

      const deduplicator = new SportsDeduplicator(existingEvents);
      const incoming = normalizeSportsEvent(
        {
          sourceId: 'feb_primera_feb',
          externalId: '102948',
          title: 'Súper Agropal Palencia vs. Club Ourense Baloncesto',
          sport: 'baloncesto',
          rawDate: '2026-10-24',
          rawTime: '19:00',
          venueName: 'Pabellón Municipal de Palencia',
          city: 'Palencia',
          officialSourceUrl: 'https://palenciabaloncesto.com/',
          status: 'confirmed',
        },
        mockExistingVenues
      );

      const dup = deduplicator.findDuplicate(incoming);
      expect(dup).not.toBeNull();
      expect(dup?.id).toBe(501);
    });

    test('Detecta cambio de hora y fecha (reprogramación oficial)', () => {
      const detector = new SportsChangeDetector();
      const existing = {
        id: 501,
        dedupeKey: 'palencia-deporte-baloncesto-102948',
        title: 'Súper Agropal Palencia vs. Ourense',
        editorialDate: '2026-10-24',
        startTime: '2026-10-24T17:00:00.000Z', // 19:00 hora local
        venueId: 999,
        status: 'tentative',
        priceCents: 0,
        isFree: false,
      };

      const incoming = normalizeSportsEvent(
        {
          sourceId: 'feb_primera_feb',
          externalId: '102948',
          title: 'Súper Agropal Palencia vs. Ourense',
          sport: 'baloncesto',
          rawDate: '2026-10-25', // Reprogramado al domingo
          rawTime: '12:30', // Cambio a matinal
          venueName: 'Pabellón Municipal de Palencia',
          city: 'Palencia',
          officialSourceUrl: 'https://palenciabaloncesto.com/',
          status: 'confirmed',
        },
        mockExistingVenues
      );

      const changes = detector.detectChanges(existing, incoming);
      expect(changes.length).toBeGreaterThanOrEqual(2);
      expect(changes.some((c) => c.changeType === 'RESCHEDULED_DATE')).toBe(true);
      expect(changes.some((c) => c.changeType === 'RESCHEDULED_TIME')).toBe(true);
    });
  });

  describe('4. Pipeline Completo del Importador en Modo Controlado (Dry-Run)', () => {
    test('Ejecuta dry-run y genera informe detallado sin modificar base de datos', async () => {
      const importer = new SportsImporter([], mockExistingVenues);

      const rawEvents: RawSportsEvent[] = [
        {
          sourceId: 'feb_primera_feb',
          externalId: 'feb-101',
          title: 'Súper Agropal Palencia vs. Club Ourense Baloncesto',
          sport: 'baloncesto',
          competition: 'Primera FEB',
          homeTeam: 'Palencia Baloncesto',
          awayTeam: 'Club Ourense Baloncesto',
          rawDate: '2026-10-24',
          rawTime: '19:00',
          venueName: 'Pabellón Municipal de Deportes de Palencia',
          city: 'Palencia',
          officialSourceUrl: 'https://feb.es/partido/101',
          status: 'confirmed',
        },
        {
          sourceId: 'fcylf_futbol',
          externalId: 'fcylf-202',
          title: 'Palencia Cristo Atlético vs. Palencia CF',
          sport: 'futbol',
          competition: 'Tercera Federación Grupo VIII',
          homeTeam: 'Palencia Cristo Atlético',
          awayTeam: 'Palencia CF',
          rawDate: '2026-11-01',
          rawTime: '17:00',
          venueName: 'Estadio Municipal Nueva Balastera',
          city: 'Palencia',
          officialSourceUrl: 'https://fcylf.es/partido/202',
          status: 'confirmed',
        },
      ];

      const report = await importer.runImport({ dryRun: true, rawEventsOverride: rawEvents });

      expect(report.dryRun).toBe(true);
      expect(report.totalRawEventsExtracted).toBe(2);
      expect(report.newProposedEventsCount).toBe(2);
      expect(report.duplicatesIgnoredCount).toBe(0);
      expect(report.proposedEvents[0].status).toBe('draft');
      expect(report.proposedEvents[1].status).toBe('draft');
      expect(report.proposedNewVenues.length).toBe(2);
      expect(report.proposedNewVenues.some((v) => v.slug === 'pabellon-municipal-deportes-palencia')).toBe(true);
      expect(report.proposedNewVenues.some((v) => v.slug === 'estadio-municipal-nueva-balastera')).toBe(true);
      expect(report.errors.length).toBe(0);
    });
  });
});
