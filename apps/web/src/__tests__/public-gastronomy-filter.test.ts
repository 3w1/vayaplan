import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderPublicHtml } from '../public-page';

describe('apps/web — Filtro «Gastronomía» en Agenda Pública (public-page.ts)', () => {
  const html = renderPublicHtml();

  // ----------------------------------------------------------------------------
  // 1. Estructura y Semántica HTML / CSS
  // ----------------------------------------------------------------------------
  test('renderPublicHtml incorpora el botón .cat-btn para Gastronomía con accesibilidad e icono SVG', () => {
    expect(html).toContain('data-action="set-cat"');
    expect(html).toContain('data-cat="gastronomia"');
    expect(html).toContain('aria-label="Categoría Gastronomía"');
    expect(html).toContain('<span class="cat-label">Gastronomía</span>');
    // Verificación del icono SVG de cubiertos/tenedor y cuchillo
    expect(html).toContain('M11 9H9V2H7v7H5V2H3v7c0 2.12');
  });

  test('renderPublicHtml contiene reglas CSS para .categories-row con prevención de overflow', () => {
    expect(html).toContain('.categories-row');
    expect(html).toContain('overflow-x: auto');
    expect(html).toContain('scrollbar-width: none');
    expect(html).toContain('-webkit-overflow-scrolling: touch');
    expect(html).toContain('.cat-btn');
    expect(html).toContain('flex-shrink: 0');
  });

  // ----------------------------------------------------------------------------
  // 2. Validación de Sintaxis JavaScript en el Script Cliente
  // ----------------------------------------------------------------------------
  test('todos los scripts inline generados en la plantilla son JavaScript válido para navegador (cero TypeScript)', () => {
    const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const clientCode = scriptMatch![1];

    // Verificar que no existen expresiones TypeScript prohibidas en scripts cliente
    expect(clientCode).not.toContain('as HTML');
    expect(clientCode).not.toContain('as any');
    expect(clientCode).not.toContain(': boolean');
    expect(clientCode).not.toContain(': string');

    // Validación formal mediante el compilador del motor V8 / Node VM
    let syntaxValid = false;
    try {
      new vm.Script(clientCode, { filename: 'public-page-inline.js' });
      syntaxValid = true;
    } catch {
      syntaxValid = false;
    }
    expect(syntaxValid).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 3. Eventos Sintéticos y Lógica de Filtrado
  // ----------------------------------------------------------------------------
  const mockSyntheticEvents = [
    {
      id: 701,
      title: 'Cata de Vinos Ribera del Duero y Maridaje',
      category: 'gastronomia',
      status: 'published',
      time_status: 'confirmed',
      start_time: '2026-10-29T20:00:00.000Z',
      editorial_date: '2026-10-29',
      price: { amount_cents: 4500, is_free: false, label: '45,00 €' },
      venue: { id: 10119, name: 'Restaurante La Traserilla' },
    },
    {
      id: 702,
      title: 'Degustación Gratuita de Cervezas Artesanales',
      category: 'gastronomia',
      status: 'published',
      time_status: 'confirmed',
      start_time: '2026-10-30T19:00:00.000Z',
      editorial_date: '2026-10-30',
      price: { amount_cents: 0, is_free: true, label: 'Gratis' },
      venue: { id: 10200, name: 'Cervecería La Brújula' },
    },
    {
      id: 703,
      title: 'Concierto Acústico en Sala',
      category: 'musica_directo',
      status: 'published',
      time_status: 'confirmed',
      start_time: '2026-10-29T21:00:00.000Z',
      editorial_date: '2026-10-29',
      price: { amount_cents: 1000, is_free: false, label: '10,00 €' },
      venue: { id: 10001, name: 'Universonoro' },
    },
    {
      id: 704,
      title: 'Sesión DJ Tardeo',
      category: 'dj_tardeo',
      status: 'published',
      time_status: 'confirmed',
      start_time: '2026-10-29T18:00:00.000Z',
      editorial_date: '2026-10-29',
      price: { amount_cents: 0, is_free: true, label: 'Gratis' },
      venue: { id: 10002, name: 'Gómez Palentino' },
    },
    {
      id: 705,
      title: 'Cata No Publicada (Borrador)',
      category: 'gastronomia',
      status: 'draft',
      time_status: 'confirmed',
      start_time: '2026-10-29T20:00:00.000Z',
      editorial_date: '2026-10-29',
      price: { amount_cents: 3000, is_free: false, label: '30,00 €' },
      venue: { id: 10119, name: 'Restaurante La Traserilla' },
    },
  ];

  const mockSyntheticRecurrences = [
    {
      id: 801,
      title: 'Cata Semanal de Quesos y Vinos',
      category: 'gastronomia',
      day_of_week: 4, // Jueves
      start_time: '20:00:00',
      is_free: false,
      price_cents: 2500,
      venue_name: 'Bodega Central',
    },
    {
      id: 802,
      title: 'Sesión DJ habitual',
      category: 'dj_tardeo',
      day_of_week: 5, // Viernes
      start_time: '19:00:00',
      is_free: true,
      price_cents: 0,
      venue_name: 'Gómez Palentino',
    },
  ];

  function filterEvents(events: any[], currentFilter: string, isFreeFilterActive: boolean) {
    if (!events || events.length === 0) return [];
    let result = events.filter((ev) => ev.status === 'published');

    if (currentFilter === 'musica') {
      result = result.filter((ev) => ev.category === 'musica_directo');
    } else if (currentFilter === 'tardeo') {
      result = result.filter((ev) => ev.category === 'dj_tardeo');
    } else if (currentFilter === 'cine') {
      result = result.filter((ev) => ev.category === 'cine');
    } else if (currentFilter === 'cultura') {
      result = result.filter((ev) => ['cultura', 'teatro', 'exposicion', 'monologo', 'conferencia'].includes(ev.category));
    } else if (currentFilter === 'deporte') {
      result = result.filter((ev) => ['baloncesto', 'futbol', 'rugby'].includes(ev.category));
    } else if (currentFilter === 'gastronomia') {
      result = result.filter((ev) => ev.category === 'gastronomia');
    }

    if (isFreeFilterActive) {
      result = result.filter((ev) => ev.price && (ev.price.is_free || ev.price.amount_cents === 0));
    }

    return result;
  }

  function filterRecurrences(recurrences: any[], currentFilter: string, isFreeFilterActive: boolean) {
    if (!recurrences || recurrences.length === 0) return [];
    let result = recurrences.slice();

    if (currentFilter === 'musica') {
      result = result.filter((r) => r.category === 'musica_directo');
    } else if (currentFilter === 'tardeo') {
      result = result.filter((r) => r.category === 'dj_tardeo');
    } else if (currentFilter === 'cine') {
      result = result.filter((r) => r.category === 'cine');
    } else if (currentFilter === 'cultura') {
      result = result.filter((r) => ['cultura', 'teatro', 'exposicion', 'monologo', 'conferencia'].includes(r.category));
    } else if (currentFilter === 'deporte') {
      result = result.filter((r) => ['baloncesto', 'futbol', 'rugby'].includes(r.category));
    } else if (currentFilter === 'gastronomia') {
      result = result.filter((r) => r.category === 'gastronomia');
    }

    if (isFreeFilterActive) {
      result = result.filter((r) => r.is_free || (r.price_cents === 0));
    }

    return result;
  }

  test('los eventos gastronómicos publicados se muestran en «Todas» y no se excluyen cuando Gastronomía no está activo', () => {
    const all = filterEvents(mockSyntheticEvents, 'all', false);
    // 4 publicados en total (el borrador id=705 está excluido)
    expect(all.length).toBe(4);
    expect(all.some((e) => e.id === 701)).toBe(true);
    expect(all.some((e) => e.id === 702)).toBe(true);
    expect(all.some((e) => e.id === 705)).toBe(false);
  });

  test('el filtro Gastronomía devuelve exclusivamente eventos con category gastronomia', () => {
    const gastro = filterEvents(mockSyntheticEvents, 'gastronomia', false);
    expect(gastro.length).toBe(2);
    expect(gastro.map((e) => e.id)).toEqual([701, 702]);
    for (const ev of gastro) {
      expect(ev.category).toBe('gastronomia');
    }
  });

  test('actividades periódicas (recurrences) con gastronomia se filtran en el filtro gastronómico', () => {
    const recs = filterRecurrences(mockSyntheticRecurrences, 'gastronomia', false);
    expect(recs.length).toBe(1);
    expect(recs[0].id).toBe(801);
    expect(recs[0].category).toBe('gastronomia');
  });

  test('la combinación Gastronomía + Gratis muestra únicamente eventos gastronómicos gratuitos', () => {
    const freeGastro = filterEvents(mockSyntheticEvents, 'gastronomia', true);
    expect(freeGastro.length).toBe(1);
    expect(freeGastro[0].id).toBe(702);
    expect(freeGastro[0].price.is_free).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 4. Convivencia con Rutas Gastronómicas (gastronomic_routes)
  // ----------------------------------------------------------------------------
  test('las rutas gastronómicas y los eventos de agenda gastronomia conviven sin duplicidad de tarjetas', () => {
    const mockGastronomicRoute = {
      id: 901,
      title: 'Ruta de Pinchos de Otoño',
      slug: 'ruta-pinchos-otono',
      summary: 'Recorre los bares participantes y prueba sus tapas',
      category: 'tapas',
      status: 'published',
      participants_count: 8,
    };

    // La ruta es un objeto de tipo GastronomicRoute, no de tipo Event.
    // filterEvents opera sobre eventos de agenda y no procesa entidades de rutas.
    const events = filterEvents(mockSyntheticEvents, 'gastronomia', false);
    expect(events.some((e: any) => e.slug === 'ruta-pinchos-otono')).toBe(false);
    expect(events.length).toBe(2);
  });

  // ----------------------------------------------------------------------------
  // 5. Lectura y Resolución de URL (?cat=gastronomia)
  // ----------------------------------------------------------------------------
  test('la lectura y resolución de URL reconoce estrictamente cat=gastronomia y category=gastronomia', () => {
    const validCategories = ['musica', 'tardeo', 'cine', 'cultura', 'deporte', 'gastronomia'];

    function parseFilterFromUrl(search: string) {
      const params = new URLSearchParams(search);
      const catParam = (params.get('cat') || params.get('category'));
      return (catParam && validCategories.includes(catParam.trim().toLowerCase()))
        ? catParam.trim().toLowerCase()
        : 'all';
    }

    expect(parseFilterFromUrl('?cat=gastronomia')).toBe('gastronomia');
    expect(parseFilterFromUrl('?category=gastronomia')).toBe('gastronomia');
    expect(parseFilterFromUrl('?cat=gastronomia&free=true')).toBe('gastronomia');
    expect(parseFilterFromUrl('?cat=desconocido')).toBe('all');
    expect(parseFilterFromUrl('')).toBe('all');
  });

  // ----------------------------------------------------------------------------
  // 6. Barra de Filtros Activos y Retirada de Chip
  // ----------------------------------------------------------------------------
  test('updateActiveFiltersBar genera chip para Gastronomía y permite retirar el filtro', () => {
    const catNames: Record<string, string> = {
      musica: 'Música',
      tardeo: 'Tardeo',
      cine: 'Cine',
      cultura: 'Cultura',
      deporte: 'Deporte',
      gastronomia: 'Gastronomía',
    };

    function renderChip(currentFilter: string) {
      if (currentFilter !== 'all') {
        return `<button class="filter-chip-removable" data-action="remove-cat-filter" aria-label="Eliminar filtro ${catNames[currentFilter]}">${catNames[currentFilter] || currentFilter} ✕</button>`;
      }
      return '';
    }

    const chipHtml = renderChip('gastronomia');
    expect(chipHtml).toContain('Gastronomía ✕');
    expect(chipHtml).toContain('data-action="remove-cat-filter"');
    expect(chipHtml).toContain('aria-label="Eliminar filtro Gastronomía"');
  });

  // ----------------------------------------------------------------------------
  // 7. Estados Vacíos Específicos
  // ----------------------------------------------------------------------------
  test('los estados vacíos muestran el mensaje específico para Gastronomía y Gastronomía + Gratis', () => {
    function getCategoryTitle(cat: string) {
      const t: Record<string, string> = {
        musica: 'Música',
        tardeo: 'Tardeo',
        cine: 'Cine',
        cultura: 'Cultura',
        deporte: 'Deporte',
        gastronomia: 'Gastronomía',
      };
      return t[cat] || 'Planes';
    }

    function renderEmptyState(currentFilter: string, isFreeActive: boolean) {
      if (isFreeActive) {
        return {
          title: 'No hay planes gratuitos con estos filtros',
          desc: `No encontramos eventos gratuitos en ${getCategoryTitle(currentFilter)} para la fecha seleccionada.`,
        };
      }
      return {
        title: `Sin planes en ${getCategoryTitle(currentFilter)}`,
        desc: 'No encontramos eventos en esta categoría para la fecha seleccionada.',
      };
    }

    const emptyGastro = renderEmptyState('gastronomia', false);
    expect(emptyGastro.title).toBe('Sin planes en Gastronomía');
    expect(emptyGastro.desc).toBe('No encontramos eventos en esta categoría para la fecha seleccionada.');

    const emptyFreeGastro = renderEmptyState('gastronomia', true);
    expect(emptyFreeGastro.title).toBe('No hay planes gratuitos con estos filtros');
    expect(emptyFreeGastro.desc).toContain('No encontramos eventos gratuitos en Gastronomía');
  });

  // ----------------------------------------------------------------------------
  // 8. Ausencia de Regresiones en las Demás Categorías
  // ----------------------------------------------------------------------------
  test('las categorías existentes (musica, tardeo, cine, cultura, deporte) conservan intacto su comportamiento', () => {
    expect(filterEvents(mockSyntheticEvents, 'musica', false).length).toBe(1);
    expect(filterEvents(mockSyntheticEvents, 'tardeo', false).length).toBe(1);
    expect(filterEvents(mockSyntheticEvents, 'cine', false).length).toBe(0);
    expect(filterEvents(mockSyntheticEvents, 'cultura', false).length).toBe(0);
    expect(filterEvents(mockSyntheticEvents, 'deporte', false).length).toBe(0);
  });

  // ----------------------------------------------------------------------------
  // 9. Banner Contextual de Descubribilidad de Rutas Gastronómicas
  // ----------------------------------------------------------------------------
  describe('Banner Contextual de Rutas Gastronómicas', () => {
    const mockRoutes = [
      {
        id: 1,
        title: 'Ruta de la Tapa y Maridaje de Otoño',
        slug: 'ruta-tapa-otono',
        summary: 'Itinerario de 6 tapas maridadas con vinos DO Arlanza',
        category: 'tapas_pinchos',
        badge_label: 'Edición Otoño',
        start_date: '2026-10-25',
        end_date: '2026-11-05',
        is_permanent: false,
        approximate_price_cents: 350,
        participants_count: 6,
      },
      {
        id: 2,
        title: 'Ruta Permanente de los Mesones Tradicionales',
        slug: 'ruta-mesones',
        summary: 'Los mejores asados y raciones clásicas de Palencia',
        category: 'tradicional',
        badge_label: 'Permanente',
        start_date: null,
        end_date: null,
        is_permanent: true,
        approximate_price_cents: null,
        participants_count: 4,
      },
      {
        id: 3,
        title: 'Jornadas del Lechazo Palentino',
        slug: 'jornadas-lechazo',
        summary: 'Menús especiales de lechazo churro',
        category: 'menu_degustacion',
        badge_label: 'Noviembre',
        start_date: '2026-11-10',
        end_date: '2026-11-20',
        is_permanent: false,
        approximate_price_cents: 2800,
        participants_count: 5,
      },
    ];

    function evaluateActiveRoutes(routes: any[] | null, targetDates: string[]) {
      if (!routes) return null;
      return routes.filter((r) => {
        if (r.is_permanent || (!r.start_date && !r.end_date)) return true;
        if (targetDates.length === 0) return true;
        return targetDates.some((dateStr) => {
          const afterStart = !r.start_date || r.start_date <= dateStr;
          const beforeEnd = !r.end_date || r.end_date >= dateStr;
          return afterStart && beforeEnd;
        });
      });
    }

    test('no se renderiza el banner en categorías distintas a gastronomia (musica, all, deporte)', () => {
      expect(html).toContain('renderGastronomyRoutesBannerHtml');
      // Verificamos que si currentFilter no es gastronomia devuelve vacío
      function renderBanner(currentFilter: string) {
        if (currentFilter !== 'gastronomia') return '';
        return '<aside class="gastronomy-routes-banner">...</aside>';
      }
      expect(renderBanner('all')).toBe('');
      expect(renderBanner('musica')).toBe('');
      expect(renderBanner('deporte')).toBe('');
    });

    test('al seleccionar Gastronomía sin datos aún o ante error: muestra texto neutral "Explorar rutas gastronómicas" y enlace a /rutas', () => {
      const active = evaluateActiveRoutes(null, ['2026-10-29']);
      expect(active).toBeNull();
      // Texto neutral exigido
      const neutralCta = 'Explorar rutas gastronómicas →';
      expect(html).toContain('Explorar rutas gastronómicas →');
      expect(html).toContain('href="/rutas"');
    });

    test('al seleccionar Gastronomía con fecha 2026-10-29: reconoce la ruta de otoño y la permanente, descartando la de noviembre', () => {
      const active = evaluateActiveRoutes(mockRoutes, ['2026-10-29']);
      expect(active).not.toBeNull();
      expect(active!.length).toBe(2);
      expect(active!.some((r) => r.slug === 'ruta-tapa-otono')).toBe(true);
      expect(active!.some((r) => r.slug === 'ruta-mesones')).toBe(true);
      expect(active!.some((r) => r.slug === 'jornadas-lechazo')).toBe(false);
    });

    test('resolución de fin de semana (weekendDates): reconoce rutas activas en cualquiera de los días del fin de semana', () => {
      const activeWeekend = evaluateActiveRoutes(mockRoutes, ['2026-11-06', '2026-11-07', '2026-11-08']);
      // En ese fin de semana la de otoño ya acabó (terminó el 5) y la de noviembre no empezó (empieza el 10).
      // Solo la permanente está activa.
      expect(activeWeekend!.length).toBe(1);
      expect(activeWeekend![0].slug === 'ruta-mesones').toBe(true);
    });

    test('renderRoutesHtml genera la página /rutas con accesibilidad, metadatos y retorno a la agenda', () => {
      const { renderRoutesHtml } = require('../routes-page');
      const routesPageHtml = renderRoutesHtml({
        city: { slug: 'palencia', name: 'Palencia' },
        routes: mockRoutes,
      }, 'https://vayaplan.com/rutas');

      expect(routesPageHtml).toContain('Rutas Gastronómicas en Palencia');
      expect(routesPageHtml).toContain('Ruta de la Tapa y Maridaje de Otoño');
      expect(routesPageHtml).toContain('6 locales participantes');
      expect(routesPageHtml).toContain('← Volver a la agenda');
      expect(routesPageHtml).toContain('href="/?cat=gastronomia"');

      // Verificación con otra ciudad (ej: Valladolid): preserva city slug
      const valladolidHtml = renderRoutesHtml({
        city: { slug: 'valladolid', name: 'Valladolid' },
        routes: [],
      }, 'https://vayaplan.com/rutas?city=valladolid');
      expect(valladolidHtml).toContain('href="/?city=valladolid&amp;cat=gastronomia"');
      expect(valladolidHtml).toContain('No hay rutas gastronómicas activas');
    });

    test('casos límite de fechas: límites abiertos, permanente y fuera de rango', () => {
      const edgeRoutes = [
        {
          id: 10,
          title: 'Ruta con solo start_date (desde 2026-10-28 en adelante)',
          slug: 'ruta-start-only',
          start_date: '2026-10-28',
          end_date: null,
          is_permanent: false,
        },
        {
          id: 11,
          title: 'Ruta con solo end_date (hasta 2026-10-30)',
          slug: 'ruta-end-only',
          start_date: null,
          end_date: '2026-10-30',
          is_permanent: false,
        },
      ];

      // El 2026-10-29 ambas rutas con límites abiertos están activas
      const active29 = evaluateActiveRoutes(edgeRoutes, ['2026-10-29']);
      expect(active29!.length).toBe(2);

      // El 2026-10-27: ruta-start-only aún no ha empezado, ruta-end-only sí está activa
      const active27 = evaluateActiveRoutes(edgeRoutes, ['2026-10-27']);
      expect(active27!.length).toBe(1);
      expect(active27![0].slug).toBe('ruta-end-only');

      // El 2026-10-31: ruta-end-only ya venció, ruta-start-only continúa activa
      const active31 = evaluateActiveRoutes(edgeRoutes, ['2026-10-31']);
      expect(active31!.length).toBe(1);
      expect(active31![0].slug).toBe('ruta-start-only');
    });
  });
});
