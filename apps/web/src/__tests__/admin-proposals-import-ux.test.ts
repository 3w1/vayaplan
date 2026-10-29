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

describe('apps/web — UX de Importación Puntual de Instagram por URL (admin.ts)', () => {
  function setupTestContext(options: {
    mockVenues?: any[];
    apiResponses?: Record<string, any>;
  } = {}) {
    const html = renderAdminHtml();
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('window.openImportInstagramModal'));
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

      // Modal de importación puntual de Instagram
      'modal-import-instagram-post': { style: {} },
      'import-ig-url-input': { value: '' },
      'import-ig-venue-select': {
        innerHTML: '',
        value: '',
        options: [],
        appendChild: function (opt: any) {
          if (!this.options) this.options = [];
          this.options.push(opt);
        },
      },
      'import-ig-feedback': { style: { display: 'none' }, innerText: '' },
      'btn-submit-import-ig': { disabled: false, innerText: '🔍 Extraer y Crear Propuesta' },
      'btn-open-import-ig': {},

      // Modal de confirmación y autorización de fallback pagado
      'modal-paid-fallback-confirm': { style: {} },
      'paid-fallback-operation-id': { value: '' },
      'paid-fallback-shortcode': { value: '' },
      'paid-fallback-canonical-url': { value: '' },
      'paid-fallback-venue-id': { value: '' },
      'paid-fallback-url-display': { innerText: '' },
      'paid-fallback-feedback': { style: { display: 'none' }, innerHTML: '', innerText: '' },
      'btn-confirm-paid-fallback': { disabled: true, innerText: '' },
      'btn-cancel-paid-fallback': { disabled: false },
    };

    const alerts: string[] = [];
    const openedModals: string[] = [];
    const closedModals: string[] = [];
    const apiCalls: { url: string; options?: any }[] = [];
    let loadedAdminProposalsCalls = 0;
    let openedEditProposalId: number | null = null;

    const mockVenues = options.mockVenues || [
      { id: 10, name: 'Zeta Bar', address: 'Calle Mayor 1' },
      { id: 2, name: 'Alfa Club', address: 'Plaza España 5' },
    ];

    const sandbox: any = {
      window: {},
      URL,
      URLSearchParams,
      document: {
        createElement: (tag: string) => ({
          value: '',
          text: '',
          tagName: tag.toUpperCase(),
        }),
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
      cachedVenues: mockVenues,
      cachedProposals: [],
      filteredProposals: [],
      activeProposalTab: 'all',
      openModal: (id: string) => openedModals.push(id),
      closeModal: (id: string) => closedModals.push(id),
      openEditProposalModal: (id: number) => {
        openedEditProposalId = id;
      },
      loadAdminProposals: async () => {
        loadedAdminProposalsCalls++;
      },
      alert: (msg: string) => alerts.push(msg),
      console: { log: () => {}, warn: () => {}, error: () => {} },
      localStorage: {
        getItem: (k: string) => (k.includes('token') || k.includes('Token') ? 'fake_jwt_token' : null),
        setItem: () => {},
        removeItem: () => {},
      },
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
      fetch: async (url: string, opts?: any) => {
        apiCalls.push({ url, options: opts });
        if (options.apiResponses && options.apiResponses[url]) {
          const resp = options.apiResponses[url];
          return {
            ok: resp.ok !== false,
            status: resp.status || (resp.ok === false ? 400 : 200),
            json: async () => resp.body || {},
          };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            proposal: { id: 999, review_status: 'pending' },
          }),
        };
      },
    };

    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);

    if (mainScript) {
      vm.runInContext(mainScript.content, ctx);
    }

    // Interceptar funciones para aserciones de prueba
    const origLoadAdminProposals = sandbox.window.loadAdminProposals;
    sandbox.window.loadAdminProposals = async () => {
      loadedAdminProposalsCalls++;
      if (typeof origLoadAdminProposals === 'function') {
        try {
          return await origLoadAdminProposals();
        } catch (_) {}
      }
    };

    const origOpenEditProposalModal = sandbox.window.openEditProposalModal;
    sandbox.window.openEditProposalModal = (id: number) => {
      openedEditProposalId = id;
      if (typeof origOpenEditProposalModal === 'function') {
        try {
          return origOpenEditProposalModal(id);
        } catch (_) {}
      }
    };

    const origCloseModal = sandbox.window.closeModal;
    sandbox.window.closeModal = (id: string) => {
      closedModals.push(id);
      if (typeof origCloseModal === 'function') {
        try {
          return origCloseModal(id);
        } catch (_) {}
      }
    };

    const origOpenModal = sandbox.window.openModal;
    sandbox.window.openModal = (id: string) => {
      openedModals.push(id);
      if (typeof origOpenModal === 'function') {
        try {
          return origOpenModal(id);
        } catch (_) {}
      }
    };

    return {
      sandbox,
      domElements,
      alerts,
      openedModals,
      closedModals,
      apiCalls,
      getLoadedProposalsCalls: () => loadedAdminProposalsCalls,
      getOpenedEditProposalId: () => openedEditProposalId,
    };
  }

  test('1. Renderiza botón #btn-open-import-ig y modal #modal-import-instagram-post en el HTML del Admin', () => {
    const html = renderAdminHtml();
    expect(html).toContain('id="btn-open-import-ig"');
    expect(html).toContain('id="modal-import-instagram-post"');
    expect(html).toContain('id="import-ig-url-input"');
    expect(html).toContain('id="import-ig-venue-select"');
    expect(html).toContain('id="btn-submit-import-ig"');
    expect(html).toContain('id="import-ig-feedback"');
    expect(html).toContain('📥 Importar Post de Instagram');
  });

  test('2. openImportInstagramModal limpia el formulario, feedback y puebla venues ordenados alfabéticamente con opción "sin asignar"', () => {
    const { sandbox, domElements, openedModals } = setupTestContext();

    domElements['import-ig-url-input'].value = 'https://instagram.com/dirty_url';
    domElements['import-ig-feedback'].style.display = 'block';
    domElements['import-ig-feedback'].innerText = 'Error previo';

    sandbox.window.openImportInstagramModal();

    expect(domElements['import-ig-url-input'].value).toBe('');
    expect(domElements['import-ig-feedback'].style.display).toBe('none');
    expect(domElements['import-ig-feedback'].innerText).toBe('');
    expect(openedModals).toContain('modal-import-instagram-post');

    // Comprobar que incluye la opción "Dejar sin asignar"
    expect(domElements['import-ig-venue-select'].innerHTML).toContain('⚠️ Dejar sin asignar');

    // Comprobar orden alfabético de venues: Alfa Club (id 2) debe ir antes de Zeta Bar (id 10)
    const options = domElements['import-ig-venue-select'].options;
    expect(options.length).toBe(2);
    expect(options[0].text).toContain('Alfa Club');
    expect(options[1].text).toContain('Zeta Bar');
  });

  test('3. submitImportInstagramPost valida URL vacía en cliente sin llamar al servidor ni cerrar el modal', async () => {
    const { sandbox, domElements, apiCalls, closedModals } = setupTestContext();

    domElements['import-ig-url-input'].value = '   ';
    await sandbox.window.submitImportInstagramPost();

    expect(apiCalls.length).toBe(0);
    expect(closedModals.length).toBe(0);
    expect(domElements['import-ig-feedback'].style.display).toBe('block');
    expect(domElements['import-ig-feedback'].innerText).toContain('pegue la URL');
  });

  test('4. Bloqueo de doble envío: mientras isImportingPost está activo no permite llamadas concurrentes', async () => {
    let resolver: any;
    const pendingPromise = new Promise(resolve => {
      resolver = resolve;
    });

    const { sandbox, domElements, apiCalls } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/import-instagram-post': {
          ok: true,
          status: 201,
          body: pendingPromise,
        },
      },
    });

    // Mock fetch que queda pausado
    sandbox.fetch = async (url: string, opts: any) => {
      apiCalls.push({ url, options: opts });
      await pendingPromise;
      return {
        ok: true,
        status: 201,
        json: async () => ({ success: true, proposal: { id: 777 } }),
      };
    };

    domElements['import-ig-url-input'].value = 'https://www.instagram.com/p/C1234567890/';

    // Primer clic
    const call1 = sandbox.window.submitImportInstagramPost();

    expect(domElements['btn-submit-import-ig'].disabled).toBe(true);
    expect(domElements['btn-submit-import-ig'].innerText).toContain('Extrayendo');

    // Segundo clic concurrente
    const call2 = sandbox.window.submitImportInstagramPost();

    expect(apiCalls.length).toBe(1); // Solamente una llamada enviada

    // Resolver
    resolver();
    await Promise.all([call1, call2]);

    // En finally se re-habilita
    expect(domElements['btn-submit-import-ig'].disabled).toBe(false);
    expect(domElements['btn-submit-import-ig'].innerText).toContain('Extraer y Crear Propuesta');
  });

  test('5. Error HTTP 400 del backend muestra mensaje en feedback y preserva datos ingresados', async () => {
    const { sandbox, domElements, closedModals, getOpenedEditProposalId } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/import-instagram-post': {
          ok: false,
          status: 400,
          body: {
            error: 'unsupported_url',
            message: 'Solo se admiten enlaces individuales a publicaciones (/p/) o reels (/reel/).',
          },
        },
      },
    });

    domElements['import-ig-url-input'].value = 'https://www.instagram.com/stories/venue/123/';
    domElements['import-ig-venue-select'].value = '10';

    await sandbox.window.submitImportInstagramPost();

    expect(closedModals.length).toBe(0); // modal permanece abierto para corregir
    expect(getOpenedEditProposalId()).toBeNull();
    expect(domElements['import-ig-url-input'].value).toBe('https://www.instagram.com/stories/venue/123/'); // no se borra
    expect(domElements['import-ig-venue-select'].value).toBe('10');
    expect(domElements['import-ig-feedback'].style.display).toBe('block');
    expect(domElements['import-ig-feedback'].innerText).toContain('Solo se admiten enlaces individuales');
    expect(domElements['btn-submit-import-ig'].disabled).toBe(false);
  });

  test('6. Importación exitosa (201): cierra modal, recarga propuestas y abre modal de edición de la nueva propuesta', async () => {
    const {
      sandbox,
      domElements,
      closedModals,
      alerts,
      getLoadedProposalsCalls,
      getOpenedEditProposalId,
    } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/import-instagram-post': {
          ok: true,
          status: 201,
          body: {
            success: true,
            proposal: { id: 888, review_status: 'pending' },
          },
        },
      },
    });

    domElements['import-ig-url-input'].value = 'https://www.instagram.com/p/VALIDPOST123/';
    domElements['import-ig-venue-select'].value = '';

    await sandbox.window.submitImportInstagramPost();

    expect(closedModals).toContain('modal-import-instagram-post');
    expect(getLoadedProposalsCalls()).toBe(1);
    expect(getOpenedEditProposalId()).toBe(888);
    expect(alerts.some(a => a.includes('Publicación importada exitosamente'))).toBe(true);
    expect(domElements['btn-submit-import-ig'].disabled).toBe(false);
  });

  test('7. Detección de duplicado (200 alreadyExisted): notifica al operador y abre la propuesta pendiente preexistente', async () => {
    const {
      sandbox,
      domElements,
      closedModals,
      alerts,
      getLoadedProposalsCalls,
      getOpenedEditProposalId,
    } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/import-instagram-post': {
          ok: true,
          status: 200,
          body: {
            success: true,
            alreadyExisted: true,
            recordType: 'proposal',
            message: 'Esta publicación de Instagram ya fue importada previamente como propuesta #63.',
            proposal: { id: 63, review_status: 'pending' },
          },
        },
      },
    });

    domElements['import-ig-url-input'].value = 'https://www.instagram.com/p/DUPLICATE123/';

    await sandbox.window.submitImportInstagramPost();

    expect(alerts.some(a => a.includes('ya fue importada previamente'))).toBe(true);
    expect(closedModals).toContain('modal-import-instagram-post');
    expect(getLoadedProposalsCalls()).toBe(1);
    expect(getOpenedEditProposalId()).toBe(63);
  });

  test('8. Renderizado de propuesta con venue_id = null: muestra badge de alerta "⚠️ Local sin asignar"', () => {
    const { sandbox, domElements } = setupTestContext();

    const mockProposals = [
      {
        id: 701,
        title: 'Concierto Acústico sin Local Asignado',
        venue_id: null,
        venue_name: null,
        proposed_date: '2026-10-30',
        proposed_time: '20:00',
        classification: 'EVENTO_POSIBLE',
        confidence: 'ALTA',
        price_status: 'NOT_INFORMED',
        source_type: 'instagram_single_post',
        source_url: 'https://www.instagram.com/p/TEST701/',
        review_status: 'pending',
      },
    ];

    sandbox.window.renderProposalsList(mockProposals);

    const cardsHtml = domElements['proposals-cards-container'].innerHTML;

    // Comprobar que en la lista editorial se muestra "⚠️ Local sin asignar"
    expect(cardsHtml).toContain('⚠️ Local sin asignar');
  });

  test('9. Error 422 access_restricted muestra mensaje claro sin undefined y ofrece completar manualmente preservando URL y local', async () => {
    const { sandbox, domElements, closedModals, openedModals } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/import-instagram-post': {
          ok: false,
          status: 422,
          body: {
            error: 'access_restricted',
            message: 'Instagram restringe el acceso a esta publicación. No se ha podido importar automáticamente. Puedes completar la propuesta manualmente.',
            canCompleteManually: true,
            canonicalUrl: 'https://www.instagram.com/p/De_jb4yFX_T/',
            shortcode: 'De_jb4yFX_T',
            venueId: 10,
          },
        },
      },
    });

    domElements['import-ig-url-input'].value = 'https://www.instagram.com/p/De_jb4yFX_T/';
    domElements['import-ig-venue-select'].value = '10';

    await sandbox.window.submitImportInstagramPost();

    const feedbackHtml = domElements['import-ig-feedback'].innerHTML;
    const feedbackText = domElements['import-ig-feedback'].innerText;

    // Comprobar mensaje claro sin undefined ni objetos crudos
    expect(feedbackText).toContain('Instagram restringe el acceso a esta publicación');
    expect(feedbackText).not.toContain('undefined');
    expect(feedbackHtml).toContain('btn-import-ig-manual');
    expect(feedbackHtml).toContain('Completar manualmente');

    // Al hacer clic en completar manualmente
    sandbox.window.openManualProposalFromImport('https://www.instagram.com/p/De_jb4yFX_T/', 10);

    expect(closedModals).toContain('modal-import-instagram-post');
    expect(openedModals).toContain('modal-edit-proposal');

    // Comprobar que modal-edit-proposal está en modo creación manual
    expect(domElements['edit-prop-id'].value).toBe('');
    expect(domElements['modal-edit-prop-title'].innerText).toBe('Completar Propuesta Manualmente');
    expect(domElements['btn-submit-edit-prop'].innerText).toBe('💾 Guardar como Propuesta Pendiente');
    expect(domElements['edit-prop-source-url'].value).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(domElements['edit-prop-venue-select'].value).toBe('10');
    expect(domElements['edit-prop-classification-select'].value).toBe('REQUIERE_REVISION');
    expect(domElements['edit-prop-meta-conf'].innerText).toBe('BAJA');
  });

  test('10. Creación manual de propuesta valida campos obligatorios (título e imagen) en cliente', async () => {
    const { sandbox, domElements, apiCalls } = setupTestContext();

    sandbox.window.openManualProposalModal({
      url: 'https://www.instagram.com/p/De_jb4yFX_T/',
      venue_id: 2,
    });

    // Intentar guardar sin título ni imagen
    domElements['edit-prop-title-input'].value = '';
    domElements['edit-prop-image-url'].value = '';

    await sandbox.window.submitEditProposal();
    expect(apiCalls.length).toBe(0);
    expect(domElements['edit-prop-error'].style.display).toBe('block');
    expect(domElements['edit-prop-error'].innerText).toContain('El título de la propuesta es obligatorio');

    // Intentar guardar con título pero sin imagen
    domElements['edit-prop-title-input'].value = 'Concierto Acústico Palencia';
    await sandbox.window.submitEditProposal();
    expect(apiCalls.length).toBe(0);
    expect(domElements['edit-prop-error'].style.display).toBe('block');
    expect(domElements['edit-prop-error'].innerText).toContain('La imagen o cartel es obligatoria');
  });

  test('11. Creación manual con datos completos envía POST /api/v1/admin/proposals/manual y recarga propuestas', async () => {
    let manualCallPayload: any = null;
    const { sandbox, domElements, closedModals, getLoadedProposalsCalls } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/manual': {
          ok: true,
          status: 201,
          body: {
            success: true,
            message: 'Propuesta registrada con éxito como pendiente.',
            proposal: {
              id: 888,
              title: 'Jam Session Palencia',
              review_status: 'pending',
              confidence: 'BAJA',
            },
          },
        },
      },
    });

    // Interceptar fetch para capturar body enviado
    const originalFetch = sandbox.fetch;
    sandbox.fetch = async (url: string, opts: any) => {
      if (url.includes('/api/v1/admin/proposals/manual')) {
        manualCallPayload = JSON.parse(opts.body);
      }
      return originalFetch(url, opts);
    };

    sandbox.window.openManualProposalModal({
      url: 'https://www.instagram.com/p/De_jb4yFX_T/',
      venue_id: 10,
    });

    domElements['edit-prop-title-input'].value = 'Jam Session Palencia';
    domElements['edit-prop-image-url'].value = 'https://images.vayaplan.com/proposals/manual_jam.jpg';
    domElements['edit-prop-caption-input'].value = 'Ven a disfrutar de la mejor música en directo este viernes.';
    domElements['edit-prop-date-input'].value = '2026-11-06';
    domElements['edit-prop-time-input'].value = '21:00';

    await sandbox.window.submitEditProposal();

    expect(manualCallPayload).toBeDefined();
    expect(manualCallPayload.url).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(manualCallPayload.title).toBe('Jam Session Palencia');
    expect(manualCallPayload.image_url).toBe('https://images.vayaplan.com/proposals/manual_jam.jpg');
    expect(manualCallPayload.caption).toBe('Ven a disfrutar de la mejor música en directo este viernes.');
    expect(manualCallPayload.venue_id).toBe(10);
    expect(manualCallPayload.proposed_date).toBe('2026-11-06');
    expect(manualCallPayload.proposed_time).toBe('21:00');

    expect(closedModals).toContain('modal-edit-proposal');
    expect(getLoadedProposalsCalls()).toBe(1);
  });

  // ============================================================================
  // IMPORTACIÓN ESCALONADA: ACTOR ALTERNATIVO CON AUTORIZACIÓN PUNTUAL DE GASTO
  // ============================================================================

  test('12. Renderiza modal de confirmación de fallback pagado (#modal-paid-fallback-confirm) con proveedor y avisos de coste', () => {
    const html = renderAdminHtml();
    expect(html).toContain('id="modal-paid-fallback-confirm"');
    expect(html).toContain('intropix/instagram-posts-reels-scraper');
    expect(html).toContain('0,015 USD');
    expect(html).toContain('0,005');
    expect(html).toContain('profile-scan');
    expect(html).toContain('result-item');
    expect(html).toContain('actor-start');
    expect(html).toContain('0,0089 USD');
    expect(html).toContain('id="btn-confirm-paid-fallback"');
    expect(html).toContain('id="btn-cancel-paid-fallback"');
    expect(html).toContain('id="paid-fallback-feedback"');
    expect(html).toContain('id="paid-fallback-url-display"');
  });

  test('13. Error access_restricted con canUsePaidFallback ofrece opción de proveedor alternativo Y manual sin forzar pago', async () => {
    const { sandbox, domElements, closedModals, openedModals } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/import-instagram-post': {
          ok: false,
          status: 422,
          body: {
            error: 'access_restricted',
            message: 'Instagram restringe el acceso a esta publicación.',
            canUsePaidFallback: true,
            canCompleteManually: true,
            canonicalUrl: 'https://www.instagram.com/p/De_jb4yFX_T/',
            shortcode: 'De_jb4yFX_T',
            venueId: 2,
          },
        },
      },
    });

    domElements['import-ig-url-input'].value = 'https://www.instagram.com/p/De_jb4yFX_T/';
    domElements['import-ig-venue-select'].value = '2';

    await sandbox.window.submitImportInstagramPost();

    const feedbackHtml = domElements['import-ig-feedback'].innerHTML;
    // Comprobar que contiene ambos botones
    expect(feedbackHtml).toContain('btn-import-ig-paid-fallback');
    expect(feedbackHtml).toContain('⚡ Intentar con proveedor alternativo');
    expect(feedbackHtml).toContain('btn-import-ig-manual');
    expect(feedbackHtml).toContain('✍️ Completar manualmente');

    // Comprobar que el operador puede elegir la vía manual directamente
    sandbox.window.openManualProposalFromImport('https://www.instagram.com/p/De_jb4yFX_T/', 2);
    expect(closedModals).toContain('modal-import-instagram-post');
    expect(openedModals).toContain('modal-edit-proposal');
    expect(domElements['edit-prop-source-url'].value).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(domElements['edit-prop-venue-select'].value).toBe('2');
  });

  test('14. openPaidFallbackModal prepara la autorización mediante API y habilita confirmación con límite en USD', async () => {
    const { sandbox, domElements, openedModals, apiCalls } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/prepare-paid-fallback': {
          ok: true,
          status: 200,
          body: {
            success: true,
            operationId: 'op_test_1234567890abcdef',
            shortcode: 'De_jb4yFX_T',
            canonicalUrl: 'https://www.instagram.com/p/De_jb4yFX_T/',
            venueId: 2,
            actorId: 'intropix/instagram-posts-reels-scraper',
            estimatedCostUsd: 0.0089,
            maxChargeLimitUsd: 0.015,
            startChargeUsd: 0.005,
            currency: 'USD',
          },
        },
      },
    });

    await sandbox.window.openPaidFallbackModal('https://www.instagram.com/p/De_jb4yFX_T/', 2);

    expect(openedModals).toContain('modal-paid-fallback-confirm');
    expect(apiCalls.some(c => c.url.includes('/api/v1/admin/proposals/prepare-paid-fallback'))).toBe(true);

    expect(domElements['paid-fallback-operation-id'].value).toBe('op_test_1234567890abcdef');
    expect(domElements['paid-fallback-shortcode'].value).toBe('De_jb4yFX_T');
    expect(domElements['paid-fallback-canonical-url'].value).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(domElements['paid-fallback-venue-id'].value).toBe('2');
    expect(domElements['paid-fallback-url-display'].innerText).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(domElements['btn-confirm-paid-fallback'].disabled).toBe(false);
    expect(domElements['btn-confirm-paid-fallback'].innerText).toContain('0,015 USD');
  });

  test('15. submitExecutePaidFallback envía ejecución, cierra modales, recarga y abre edición de la propuesta', async () => {
    let executePayload: any = null;
    let openedEditId: number | null = null;

    const { sandbox, domElements, closedModals, getLoadedProposalsCalls } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/execute-paid-fallback': {
          ok: true,
          status: 201,
          body: {
            success: true,
            proposal: {
              id: 999,
              title: 'Concierto Extraído con Fallback',
              review_status: 'pending',
              classification: 'CONCIERTO',
            },
            operation: {
              operationId: 'op_test_1234567890abcdef',
              reportedCostUsd: 0.0089,
            },
          },
        },
      },
    });

    const origFetch = sandbox.fetch;
    sandbox.fetch = async (url: string, opts: any) => {
      if (url.includes('/api/v1/admin/proposals/execute-paid-fallback')) {
        executePayload = JSON.parse(opts.body);
      }
      return origFetch(url, opts);
    };

    sandbox.window.openEditProposalModal = (id: number) => {
      openedEditId = id;
    };

    domElements['paid-fallback-operation-id'].value = 'op_test_1234567890abcdef';
    domElements['paid-fallback-shortcode'].value = 'De_jb4yFX_T';
    domElements['paid-fallback-canonical-url'].value = 'https://www.instagram.com/p/De_jb4yFX_T/';
    domElements['paid-fallback-venue-id'].value = '2';

    await sandbox.window.submitExecutePaidFallback();

    expect(executePayload).toBeDefined();
    expect(executePayload.operationId).toBe('op_test_1234567890abcdef');
    expect(executePayload.shortcode).toBe('De_jb4yFX_T');
    expect(executePayload.canonicalUrl).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(executePayload.venue_id).toBe(2);

    expect(closedModals).toContain('modal-paid-fallback-confirm');
    expect(closedModals).toContain('modal-import-instagram-post');
    expect(getLoadedProposalsCalls()).toBe(1);
    expect(openedEditId).toBe(999);
  });

  test('16. submitExecutePaidFallback ante fallo del proveedor alternativo muestra error y ofrece completar manualmente', async () => {
    const { sandbox, domElements, closedModals, openedModals } = setupTestContext({
      apiResponses: {
        '/api/v1/admin/proposals/execute-paid-fallback': {
          ok: false,
          status: 422,
          body: {
            error: 'target_post_not_found',
            message: 'La publicación no existe o fue eliminada en Instagram.',
            canCompleteManually: true,
          },
        },
      },
    });

    domElements['paid-fallback-operation-id'].value = 'op_test_not_found';
    domElements['paid-fallback-shortcode'].value = 'De_jb4yFX_T';
    domElements['paid-fallback-canonical-url'].value = 'https://www.instagram.com/p/De_jb4yFX_T/';
    domElements['paid-fallback-venue-id'].value = '2';

    await sandbox.window.submitExecutePaidFallback();

    const feedbackHtml = domElements['paid-fallback-feedback'].innerHTML;
    expect(feedbackHtml).toContain('La publicación no existe o fue eliminada');
    expect(feedbackHtml).toContain('btn-paid-fallback-to-manual');
    expect(feedbackHtml).toContain('✍️ Completar manualmente');

    // Al pulsar el botón manual ofrecido en el error del fallback
    sandbox.window.openManualProposalFromImport('https://www.instagram.com/p/De_jb4yFX_T/', 2);
    expect(openedModals).toContain('modal-edit-proposal');
    expect(domElements['edit-prop-source-url'].value).toBe('https://www.instagram.com/p/De_jb4yFX_T/');
    expect(domElements['edit-prop-venue-select'].value).toBe('2');
  });
});
