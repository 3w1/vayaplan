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

  test('renderAdminHtml estructura el modal de venues con zona única de scroll y bloqueo de fondo', () => {
    const adminHtml = renderAdminHtml();

    // 1. Ausencia del estilo inline de scroll anidado en el modal-body de venues
    expect(adminHtml).not.toContain('style="max-height: 75vh; overflow-y: auto; padding-right: 0.5rem;"');

    // 2. Presencia de reglas CSS para modal de venues con contención y zona única
    expect(adminHtml).toContain('#modal-venue .modal-card');
    expect(adminHtml).toContain('#modal-venue #form-venue');
    expect(adminHtml).toContain('#modal-venue .modal-body');

    // 3. Bloqueo de desplazamiento del fondo
    expect(adminHtml).toContain('body.modal-open');
    expect(adminHtml).toContain('body:has(.modal-overlay.active)');
  });
});
