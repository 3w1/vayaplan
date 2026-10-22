import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  normalizeName,
  normalizeAddress,
  calculateTokenSimilarity,
  evaluateCandidate,
  validateCoordinates,
  deduplicateCatalog,
  matchCatalogWithOfficialVenues,
  exportCatalogToCsv,
  exportMatchesToCsv,
  type NormalizedVenue,
  type VenueInput,
  type MatchResult
} from '../apify-google-maps-extract';

describe('scripts — apify-google-maps-extract (catálogo persistente y cruce)', () => {
  describe('Extracción y Validación de Coordenadas', () => {
    test('valida coordenadas correctas dentro del área de Palencia', () => {
      const valid = validateCoordinates(42.0129396, -4.5213846);
      expect(valid.latitude).toBe(42.0129396);
      expect(valid.longitude).toBe(-4.5213846);
    });

    test('acepta coordenadas pasadas como strings numéricos válidos', () => {
      const valid = validateCoordinates('42.0050', '-4.5300');
      expect(valid.latitude).toBe(42.005);
      expect(valid.longitude).toBe(-4.53);
    });

    test('descarta coordenadas fuera del rango geográfico razonable de Palencia', () => {
      // Madrid: lat ~40.4, lng ~-3.7
      const madrid = validateCoordinates(40.4168, -3.7038);
      expect(madrid.latitude).toBeNull();
      expect(madrid.longitude).toBeNull();

      // Barcelona: lat ~41.38, lng ~2.17
      const bcn = validateCoordinates(41.3851, 2.1734);
      expect(bcn.latitude).toBeNull();
      expect(bcn.longitude).toBeNull();
    });

    test('maneja valores nulos, indefinidos, vacíos o no numéricos retornando null', () => {
      expect(validateCoordinates(null, null)).toEqual({ latitude: null, longitude: null });
      expect(validateCoordinates(undefined, -4.52)).toEqual({ latitude: null, longitude: null });
      expect(validateCoordinates('invalido', -4.52)).toEqual({ latitude: null, longitude: null });
    });
  });

  describe('Normalización de Nombres y Direcciones', () => {
    test('normalizeName elimina acentos, puntuación y stopwords comunes', () => {
      expect(normalizeName('Restaurante San Remo')).toBe('san remo');
      expect(normalizeName('Bar Adrián')).toBe('adrian');
      expect(normalizeName('El Chaval de Lorenzo')).toBe('chaval lorenzo');
      expect(normalizeName('Asador La Piedra')).toBe('piedra');
      expect(normalizeName('Restaurante Casero by Caway')).toBe('casero caway');
    });

    test('normalizeAddress estandariza tipos de vía y elimina puntuación', () => {
      expect(normalizeAddress('Avda. Brasilia, 2')).toBe('avda brasilia 2');
      expect(normalizeAddress('C/ La Cestilla, 5')).toBe('calle cestilla 5');
      expect(normalizeAddress('Pº del Salón, 3')).toBe('paseo salon 3');
      expect(normalizeAddress('Plaza Mayor Principal, 14')).toBe('plaza mayor principal 14');
    });

    test('calculateTokenSimilarity calcula solapamiento de tokens', () => {
      expect(calculateTokenSimilarity('san remo', 'san remo')).toBe(1);
      expect(calculateTokenSimilarity('san remo', 'san remo restaurante')).toBeGreaterThanOrEqual(0.65);
      expect(calculateTokenSimilarity('adrian', 'totalmente distinto')).toBe(0);
    });
  });

  describe('Deduplicación del Catálogo por Place ID', () => {
    const rawItemsMock = [
      {
        placeId: 'ChIJnbYTS0uwRw0R-GQDLrWaj4E',
        title: 'Restaurante San Remo',
        address: 'Av. Brasilia, 2, Palencia',
        location: { lat: 42.0129, lng: -4.5213 },
        phone: '+34 979 71 21 63',
        query: 'restaurantes en Palencia'
      },
      {
        placeId: 'ChIJnbYTS0uwRw0R-GQDLrWaj4E', // Mismo place_id en otra búsqueda
        title: 'Restaurante San Remo',
        address: 'Av. Brasilia, 2, Palencia',
        location: { lat: 42.0129, lng: -4.5213 },
        website: 'https://sanremopalencia.com',
        query: 'asadores en Palencia'
      },
      {
        placeId: 'ChIJ_abc1234567890',
        title: 'Bar Pepe',
        address: 'Calle Mayor, 10, Palencia',
        location: { lat: 42.008, lng: -4.53 },
        query: 'bares en Palencia'
      }
    ];

    test('unifica locales con el mismo Place ID en un único registro canónico', () => {
      const catalog = deduplicateCatalog(rawItemsMock, 'restaurantes en Palencia', 'run123', '2026-10-22T16:00:00Z');
      expect(catalog.length).toBe(2);

      const sanRemo = catalog.find(v => v.place_id === 'ChIJnbYTS0uwRw0R-GQDLrWaj4E');
      expect(sanRemo).toBeDefined();
      expect(sanRemo!.google_maps_name).toBe('Restaurante San Remo');
    });

    test('fusiona y preserva la lista de búsquedas en found_in_queries', () => {
      const catalog = deduplicateCatalog(rawItemsMock, 'restaurantes en Palencia', 'run123', '2026-10-22T16:00:00Z');
      const sanRemo = catalog.find(v => v.place_id === 'ChIJnbYTS0uwRw0R-GQDLrWaj4E')!;

      expect(sanRemo.found_in_queries).toContain('restaurantes en Palencia');
      expect(sanRemo.found_in_queries).toContain('asadores en Palencia');
      expect(sanRemo.found_in_queries.length).toBe(2);
    });

    test('conserva el registro más completo combinando datos disponibles', () => {
      const catalog = deduplicateCatalog(rawItemsMock, 'restaurantes en Palencia', 'run123', '2026-10-22T16:00:00Z');
      const sanRemo = catalog.find(v => v.place_id === 'ChIJnbYTS0uwRw0R-GQDLrWaj4E')!;

      // Debe contener tanto teléfono como web
      expect(sanRemo.phone).toBe('+34 979 71 21 63');
      expect(sanRemo.website).toBe('https://sanremopalencia.com');
    });
  });

  describe('Lógica de Cruce y Clasificación de Estados', () => {
    const catalogMock: NormalizedVenue[] = [
      {
        place_id: 'ChIJ_san_remo',
        google_maps_name: 'Restaurante San Remo',
        google_maps_address: 'Av. Brasilia, 2, LOCAL, 34004 Palencia',
        latitude: 42.0129,
        longitude: -4.5213,
        google_maps_url: 'https://maps.google.com/?cid=1',
        phone: '+34 979 71 21 63',
        website: 'https://sanremo.com',
        category: 'Restaurante',
        rating: 4.5,
        reviews_count: 250,
        found_in_queries: ['restaurantes en Palencia'],
        extraction_run_id: 'run123',
        extraction_date: '2026-10-22T16:00:00Z',
        raw_result: {}
      },
      {
        place_id: 'ChIJ_la_cestilla_dudoso',
        google_maps_name: 'Bar La Cestilla',
        google_maps_address: 'Calle Mayor Principal, 80, Palencia', // Mismo nombre pero dirección lejana
        latitude: 42.01,
        longitude: -4.53,
        google_maps_url: 'https://maps.google.com/?cid=2',
        phone: null,
        website: null,
        category: 'Bar',
        rating: 4.0,
        reviews_count: 50,
        found_in_queries: ['bares en Palencia'],
        extraction_run_id: 'run123',
        extraction_date: '2026-10-22T16:00:00Z',
        raw_result: {}
      }
    ];

    test('clasifica como MATCHED cuando nombre y dirección tienen alta coincidencia (score >= 0.80)', () => {
      const official: VenueInput = {
        source: 'ayuntamiento_palencia_2025',
        official_name: 'Restaurante San Remo',
        official_address: 'Avda. Brasilia, 2',
        city: 'Palencia'
      };

      const matches = matchCatalogWithOfficialVenues(catalogMock, [official]);
      expect(matches.length).toBe(1);
      expect(matches[0].match_status).toBe('MATCHED');
      expect(matches[0].match_score).toBeGreaterThanOrEqual(0.80);
      expect(matches[0].matched_place_id).toBe('ChIJ_san_remo');
      expect(matches[0].latitude).toBe(42.0129);
      expect(matches[0].longitude).toBe(-4.5213);
    });

    test('clasifica como NEEDS_MANUAL_REVIEW cuando hay discrepancia parcial o falta de número', () => {
      const officialDudoso: VenueInput = {
        source: 'ayuntamiento_palencia_2025',
        official_name: 'Bar La Cestilla',
        official_address: 'Calle La Cestilla, 5', // Dirección diferente a la del catálogo
        city: 'Palencia'
      };

      const matches = matchCatalogWithOfficialVenues(catalogMock, [officialDudoso]);
      expect(matches.length).toBe(1);
      expect(matches[0].match_status).toBe('NEEDS_MANUAL_REVIEW');
      expect(matches[0].match_score).toBeGreaterThanOrEqual(0.50);
      expect(matches[0].match_score).toBeLessThan(0.80);
    });

    test('clasifica como NOT_FOUND cuando no existe candidato razonable en el catálogo', () => {
      const officialInexistente: VenueInput = {
        source: 'ayuntamiento_palencia_2025',
        official_name: 'Restaurante Inexistente Total',
        official_address: 'Camino Desconocido, 99',
        city: 'Palencia'
      };

      const matches = matchCatalogWithOfficialVenues(catalogMock, [officialInexistente]);
      expect(matches.length).toBe(1);
      expect(matches[0].match_status).toBe('NOT_FOUND');
      expect(matches[0].match_score).toBe(0);
      expect(matches[0].matched_place_id).toBeNull();
      expect(matches[0].google_maps_name).toBeNull();
    });
  });

  describe('Exportación a CSV de Catálogo y Matches', () => {
    test('exportCatalogToCsv genera cabeceras correctas y escapa arrays y comas', () => {
      const catalogMock: NormalizedVenue = {
        place_id: 'ChIJ1',
        google_maps_name: 'Bar "El Pucherito", Palencia',
        google_maps_address: 'Plaza Mayor, 1',
        latitude: 42.01,
        longitude: -4.52,
        google_maps_url: 'https://maps.google.com/?cid=1',
        phone: '+34 979 00 00 00',
        website: 'https://elpucherito.es',
        category: 'Bar',
        rating: 4.5,
        reviews_count: 120,
        found_in_queries: ['bares en Palencia', 'restaurantes en Palencia'],
        extraction_run_id: 'run123',
        extraction_date: '2026-10-22T16:00:00Z',
        raw_result: {}
      };

      const csv = exportCatalogToCsv([catalogMock]);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('place_id,google_maps_name,google_maps_address');
      expect(lines[1]).toContain('"Bar ""El Pucherito"", Palencia"');
      expect(lines[1]).toContain('bares en Palencia; restaurantes en Palencia');
    });

    test('exportMatchesToCsv formatea correctamente el resultado del cruce', () => {
      const matchMock: MatchResult = {
        official_name: 'Restaurante San Remo',
        official_address: 'Avda. Brasilia, 2',
        match_status: 'MATCHED',
        match_score: 0.95,
        matched_place_id: 'ChIJnbYTS0uwRw0R-GQDLrWaj4E',
        google_maps_name: 'Restaurante San Remo',
        google_maps_address: 'Av. Brasilia, 2, Palencia',
        latitude: 42.0129,
        longitude: -4.5213,
        google_maps_url: 'https://maps.google.com/?cid=1',
        phone: '+34 979 71 21 63',
        website: 'https://sanremopalencia.com',
        category: 'Restaurante',
        rating: 4.2,
        reviews_count: 350,
        found_in_queries: ['restaurantes en Palencia'],
        extraction_run_id: 'run123',
        extraction_date: '2026-10-22T16:00:00Z',
        raw_result: null
      };

      const csv = exportMatchesToCsv([matchMock]);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('official_name,official_address,match_status,match_score');
      expect(lines[1]).toContain('Restaurante San Remo');
      expect(lines[1]).toContain('MATCHED');
      expect(lines[1]).toContain('ChIJnbYTS0uwRw0R-GQDLrWaj4E');
    });
  });

  describe('Estructura y Persistencia en Directorios Versionables', () => {
    test('crea la estructura raw, normalized y matches en el directorio destino', () => {
      const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'palencia-hospitality-test-'));
      const rawDir = path.join(tmpBase, 'raw');
      const normalizedDir = path.join(tmpBase, 'normalized');
      const matchesDir = path.join(tmpBase, 'matches');

      fs.mkdirSync(rawDir, { recursive: true });
      fs.mkdirSync(normalizedDir, { recursive: true });
      fs.mkdirSync(matchesDir, { recursive: true });

      fs.writeFileSync(path.join(rawDir, 'apify-raw-results-20261022.json'), JSON.stringify({ ok: true }));
      fs.writeFileSync(path.join(normalizedDir, 'palencia-hospitality-catalog.json'), JSON.stringify([]));
      fs.writeFileSync(path.join(matchesDir, 'pucherito-2025-match-results.json'), JSON.stringify([]));

      expect(fs.existsSync(path.join(rawDir, 'apify-raw-results-20261022.json'))).toBe(true);
      expect(fs.existsSync(path.join(normalizedDir, 'palencia-hospitality-catalog.json'))).toBe(true);
      expect(fs.existsSync(path.join(matchesDir, 'pucherito-2025-match-results.json'))).toBe(true);

      fs.rmSync(tmpBase, { recursive: true, force: true });
    });
  });
});
