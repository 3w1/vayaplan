import { describe, expect, test } from 'bun:test';
import { VALID_VENUE_CATEGORIES, VENUE_CATEGORY_LABELS } from '@vayaplan/shared';
import { renderAdminHtml, renderVenueCategorySelectOptions } from '../admin';

describe('apps/web — Catálogo de Categorías de Venues en Admin (admin.ts)', () => {
  test('renderVenueCategorySelectOptions genera exactamente las opciones de VALID_VENUE_CATEGORIES', () => {
    const html = renderVenueCategorySelectOptions('— Selecciona —');
    expect(html).toContain('<option value="">— Selecciona —</option>');

    for (const cat of VALID_VENUE_CATEGORIES) {
      const label = VENUE_CATEGORY_LABELS[cat];
      expect(html).toContain(`<option value="${cat}">${label}</option>`);
    }

    // Comprueba que 'restaurante' está presente con etiqueta 'Restaurante'
    expect(html).toContain('<option value="restaurante">Restaurante</option>');

    // Comprueba que no genera opciones arbitrarias ajenas al catálogo
    expect(html).not.toContain('cafeteria');
    expect(html).not.toContain('gasolinera');
    expect(html).not.toContain('musica_directo'); // categoría de eventos, no de venues
  });

  test('renderAdminHtml genera los selectores de venues a partir del catálogo compartido', () => {
    const adminHtml = renderAdminHtml();

    // 1. Selector del modal de local (#venue-category)
    expect(adminHtml).toContain('id="venue-category"');
    expect(adminHtml).toContain('<option value="">— Selecciona una categoría —</option>');

    // 2. Selector de filtro de reasignación (#reassign-filter-category)
    expect(adminHtml).toContain('id="reassign-filter-category"');
    expect(adminHtml).toContain('<option value="">Todas las categorías</option>');

    // 3. Ambas listas contienen todas las categorías del catálogo compartido
    for (const cat of VALID_VENUE_CATEGORIES) {
      const label = VENUE_CATEGORY_LABELS[cat];
      const optionSnippet = `<option value="${cat}">${label}</option>`;
      // Debe aparecer al menos dos veces (modal + filtro de reasignación)
      const occurrences = adminHtml.split(optionSnippet).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }

    // 4. 'restaurante' está presente en ambos selects
    expect(adminHtml).toContain('<option value="restaurante">Restaurante</option>');
  });
});
