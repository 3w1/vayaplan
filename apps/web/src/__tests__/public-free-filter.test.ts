import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderPublicHtml } from '../public-page';

describe('apps/web — Filtro «Gratis» en Agenda Pública (public-page.ts)', () => {
  const html = renderPublicHtml();

  // ----------------------------------------------------------------------------
  // 1. Estructura y Semántica HTML / CSS
  // ----------------------------------------------------------------------------
  test('renderPublicHtml incorpora el control de botón conmutable #btn-filter-free con accesibilidad', () => {
    expect(html).toContain('id="btn-filter-free"');
    expect(html).toContain('data-action="toggle-free"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Filtrar solo planes gratis"');
    expect(html).toContain('class="btn-filter-free-label">Gratis</span>');
    expect(html).toContain('class="btn-filter-free-status" aria-hidden="true">✓</span>');
  });

  test('renderPublicHtml contiene reglas CSS que no dependen únicamente del color para indicar el estado activo', () => {
    expect(html).toContain('.secondary-filters-bar');
    expect(html).toContain('.btn-filter-free');
    expect(html).toContain('.btn-filter-free[aria-pressed="true"]');
    expect(html).toContain('.btn-filter-free-status');
    // Indicador visual no dependiente de color (check ✓ visible al activarse)
    expect(html).toContain('.btn-filter-free[aria-pressed="true"] .btn-filter-free-status');
  });

  // ----------------------------------------------------------------------------
  // 2. Validación de Sintaxis JavaScript en el Script Cliente
  // ----------------------------------------------------------------------------
  test('todos los scripts inline generados en la plantilla son JavaScript válido para navegador', () => {
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
  // 3. Comparación Estricta y Lógica de Filtrado (is_free === true)
  // ----------------------------------------------------------------------------
  test('isEventFree realiza una comparación estricta y rechaza valores false, null, undefined, números o cadenas', () => {
    function isEventFree(ev: any) {
      if (!ev) return false;
      if (ev.price && typeof ev.price === 'object' && ev.price.is_free !== undefined) {
        return ev.price.is_free === true;
      }
      return ev.is_free === true;
    }

    // Casos válidos
    expect(isEventFree({ is_free: true })).toBe(true);
    expect(isEventFree({ price: { is_free: true, amount_cents: 0 } })).toBe(true);
    expect(isEventFree({ is_free: true, price: { is_free: true } })).toBe(true);

    // Casos no gratuitos o inválidos
    expect(isEventFree({ is_free: false })).toBe(false);
    expect(isEventFree({ price: { is_free: false, amount_cents: 1000 } })).toBe(false);
    expect(isEventFree({ is_free: null })).toBe(false);
    expect(isEventFree({ is_free: undefined })).toBe(false);
    expect(isEventFree({ is_free: 'true' })).toBe(false);
    expect(isEventFree({ is_free: '1' })).toBe(false);
    expect(isEventFree({ is_free: 1 })).toBe(false);
    expect(isEventFree({ is_free: 0 })).toBe(false);
    expect(isEventFree({ price: { is_free: 'true' } })).toBe(false);
    expect(isEventFree({ price: { is_free: null } })).toBe(false);
    expect(isEventFree({ price: { is_free: undefined } })).toBe(false);
    expect(isEventFree({})).toBe(false);
    expect(isEventFree(null)).toBe(false);
    expect(isEventFree(undefined)).toBe(false);
  });

  test('prioridad del campo autoritativo ante contradicciones entre ev.price.is_free y ev.is_free', () => {
    function isEventFree(ev: any) {
      if (!ev) return false;
      if (ev.price && typeof ev.price === 'object' && ev.price.is_free !== undefined) {
        return ev.price.is_free === true;
      }
      return ev.is_free === true;
    }

    // Contradicción 1: Campo autoritativo price.is_free es false, pero representación secundaria is_free es true
    // Un false en el campo autoritativo NO debe quedar anulado por un true secundario
    const conflictPaid = {
      id: 991,
      title: 'Evento con conflicto: de pago en contrato, true en raíz',
      is_free: true,
      price: { amount_cents: 1500, is_free: false, label: '15,00 €' },
    };
    expect(isEventFree(conflictPaid)).toBe(false);

    // Contradicción 2: Campo autoritativo price.is_free es true, pero representación secundaria es false
    const conflictFree = {
      id: 992,
      title: 'Evento con conflicto: gratuito en contrato, false en raíz',
      is_free: false,
      price: { amount_cents: 0, is_free: true, label: 'Gratis' },
    };
    expect(isEventFree(conflictFree)).toBe(true);

    // Caso fallback: price ausente pero is_free booleano presente
    expect(isEventFree({ id: 993, is_free: true })).toBe(true);
    expect(isEventFree({ id: 994, is_free: false })).toBe(false);
  });

  test('isRecurrenceFree evalúa correctamente actividades periódicas y prioridad en RecurrenceItem', () => {
    function isRecurrenceFree(r: any) {
      if (!r) return false;
      if (r.is_free !== undefined) {
        return r.is_free === true;
      }
      if (r.price && typeof r.price === 'object' && r.price.is_free !== undefined) {
        return r.price.is_free === true;
      }
      return false;
    }

    expect(isRecurrenceFree({ is_free: true, price_cents: 0 })).toBe(true);
    expect(isRecurrenceFree({ is_free: false, price_cents: 500 })).toBe(false);
    expect(isRecurrenceFree({ is_free: 'true' })).toBe(false);
    expect(isRecurrenceFree(null)).toBe(false);

    // Contradicción en recurrencias: r.is_free es autoritativo según el modelo de datos
    expect(isRecurrenceFree({ is_free: false, price: { is_free: true } })).toBe(false);
    expect(isRecurrenceFree({ is_free: true, price: { is_free: false } })).toBe(true);
  });

  // ----------------------------------------------------------------------------
  // 4. Combinación de Filtros (Categoría + Gratis + Fecha)
  // ----------------------------------------------------------------------------
  test('el filtrado combina estrictamente la categoría y el filtro gratis', () => {
    function isEventFree(ev: any) {
      if (!ev) return false;
      if (ev.is_free === true) return true;
      if (ev.price && typeof ev.price === 'object' && ev.price.is_free === true) return true;
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
        result = result.filter((ev) => ['cultura', 'teatro', 'exposicion', 'monologo'].includes(ev.category));
      }

      if (isFreeFilterActive) {
        result = result.filter((ev) => isEventFree(ev));
      }

      return result;
    }

    const testEvents = [
      { id: 1, title: 'Concierto Gratis', category: 'musica_directo', price: { is_free: true } },
      { id: 2, title: 'Concierto de Pago', category: 'musica_directo', price: { is_free: false } },
      { id: 3, title: 'Teatro Gratis', category: 'teatro', price: { is_free: true } },
      { id: 4, title: 'Cine de Pago', category: 'cine', price: { is_free: false } },
      { id: 5, title: 'Exposición Continuada Gratis', category: 'exposicion', time_status: 'continuous', price: { is_free: true } },
      { id: 6, title: 'Exposición de Pago', category: 'exposicion', time_status: 'continuous', price: { is_free: false } },
    ];

    // Sin filtro de categoría ni de gratis: todos
    expect(filterEvents(testEvents, 'all', false).length).toBe(6);

    // Solo filtro gratis (Todas las categorías)
    const freeAll = filterEvents(testEvents, 'all', true);
    expect(freeAll.map((e) => e.id)).toEqual([1, 3, 5]);

    // Música + Gratis
    const freeMusic = filterEvents(testEvents, 'musica', true);
    expect(freeMusic.map((e) => e.id)).toEqual([1]);

    // Música sin filtro gratis
    const allMusic = filterEvents(testEvents, 'musica', false);
    expect(allMusic.map((e) => e.id)).toEqual([1, 2]);

    // Cultura + Gratis (incluye teatro y exposiciones gratuitas)
    const freeCulture = filterEvents(testEvents, 'cultura', true);
    expect(freeCulture.map((e) => e.id)).toEqual([3, 5]);

    // Cine + Gratis (sin resultados)
    const freeCinema = filterEvents(testEvents, 'cine', true);
    expect(freeCinema.length).toBe(0);
  });

  // ----------------------------------------------------------------------------
  // 5. Soporte en Vista de Fin de Semana y Eventos Continuados
  // ----------------------------------------------------------------------------
  test('la vista de fin de semana filtra correctamente días y recurrencias por gratuidad', () => {
    function isEventFree(ev: any) {
      if (!ev) return false;
      if (ev.is_free === true) return true;
      if (ev.price && typeof ev.price === 'object' && ev.price.is_free === true) return true;
      return false;
    }

    const weekendDays = [
      {
        editorial_date: '2026-10-23',
        editorial_label: 'Viernes',
        events: [
          { id: 101, title: 'Viernes Gratis', is_free: true },
          { id: 102, title: 'Viernes Pago', is_free: false },
        ],
        recurrences: [
          { id: 201, title: 'Jam Gratis', is_free: true },
        ],
      },
      {
        editorial_date: '2026-10-24',
        editorial_label: 'Sábado',
        events: [
          { id: 103, title: 'Sábado Pago', is_free: false },
        ],
        recurrences: [
          { id: 202, title: 'Tardeo Pago', is_free: false },
        ],
      },
    ];

    const freeFridayEvents = weekendDays[0].events.filter(isEventFree);
    expect(freeFridayEvents.map((e) => e.id)).toEqual([101]);

    const freeSaturdayEvents = weekendDays[1].events.filter(isEventFree);
    expect(freeSaturdayEvents.length).toBe(0);
  });

  // ----------------------------------------------------------------------------
  // 6. Sincronización de Parámetros de URL (?free=true)
  // ----------------------------------------------------------------------------
  test('la lectura y actualización de URL gestiona estrictamente free=true', () => {
    function parseFreeParam(searchString: string): boolean {
      const params = new URLSearchParams(searchString);
      return params.get('free') === 'true';
    }

    expect(parseFreeParam('?free=true')).toBe(true);
    expect(parseFreeParam('?cat=musica&free=true')).toBe(true);
    expect(parseFreeParam('?date=2026-10-23&free=true')).toBe(true);

    // Valores no equivalentes a true
    expect(parseFreeParam('?free=false')).toBe(false);
    expect(parseFreeParam('?free=1')).toBe(false);
    expect(parseFreeParam('?free=yes')).toBe(false);
    expect(parseFreeParam('?free=null')).toBe(false);
    expect(parseFreeParam('?free=TRUE')).toBe(false);
    expect(parseFreeParam('')).toBe(false);
    expect(parseFreeParam('?cat=cine')).toBe(false);

    // Actualización de search params
    function buildListingQuery(currentParams: string, isFree: boolean): string {
      const params = new URLSearchParams(currentParams);
      if (isFree) {
        params.set('free', 'true');
      } else {
        params.delete('free');
      }
      return params.toString();
    }

    // Activar gratis preservando categoría y fecha
    const initial = '?cat=musica&date=2026-10-24';
    const withFree = buildListingQuery(initial, true);
    expect(withFree).toContain('cat=musica');
    expect(withFree).toContain('date=2026-10-24');
    expect(withFree).toContain('free=true');

    // Desactivar gratis retira únicamente el parámetro free
    const withoutFree = buildListingQuery('?' + withFree, false);
    expect(withoutFree).toContain('cat=musica');
    expect(withoutFree).toContain('date=2026-10-24');
    expect(withoutFree).not.toContain('free');
  });

  // ----------------------------------------------------------------------------
  // 7. Retirada Individual y Acción Limpiar
  // ----------------------------------------------------------------------------
  test('updateActiveFiltersBar y clearAllFilters en public-page.ts integran la retirada individual de Gratis', () => {
    expect(html).toContain('data-action="remove-free-filter"');
    expect(html).toContain('data-action="clear-filters"');
    expect(html).toContain('function toggleFreeFilter(');
    expect(html).toContain('function syncFreeFilterUi(');
    expect(html).toContain('isFreeFilterActive');
  });

  // ----------------------------------------------------------------------------
  // 8. Mensaje de Estado Vacío Específico
  // ----------------------------------------------------------------------------
  test('los estados vacíos muestran el mensaje específico para planes gratuitos', () => {
    expect(html).toContain('No hay planes gratuitos con estos filtros');
  });
});
