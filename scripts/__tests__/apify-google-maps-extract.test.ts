import { describe, expect, test } from 'bun:test';
import {
  normalizeName,
  normalizeAddress,
  calculateTokenSimilarity,
  evaluateCandidate,
  exportToCsv,
  type ExtractionResult,
  type VenueInput
} from '../apify-google-maps-extract';

describe('scripts — apify-google-maps-extract', () => {
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

  describe('Evaluación Heurística de Candidatos', () => {
    const venueSanRemo: VenueInput = {
      source: 'ayuntamiento_palencia_2025',
      official_name: 'Restaurante San Remo',
      official_address: 'Avda. Brasilia, 2',
      city: 'Palencia'
    };

    test('clasifica como MATCHED cuando nombre y dirección coinciden claramente', () => {
      const candidate = {
        title: 'Restaurante San Remo',
        address: 'Av. Brasilia, 2, 34004 Palencia',
        location: { lat: 42.01, lng: -4.53 }
      };

      const result = evaluateCandidate(venueSanRemo, candidate);
      expect(result.status).toBe('MATCHED');
      expect(result.score).toBeGreaterThanOrEqual(0.80);
    });

    test('clasifica como NEEDS_MANUAL_REVIEW cuando hay discrepancia parcial o falta de número', () => {
      const candidate = {
        title: 'Restaurante San Remo',
        address: 'Av. Brasilia, 20, 34004 Palencia', // Mismo nombre pero número diferente
        location: { lat: 42.01, lng: -4.53 }
      };

      const result = evaluateCandidate(venueSanRemo, candidate);
      expect(result.status).toBe('NEEDS_MANUAL_REVIEW');
      expect(result.score).toBeGreaterThanOrEqual(0.50);
      expect(result.score).toBeLessThan(0.80);
    });

    test('clasifica como NOT_FOUND cuando el candidato no tiene relación con el local', () => {
      const candidate = {
        title: 'Farmacia Brasilia',
        address: 'Av. Brasilia, 20, 34004 Palencia',
        location: { lat: 42.01, lng: -4.53 }
      };

      const result = evaluateCandidate(venueSanRemo, candidate);
      expect(result.status).toBe('NOT_FOUND');
      expect(result.score).toBeLessThan(0.50);
    });
  });

  describe('Exportación a CSV', () => {
    test('exportToCsv genera cabeceras correctas y escapa comas y comillas', () => {
      const mockResult: ExtractionResult = {
        source: 'ayuntamiento_palencia_2025',
        official_name: 'Bar "El Rincón", Tapas',
        official_address: 'Calle Mayor, 10',
        search_query: 'Bar "El Rincón", Tapas Calle Mayor, 10 Palencia',
        match_status: 'MATCHED',
        apify_run_id: 'run123',
        apify_place_id: 'place123',
        google_maps_name: 'El Rincón',
        google_maps_address: 'Calle Mayor, 10, Palencia',
        latitude: 42.01,
        longitude: -4.52,
        google_maps_url: 'https://maps.google.com/?q=10',
        phone: '+34 979 00 00 00',
        website: 'https://elrincon.es',
        category: 'Bar',
        rating: 4.5,
        reviews_count: 100,
        match_score: 0.95,
        error_message: null,
        raw_result: null
      };

      const csv = exportToCsv([mockResult]);
      const lines = csv.split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('official_name');
      expect(lines[0]).toContain('match_status');
      expect(lines[0]).toContain('error_message');

      // Comprueba el escape de comillas dobles y comas
      expect(lines[1]).toContain('"Bar ""El Rincón"", Tapas"');
      expect(lines[1]).toContain('"Calle Mayor, 10"');
      expect(lines[1]).toContain('MATCHED');
    });
  });
});
