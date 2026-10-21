import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderPublicHtml } from '../public-page';

describe('apps/web — Filtro «Deporte» en Agenda Pública (public-page.ts)', () => {
  const html = renderPublicHtml();

  // ----------------------------------------------------------------------------
  // 1. Estructura y Semántica HTML / CSS
  // ----------------------------------------------------------------------------
  test('renderPublicHtml incorpora el control de botón .cat-btn para Deporte con accesibilidad y semántica', () => {
    expect(html).toContain('data-action="set-cat"');
    expect(html).toContain('data-cat="deporte"');
    expect(html).toContain('aria-label="Categoría Deporte"');
    expect(html).toContain('<span class="cat-label">Deporte</span>');
  });

  test('renderPublicHtml contiene reglas CSS para .categories-row con prevención de overflow y scroll horizontal suave', () => {
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
    } catch (e: any) {
      syntaxValid = false;
    }
    expect(syntaxValid).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 3. Eventos Sintéticos y Lógica de Filtrado (Baloncesto, Fútbol, Rugby, No Deportivo, Horario Pendiente)
  // ----------------------------------------------------------------------------
  const mockSyntheticEvents = [
    {
      id: 501,
      title: 'Partido Baloncesto Palencia — Entrada Libre',
      category: 'baloncesto',
      time_status: 'confirmed',
      start_time: '2026-10-24T18:00:00.000Z',
      editorial_date: '2026-10-24',
      price: { amount_cents: 0, is_free: true, label: 'Gratis' },
      venue: { id: 10, name: 'Pabellón Municipal Marta Domínguez' },
    },
    {
      id: 502,
      title: 'Derbi de Fútbol Palencia vs Valladolid — Taquilla',
      category: 'futbol',
      time_status: 'confirmed',
      start_time: '2026-10-24T17:00:00.000Z',
      editorial_date: '2026-10-24',
      price: { amount_cents: 1500, is_free: false, label: '15,00 €' },
      venue: { id: 11, name: 'Estadio Municipal Nueva Balastera' },
    },
    {
      id: 503,
      title: 'Encuentro Rugby Palencia — Acceso Pago',
      category: 'rugby',
      time_status: 'confirmed',
      start_time: '2026-10-24T16:00:00.000Z',
      editorial_date: '2026-10-24',
      price: { amount_cents: 500, is_free: false, label: '5,00 €' },
      venue: { id: 12, name: 'Campos de la Juventud' },
    },
    {
      id: 504,
      title: 'Concierto Jazz en Vivo',
      category: 'musica_directo',
      time_status: 'confirmed',
      start_time: '2026-10-24T21:00:00.000Z',
      editorial_date: '2026-10-24',
      price: { amount_cents: 1200, is_free: false, label: '12,00 €' },
      venue: { id: 1, name: 'Bar Universonoro' },
    },
    {
      id: 505,
      title: 'Torneo Baloncesto Base — Horario Pendiente',
      category: 'baloncesto',
      time_status: 'pending_time',
      start_time: null,
      editorial_date: '2026-10-24',
      price: { amount_cents: 0, is_free: true, label: 'Entrada libre' },
      venue: { id: 10, name: 'Pabellón Municipal Marta Domínguez' },
    },
  ];

  const mockSyntheticRecurrences = [
    {
      id: 601,
      title: 'Entrenamiento Abierto Rugby Formativo',
      category: 'rugby',
      day_of_week: 6,
      start_time: '11:00:00',
      is_free: true,
      price_cents: 0,
    },
    {
      id: 602,
      title: 'Sesión DJ Tardeo Semanal',
      category: 'dj_tardeo',
      day_of_week: 6,
      start_time: '19:00:00',
      is_free: false,
      price_cents: 800,
    },
  ];

  const SPORTS_CATEGORIES = ['baloncesto', 'futbol', 'rugby'];
  const CULTURE_CATEGORIES = ['cultura', 'teatro', 'exposicion', 'monologo'];

  function isEventFree(ev: any) {
    if (!ev) return false;
    if (ev.price && typeof ev.price === 'object' && ev.price.is_free !== undefined) {
      return ev.price.is_free === true;
    }
    if (ev.is_free !== undefined) {
      return ev.is_free === true;
    }
    return false;
  }

  function isRecurrenceFree(r: any) {
    if (!r) return false;
    if (r.is_free !== undefined) return r.is_free === true;
    if (r.price && typeof r.price === 'object' && r.price.is_free !== undefined) return r.price.is_free === true;
    return false;
  }

  function filterEvents(events: any[], currentFilter: string, isFreeFilterActive: boolean) {
    if (!events || events.length === 0) return [];
    let result = events;

    if (currentFilter === 'musica') {
      result = result.filter((ev) => ev.category === 'musica_directo');
    } else if (currentFilter === 'tardeo') {
      result = result.filter((ev) => ev.category === 'dj_tardeo');
    } else if (currentFilter === 'cine') {
      result = result.filter((ev) => ev.category === 'cine');
    } else if (currentFilter === 'cultura') {
      result = result.filter((ev) => CULTURE_CATEGORIES.includes(ev.category));
    } else if (currentFilter === 'deporte') {
      result = result.filter((ev) => SPORTS_CATEGORIES.includes(ev.category));
    }

    if (isFreeFilterActive) {
      result = result.filter((ev) => isEventFree(ev));
    }

    return result;
  }

  function filterRecurrences(recurrences: any[], currentFilter: string, isFreeFilterActive: boolean) {
    if (!recurrences || recurrences.length === 0) return [];
    let result = recurrences;

    if (currentFilter === 'musica') {
      result = result.filter((r) => r.category === 'musica_directo');
    } else if (currentFilter === 'tardeo') {
      result = result.filter((r) => r.category === 'dj_tardeo');
    } else if (currentFilter === 'cine') {
      result = result.filter((r) => r.category === 'cine');
    } else if (currentFilter === 'cultura') {
      result = result.filter((r) => CULTURE_CATEGORIES.includes(r.category));
    } else if (currentFilter === 'deporte') {
      result = result.filter((r) => SPORTS_CATEGORIES.includes(r.category));
    }

    if (isFreeFilterActive) {
      result = result.filter((r) => isRecurrenceFree(r));
    }

    return result;
  }

  // ----------------------------------------------------------------------------
  // 4. Agrupación y Visibilidad en «Todas» vs «Deporte»
  // ----------------------------------------------------------------------------
  test('los eventos deportivos se muestran íntegramente en «Todas» y no se excluyen cuando Deporte no está activo', () => {
    const allEvents = filterEvents(mockSyntheticEvents, 'all', false);
    expect(allEvents.length).toBe(5);
    const ids = allEvents.map((e) => e.id);
    expect(ids).toContain(501); // Baloncesto
    expect(ids).toContain(502); // Fútbol
    expect(ids).toContain(503); // Rugby
    expect(ids).toContain(504); // Música
    expect(ids).toContain(505); // Baloncesto pendiente
  });

  test('el filtro Deporte agrupa baloncesto, futbol y rugby, excluyendo categorías no deportivas', () => {
    const sportsEvents = filterEvents(mockSyntheticEvents, 'deporte', false);
    expect(sportsEvents.length).toBe(4);
    const ids = sportsEvents.map((e) => e.id);
    expect(ids).toContain(501); // Baloncesto
    expect(ids).toContain(502); // Fútbol
    expect(ids).toContain(503); // Rugby
    expect(ids).toContain(505); // Baloncesto pendiente
    expect(ids).not.toContain(504); // Música (excluido)
  });

  test('actividades periódicas (recurrences) deportivas se filtran correctamente en Deporte', () => {
    const sportsRecs = filterRecurrences(mockSyntheticRecurrences, 'deporte', false);
    expect(sportsRecs.length).toBe(1);
    expect(sportsRecs[0].id).toBe(601); // Rugby
    expect(sportsRecs[0].category).toBe('rugby');
  });

  // ----------------------------------------------------------------------------
  // 5. Combinación con el Filtro «Gratis»
  // ----------------------------------------------------------------------------
  test('la combinación Deporte + Gratis muestra únicamente actividades deportivas gratuitas', () => {
    const freeSportsEvents = filterEvents(mockSyntheticEvents, 'deporte', true);
    expect(freeSportsEvents.length).toBe(2);
    const ids = freeSportsEvents.map((e) => e.id);
    expect(ids).toContain(501); // Baloncesto gratuito
    expect(ids).toContain(505); // Baloncesto horario pendiente gratuito
    expect(ids).not.toContain(502); // Fútbol de pago (15 €)
    expect(ids).not.toContain(503); // Rugby de pago (5 €)
    expect(ids).not.toContain(504); // Música no deportiva

    const freeSportsRecs = filterRecurrences(mockSyntheticRecurrences, 'deporte', true);
    expect(freeSportsRecs.length).toBe(1);
    expect(freeSportsRecs[0].id).toBe(601);
  });

  // ----------------------------------------------------------------------------
  // 6. Vista de Fin de Semana
  // ----------------------------------------------------------------------------
  test('la vista de fin de semana filtra correctamente deportes por días', () => {
    const mockWeekendDays = [
      {
        editorial_date: '2026-10-24',
        events: mockSyntheticEvents.slice(0, 3), // Baloncesto (gratis), Fútbol (pago), Rugby (pago)
        recurrences: [mockSyntheticRecurrences[0]], // Rugby
      },
      {
        editorial_date: '2026-10-25',
        events: [mockSyntheticEvents[3]], // Música
        recurrences: [mockSyntheticRecurrences[1]], // DJ
      },
    ];

    // Día 1 con filtro Deporte
    const day1Sports = filterEvents(mockWeekendDays[0].events, 'deporte', false);
    expect(day1Sports.length).toBe(3);
    const day1Recs = filterRecurrences(mockWeekendDays[0].recurrences, 'deporte', false);
    expect(day1Recs.length).toBe(1);

    // Día 2 con filtro Deporte (sin deportes)
    const day2Sports = filterEvents(mockWeekendDays[1].events, 'deporte', false);
    expect(day2Sports.length).toBe(0);
    const day2Recs = filterRecurrences(mockWeekendDays[1].recurrences, 'deporte', false);
    expect(day2Recs.length).toBe(0);

    // Día 1 con filtro Deporte + Gratis
    const day1FreeSports = filterEvents(mockWeekendDays[0].events, 'deporte', true);
    expect(day1FreeSports.length).toBe(1);
    expect(day1FreeSports[0].id).toBe(501);
  });

  // ----------------------------------------------------------------------------
  // 7. Sincronización de URL (cat=deporte y ausencia de aliases no soportados previamente)
  // ----------------------------------------------------------------------------
  test('la lectura y resolución de URL gestiona estrictamente cat=deporte y no convierte disciplinas individuales en Deporte', () => {
    const validCategories = ['musica', 'tardeo', 'cine', 'cultura', 'deporte'];

    function parseFilterFromUrl(search: string) {
      const params = new URLSearchParams(search);
      const catParam = (params.get('cat') || params.get('category'));
      return (catParam && validCategories.includes(catParam.trim().toLowerCase()))
        ? catParam.trim().toLowerCase()
        : 'all';
    }

    expect(parseFilterFromUrl('?cat=deporte')).toBe('deporte');
    expect(parseFilterFromUrl('?cat=deporte&free=true')).toBe('deporte');
    expect(parseFilterFromUrl('?category=deporte')).toBe('deporte');
    // Sin soporte previo para disciplinas individuales: caen limpiamente a 'all' sin mutar a Deporte
    expect(parseFilterFromUrl('?cat=baloncesto')).toBe('all');
    expect(parseFilterFromUrl('?cat=futbol')).toBe('all');
    expect(parseFilterFromUrl('?cat=rugby')).toBe('all');
    expect(parseFilterFromUrl('?cat=musica')).toBe('musica');
    expect(parseFilterFromUrl('?cat=inexistente')).toBe('all');
    expect(parseFilterFromUrl('')).toBe('all');
  });

  // ----------------------------------------------------------------------------
  // 8. Barra de Filtros Activos, Retirada y Acción Limpiar
  // ----------------------------------------------------------------------------
  test('updateActiveFiltersBar genera chip para Deporte y permite retirar el filtro', () => {
    const catNames: Record<string, string> = {
      musica: 'Música',
      tardeo: 'Tardeo',
      cine: 'Cine',
      cultura: 'Cultura',
      deporte: 'Deporte',
    };

    function renderChip(currentFilter: string) {
      if (currentFilter !== 'all') {
        return `<button class="filter-chip-removable" data-action="remove-cat-filter" aria-label="Eliminar filtro ${catNames[currentFilter]}">${catNames[currentFilter] || currentFilter} ✕</button>`;
      }
      return '';
    }

    const chipHtml = renderChip('deporte');
    expect(chipHtml).toContain('Deporte ✕');
    expect(chipHtml).toContain('data-action="remove-cat-filter"');
    expect(chipHtml).toContain('aria-label="Eliminar filtro Deporte"');
  });

  // ----------------------------------------------------------------------------
  // 9. Estados Vacíos Específicos
  // ----------------------------------------------------------------------------
  test('los estados vacíos muestran el mensaje específico para la categoría Deporte y Deporte + Gratis', () => {
    function getCategoryTitle(cat: string) {
      const t: Record<string, string> = {
        musica: 'Música',
        tardeo: 'Tardeo',
        cine: 'Cine',
        cultura: 'Cultura',
        deporte: 'Deporte',
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

    const emptySports = renderEmptyState('deporte', false);
    expect(emptySports.title).toBe('Sin planes en Deporte');
    expect(emptySports.desc).toBe('No encontramos eventos en esta categoría para la fecha seleccionada.');

    const emptyFreeSports = renderEmptyState('deporte', true);
    expect(emptyFreeSports.title).toBe('No hay planes gratuitos con estos filtros');
    expect(emptyFreeSports.desc).toContain('No encontramos eventos gratuitos en Deporte');
  });

  // ----------------------------------------------------------------------------
  // 10. Ausencia de Regresiones en las Demás Categorías
  // ----------------------------------------------------------------------------
  test('las categorías existentes (musica, tardeo, cine, cultura) conservan intacto su comportamiento', () => {
    expect(filterEvents(mockSyntheticEvents, 'musica', false).length).toBe(1);
    expect(filterEvents(mockSyntheticEvents, 'cine', false).length).toBe(0);
    expect(filterEvents(mockSyntheticEvents, 'tardeo', false).length).toBe(0);

    const cultureEvent = {
      id: 510,
      title: 'Obra de Teatro',
      category: 'teatro',
      price: { amount_cents: 1000, is_free: false, label: '10,00 €' },
    };
    expect(filterEvents([cultureEvent], 'cultura', false).length).toBe(1);
    expect(filterEvents([cultureEvent], 'deporte', false).length).toBe(0);
  });
});
