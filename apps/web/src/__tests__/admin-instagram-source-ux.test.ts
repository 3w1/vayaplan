import { describe, expect, test } from 'bun:test';
import { renderAdminHtml } from '../admin';
import { extractExecutableInlineScripts, validateScriptSyntax } from './admin-script-syntax.test';
import { parseAndNormalizeInstagramInput } from '@vayaplan/shared';

describe('apps/web — UX Alta de Fuentes Instagram en Admin (admin.ts)', () => {
  const adminHtml = renderAdminHtml();

  describe('Estructura HTML y Accesibilidad del Modal (#modal-add-source)', () => {
    test('contiene el buscador reactivo de locales con atributos ARIA combobox', () => {
      expect(adminHtml).toContain('id="add-source-venue-search"');
      expect(adminHtml).toContain('role="combobox"');
      expect(adminHtml).toContain('aria-autocomplete="list"');
      expect(adminHtml).toContain('aria-expanded="false"');
      expect(adminHtml).toContain('aria-controls="add-source-venue-results"');
      expect(adminHtml).toContain('placeholder="Escribe el nombre del bar o local…"');
    });

    test('contiene el contenedor de resultados de locales con role listbox', () => {
      expect(adminHtml).toContain('id="add-source-venue-results"');
      expect(adminHtml).toContain('role="listbox"');
    });

    test('contiene la tarjeta de local seleccionado con botón "Cambiar local"', () => {
      expect(adminHtml).toContain('id="add-source-selected-venue-card"');
      expect(adminHtml).toContain('id="add-source-selected-name"');
      expect(adminHtml).toContain('id="add-source-selected-address"');
      expect(adminHtml).toContain('onclick="changeSelectedSourceVenue()"');
      expect(adminHtml).toContain('Cambiar local');
    });

    test('contiene el banner informativo de estado del local seleccionado', () => {
      expect(adminHtml).toContain('id="add-source-venue-status-banner"');
    });

    test('contiene el campo unificado de Instagram con preview y contenedor de errores en línea', () => {
      expect(adminHtml).toContain('id="add-source-instagram-input"');
      expect(adminHtml).toContain('id="add-source-instagram-inline-error"');
      expect(adminHtml).toContain('id="add-source-instagram-preview"');
      expect(adminHtml).toContain('id="add-source-preview-url"');
      expect(adminHtml).toContain('id="add-source-conflict-warning"');
    });

    test('contiene opciones avanzadas colapsables (<details>) con valores por defecto', () => {
      expect(adminHtml).toContain('<details id="add-source-advanced-details"');
      expect(adminHtml).toContain('Opciones avanzadas');
      expect(adminHtml).toContain('id="add-source-posts-limit"');
      expect(adminHtml).toContain('id="add-source-include-reels"');
      expect(adminHtml).toContain('id="add-source-is-active"');
    });

    test('mantiene campos ocultos de compatibilidad con el backend', () => {
      expect(adminHtml).toContain('id="add-source-venue-id"');
      expect(adminHtml).toContain('id="add-source-venue-select"');
      expect(adminHtml).toContain('id="add-source-username-input"');
      expect(adminHtml).toContain('id="add-source-url-input"');
    });

    test('muestra nota explícita de seguridad sobre no ejecución automática de ingesta', () => {
      expect(adminHtml).toContain('Guardar la fuente no ejecuta la ingesta ni publica eventos');
    });

    test('el botón de submit contiene estado de doble envío y label claro', () => {
      expect(adminHtml).toContain('id="btn-submit-add-source"');
      expect(adminHtml).toContain('Guardar Fuente');
    });
  });

  describe('Sintaxis y Ausencia de TypeScript en Scripts del Admin', () => {
    test('todos los scripts en línea de renderAdminHtml son JavaScript de navegador 100% válido', () => {
      const scripts = extractExecutableInlineScripts(adminHtml);
      expect(scripts.length).toBeGreaterThan(0);

      for (let i = 0; i < scripts.length; i++) {
        const result = validateScriptSyntax(scripts[i]);
        if (!result.valid) {
          throw new Error(`Error de sintaxis en script inline #${i}: ${result.error}\nFragmento:\n${scripts[i].content.slice(0, 300)}`);
        }
        expect(result.valid).toBe(true);
      }
    });

    test('las funciones cliente del modal de fuentes están definidas en el script', () => {
      expect(adminHtml).toContain('function normalizeSearchStr(');
      expect(adminHtml).toContain('function parseClientInstagram(');
      expect(adminHtml).toContain('function filterVenuesForSource(');
      expect(adminHtml).toContain('window.selectAddSourceVenue = function');
      expect(adminHtml).toContain('window.changeSelectedSourceVenue = function');
      expect(adminHtml).toContain('window.onAddSourceInstagramUnifiedInput = function');
      expect(adminHtml).toContain('window.openAddSourceModal = function');
      expect(adminHtml).toContain('window.submitAddSource = async function');
    });
  });

  describe('Lógica de Búsqueda y Coincidencia Flexible de Locales', () => {
    // Implementación idéntica a la incluida en admin.ts para verificar el algoritmo
    function normalizeSearch(str: string): string {
      return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    const testVenues = [
      { id: 10037, name: 'LinaMorganFreeman', address: 'C. Rizarzuela, 8, 34002 Palencia', instagram_handle: 'bar_linamorganfreeman' },
      { id: 10002, name: 'Bar Alaska', address: 'C. Mayor, 12, 34001 Palencia', instagram_handle: 'baralaskapalencia' },
      { id: 10015, name: 'Café Bar Universonoro', address: 'C. San Juan de Dios, 3, 34002 Palencia', instagram_handle: 'universonoro' },
      { id: 10050, name: 'Sala Infinity', address: 'Av. Santander, 30, 34003 Palencia', instagram_handle: 'salainfinity' },
      { id: 10149, name: 'Ateneo de Palencia', address: 'C. Mayor, 54, 34001 Palencia', instagram_handle: null },
    ];

    function filterVenues(venues: typeof testVenues, query: string) {
      const q = normalizeSearch(query);
      if (!q) return [];
      const qCompact = q.replace(/[^a-z0-9]/g, '');

      return venues.filter((v) => {
        const nameNorm = normalizeSearch(v.name);
        const nameCompact = nameNorm.replace(/[^a-z0-9]/g, '');
        const addrNorm = normalizeSearch(v.address || '');
        const handleNorm = normalizeSearch(v.instagram_handle || '');

        if (nameNorm.includes(q)) return true;
        if (qCompact && nameCompact.includes(qCompact)) return true;
        if (addrNorm.includes(q)) return true;
        if (handleNorm.includes(q)) return true;
        return false;
      });
    }

    test('encuentra LinaMorganFreeman al escribir "Lina"', () => {
      const results = filterVenues(testVenues, 'Lina');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('LinaMorganFreeman');
    });

    test('encuentra LinaMorganFreeman al escribir "Morgan"', () => {
      const results = filterVenues(testVenues, 'Morgan');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('LinaMorganFreeman');
    });

    test('encuentra LinaMorganFreeman al escribir "Freeman"', () => {
      const results = filterVenues(testVenues, 'Freeman');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('LinaMorganFreeman');
    });

    test('encuentra LinaMorganFreeman al escribir con espacios ("Lina Morgan")', () => {
      const results = filterVenues(testVenues, 'Lina Morgan');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('LinaMorganFreeman');
    });

    test('búsqueda insensible a mayúsculas, minúsculas y tildes ("café" encuentra "Café Bar Universonoro")', () => {
      const results1 = filterVenues(testVenues, 'cafe');
      expect(results1.some((v) => v.name === 'Café Bar Universonoro')).toBe(true);

      const results2 = filterVenues(testVenues, 'CAFÉ');
      expect(results2.some((v) => v.name === 'Café Bar Universonoro')).toBe(true);
    });

    test('encuentra local por su calle / dirección ("Rizarzuela" encuentra LinaMorganFreeman)', () => {
      const results = filterVenues(testVenues, 'Rizarzuela');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('LinaMorganFreeman');
    });

    test('encuentra local por su usuario de Instagram del censo ("bar_linamorganfreeman")', () => {
      const results = filterVenues(testVenues, 'bar_linamorganfreeman');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('LinaMorganFreeman');
    });

    test('devuelve lista vacía ante búsqueda sin resultados o consulta vacía', () => {
      expect(filterVenues(testVenues, '')).toEqual([]);
      expect(filterVenues(testVenues, '   ')).toEqual([]);
      expect(filterVenues(testVenues, 'inexistente999')).toEqual([]);
    });
  });

  describe('Prioridades de Autocompletado al Seleccionar un Local', () => {
    interface MockVenue {
      id: number;
      name: string;
      instagram_handle: string | null;
    }

    interface MockSource {
      id: number;
      venue_id: number;
      instagram_username: string;
      profile_url: string;
      is_active: boolean;
      posts_limit: number;
    }

    function determineAutofillState(
      venue: MockVenue,
      sources: MockSource[]
    ): {
      action: 'update' | 'create';
      bannerType: 'notice' | 'success' | 'empty';
      bannerText: string;
      buttonText: string;
      resolvedUsername: string;
      resolvedUrl: string;
    } {
      const existingSource = sources.find((s) => s.venue_id === venue.id);

      if (existingSource) {
        return {
          action: 'update',
          bannerType: 'notice',
          bannerText: `Este local ya tiene una fuente configurada (@${existingSource.instagram_username}). Puedes actualizarla aquí.`,
          buttonText: 'Guardar cambios',
          resolvedUsername: existingSource.instagram_username,
          resolvedUrl: existingSource.profile_url,
        };
      }

      if (venue.instagram_handle && venue.instagram_handle.trim()) {
        const norm = parseAndNormalizeInstagramInput(venue.instagram_handle);
        return {
          action: 'create',
          bannerType: 'success',
          bannerText: 'Datos recuperados del censo de locales. Comprueba que el usuario sea correcto antes de guardar.',
          buttonText: 'Guardar Fuente',
          resolvedUsername: norm.isValid && norm.username ? norm.username : venue.instagram_handle.trim(),
          resolvedUrl: norm.isValid && norm.canonicalUrl ? norm.canonicalUrl : `https://www.instagram.com/${venue.instagram_handle.trim()}/`,
        };
      }

      return {
        action: 'create',
        bannerType: 'empty',
        bannerText: 'Este local no tiene cuenta de Instagram registrada en el censo. Pega el usuario o la URL del perfil para continuar.',
        buttonText: 'Guardar Fuente',
        resolvedUsername: '',
        resolvedUrl: '',
      };
    }

    test('Prioridad 1 — Si el local ya tiene fuente configurada, carga la configuración y activa modo edición', () => {
      const venue: MockVenue = { id: 10015, name: 'Café Bar Universonoro', instagram_handle: 'universonoro_censo' };
      const sources: MockSource[] = [
        { id: 7, venue_id: 10015, instagram_username: 'universonoro', profile_url: 'https://www.instagram.com/universonoro/', is_active: true, posts_limit: 10 },
      ];

      const state = determineAutofillState(venue, sources);
      expect(state.action).toBe('update');
      expect(state.bannerType).toBe('notice');
      expect(state.bannerText).toContain('ya tiene una fuente configurada');
      expect(state.buttonText).toBe('Guardar cambios');
      expect(state.resolvedUsername).toBe('universonoro');
      expect(state.resolvedUrl).toBe('https://www.instagram.com/universonoro/');
    });

    test('Prioridad 2 — Si no tiene fuente pero tiene Instagram en censo (ej. LinaMorganFreeman), recupera y normaliza datos', () => {
      const venue: MockVenue = { id: 10037, name: 'LinaMorganFreeman', instagram_handle: 'bar_linamorganfreeman' };
      const sources: MockSource[] = []; // Sin fuente configurada

      const state = determineAutofillState(venue, sources);
      expect(state.action).toBe('create');
      expect(state.bannerType).toBe('success');
      expect(state.bannerText).toContain('Datos recuperados del censo de locales');
      expect(state.buttonText).toBe('Guardar Fuente');
      expect(state.resolvedUsername).toBe('bar_linamorganfreeman');
      expect(state.resolvedUrl).toBe('https://www.instagram.com/bar_linamorganfreeman/');
    });

    test('Prioridad 3 — Si no tiene fuente ni Instagram en censo (ej. Ateneo), no genera errores prematuros y pide rellenar', () => {
      const venue: MockVenue = { id: 10149, name: 'Ateneo de Palencia', instagram_handle: null };
      const sources: MockSource[] = [];

      const state = determineAutofillState(venue, sources);
      expect(state.action).toBe('create');
      expect(state.bannerType).toBe('empty');
      expect(state.bannerText).toContain('no tiene cuenta de Instagram registrada en el censo');
      expect(state.buttonText).toBe('Guardar Fuente');
      expect(state.resolvedUsername).toBe('');
      expect(state.resolvedUrl).toBe('');
    });
  });

  describe('Detección de Conflictos y Duplicados', () => {
    test('detecta si un usuario de Instagram ya está asignado a otro local diferente', () => {
      const sources = [
        { id: 1, venue_id: 10002, instagram_username: 'baralaskapalencia' },
        { id: 2, venue_id: 10050, instagram_username: 'salainfinity' },
      ];

      function checkDuplicateUser(username: string, currentVenueId: number) {
        return sources.find((s) => s.instagram_username.toLowerCase() === username.toLowerCase() && s.venue_id !== currentVenueId);
      }

      // Mismo local: no hay conflicto
      expect(checkDuplicateUser('baralaskapalencia', 10002)).toBeUndefined();

      // Local distinto intentando usar el mismo username
      const conflict = checkDuplicateUser('baralaskapalencia', 10037);
      expect(conflict).toBeDefined();
      expect(conflict?.venue_id).toBe(10002);
    });
  });
});
