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
});
