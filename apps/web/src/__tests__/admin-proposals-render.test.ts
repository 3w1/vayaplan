import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml, isContinuousProposal } from '../admin';
import { extractExecutableInlineScripts } from './admin-script-syntax.test';

describe('apps/web — Renderizado de Propuestas en Admin (admin.ts)', () => {
  test('isContinuousProposal detecta correctamente clasificación EVENTO_CONTINUO o rango de fechas', () => {
    expect(isContinuousProposal({ classification: 'EVENTO_CONTINUO' })).toBe(true);
    expect(isContinuousProposal({ classification: 'EVENTO_POSIBLE', proposed_date: '2026-10-01', proposed_end_date: '2026-10-30' })).toBe(true);
    expect(isContinuousProposal({ classification: 'EVENTO_POSIBLE', proposed_date: '2026-10-01', proposed_end_date: '2026-10-01' })).toBe(false);
    expect(isContinuousProposal({ classification: 'EVENTO_POSIBLE', proposed_date: '2026-10-01', proposed_end_date: null })).toBe(false);
    expect(isContinuousProposal(null)).toBe(false);
    expect(isContinuousProposal(undefined)).toBe(false);
  });

  test('loadProposals y renderProposalsList ejecutan sin ReferenceError y renderizan propuesta continua #21 y estándar #11', async () => {
    const html = renderAdminHtml();
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('window.renderProposalsList'));
    expect(mainScript).toBeDefined();

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'proposal-filter-status': { value: 'pending' },
      'proposal-filter-venue': { value: '' },
      'proposal-filter-category': { value: '' },
      'proposal-filter-price-status': { value: '' },
      'proposal-filter-confidence': { value: '' },
      'proposal-filter-date': { value: '' },
      'proposal-filter-clear-all': { style: {} },
      'approve-prop-continuous-badge': { style: {} },
      'approve-prop-continuous-text': { innerText: '' },
      'approve-prop-time-hint': { innerText: '', style: {} },
      'approve-prop-id': { value: '' },
      'approve-prop-title-input': { value: '' },
      'approve-prop-desc-input': { value: '' },
      'approve-prop-venue-select': { value: '' },
      'approve-prop-venue-static-container': { style: {} },
      'approve-prop-venue-static-name': { innerText: '' },
      'approve-prop-date-input': { value: '' },
      'approve-prop-end-date-input': { value: '' },
      'approve-prop-time-input': { value: '', disabled: false, placeholder: '', required: false },
      'approve-prop-end-time-input': { value: '', disabled: false, placeholder: '', required: false },
      'approve-prop-category-select': { value: '' },
      'approve-prop-price-status-select': { value: '' },
      'approve-prop-price-input': { value: '' },
      'approve-prop-price-note-input': { value: '' },
      'approve-prop-img-input': { value: '' },
      'approve-prop-img-preview': { src: '', style: {} },
      'approve-prop-meta-source': { innerText: '' },
      'approve-prop-error': { style: {}, innerText: '' },
      'approve-prop-duplicate-alert': { style: {}, innerHTML: '' },
      'approve-prop-submit-btn': { disabled: false, innerText: '' },
      'prop-tab-all': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-events': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-no-time': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-duplicates': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-venue-content': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-continuous': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-ateneo': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-archived': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-count-all': { innerText: '' },
      'prop-tab-count-events': { innerText: '' },
      'prop-tab-count-no-time': { innerText: '' },
      'prop-tab-count-duplicates': { innerText: '' },
      'prop-tab-count-venue-content': { innerText: '' },
      'prop-tab-count-continuous': { innerText: '' },
      'prop-tab-count-ateneo': { innerText: '' },
      'prop-tab-count-archived': { innerText: '' },
    };

    const mockProposals = [
      {
        id: 21,
        venue_id: 10149,
        venue_name: 'Ateneo de Palencia',
        title: 'Exposición de Antonio Capel',
        description: 'Muestra de pintura realista y bodegones del maestro Antonio Capel.',
        proposed_date: '2026-10-01',
        proposed_end_date: '2026-10-30',
        proposed_time: '08:00',
        proposed_end_time: '18:00',
        category: 'arte_cultura',
        image_url: 'https://media.vayaplan.com/ateneo/capel.jpg',
        classification: 'EVENTO_CONTINUO',
        confidence_score: 95,
        review_status: 'pending',
        source_type: 'WEB_PROGRAMACION',
        source_url: 'https://ateneopalencia.com/evento/capel',
        price: null,
        price_status: 'NOT_INFORMED',
        price_note: null,
      },
      {
        id: 11,
        venue_id: 10001,
        venue_name: 'Bar Central',
        title: 'Concierto Acústico',
        description: 'Música en vivo',
        proposed_date: '2026-10-25',
        proposed_end_date: null,
        proposed_time: '20:30',
        proposed_end_time: null,
        category: 'musica_en_vivo',
        image_url: null,
        classification: 'EVENTO_POSIBLE',
        confidence_score: 90,
        review_status: 'pending',
        source_type: 'INSTAGRAM_POST',
        source_url: null,
        price: 0,
        price_status: 'UNKNOWN',
        price_note: null,
      },
    ];

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ proposals: mockProposals }),
      }),
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              value: '',
              innerText: '',
              innerHTML: '',
              style: {},
              classList: { add: () => {}, remove: () => {} },
              querySelector: () => null,
              querySelectorAll: () => [],
            };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
      },
      localStorage: {
        getItem: () => 'valid-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
      alert: () => {},
      openModal: () => {},
      closeModal: () => {},
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
      apiFetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ proposals: mockProposals }),
      }),
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    expect(typeof ctx.isContinuousProposal).toBe('function');
    expect(typeof ctx.window.loadAdminProposals).toBe('function');
    expect(typeof ctx.window.switchProposalTab).toBe('function');
    expect(typeof ctx.window.renderProposalsList).toBe('function');

    // Cargar propuestas
    await ctx.window.loadAdminProposals();

    // Comprobar que no hay mensajes de error en cards
    expect(domElements['proposals-cards-container'].innerHTML).not.toContain('Error al cargar propuestas');

    // 1. Pestaña inicial 'all'
    const cardsHtmlAll = domElements['proposals-cards-container'].innerHTML;

    expect(cardsHtmlAll).toContain('Exposición de Antonio Capel');
    expect(cardsHtmlAll).toContain('Del 2026-10-01 al 2026-10-30');
    expect(cardsHtmlAll).toContain('De 08:00 a 18:00');
    expect(cardsHtmlAll).toContain('No informado');
    expect(cardsHtmlAll).toContain('✓ Aprobar Borrador');

    // 2. Cambiar a pestaña 'continuous'
    ctx.window.switchProposalTab('continuous');
    expect(domElements['proposals-cards-container'].innerHTML).toContain('Exposición de Antonio Capel');
    expect(domElements['proposals-cards-container'].innerHTML).not.toContain('Concierto Acústico');

    // 3. Cambiar a pestaña 'ateneo'
    ctx.window.switchProposalTab('ateneo');
    expect(domElements['proposals-cards-container'].innerHTML).toContain('Exposición de Antonio Capel');
    expect(domElements['proposals-cards-container'].innerHTML).not.toContain('Concierto Acústico');

    // 4. Cambiar a pestaña 'events'
    ctx.window.switchProposalTab('events');
    expect(domElements['proposals-cards-container'].innerHTML).not.toContain('Exposición de Antonio Capel');
    expect(domElements['proposals-cards-container'].innerHTML).toContain('Concierto Acústico');

    // 5. Modal de aprobación con propuesta #21 no lanza ReferenceError y rellena campos
    expect(() => ctx.openApproveProposalModal(21)).not.toThrow();
    expect(domElements['approve-prop-title-input'].value).toBe('Exposición de Antonio Capel');
    expect(domElements['approve-prop-date-input'].value).toBe('2026-10-01');
    expect(domElements['approve-prop-end-date-input'].value).toBe('2026-10-30');
    expect(domElements['approve-prop-time-input'].value).toBe('08:00');
    expect(domElements['approve-prop-end-time-input'].value).toBe('18:00');
    expect(domElements['approve-prop-price-status-select'].value).toBe('NOT_INFORMED');

    // 6. Modal de aprobación con propuesta puntual #11
    expect(() => ctx.openApproveProposalModal(11)).not.toThrow();
    expect(domElements['approve-prop-title-input'].value).toBe('Concierto Acústico');
    expect(domElements['approve-prop-date-input'].value).toBe('2026-10-25');
    expect(domElements['approve-prop-time-input'].value).toBe('20:30');

    // 7. Rediseño editorial: lista compacta, acción principal ✏️ Revisar y menú secundario •••
    expect(cardsHtmlAll).toContain('prop-item-21');
    expect(cardsHtmlAll).toContain('openEditProposalModal(21)');
    expect(cardsHtmlAll).toContain('✏️ Revisar');
    expect(cardsHtmlAll).toContain('btn-menu-trigger');
    expect(cardsHtmlAll).toContain('toggleProposalActionsMenu(21, event)');

    // 8. Visor de imagen para propuestas
    expect(typeof ctx.openProposalImageModal).toBe('function');
    let openedModalId = '';
    ctx.openModal = (id: string) => { openedModalId = id; };
    ctx.openProposalImageModal(21);
    expect(openedModalId).toBe('modal-proposal-image');
    expect(domElements['modal-prop-img-element'].src).toBe('https://media.vayaplan.com/ateneo/capel.jpg');
    expect(domElements['modal-prop-img-title'].textContent).toBe('Cartel: Exposición de Antonio Capel');

    // 9. Alternancia del menú secundario de acciones
    expect(typeof ctx.toggleProposalActionsMenu).toBe('function');
    expect(typeof ctx.closeAllProposalActionMenus).toBe('function');
    const mockEvent = { stopPropagation: () => {} };
    ctx.toggleProposalActionsMenu(21, mockEvent);
    expect(ctx.activeProposalOpenMenuId).toBe(21);
    expect(domElements['prop-menu-dropdown-21'].style.display).toBe('flex');
    ctx.closeAllProposalActionMenus();
    expect(ctx.activeProposalOpenMenuId).toBeNull();
    expect(domElements['prop-menu-dropdown-21'].style.display).toBe('none');

    // 10. Navegación por pestañas de estado (Pendientes, Resueltas, Todas)
    expect(typeof ctx.switchProposalStateTab).toBe('function');
    ctx.switchProposalStateTab('resolved');
    expect(ctx.currentProposalStateTab).toBe('resolved');
    ctx.switchProposalStateTab('pending');
    expect(ctx.currentProposalStateTab).toBe('pending');
  });
});
