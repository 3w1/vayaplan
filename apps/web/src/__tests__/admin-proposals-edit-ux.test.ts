import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';

interface InlineScript {
  attrs: string;
  type: string;
  isModule: boolean;
  content: string;
}

function extractExecutableInlineScripts(html: string): InlineScript[] {
  const scripts: InlineScript[] = [];
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';
    if (attrs.includes('type="application/ld+json"')) continue;
    scripts.push({
      attrs,
      type: 'text/javascript',
      isModule: attrs.includes('type="module"'),
      content,
    });
  }
  return scripts;
}

describe('apps/web — UX de Edición Manual de Propuestas (admin.ts)', () => {
  function setupTestContext(mockProposals: any[], apiResponses: Record<string, any> = {}) {
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
      'prop-tab-all': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'prop-tab-count-all': { innerText: '' },

      // Modal de edición de propuesta
      'modal-edit-proposal': { style: {} },
      'edit-prop-id': { value: '' },
      'edit-prop-error': { style: { display: 'none' }, innerText: '' },
      'edit-prop-title-input': { value: '' },
      'edit-prop-classification-select': {
        value: '',
        options: [
          { value: 'CONTENIDO_VENUE', text: 'CONTENIDO_VENUE' },
          { value: 'EVENTO_POSIBLE', text: 'EVENTO_POSIBLE' },
          { value: 'EVENTO_POSIBLE_SIN_HORA', text: 'EVENTO_POSIBLE_SIN_HORA' },
          { value: 'EVENTO_CONTINUO', text: 'EVENTO_CONTINUO' },
          { value: 'DUPLICADO_POSIBLE', text: 'DUPLICADO_POSIBLE' },
          { value: 'SIN_MATCH', text: 'SIN_MATCH' },
          { value: 'PAST_EVENT', text: 'PAST_EVENT' },
          { value: 'PROMOCION', text: 'PROMOCION' },
          { value: 'CONTENIDO_GENERAL', text: 'CONTENIDO_GENERAL' },
          { value: 'REQUIERE_REVISION', text: 'REQUIERE_REVISION' },
          { value: 'NO_RELEVANTE', text: 'NO_RELEVANTE' },
        ],
        appendChild: function(opt: any) { this.options.push(opt); }
      },
      'edit-prop-date-input': { value: '' },
      'edit-prop-end-date-input': { value: '' },
      'edit-prop-time-input': { value: '' },
      'edit-prop-end-time-input': { value: '' },
      'edit-prop-venue-select': {
        value: '',
        options: [{ value: '', text: '—' }, { value: '10161', text: 'Local 10161' }],
        appendChild: function(opt: any) { this.options.push(opt); }
      },
      'edit-prop-category-select': {
        value: '',
        options: [
          { value: 'dj_tardeo', text: 'dj_tardeo' },
          { value: 'musica_directo', text: 'musica_directo' },
          { value: 'monologo', text: 'monologo' },
          { value: 'cine', text: 'cine' },
          { value: 'teatro', text: 'teatro' },
          { value: 'exposicion', text: 'exposicion' },
          { value: 'cultura', text: 'cultura' },
          { value: 'otros', text: 'otros' },
        ],
        appendChild: function(opt: any) { this.options.push(opt); }
      },
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
      'edit-prop-meta-link': { href: '#', style: { display: 'none' }, target: '', rel: '' },
      'edit-prop-original-caption': { innerText: '', style: { display: 'none' } },
      'edit-prop-caption-input': { value: '', style: { display: 'none' } },
      'edit-prop-caption-label': { innerText: '' },
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
      URL,
      URLSearchParams,
      document: {
        createElement: (tag: string) => ({ value: '', text: '', tagName: tag.toUpperCase() }),
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

    const cardsHtml = domElements['proposals-cards-container'].innerHTML;

    // Verificar botón Revisar / Editar en lista editorial para propuesta 63 (CONTENIDO_VENUE)
    expect(cardsHtml).toContain("openEditProposalModal(63)");
    expect(cardsHtml).toContain("title=\"✏️ Editar\"");

    // Verificar que propuesta 62 también lo tiene
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

  test('3. H-04: Preserva clasificación y categoría existentes que no estén en selectores estáticos al abrir y guardar sin cambios', async () => {
    const mockProposals = [
      {
        id: 70,
        venue_id: 10161,
        title: 'Propuesta con Valores Especiales',
        classification: 'SIN_MATCH',
        category: 'categoria_personalizada_test',
        proposed_date: '2026-11-20',
        proposed_time: '21:00',
        review_status: 'pending',
      },
    ];

    let patchPayload: any = null;
    const apiResponses = {
      '/api/v1/admin/proposals/70': (options: any) => {
        patchPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Propuesta editada con éxito.' }),
        };
      },
    };

    const { ctx, domElements } = setupTestContext(mockProposals, apiResponses);
    await ctx.window.loadAdminProposals();

    // Abrir modal
    ctx.window.openEditProposalModal(70);

    // Debe haber preservado SIN_MATCH y la categoría personalizada
    expect(domElements['edit-prop-classification-select'].value).toBe('SIN_MATCH');
    expect(domElements['edit-prop-category-select'].value).toBe('categoria_personalizada_test');

    // Guardar sin hacer modificaciones manuales
    await ctx.window.submitEditProposal();

    expect(patchPayload).not.toBeNull();
    expect(patchPayload.classification).toBe('SIN_MATCH');
    expect(patchPayload.category).toBe('categoria_personalizada_test');
    expect(patchPayload.proposed_date).toBe('2026-11-20');
    expect(patchPayload.proposed_time).toBe('21:00');
  });

  test('4. H-04: Validación de protocolo seguro en enlace externo, limpiando y ocultando ante javascript: o URLs malformadas', async () => {
    const mockProposals = [
      {
        id: 81,
        venue_id: 10161,
        title: 'Propuesta con URL Maliciosa',
        source_url: 'javascript:alert(1)',
        review_status: 'pending',
      },
      {
        id: 82,
        venue_id: 10161,
        title: 'Propuesta con URL Válida',
        source_url: 'https://www.instagram.com/p/valida123/',
        review_status: 'pending',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    // 1. Abrir primero propuesta con URL válida
    ctx.window.openEditProposalModal(82);
    expect(domElements['edit-prop-meta-link'].style.display).toBe('inline-block');
    expect(domElements['edit-prop-meta-link'].href).toBe('https://www.instagram.com/p/valida123/');
    expect(domElements['edit-prop-meta-link'].target).toBe('_blank');
    expect(domElements['edit-prop-meta-link'].rel).toBe('noopener noreferrer');

    // 2. Abrir después propuesta con URL maliciosa: debe limpiarse el href a '#' y ocultarse
    ctx.window.openEditProposalModal(81);
    expect(domElements['edit-prop-meta-link'].style.display).toBe('none');
    expect(domElements['edit-prop-meta-link'].href).toBe('#');
    expect(mockProposals[0].source_url).toBe('javascript:alert(1)'); // source_url original inalterado
  });

  test('5. submitEditProposal valida título y hora en cliente antes de enviar', async () => {
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

  test('6. submitEditProposal envía PATCH con datos limpios, cierra modal y recarga lista', async () => {
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

  test('7. Error HTTP y de red: conserva íntegros todos los datos ingresados y restaura botón en finally', async () => {
    const mockProposals = [
      {
        id: 90,
        venue_id: 10161,
        title: 'Título Original',
        review_status: 'pending',
      },
    ];

    let attempts = 0;
    const apiResponses = {
      '/api/v1/admin/proposals/90': () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: 'Error interno simulado de base de datos' }),
          };
        }
        throw new Error('Fallo de conexión simulado');
      },
    };

    const { ctx, domElements, closedModals } = setupTestContext(mockProposals, apiResponses);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(90);

    // Escribir datos en el formulario
    domElements['edit-prop-title-input'].value = 'Título Modificado por Editor';
    domElements['edit-prop-date-input'].value = '2026-11-25';
    domElements['edit-prop-time-input'].value = '20:15';

    // 1. Intento 1: Error HTTP 500
    await ctx.window.submitEditProposal();

    // El modal NO debe haberse cerrado
    expect(closedModals).not.toContain('modal-edit-proposal');
    // El mensaje de error debe mostrarse
    expect(domElements['edit-prop-error'].style.display).toBe('block');
    expect(domElements['edit-prop-error'].innerText).toContain('Error interno simulado');
    // Los datos del formulario deben conservarse intactos
    expect(domElements['edit-prop-title-input'].value).toBe('Título Modificado por Editor');
    expect(domElements['edit-prop-date-input'].value).toBe('2026-11-25');
    expect(domElements['edit-prop-time-input'].value).toBe('20:15');
    // El botón debe restaurarse en finally
    expect(domElements['btn-submit-edit-prop'].disabled).toBe(false);

    // 2. Intento 2: Error de red (throw)
    await ctx.window.submitEditProposal();
    expect(closedModals).not.toContain('modal-edit-proposal');
    expect(domElements['edit-prop-error'].style.display).toBe('block');
    expect(domElements['edit-prop-error'].innerText).toContain('Error de conexión');
    // Siguen intactos
    expect(domElements['edit-prop-title-input'].value).toBe('Título Modificado por Editor');
    expect(domElements['btn-submit-edit-prop'].disabled).toBe(false);
  });

  test('8. Prevención de doble envío: bloquea segundas peticiones mientras una está en curso', async () => {
    const mockProposals = [
      {
        id: 95,
        venue_id: 10161,
        title: 'Propuesta Doble Submit',
        review_status: 'pending',
      },
    ];

    let patchCallsCount = 0;
    const apiResponses = {
      '/api/v1/admin/proposals/95': async () => {
        patchCallsCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Guardado OK' }),
        };
      },
    };

    const { ctx, domElements } = setupTestContext(mockProposals, apiResponses);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(95);
    domElements['edit-prop-title-input'].value = 'Título Único';

    // Disparar dos llamadas concurrentes
    const p1 = ctx.window.submitEditProposal();
    const p2 = ctx.window.submitEditProposal();
    await Promise.all([p1, p2]);

    // Solo debe haberse despachado 1 petición
    expect(patchCallsCount).toBe(1);
    expect(domElements['btn-submit-edit-prop'].disabled).toBe(false);
  });

  test('9. openProposalCaptionModal incluye botón "✏️ Editar Propuesta" en su pie si la propuesta está pendiente', async () => {
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

  test('10. Propuesta importada por Actor habitual: muestra único visor estático y oculta textarea', async () => {
    const mockProposals = [
      {
        id: 75,
        venue_id: 10119,
        title: 'No será una más… 🪩 — P21 Pub',
        caption: 'No será una más…. 🪩\n\nEste sábado 24 vuelvo a P21 para una tarde mágica.',
        classification: 'EVENTO_POSIBLE',
        review_status: 'pending',
        source_type: 'instagram',
        instagram_post_shortcode: 'Dez5FxJsume',
        image_url: 'https://media.vayaplan.com/bars/p21/post75.jpg',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(75);

    // Exactamente 1 control visible: el visor de solo lectura
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');

    // Contenido preservado íntegro en el visor
    expect(domElements['edit-prop-original-caption'].innerText).toContain('No será una más…. 🪩');
    expect(domElements['edit-prop-original-caption'].innerText).toContain('Este sábado 24 vuelvo a P21');
  });

  test('11. Propuesta importada por proveedor alternativo (intropix): muestra único visor con caption largo y emojis', async () => {
    const longCaption = '🍷✨ ¡Una noche para disfrutar del vino, la gastronomía y los pequeños grandes placeres!\n\n' +
      'El próximo 29 de octubre a las 20:00 h, nos unimos a Bodega Corrales Espinosa para disfrutar de una cata vertical. 🍇🍽️\n\n' +
      '📅 29 de octubre\n🕗 20:00 h\n📍 Restaurante La Traserilla · Palencia\n💶 45 € por persona\n\n⚠️ ¡Plazas limitadas!\n\n' +
      '#LaTraserilla #Palencia #CorralesEspinosa #CataDeVinos #experienciasgastronomicas';

    const mockProposals = [
      {
        id: 76,
        venue_id: 10533,
        title: 'Cata en Restaurante La Traserilla',
        caption: longCaption,
        classification: 'REQUIERE_REVISION',
        review_status: 'pending',
        source_type: 'instagram_intropix',
        instagram_post_shortcode: 'De_jb4yFX_T',
        image_url: 'https://media.vayaplan.com/bars/traserilla/post76.jpg',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(76);

    // Solo el visor está visible, textarea oculto
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');

    // Caption largo y emojis íntegros
    expect(domElements['edit-prop-original-caption'].innerText).toBe(longCaption);
    expect(domElements['edit-prop-original-caption'].innerText.length).toBe(longCaption.length);
  });

  test('12. Modo creación manual: muestra único textarea editable y oculta visor estático', async () => {
    const { ctx, domElements } = setupTestContext([]);

    ctx.window.openManualProposalModal({
      url: 'https://www.instagram.com/p/De_jb4yFX_T/',
      venue_id: 10533,
      caption: 'Texto precargado o manual para la propuesta',
    });

    // En modo manual, el textarea es el único control visible
    expect(domElements['edit-prop-caption-input'].style.display).toBe('block');
    expect(domElements['edit-prop-original-caption'].style.display).toBe('none');
    expect(domElements['edit-prop-caption-input'].value).toBe('Texto precargado o manual para la propuesta');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('');
  });

  test('13. Caption vacío o nulo en propuesta existente: visor muestra mensaje informativo y textarea oculto', async () => {
    const mockProposals = [
      {
        id: 80,
        venue_id: 10001,
        title: 'Post sin texto',
        caption: null,
        classification: 'CONTENIDO_VENUE',
        review_status: 'pending',
        source_type: 'instagram',
        image_url: 'https://media.vayaplan.com/bars/test/post80.jpg',
      },
      {
        id: 81,
        venue_id: 10001,
        title: 'Post con cadena vacía',
        caption: '',
        classification: 'CONTENIDO_VENUE',
        review_status: 'pending',
        source_type: 'instagram',
        image_url: 'https://media.vayaplan.com/bars/test/post81.jpg',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    // Propuesta con caption null
    ctx.window.openEditProposalModal(80);
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('(Sin texto disponible en el post original)');

    // Propuesta con caption cadena vacía
    ctx.window.openEditProposalModal(81);
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('(Sin texto disponible en el post original)');
  });

  test('14. Protección XSS y formato seguro: caracteres HTML son tratados como texto y no como DOM', async () => {
    const dangerousCaption = '<script>alert("xss")</script> & <img src=x onerror=alert(1)> <b>Negrita</b>\nLínea 2 con emojis: 🥂✨';

    const mockProposals = [
      {
        id: 82,
        venue_id: 10001,
        title: 'Post con caracteres HTML',
        caption: dangerousCaption,
        classification: 'EVENTO_POSIBLE',
        review_status: 'pending',
        source_type: 'instagram',
        image_url: 'https://media.vayaplan.com/bars/test/post82.jpg',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    ctx.window.openEditProposalModal(82);

    // Se asigna vía innerText, garantizando escape de entidades y conservación de formato
    expect(domElements['edit-prop-original-caption'].innerText).toBe(dangerousCaption);
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');
  });

  test('15. Alternancia y limpieza entre aperturas sucesivas: nunca se muestran ambos controles', async () => {
    const mockProposals = [
      {
        id: 91,
        venue_id: 10001,
        title: 'Propuesta A',
        caption: 'Caption de la propuesta A',
        review_status: 'pending',
      },
      {
        id: 92,
        venue_id: 10001,
        title: 'Propuesta B',
        caption: 'Caption de la propuesta B',
        review_status: 'pending',
      },
    ];

    const { ctx, domElements } = setupTestContext(mockProposals);
    await ctx.window.loadAdminProposals();

    // 1. Abrir Propuesta A existente (modo edición)
    ctx.window.openEditProposalModal(91);
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('Caption de la propuesta A');

    // 2. Abrir creación manual (modo alta manual)
    ctx.window.openManualProposalModal({ title: 'Manual C', caption: 'Caption manual C' });
    expect(domElements['edit-prop-caption-input'].style.display).toBe('block');
    expect(domElements['edit-prop-original-caption'].style.display).toBe('none');
    expect(domElements['edit-prop-caption-input'].value).toBe('Caption manual C');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('');

    // 3. Abrir Propuesta B existente (modo edición)
    ctx.window.openEditProposalModal(92);
    expect(domElements['edit-prop-original-caption'].style.display).toBe('block');
    expect(domElements['edit-prop-caption-input'].style.display).toBe('none');
    expect(domElements['edit-prop-original-caption'].innerText).toBe('Caption de la propuesta B');

    // 4. Abrir creación manual vacía
    ctx.window.openManualProposalModal({});
    expect(domElements['edit-prop-caption-input'].style.display).toBe('block');
    expect(domElements['edit-prop-original-caption'].style.display).toBe('none');
    expect(domElements['edit-prop-caption-input'].value).toBe('');
  });

  test('16. Renderizado HTML: estilos anti-desborde horizontal y soporte de scroll vertical', () => {
    const html = renderAdminHtml();

    // Contiene los dos controles con display:none inicial para evitar flashes
    expect(html).toContain('id="edit-prop-caption-input"');
    expect(html).toContain('id="edit-prop-original-caption"');
    expect(html).toContain('id="edit-prop-caption-label"');

    // Estilos del visor: ajuste de ancho, rotura de palabras largas, scroll vertical
    expect(html).toContain('white-space:pre-wrap');
    expect(html).toContain('word-break:break-word');
    expect(html).toContain('overflow-wrap:break-word');
    expect(html).toContain('overflow-x:hidden');
    expect(html).toContain('overflow-y:auto');
  });
});
