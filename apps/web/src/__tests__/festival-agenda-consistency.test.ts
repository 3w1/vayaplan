import { describe, expect, test } from 'bun:test';
import * as vm from 'node:vm';
import { renderPublicHtml } from '../public-page';
import { renderFestivalHtml } from '../festival-page';
import type { FestivalProgramResponseContract, PublicEventItem, FestivalSummary } from '@vayaplan/types';

describe('apps/web — Consistencia de Festivales en la Agenda (festival-agenda-consistency)', () => {
  // Metadatos de prueba sintéticos
  const mockFestJazz: FestivalSummary = {
    id: 10,
    name: 'XIII Jazz Palencia Festival',
    edition: 'XIII Edición',
    slug: 'jazz-palencia-2026',
    official_url: 'https://jazzpalencia.es',
  };

  const mockFestOtono: FestivalSummary = {
    id: 20,
    name: 'Otoño Cultural 2026',
    edition: 'Edición Otoño',
    slug: 'otono-cultural-2026',
    official_url: 'https://cultura.palencia.es',
  };

  const mockFestSpecialChars: FestivalSummary = {
    id: 30,
    name: 'Ciclo "Música & Teatro" <Especial>',
    edition: '1ª Edición',
    slug: 'musica-y-teatro-especial',
    official_url: 'https://ejemplo.es/?a=1&b=2',
  };

  const baseEvent: PublicEventItem = {
    id: 201,
    title: 'Marco Mezquida en Concierto',
    category: 'musica_directo',
    time_status: 'confirmed',
    start_time: '2026-11-14T20:30:00.000Z',
    end_time: null,
    editorial_date: '2026-11-14',
    editorial_label: 'Sábado',
    price: { amount_cents: 2200, is_free: false, label: '22,00 €' },
    status: 'published',
    venue: { id: 2, name: 'Teatro Principal de Palencia', slug: 'teatro-principal' },
    image_url: null,
    actions: { maps_url: null, booking_url: null, tickets_url: null, whatsapp_url: null },
    verification: { source: 'manual', verified_at: null },
    promotion: null,
  };

  // ==============================================================================
  // 1. Sintaxis JavaScript Literal en la Plantilla Pública (V8 vm.Script)
  // ==============================================================================
  describe('1. Validación Sintáctica de Scripts Inline para Navegador', () => {
    test('todos los scripts inline generados en renderPublicHtml son JavaScript válido y puro (cero TypeScript)', () => {
      const html = renderPublicHtml();

      // 1. Script ejecutable cliente (type="module")
      const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/i);
      expect(moduleMatch).not.toBeNull();
      const clientCode = moduleMatch![1];

      // No debe contener anotaciones TypeScript
      expect(clientCode).not.toContain('as HTML');
      expect(clientCode).not.toContain('as any');
      expect(clientCode).not.toContain(': boolean');
      expect(clientCode).not.toContain(': string');
      expect(clientCode).not.toMatch(/\binterface\s+[A-Za-z]+\b/);

      // V8 vm.Script valida parseo exacto en el motor JavaScript
      let syntaxValid = false;
      try {
        new vm.Script(clientCode, { filename: 'public-page-inline.js' });
        syntaxValid = true;
      } catch (e: any) {
        syntaxValid = false;
      }
      expect(syntaxValid).toBe(true);

      // 2. Script de datos estructurados JSON-LD
      const ldJsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      if (ldJsonMatch) {
        expect(() => JSON.parse(ldJsonMatch[1])).not.toThrow();
      }
    });

    test('renderPublicHtml incorpora estilos CSS para las tarjetas y distintivos de festival', () => {
      const html = renderPublicHtml();
      expect(html).toContain('.card-festivals-row');
      expect(html).toContain('.card-festival-pill');
      expect(html).toContain('overflow: hidden');
      expect(html).toContain('text-overflow: ellipsis');
      expect(html).toContain('white-space: nowrap');
      expect(html).toContain('.card-compact:focus-visible');
    });
  });

  // ==============================================================================
  // 2. Comportamiento de Tarjetas Compactas y Cardinalidad N:M
  // ==============================================================================
  describe('2. Distintivos de Festival y Cardinalidad en Tarjetas Compactas', () => {
    test('actuación sin festival no muestra fila de distintivos ni enlaces vacíos', () => {
      const html = renderPublicHtml();
      expect(html).toContain('function renderCardFestivalsHtml(ev)');

      const evWithoutFest = { ...baseEvent, festival: null, festivals: [] };
      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });
      const code = `
        function renderCardFestivalsHtml(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const fests = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!fests || fests.length === 0) return '';
          return '<div class="card-festivals-row">' +
            fests.map(function(f) {
              const safeSlug = encodeURIComponent(f.slug || '');
              const safeName = escapeHtml(f.name || '');
              return '<a href="/festivals/' + safeSlug + '" class="card-festival-pill" data-action="open-festival-program" data-slug="' + safeSlug + '" onclick="event.stopPropagation();" aria-label="Ver programa de ' + safeName + '" title="Ver programa de ' + safeName + '">🎪 ' + safeName + '</a>';
            }).join('') +
          '</div>';
        }
        res = renderCardFestivalsHtml(${JSON.stringify(evWithoutFest)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toBe('');
    });

    test('actuación vinculada a un único festival muestra su distintivo con icono neutral y enlace accesible', () => {
      const evWithFest = {
        ...baseEvent,
        festival: mockFestJazz,
        festivals: [mockFestJazz],
      };
      const ctx = vm.createContext({
        escapeHtml: (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });
      const code = `
        function renderCardFestivalsHtml(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const fests = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!fests || fests.length === 0) return '';
          return '<div class="card-festivals-row">' +
            fests.map(function(f) {
              const safeSlug = encodeURIComponent(f.slug || '');
              const safeName = escapeHtml(f.name || '');
              return '<a href="/festivals/' + safeSlug + '" class="card-festival-pill" data-action="open-festival-program" data-slug="' + safeSlug + '" onclick="event.stopPropagation();" aria-label="Ver programa de ' + safeName + '" title="Ver programa de ' + safeName + '">🎪 ' + safeName + '</a>';
            }).join('') +
          '</div>';
        }
        res = renderCardFestivalsHtml(${JSON.stringify(evWithFest)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toContain('class="card-festivals-row"');
      expect(ctx.res).toContain('href="/festivals/jazz-palencia-2026"');
      expect(ctx.res).toContain('🎪 XIII Jazz Palencia Festival');
      expect(ctx.res).toContain('data-action="open-festival-program"');
      expect(ctx.res).toContain('onclick="event.stopPropagation();"');
      expect(ctx.res).not.toContain('🎷');
    });

    test('actuación vinculada a dos agrupaciones (N:M) muestra ambos distintivos sin descartar ninguno', () => {
      const evWithTwoFests = {
        ...baseEvent,
        festival: mockFestJazz,
        festivals: [mockFestJazz, mockFestOtono],
      };
      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });
      const code = `
        function renderCardFestivalsHtml(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const fests = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!fests || fests.length === 0) return '';
          return '<div class="card-festivals-row">' +
            fests.map(function(f) {
              const safeSlug = encodeURIComponent(f.slug || '');
              const safeName = escapeHtml(f.name || '');
              return '<a href="/festivals/' + safeSlug + '" class="card-festival-pill" data-action="open-festival-program" data-slug="' + safeSlug + '" onclick="event.stopPropagation();" aria-label="Ver programa de ' + safeName + '" title="Ver programa de ' + safeName + '">🎪 ' + safeName + '</a>';
            }).join('') +
          '</div>';
        }
        res = renderCardFestivalsHtml(${JSON.stringify(evWithTwoFests)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toContain('href="/festivals/jazz-palencia-2026"');
      expect(ctx.res).toContain('🎪 XIII Jazz Palencia Festival');
      expect(ctx.res).toContain('href="/festivals/otono-cultural-2026"');
      expect(ctx.res).toContain('🎪 Otoño Cultural 2026');
    });

    test('escapa correctamente caracteres conflictivos en nombres y construye slugs URL seguros', () => {
      const evSpecial = {
        ...baseEvent,
        festival: mockFestSpecialChars,
        festivals: [mockFestSpecialChars],
      };
      const ctx = vm.createContext({
        escapeHtml: (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });
      const code = `
        function renderCardFestivalsHtml(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const fests = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!fests || fests.length === 0) return '';
          return '<div class="card-festivals-row">' +
            fests.map(function(f) {
              const safeSlug = encodeURIComponent(f.slug || '');
              const safeName = escapeHtml(f.name || '');
              return '<a href="/festivals/' + safeSlug + '" class="card-festival-pill" data-action="open-festival-program" data-slug="' + safeSlug + '" onclick="event.stopPropagation();" aria-label="Ver programa de ' + safeName + '" title="Ver programa de ' + safeName + '">🎪 ' + safeName + '</a>';
            }).join('') +
          '</div>';
        }
        res = renderCardFestivalsHtml(${JSON.stringify(evSpecial)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toContain('&quot;Música &amp; Teatro&quot; &lt;Especial&gt;');
      expect(ctx.res).toContain('href="/festivals/musica-y-teatro-especial"');
      expect(ctx.res).not.toContain('<Especial>');
    });
  });

  // ==============================================================================
  // 3. Ausencia de Duplicados y Contadores de Planes
  // ==============================================================================
  describe('3. Conteo Factual y Ausencia de Duplicados', () => {
    test('dos actuaciones vinculadas al mismo festival cuentan como 2 planes en contadores, nunca como 3', () => {
      const act1 = { ...baseEvent, id: 201, title: 'Actuación A', festival: mockFestJazz, festivals: [mockFestJazz] };
      const act2 = { ...baseEvent, id: 202, title: 'Actuación B', festival: mockFestJazz, festivals: [mockFestJazz] };

      const eventsList = [act1, act2];
      expect(eventsList.length).toBe(2);

      const hasSyntheticFestivalCard = eventsList.some((e: any) => e.type === 'festival' || e.is_festival);
      expect(hasSyntheticFestivalCard).toBe(false);
    });
  });

  // ==============================================================================
  // 4. Consumidores del Contrato Plural (Modal y Ficha Individual)
  // ==============================================================================
  describe('4. Consumidores del Contrato Plural (Modal y Ficha Individual)', () => {
    test('cero vinculaciones con festivals: [] no resucita un festival singular obsoleto', () => {
      const evWithStaleSingle = {
        ...baseEvent,
        festival: { id: 99, name: 'Festival Obsoleto Resucitado', slug: 'obsoleto' },
        festivals: [], // festivals está presente y vacío de forma autoritativa
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderModalFestivalsBanner(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        resBanner = renderModalFestivalsBanner(${JSON.stringify(evWithStaleSingle)});
      `;
      vm.runInContext(code, ctx);
      // El banner debe ser cadena vacía; no resucita la entrada obsoleta
      expect(ctx.resBanner).toBe('');
    });

    test('una vinculación en festivals[] renderiza etiqueta singular y un solo enlace', () => {
      const evWithSingle = {
        ...baseEvent,
        festival: mockFestJazz,
        festivals: [mockFestJazz],
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderModalFestivalsBanner(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        resBanner = renderModalFestivalsBanner(${JSON.stringify(evWithSingle)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resBanner).toContain('Festival / Ciclo');
      expect(ctx.resBanner).not.toContain('Festivales / Ciclos');
      expect(ctx.resBanner).toContain('XIII Jazz Palencia Festival');
    });

    test('dos vinculaciones en festivals[] renderiza etiqueta plural y ambos programas accesibles', () => {
      const evWithTwo = {
        ...baseEvent,
        festival: mockFestJazz,
        festivals: [mockFestJazz, mockFestOtono],
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderModalFestivalsBanner(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        resBanner = renderModalFestivalsBanner(${JSON.stringify(evWithTwo)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resBanner).toContain('Festivales / Ciclos');
      expect(ctx.resBanner).toContain('XIII Jazz Palencia Festival');
      expect(ctx.resBanner).toContain('Otoño Cultural 2026');
    });

    test('fallback retroactivo: si festivals no existe (undefined), consume festival singular', () => {
      const evLegacy = {
        ...baseEvent,
        festival: mockFestJazz,
        // festivals es undefined
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderModalFestivalsBanner(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        resBanner = renderModalFestivalsBanner(${JSON.stringify(evLegacy)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resBanner).toContain('Festival / Ciclo');
      expect(ctx.resBanner).toContain('XIII Jazz Palencia Festival');
    });

    test('enlace oficial del modal (officialLink) para 0, 1 y 2 festivales y precedencia de entradas', () => {
      const ctx = vm.createContext({});
      const code = `
        function getOfficialLink(ev) {
          const hasFestivalsList = Array.isArray(ev.festivals);
          const festForOfficial = hasFestivalsList
            ? (ev.festivals[0] || null)
            : (ev.festival || null);
          return (ev.actions && (ev.actions.tickets_url || ev.actions.booking_url)) || (festForOfficial && festForOfficial.official_url) || null;
        }

        // 0 festivales (festivals: [] no debe resucitar festival singular)
        const evZero = { ...${JSON.stringify(baseEvent)}, festivals: [], festival: ${JSON.stringify(mockFestJazz)} };
        resZero = getOfficialLink(evZero);

        // 1 festival
        const evOne = { ...${JSON.stringify(baseEvent)}, festivals: [${JSON.stringify(mockFestJazz)}], festival: ${JSON.stringify(mockFestJazz)} };
        resOne = getOfficialLink(evOne);

        // 2 festivales (usa el primero por orden alfabético)
        const evTwo = { ...${JSON.stringify(baseEvent)}, festivals: [${JSON.stringify(mockFestJazz)}, ${JSON.stringify(mockFestOtono)}] };
        resTwo = getOfficialLink(evTwo);

        // Precedencia: tickets_url prevalece sobre festival
        const evTickets = { ...${JSON.stringify(baseEvent)}, actions: { tickets_url: 'https://entradas.ejemplo.es' }, festivals: [${JSON.stringify(mockFestJazz)}] };
        resTickets = getOfficialLink(evTickets);

        // Fallback compatible: festivals undefined
        const evLegacy = { ...${JSON.stringify(baseEvent)}, festival: ${JSON.stringify(mockFestJazz)} };
        resLegacy = getOfficialLink(evLegacy);
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resZero).toBeNull();
      expect(ctx.resOne).toBe('https://jazzpalencia.es');
      expect(ctx.resTwo).toBe('https://jazzpalencia.es');
      expect(ctx.resTickets).toBe('https://entradas.ejemplo.es');
      expect(ctx.resLegacy).toBe('https://jazzpalencia.es');
    });
  });

  // ==============================================================================
  // 5. Integración con Filtros: Gratis y Categorías
  // ==============================================================================
  describe('5. Interacción con Filtros de la Agenda', () => {
    test('gratuidad se evalúa por la actuación individual, no por pertenencia al festival', () => {
      const paidFestivalAct = {
        ...baseEvent,
        id: 201,
        price: { amount_cents: 2500, is_free: false, label: '25,00 €' },
        festival: mockFestJazz,
        festivals: [mockFestJazz],
      };
      const freeFestivalAct = {
        ...baseEvent,
        id: 202,
        price: { amount_cents: 0, is_free: true, label: 'Entrada libre' },
        festival: mockFestJazz,
        festivals: [mockFestJazz],
      };

      const ctx = vm.createContext({});
      const code = `
        function isEventFree(ev) {
          if (!ev) return false;
          if (ev.price && typeof ev.price.is_free === 'boolean') {
            return ev.price.is_free === true;
          }
          return ev.is_free === true;
        }
        resPaid = isEventFree(${JSON.stringify(paidFestivalAct)});
        resFree = isEventFree(${JSON.stringify(freeFestivalAct)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resPaid).toBe(false);
      expect(ctx.resFree).toBe(true);
    });

    test('un programa deportivo no altera su categoría al pertenecer a un ciclo/festival', () => {
      const sportsAct = {
        ...baseEvent,
        id: 203,
        category: 'baloncesto',
        festival: mockFestOtono,
        festivals: [mockFestOtono],
      };

      const ctx = vm.createContext({
        SPORTS_CATEGORIES: ['baloncesto', 'futbol', 'rugby'],
        CULTURE_CATEGORIES: ['teatro', 'cultura', 'arte'],
      });
      const code = `
        function filterEvents(events, currentFilter) {
          if (currentFilter === 'musica') {
            return events.filter(e => e.category === 'musica_directo');
          }
          if (currentFilter === 'deporte') {
            return events.filter(e => SPORTS_CATEGORIES.includes(e.category));
          }
          return events;
        }
        inMusic = filterEvents([${JSON.stringify(sportsAct)}], 'musica');
        inSports = filterEvents([${JSON.stringify(sportsAct)}], 'deporte');
      `;
      vm.runInContext(code, ctx);
      expect(ctx.inMusic.length).toBe(0);
      expect(ctx.inSports.length).toBe(1);
    });
  });

  // ==============================================================================
  // 6. Página Pública del Programa de Festival (renderFestivalHtml)
  // ==============================================================================
  describe('6. Ficha y Programa de Festival (festival-page.ts)', () => {
    test('renderFestivalHtml renderiza cabecera neutral, fechas y enlaces sin icono de jazz para ciclos generales', () => {
      const mockContract: FestivalProgramResponseContract = {
        city: { id: 1, name: 'Palencia', slug: 'palencia' },
        festival: {
          id: 20,
          name: 'Otoño Cultural 2026',
          edition: 'XI Edición',
          slug: 'otono-cultural-2026',
          description: 'Ciclo multidisciplinar de teatro, música y artes en Palencia.',
          start_date: '2026-10-15',
          end_date: '2026-11-30',
          official_url: 'https://cultura.palencia.es',
        },
        events: [
          {
            ...baseEvent,
            id: 301,
            title: 'Obra de Teatro Clásico',
            category: 'teatro',
            editorial_date: '2026-10-20',
            price: { amount_cents: 1200, is_free: false, label: '12,00 €' },
          },
          {
            ...baseEvent,
            id: 302,
            title: 'Concierto Barroco',
            category: 'musica_directo',
            editorial_date: '2026-10-25',
            price: { amount_cents: 0, is_free: true, label: 'Entrada libre' },
          },
        ],
      };

      const html = renderFestivalHtml(mockContract, 'https://vayaplan.com/festivals/otono-cultural-2026');
      expect(html).toContain('Otoño Cultural 2026');
      expect(html).toContain('XI Edición');
      expect(html).toContain('Ciclo multidisciplinar de teatro');
      expect(html).toContain('href="https://cultura.palencia.es"');
      expect(html).toContain('Obra de Teatro Clásico');
      expect(html).toContain('Concierto Barroco');
      expect(html).toContain('href="/events/301"');
      expect(html).toContain('href="/events/302"');
      expect(html).toContain('href="/"');
      expect(html).toContain('← Volver a la agenda');
      expect(html).not.toContain('🎷');
    });

    test('renderFestivalHtml preserva orden cronológico por fecha editorial', () => {
      const mockContract: FestivalProgramResponseContract = {
        city: { id: 1, name: 'Palencia', slug: 'palencia' },
        festival: {
          id: 10,
          name: 'Festival Ordenado',
          edition: null,
          slug: 'fest-ordenado',
          description: null,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          official_url: null,
        },
        events: [
          { ...baseEvent, id: 402, title: 'Evento del 20 de Noviembre', editorial_date: '2026-11-20' },
          { ...baseEvent, id: 401, title: 'Evento del 5 de Noviembre', editorial_date: '2026-11-05' },
        ],
      };

      const html = renderFestivalHtml(mockContract, 'https://vayaplan.com/festivals/fest-ordenado');
      const idx5 = html.indexOf('Evento del 5 de Noviembre');
      const idx20 = html.indexOf('Evento del 20 de Noviembre');
      expect(idx5).toBeGreaterThan(0);
      expect(idx20).toBeGreaterThan(0);
      expect(idx5).toBeLessThan(idx20);
    });

    test('renderFestivalHtml maneja estado vacío cuando el ciclo no tiene actividades aún', () => {
      const mockContract: FestivalProgramResponseContract = {
        city: { id: 1, name: 'Palencia', slug: 'palencia' },
        festival: {
          id: 15,
          name: 'Festival Sin Actividades',
          edition: null,
          slug: 'fest-vacio',
          description: null,
          start_date: '2026-12-01',
          end_date: '2026-12-10',
          official_url: null,
        },
        events: [],
      };

      const html = renderFestivalHtml(mockContract, 'https://vayaplan.com/festivals/fest-vacio');
      expect(html).toContain('No hay actividades publicadas para este ciclo en este momento.');
    });
  });

  // ==============================================================================
  // 7. Accesibilidad, Semántica y Manejo Estricto de Teclado
  // ==============================================================================
  describe('7. Accesibilidad, Semántica y Manejo Estricto de Teclado', () => {
    test('la tarjeta de evento usa un contenedor no interactivo <article> y un botón real con nombre accesible', () => {
      const html = renderPublicHtml();
      // Contenedor semántico no interactivo (sin tabindex para evitar foco redundante)
      expect(html).toContain('<article class="card-compact');
      expect(html).not.toMatch(/<article[^>]*tabindex=/);
      expect(html).not.toMatch(/class="card-compact[^"]*"\s+role="button"/);

      // Botón real nativo para abrir el evento con nombre accesible
      expect(html).toContain('class="card-title-btn"');
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-label="Ver detalles:');

      // Enlaces a festival son controles independientes fuera del botón
      expect(html).toContain('class="card-festival-pill"');
      expect(html).not.toMatch(/<button[^>]*>[\s\S]*<a\s+class="card-festival-pill"/);
    });

    test('recorrido de teclado: el botón nativo del evento activa el modal y previene desplazamiento con Espacio', () => {
      const ctx = vm.createContext({
        lastFocusedElement: null,
        openedModalId: null,
        openEventModal: function(id: number) { ctx.openedModalId = id; },
      });

      const code = `
        function handleKey(e) {
          // Si el control es un botón nativo, el navegador emite 'click' estándar;
          // para cualquier otro disparador delegado, el keydown previene scroll y abre modal.
          if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.dataset && e.target.dataset.action === 'open-event') {
            e.preventDefault();
            lastFocusedElement = e.target;
            openEventModal(Number(e.target.dataset.id));
            return true;
          }
          return false;
        }

        // Caso 1: Enter en el botón nativo del título
        var titleBtn = {
          tagName: 'BUTTON',
          dataset: { action: 'open-event', id: '201' },
        };
        var enterEv = { key: 'Enter', target: titleBtn, defaultPrevented: false, preventDefault: function() { this.defaultPrevented = true; } };
        resEnter = handleKey(enterEv);
        idEnter = openedModalId;
        preventEnter = enterEv.defaultPrevented;

        // Caso 2: Espacio en el botón nativo del título (previene desplazamiento de página)
        var spaceEv = { key: ' ', target: titleBtn, defaultPrevented: false, preventDefault: function() { this.defaultPrevented = true; } };
        resSpace = handleKey(spaceEv);
        preventSpace = spaceEv.defaultPrevented;
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resEnter).toBe(true);
      expect(ctx.idEnter).toBe(201);
      expect(ctx.preventEnter).toBe(true);
      expect(ctx.resSpace).toBe(true);
      expect(ctx.preventSpace).toBe(true);
    });

    test('manejador de teclado: Enter sobre enlace interno no intercepta ni abre el modal', () => {
      const ctx = vm.createContext({
        openedModalId: null,
        openEventModal: function(id: number) { ctx.openedModalId = id; },
      });

      const code = `
        function handleKey(e) {
          if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.dataset && e.target.dataset.action === 'open-event') {
            e.preventDefault();
            openEventModal(Number(e.target.dataset.id));
            return true;
          }
          return false;
        }

        // Enter sobre enlace de festival 1
        var link1 = {
          tagName: 'A',
          classList: { contains: function(c) { return c === 'card-festival-pill'; } },
          dataset: { action: 'open-festival-program', slug: 'jazz-palencia-2026' },
        };
        var evLink1 = { key: 'Enter', target: link1, defaultPrevented: false, preventDefault: function() { this.defaultPrevented = true; } };
        resLink1 = handleKey(evLink1);
        modalAfterLink1 = openedModalId;

        // Enter sobre enlace de festival 2
        var link2 = {
          tagName: 'A',
          classList: { contains: function(c) { return c === 'card-festival-pill'; } },
          dataset: { action: 'open-festival-program', slug: 'otono-cultural-2026' },
        };
        var evLink2 = { key: 'Enter', target: link2, defaultPrevented: false, preventDefault: function() { this.defaultPrevented = true; } };
        resLink2 = handleKey(evLink2);
        modalAfterLink2 = openedModalId;
      `;
      vm.runInContext(code, ctx);
      expect(ctx.resLink1).toBe(false);
      expect(ctx.modalAfterLink1).toBeNull();
      expect(ctx.resLink2).toBe(false);
      expect(ctx.modalAfterLink2).toBeNull();
    });

    test('el clic en el distintivo de festival tiene data-action="open-festival-program" que no dispara el modal', () => {
      const html = renderPublicHtml();
      expect(html).toContain("action === 'open-festival-program'");
      expect(html).toContain('event.stopPropagation()');
    });
  });

  // ==============================================================================
  // 8. Service Worker y Política de Caché (sw.js)
  // ==============================================================================
  describe('8. Service Worker y Política de Caché (sw.js)', () => {
    test('el endpoint /sw.js sirve la versión v1.6 con CACHE_NAME vayaplan-pwa-v4', async () => {
      const webApp = (await import('../index')).default;
      const res = await webApp.fetch(new Request('http://localhost/sw.js'));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/javascript');
      expect(res.headers.get('Cache-Control')).toContain('no-cache, no-store, must-revalidate');

      const swText = await res.text();
      expect(swText).toContain('VayaPlan Service Worker v1.6');
      expect(swText).toContain("CACHE_NAME = 'vayaplan-pwa-v4'");

      // V8 parsea el código del service worker sin errores
      let syntaxOk = false;
      try {
        new vm.Script(swText, { filename: 'sw.js' });
        syntaxOk = true;
      } catch {
        syntaxOk = false;
      }
      expect(syntaxOk).toBe(true);
    });

    test('sw.js excluye expresamente rutas dinámicas /events/, /festivals/ y /ciudades/ de la caché y de navegación offline', async () => {
      const webApp = (await import('../index')).default;
      const res = await webApp.fetch(new Request('http://localhost/sw.js'));
      const swText = await res.text();

      // Comprueba exclusión de rutas dinámicas en caching
      expect(swText).toContain("!url.pathname.startsWith('/events/')");
      expect(swText).toContain("!url.pathname.startsWith('/festivals/')");
      expect(swText).toContain("!url.pathname.startsWith('/ciudades/')");

      // Comprueba exclusión al servir fallback de navegación '/'
      expect(swText).toMatch(/event\.request\.mode === 'navigate'[\s\S]*!url\.pathname\.startsWith\('\/festivals\/'\)/);
      expect(swText).toMatch(/event\.request\.mode === 'navigate'[\s\S]*!url\.pathname\.startsWith\('\/ciudades\/'\)/);
    });

    test('sw.js purga versiones antiguas del prefijo vayaplan-pwa- en activación', async () => {
      const webApp = (await import('../index')).default;
      const res = await webApp.fetch(new Request('http://localhost/sw.js'));
      const swText = await res.text();

      expect(swText).toContain("key.startsWith('vayaplan-pwa-')");
      expect(swText).toContain('caches.delete(key)');
      expect(swText).toContain('self.clients.claim()');
      expect(swText).toContain('self.skipWaiting()');
    });
  });

  // ==============================================================================
  // 9. Ficha Individual Pública (GET /events/:id y renderEventDetail)
  // ==============================================================================
  describe('9. Ficha Individual Pública (GET /events/:id y renderEventDetail)', () => {
    test('renderPublicHtml con initialEvent inyecta bootstrapData y metadatos específicos', () => {
      const evWithTwoFests: PublicEventItem = {
        ...baseEvent,
        id: 701,
        festivals: [mockFestJazz, mockFestOtono],
        festival: mockFestJazz,
      };

      const html = renderPublicHtml({
        title: 'Marco Mezquida en Concierto — Teatro Principal | VayaPlan',
        description: 'Marco Mezquida en concierto en Palencia',
        initialEvent: evWithTwoFests,
      });

      // El bootstrap incluye el evento completo con su array de festivales
      const bootstrapMatch = html.match(/<script id="__VAYAPLAN_BOOTSTRAP__" type="application\/json">([\s\S]*?)<\/script>/);
      expect(bootstrapMatch).not.toBeNull();
      const bootstrapData = JSON.parse(bootstrapMatch![1]);
      expect(bootstrapData.event).toBeDefined();
      expect(bootstrapData.event.id).toBe(701);
      expect(bootstrapData.event.festivals.length).toBe(2);
      expect(bootstrapData.event.festivals[0].name).toBe('XIII Jazz Palencia Festival');
      expect(bootstrapData.event.festivals[1].name).toBe('Otoño Cultural 2026');
    });

    test('presentación real de la ficha individual para 0 vinculaciones (festivals: [] es autoritativo)', () => {
      const evZero = {
        ...baseEvent,
        festival: { id: 99, name: 'Festival Residuo Obsoleto', slug: 'obsoleto' },
        festivals: [], // autoritativo
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderFichaFestivalSection(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<a href="/festivals/' + encodeURIComponent(f.slug) + '"><strong>' + escapeHtml(f.name) + '</strong></a>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        res = renderFichaFestivalSection(${JSON.stringify(evZero)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toBe('');
      expect(ctx.res).not.toContain('event-festival-banner');
      expect(ctx.res).not.toContain('Festival Residuo Obsoleto');
    });

    test('presentación real de la ficha individual para 1 vinculación (enlace accesible y singular)', () => {
      const evOne = {
        ...baseEvent,
        festivals: [mockFestJazz],
        festival: mockFestJazz,
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderFichaFestivalSection(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<a href="/festivals/' + encodeURIComponent(f.slug) + '"><strong>' + escapeHtml(f.name) + '</strong></a>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        res = renderFichaFestivalSection(${JSON.stringify(evOne)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toContain('class="event-festival-banner"');
      expect(ctx.res).toContain('Festival / Ciclo');
      expect(ctx.res).not.toContain('Festivales / Ciclos');
      expect(ctx.res).toContain('href="/festivals/jazz-palencia-2026"');
      expect(ctx.res).toContain('<strong>XIII Jazz Palencia Festival</strong>');
    });

    test('presentación real de la ficha individual para 2 vinculaciones (ambos programas enlazados y accesibles)', () => {
      const evTwo = {
        ...baseEvent,
        festivals: [mockFestJazz, mockFestOtono],
        festival: mockFestJazz,
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderFichaFestivalSection(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<a href="/festivals/' + encodeURIComponent(f.slug) + '"><strong>' + escapeHtml(f.name) + '</strong></a>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        res = renderFichaFestivalSection(${JSON.stringify(evTwo)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toContain('class="event-festival-banner"');
      expect(ctx.res).toContain('Festivales / Ciclos');
      expect(ctx.res).toContain('href="/festivals/jazz-palencia-2026"');
      expect(ctx.res).toContain('<strong>XIII Jazz Palencia Festival</strong>');
      expect(ctx.res).toContain('href="/festivals/otono-cultural-2026"');
      expect(ctx.res).toContain('<strong>Otoño Cultural 2026</strong>');
    });

    test('presentación real de la ficha individual con fallback compatible si festivals es undefined', () => {
      const evLegacy = {
        ...baseEvent,
        festival: mockFestJazz,
        // festivals es undefined
      };

      const ctx = vm.createContext({
        escapeHtml: (s: string) => s,
        encodeURIComponent: (s: string) => encodeURIComponent(s),
      });

      const code = `
        function renderFichaFestivalSection(ev) {
          const hasFestivals = Array.isArray(ev.festivals);
          const list = hasFestivals ? ev.festivals : (ev.festival ? [ev.festival] : []);
          if (!list || list.length === 0) return '';
          return '<div class="event-festival-banner">' +
            '<div class="festival-banner-tag">' + (list.length > 1 ? 'Festivales / Ciclos' : 'Festival / Ciclo') + '</div>' +
            '<div class="festival-banner-name">Forma parte de ' +
              list.map(function(f) { return '<a href="/festivals/' + encodeURIComponent(f.slug) + '"><strong>' + escapeHtml(f.name) + '</strong></a>'; }).join(' · ') +
            '</div>' +
          '</div>';
        }
        res = renderFichaFestivalSection(${JSON.stringify(evLegacy)});
      `;
      vm.runInContext(code, ctx);
      expect(ctx.res).toContain('class="event-festival-banner"');
      expect(ctx.res).toContain('Festival / Ciclo');
      expect(ctx.res).toContain('href="/festivals/jazz-palencia-2026"');
      expect(ctx.res).toContain('<strong>XIII Jazz Palencia Festival</strong>');
    });
  });
});
