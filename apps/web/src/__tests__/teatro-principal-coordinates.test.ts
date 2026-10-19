import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildDirectionsUrl,
  isValidCoordinate,
  isValidExternalMapUrl,
  extractEventActionSource,
  renderVenueDirectionsHtml,
  renderEventActionsHtml,
  type PublicEventItem,
} from '../event-actions';

describe('Pruebas Dirigidas — Coordenadas y "Cómo llegar" de Teatro Principal (venues.id = 2)', () => {
  const ROOT_DIR = resolve(__dirname, '../../../../');
  const SEED_SQL_PATH = resolve(ROOT_DIR, 'infra/seed.sql');
  const VENUES_CSV_PATH = resolve(ROOT_DIR, 'ops/palencia-venues.csv');
  const EXECUTE_SQL_PATH = resolve(ROOT_DIR, 'infra/scripts/execute_update_teatro_principal_coords.sql');
  const ROLLBACK_SQL_PATH = resolve(ROOT_DIR, 'infra/scripts/rollback_update_teatro_principal_coords.sql');

  const EXPECTED_LAT = 42.00994338;
  const EXPECTED_LON = -4.53071776;
  const EXPECTED_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=42.00994338,-4.53071776';
  const FORBIDDEN_CID = '98765432109876543210';

  describe('1. Verificación de Archivos Censales', () => {
    test('ops/palencia-venues.csv contiene las coordenadas definitivas y no tiene el CID ficticio en Teatro Principal', () => {
      const csvContent = readFileSync(VENUES_CSV_PATH, 'utf-8');
      const lines = csvContent.trim().split('\n');
      
      expect(lines.length).toBe(3); // Cabecera + Bar Universonoro + Teatro Principal
      
      const header = lines[0];
      expect(header).toBe('name,slug,address,latitude,longitude,google_maps_url,instagram_handle,whatsapp_contact,website_url');

      const teatroLine = lines.find((l) => l.includes('teatro-principal'));
      expect(teatroLine).toBeDefined();

      // Comprobar coordenadas redondeadas a 8 decimales
      expect(teatroLine).toContain('42.00994338');
      expect(teatroLine).toContain('-4.53071776');

      // Comprobar URL de búsqueda por coordenadas
      expect(teatroLine).toContain(EXPECTED_SEARCH_URL);

      // Comprobar ausencia del CID sintético
      expect(teatroLine).not.toContain(FORBIDDEN_CID);

      // Comprobar que Bar Universonoro NO ha sido modificado
      const universonoroLine = lines.find((l) => l.includes('universonoro'));
      expect(universonoroLine).toBeDefined();
      expect(universonoroLine).toContain('42.01210000,-4.53420000');
    });

    test('infra/seed.sql contiene las coordenadas definitivas y retira el CID ficticio de Teatro Principal', () => {
      const seedContent = readFileSync(SEED_SQL_PATH, 'utf-8');
      
      // Comprobar coordenadas en bloque de venue id 2
      expect(seedContent).toContain('42.00994338');
      expect(seedContent).toContain('-4.53071776');
      expect(seedContent).toContain(EXPECTED_SEARCH_URL);

      // Comprobar ausencia del CID ficticio en todo el archivo de seed
      expect(seedContent).not.toContain(FORBIDDEN_CID);

      // Comprobar que Bar Universonoro (id 1) permanece intacto
      expect(seedContent).toContain('42.01210000');
      expect(seedContent).toContain('-4.53420000');
    });
  });

  describe('2. Generación de Enlace "Cómo llegar" y Orden de Coordenadas', () => {
    test('buildDirectionsUrl genera la URL correcta con latitud primero y longitud después', () => {
      const url = buildDirectionsUrl({
        latitude: EXPECTED_LAT,
        longitude: EXPECTED_LON,
        maps_url: EXPECTED_SEARCH_URL,
        venue_name: 'Teatro Principal de Palencia',
        venue_address: 'Calle de Burgos, 3, 34001 Palencia',
        city: 'Palencia',
      });

      expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=42.00994338,-4.53071776');
      
      // Comprobar orden estricto: latitud (42.) antes que longitud (-4.)
      const latIndex = url!.indexOf('42.00994338');
      const lonIndex = url!.indexOf('-4.53071776');
      expect(latIndex).toBeGreaterThan(-1);
      expect(lonIndex).toBeGreaterThan(latIndex);
    });

    test('isValidCoordinate valida las coordenadas definitivas', () => {
      expect(isValidCoordinate(EXPECTED_LAT, EXPECTED_LON)).toBe(true);
    });

    test('isValidExternalMapUrl valida la URL de búsqueda por coordenadas en www.google.com/maps/search/', () => {
      expect(isValidExternalMapUrl(EXPECTED_SEARCH_URL)).toBe(true);
    });

    test('buildDirectionsUrl usa la URL de búsqueda si las coordenadas fueran nulas', () => {
      const url = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: EXPECTED_SEARCH_URL,
      });

      expect(url).toBe(EXPECTED_SEARCH_URL);
    });
  });

  describe('3. Recorrido Dato -> API -> Botón de Acciones', () => {
    test('extractEventActionSource y renderVenueDirectionsHtml generan el botón con destino definitivo', () => {
      const mockApiEvent: PublicEventItem = {
        id: 8,
        title: 'Festival Jazz',
        slug: 'festival-jazz',
        status: 'published',
        start_time: '2026-10-19T17:00:00.000Z',
        end_time: '2026-10-19T19:00:00.000Z',
        editorial_date: '2026-10-19',
        venue: {
          id: 2,
          name: 'Teatro Principal de Palencia',
          slug: 'teatro-principal',
          latitude: EXPECTED_LAT,
          longitude: EXPECTED_LON,
          google_maps_url: EXPECTED_SEARCH_URL,
        },
        actions: {
          maps_url: EXPECTED_SEARCH_URL,
        },
      };

      const source = extractEventActionSource(mockApiEvent);
      expect(source.latitude).toBe(EXPECTED_LAT);
      expect(source.longitude).toBe(EXPECTED_LON);
      expect(source.venue_name).toBe('Teatro Principal de Palencia');

      const directionsHtml = renderVenueDirectionsHtml(source);
      
      // El HTML debe contener el enlace de Cómo llegar apuntando a destination=42.00994338,-4.53071776
      expect(directionsHtml).toContain('href="https://www.google.com/maps/dir/?api=1&amp;destination=42.00994338,-4.53071776"');
      expect(directionsHtml).toContain('target="_blank"');
      expect(directionsHtml).toContain('rel="noopener noreferrer"');
      expect(directionsHtml).toContain('Cómo llegar ↗');

      // Comprobar además que renderEventActionsHtml (la cuadrícula 2x2 de compartir) ya no contiene "Cómo llegar"
      const actionsHtml = renderEventActionsHtml(source);
      expect(actionsHtml).not.toContain('Cómo llegar');
    });
  });

  describe('4. Validación Estructural de Scripts SQL', () => {
    test('execute_update_teatro_principal_coords.sql cumple todas las directivas defensivas', () => {
      const sql = readFileSync(EXECUTE_SQL_PATH, 'utf-8');

      expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
      expect(sql).toContain("SET LOCAL statement_timeout = '15s';");
      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('FOR UPDATE;');
      expect(sql).toContain('WHERE id = 2');
      expect(sql).toContain('42.00940000'); // Comprueba valor anterior
      expect(sql).toContain('-4.52980000'); // Comprueba valor anterior
      expect(sql).toContain(FORBIDDEN_CID); // Comprueba valor anterior
      expect(sql).toContain('42.00994338'); // Asigna valor nuevo
      expect(sql).toContain('-4.53071776'); // Asigna valor nuevo
      expect(sql).toContain(EXPECTED_SEARCH_URL);
      expect(sql).toContain('RETURNING');
      expect(sql).toContain('COMMIT;');
    });

    test('rollback_update_teatro_principal_coords.sql cumple las directivas de reversión y contiene la advertencia', () => {
      const sql = readFileSync(ROLLBACK_SQL_PATH, 'utf-8');

      expect(sql).toContain('ADVERTENCIA OPERATIVA');
      expect(sql).toContain('recuperación ante contingencias, no una solución definitiva');
      expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
      expect(sql).toContain("SET LOCAL statement_timeout = '15s';");
      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('FOR UPDATE;');
      expect(sql).toContain('42.00994338'); // Verifica presencia de corrección
      expect(sql).toContain('-4.53071776'); // Verifica presencia de corrección
      expect(sql).toContain('42.00940000'); // Restaura valor original
      expect(sql).toContain('-4.52980000'); // Restaura valor original
      expect(sql).toContain(FORBIDDEN_CID); // Restaura valor original
      expect(sql).toContain('COMMIT;');
    });
  });
});
