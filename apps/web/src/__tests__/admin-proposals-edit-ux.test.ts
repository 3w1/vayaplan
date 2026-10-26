import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';
import { extractExecutableInlineScripts } from './admin-script-syntax.test';

describe('apps/web — UX de Edición Manual de Propuestas (admin.ts)', () => {
  function setupTestContext(mockProposals: any[], apiResponses: Record<string, any> = {}) {
    const html = renderAdminHtml();
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('window.renderProposalsList'));
    expect(mainScript).toBeDefined();

    const domElements: Record<string, any> = {
      'proposals-tbody': { innerHTML: '' },
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'proposal-filter-status': { value: 'pending' },
      'proposal-filter-venue': { value: '' },
      'proposal-filter-category': { value: '' },
      'proposal-filter-price-status': { value: '' },
      'proposal-filter-confidence': { value: '' },
      'proposal-filter-date': { value: '' },
      'proposal-filter-clear-all': { style: {} },
      'prop-tab-all': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-count-all': { innerText: '' },

      // Modal de edición de propuesta
      'modal-edit-proposal': { style: {} },
      'edit-prop-id': { value: '' },
      'edit-prop-error': { style: { display: 'none' }, innerText: '' },
      'edit-prop-title-input': { value: '' },
      'edit-prop-classification-select': { value: '' },
      'edit-prop-date-input': { value: '' },
      'edit-prop-end-date-input': { value: '' },
      'edit-prop-time-input': { value: '' },
      'edit-prop-end-time-input': { value: '' },
      'edit-prop-venue-select': { value: '' },
      'edit-prop-category-select': { value: '' },
      'edit-prop-price-status-select': { value: '' },
      'edit-prop-price-amount-container': { style: { display: 'none' } },
      'edit-prop-price-input': { value: '' },
      'edit-prop-price-note-input': { value: '' },
      'edit-prop-img-preview': { src: '', style: { display: 'none' } },
      'edit-prop-img-placeholder': { style: { display: 'none' }, innerText: '' },
      'edit-prop-meta-source': { innerText: '' },
      'edit-prop-meta-user': { innerText: '' },
      'edit-prop-meta-conf': { innerText: '', className: '' },
      'edit-prop-meta-reasons': { innerText: '' },
      'edit-prop-meta-link': { href: '', style: {} },
      'edit-prop-original-caption': { innerText: '' },
      'btn-submit-edit-prop': { disabled: false, innerText: '' },

      // Modal de ver caption
      'modal-proposal-caption': { style: {} },
      'modal-caption-prop-body': { innerHTML: '' },
      'modal-caption-prop-footer': { innerHTML: '' },
    };

    const alerts: string[] = [];
    const openedModals: string[] = [];
    const closedModals: string[] = [];
    const apiCalls: { url: string; options?: any }[] = [];

    const sandbox: any = {
      window: {},
      URLSearchParams,
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {};
          }
          const el = domElements[id];
          if (!el.classList) {
            el.classList = {
              add: (cls: string) => {
                if (cls === 'active') openedModals.push(id);
              },
              remove: (cls: string) => {
                if (cls === 'active') closedModals.push(id);
              },
            };
          }
          if (!el.querySelectorAll) el.querySelectorAll = () => [];
          if (!el.querySelector) el.querySelector = () => null;
          if (!el.focus) el.focus = () => {};
          if (!el.style) el.style = {};
          if (el.value === undefined) el.value = '';
          if (el.innerText === undefined) el.innerText = '';
          if (el.innerHTML === undefined) el.innerHTML = '';
          return el;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} }, focus: () => {} },
        addEventListener: () => {},
      },
      localStorage: {
        getItem: () => 'valid-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: (msg: string) => { alerts.push(msg); },
      openModal: (modalId: string) => { openedModals.push(modalId); },
      closeModal: (modalId: string) => { closedModals.push(modalId); },
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
      fetch: async (url: string, options?: any) => {
        apiCalls.push({ url, options });
        if (url.includes('/api/v1/admin/proposals?review_status=pending')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ proposals: mockProposals }),
          };
        }
        if (apiResponses[url]) {
          return apiResponses[url](options);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Operación simulada con éxito' }),
        };
      },
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    return { ctx, domElements, alerts, openedModals, closedModals, apiCalls };
  }

  test('1. Renderiza botón "✏️ Editar" para propuestas CONTENIDO_VENUE y estándar en desktop y móvil', async () => {
    const mockProposals = [
      {
        id: 63,
        venue_id: 10161,
        venue_name: 'Asociación Cultural Terror Palencia',
        title: 'Normas de convivencia con el inframundo',
        description: null,
        proposed_date: null,
        proposed_end_date: null,
        proposed_time: null,
        category: 'cultura',
        classification: 'CONTENIDO_VENUE',
        confidence: 'BAJA',
        review_status: 'pending',
        image_url: 'https://media.vayaplan.com/bars/actpalencia/post63.jpg',
        price: null,
        price_status: 'NOT_INFORMED',
      },
      {
        id: 62,
        venue_id: 10161,
        venue_name: 'Asociación Cultural Terror Palencia',
        title: 'Presentación de Cortos de Terror',
        description: null,
        proposed_date: '2026-10-31',
        proposed_end_date: null,
        proposed_time: '20:00',
        category: 'cine',
        classification: 'EVENTO_POSIBLE',
        confidence: 'ALTA',
        review_status: 'pending',
        image_url: 'https://media.vayaplan.com/bars/actpalencia/post62.jpg',
        price: 5.0,
        price_status: 'CONFIRMED',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    const tbodyHtml = domElements['proposals-tbody'].innerHTML;
    const cardsHtml = domElements['proposals-cards-container'].innerHTML;

    // Verificar botón Editar en tabla desktop para propuesta 63 (CONTENIDO_VENUE)
    expect(tbodyHtml).toContain("openEditProposalModal(63)");
    expect(tbodyHtml).toContain("✏️ Editar");

    // Verificar botón Editar en tarjetas móvil para propuesta 63
    expect(cardsHtml).toContain("openEditProposalModal(63)");
    expect(cardsHtml).toContain("✏️ Editar");

    // Verificar que propuesta 62 también lo tiene
    expect(tbodyHtml).toContain("openEditProposalModal(62)");
    expect(cardsHtml).toContain("openEditProposalModal(62)");
  });

  test('2. openEditProposalModal precarga fielmente todos los datos de la propuesta y su caption', async () => {
    const mockProposals = [
      {
        id: 63,
        venue_id: 10161,
        venue_name: 'Asociación Cultural Terror Palencia',
        title: 'Normas de convivencia con el inframundo',
        caption: 'Texto íntegro del post de normas...',
        proposed_date: null,
        proposed_end_date: null,
        proposed_time: null,
        proposed_end_time: null,
        category: 'cultura',
        classification: 'CONTENIDO_VENUE',
        confidence: 'BAJA',
        review_status: 'pending',
        image_url: 'https://media.vayaplan.com/bars/actpalencia/post63.jpg',
        source_url: 'https://www.instagram.com/p/DB12345/',
        instagram_username: 'actpalencia',
        match_reasons: ['No date or time found', 'Atmosphere content'],
        price: null,
        price_status: 'NOT_INFORMED',
        price_note: null,
      },
    ];

    const { ctx, domElements, openedModals } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(63);

    expect(openedModals).toContain('modal-edit-proposal');
    expect(domElements['edit-prop-id'].value).toBe('63');
    expect(domElements['edit-prop-title-input'].value).toBe('Normas de convivencia con el inframundo');
    expect(domElements['edit-prop-classification-select'].value).toBe('CONTENIDO_VENUE');
    expect(domElements['edit-prop-date-input'].value).toBe('');
    expect(domElements['edit-prop-time-input'].value).toBe('');
    expect(domElements['edit-prop-venue-select'].value).toBe('10161');
    expect(domElements['edit-prop-category-select'].value).toBe('cultura');
    expect(domElements['edit-prop-price-status-select'].value).toBe('NOT_INFORMED');
    expect(domElements['edit-prop-price-amount-container'].style.display).toBe('none');
    expect(domElements['edit-prop-meta-user'].innerText).toBe('@actpalencia');
    expect(domElements['edit-prop-meta-conf'].innerText).toBe('BAJA');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('Texto íntegro del post de normas...');
  });

  test('3. submitEditProposal valida título y hora en cliente antes de enviar', async () => {
    const mockProposals = [
      {
        id: 63,
        venue_id: 10161,
        title: 'Título Inicial',
        classification: 'CONTENIDO_VENUE',
        review_status: 'pending',
      },
    ];

    const { ctx, domElements, apiCalls } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(63);

    // Caso 1: Título vacío
    domElements['edit-prop-title-input'].value = '   ';
    await ctx.window.submitEditProposal();
    expect(domElements['edit-prop-error'].style.display).toBe('block');
    expect(domElements['edit-prop-error'].innerText).toContain('título');
    expect(apiCalls.filter(c => c.options?.method === 'PATCH').length).toBe(0);

    // Caso 2: Hora inválida
    domElements['edit-prop-title-input'].value = 'Título Válido';
    domElements['edit-prop-time-input'].value = '25:70';
    await ctx.window.submitEditProposal();
    expect(domElements['edit-prop-error'].style.display).toBe('block');
    expect(domElements['edit-prop-error'].innerText).toContain('formato de hora');
    expect(apiCalls.filter(c => c.options?.method === 'PATCH').length).toBe(0);
  });

  test('4. submitEditProposal envía PATCH con datos limpios, cierra modal y recarga lista', async () => {
    const mockProposals = [
      {
        id: 63,
        venue_id: 10161,
        title: 'Normas',
        classification: 'CONTENIDO_VENUE',
        review_status: 'pending',
      },
    ];

    let patchPayload: any = null;
    const apiResponses = {
      '/api/v1/admin/proposals/63': (options: any) => {
        patchPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Propuesta editada con éxito.' }),
        };
      },
    };

    const { ctx, domElements, alerts, closedModals } = setupTestContext(mockProposals, apiResponses);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(63);

    // Modificar datos: reclasificar a EVENTO_POSIBLE y fijar fecha y hora
    domElements['edit-prop-title-input'].value = 'Pase Especial de Terror';
    domElements['edit-prop-classification-select'].value = 'EVENTO_POSIBLE';
    domElements['edit-prop-date-input'].value = '2026-10-31';
    domElements['edit-prop-time-input'].value = '22:00';
    domElements['edit-prop-category-select'].value = 'cine';
    domElements['edit-prop-price-status-select'].value = 'FREE';

    await ctx.window.submitEditProposal();

    expect(patchPayload).not.toBeNull();
    expect(patchPayload.title).toBe('Pase Especial de Terror');
    expect(patchPayload.classification).toBe('EVENTO_POSIBLE');
    expect(patchPayload.proposed_date).toBe('2026-10-31');
    expect(patchPayload.proposed_time).toBe('22:00');
    expect(patchPayload.category).toBe('cine');
    expect(patchPayload.price_status).toBe('FREE');
    expect(patchPayload.price).toBe(0);

    // No envía campos de metadata interna que sobreescriban auditoría
    expect(patchPayload.confidence).toBeUndefined();
    expect(patchPayload.review_status).toBeUndefined();

    expect(closedModals).toContain('modal-edit-proposal');
    expect(alerts.some(a => a.includes('Propuesta editada con éxito'))).toBe(true);
  });

  test('5. openProposalCaptionModal incluye botón "✏️ Editar Propuesta" en su pie si la propuesta está pendiente', async () => {
    const mockProposals = [
      {
        id: 63,
        venue_id: 10161,
        title: 'Normas de convivencia',
        classification: 'CONTENIDO_VENUE',
        review_status: 'pending',
        image_url: 'https://media.vayaplan.com/bars/actpalencia/post63.jpg',
      },
      {
        id: 50,
        venue_id: 10001,
        title: 'Evento Ya Aprobado',
        classification: 'EVENTO_POSIBLE',
        review_status: 'approved',
        image_url: 'https://media.vayaplan.com/bars/central/post50.jpg',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    // Propuesta pendiente #63
    ctx.window.openProposalCaptionModal(63);
    const footerPending = domElements['modal-caption-prop-footer'].innerHTML;
    expect(footerPending).toContain('✏️ Editar Propuesta');
    expect(footerPending).toContain('openEditProposalModal(63)');

    // Propuesta ya aprobada #50
    ctx.window.openProposalCaptionModal(50);
    const footerApproved = domElements['modal-caption-prop-footer'].innerHTML;
    expect(footerApproved).not.toContain('✏️ Editar Propuesta');
    expect(footerApproved).toContain('Cerrar');
  });
});
