import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';
import { extractExecutableInlineScripts } from './admin-script-syntax.test';

describe('apps/web — Panel de Administración: Imágenes de Biblioteca Pública (admin.ts)', () => {
  const html = renderAdminHtml();

  test('renderAdminHtml incluye el botón de pestaña y el modal de decisión', () => {
    expect(html).toContain('id="prop-tab-biblioteca"');
    expect(html).toContain('Imágenes Biblioteca Pública');
    expect(html).toContain('id="modal-biblioteca-decision"');
    expect(html).toContain('id="bib-decision-event-id"');
    expect(html).toContain('id="bib-decision-action"');
    expect(html).toContain('submitBibliotecaDecision()');
  });

  test('renderBibliotecaImagesList ejecuta y renderiza los eventos de la biblioteca con sus imágenes', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));
    expect(mainScript).toBeDefined();

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'bib-decision-event-id': { value: '' },
      'bib-decision-action': { value: '' },
      'bib-decision-image-url': { value: '' },
      'bib-decision-r2-key': { value: '' },
      'bib-decision-credit': { value: '' },
      'bib-decision-notes': { value: '' },
      'bib-decision-idempotency-key': { value: '' },
      'bib-decision-expected-previous-id': { value: '' },
      'bib-decision-alert': { style: {}, innerText: '' },
      'modal-bib-decision-title': { innerText: '' },
      'bib-decision-description-text': { innerText: '' },
      'bib-decision-preview-box': { innerHTML: '' },
      'btn-submit-bib-decision': { disabled: false, innerText: '' },
      'prop-tab-biblioteca': { classList: { add: () => {}, remove: () => {} }, style: {} },
    };

    const mockProposals = [
      {
        eventId: 9,
        eventTitle: "Exposición de fotografía 'Una mirada sincera' de Agustín Hernández",
        editorialDate: '2026-10-01',
        endDate: '2026-10-30',
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'SIN_IMAGEN',
        currentImageUrl: null,
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
        r2Key: 'biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
        sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/35/937/cartel.jpg',
        sourcePageUrl: 'https://bibliotecas.jcyl.es/web/evento/9',
        sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
        credit: 'Biblioteca Pública de Palencia / Agustín Hernández',
        imageWidth: 530,
        imageHeight: 750,
        contentType: 'image/webp',
        sizeBytes: 42892,
        lastCheckedAt: '2026-10-24T21:48:12Z',
        recommendedAction: 'ADOPTAR_IMAGEN_OFICIAL',
      },
      {
        eventId: 19,
        eventTitle: 'Exposición: «El jazz está en los libros»',
        editorialDate: '2026-10-30',
        endDate: '2026-11-21',
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'IMAGEN_GENERICA',
        currentImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2026/09/Cartel-Jazz-2026.webp',
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
        r2Key: 'biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
        sourceImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2025/09/biblioteca-palencia.webp',
        sourcePageUrl: 'https://jazzpalencia.es/actividades/19',
        sourceName: 'Festival Jazz Palencia / Biblioteca Pública de Palencia',
        credit: 'Jazz Palencia / Biblioteca Pública de Palencia',
        imageWidth: 1360,
        imageHeight: 1020,
        contentType: 'image/webp',
        sizeBytes: 141078,
        lastCheckedAt: '2026-10-24T21:48:12Z',
        recommendedAction: 'PROPONER_ALTERNATIVA',
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
        removeEventListener: () => {},
      },
      localStorage: {
        getItem: () => 'valid-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: () => {},
      openModal: () => {},
      closeModal: () => {},
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    expect(typeof ctx.window.loadBibliotecaImageProposals).toBe('function');
    expect(typeof ctx.window.renderBibliotecaImagesList).toBe('function');
    expect(typeof ctx.window.openBibliotecaDecisionModal).toBe('function');

    await ctx.window.loadBibliotecaImageProposals();

    const cardsHtml = domElements['proposals-cards-container'].innerHTML;

    expect(cardsHtml).toContain("Exposición de fotografía 'Una mirada sincera'");
    expect(cardsHtml).toContain('Sin Imagen');
    expect(cardsHtml).toContain('Adoptar imagen oficial');
    expect(cardsHtml).toContain('Proponer alternativa');
    expect(cardsHtml).toContain('Exposición: «El jazz está en los libros»');
    expect(cardsHtml).toContain('Oficial R2');

    // Probar apertura del modal de decisión para adopción
    expect(() => ctx.openBibliotecaDecisionModal(9, 'adopt')).not.toThrow();
    expect(domElements['bib-decision-event-id'].value).toBe('9');
    expect(domElements['bib-decision-action'].value).toBe('adopt');
    expect(domElements['bib-decision-image-url'].value).toContain('8a71e5e5a4d7.webp');
  });

  test('Flujo de adopción confirmada: retira de pendientes, decrementa contador y no reaparece al recargar', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));
    expect(mainScript).toBeDefined();

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-text': { innerText: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'bib-decision-event-id': { value: '' },
      'bib-decision-action': { value: '' },
      'bib-decision-image-url': { value: '' },
      'bib-decision-r2-key': { value: '' },
      'bib-decision-credit': { value: '' },
      'bib-decision-notes': { value: '' },
      'bib-decision-idempotency-key': { value: '' },
      'bib-decision-expected-previous-id': { value: '' },
      'bib-decision-alert': { style: {}, innerText: '' },
      'modal-bib-decision-title': { innerText: '' },
      'bib-decision-description-text': { innerText: '' },
      'bib-decision-preview-box': { innerHTML: '' },
      'btn-submit-bib-decision': { disabled: false, innerText: '' },
      'prop-tab-biblioteca': { innerText: '', title: '', style: {}, classList: { add: () => {}, remove: () => {} } },
      'proposals-header-title': { innerText: '' },
      'proposals-header-desc': { innerText: '' },
      'prop-tab-pending': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
      'prop-tab-resolved': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
      'prop-tab-all': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
    };

    let serverPendingProposals = [
      {
        eventId: 9,
        eventTitle: "Exposición de fotografía 'Una mirada sincera' de Agustín Hernández",
        editorialDate: '2026-10-01',
        endDate: '2026-10-30',
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'SIN_IMAGEN',
        currentImageUrl: null,
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion/8a71.webp',
        r2Key: 'biblioteca-publica/exposicion/8a71.webp',
        sourceImageUrl: 'https://bibliotecas.jcyl.es/cartel.jpg',
        sourcePageUrl: 'https://bibliotecas.jcyl.es/evento/9',
        sourceName: 'Biblioteca Pública de Palencia',
        credit: 'Biblioteca Pública / Agustín Hernández',
        recommendedAction: 'ADOPTAR_IMAGEN_OFICIAL',
        isPending: true,
        verifiedAt: null,
        verifiedBy: null,
      },
      {
        eventId: 19,
        eventTitle: 'Exposición: «El jazz está en los libros»',
        editorialDate: '2026-10-30',
        endDate: '2026-11-21',
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'IMAGEN_GENERICA',
        currentImageUrl: 'https://jazzpalencia.es/cartel.webp',
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/el-jazz/514f.webp',
        r2Key: 'biblioteca-publica/el-jazz/514f.webp',
        sourceImageUrl: 'https://jazzpalencia.es/biblioteca.webp',
        sourcePageUrl: 'https://jazzpalencia.es/19',
        sourceName: 'Jazz Palencia',
        credit: 'Jazz Palencia',
        recommendedAction: 'PROPONER_ALTERNATIVA',
        isPending: true,
        verifiedAt: null,
        verifiedBy: null,
      },
    ];

    let serverResolvedProposals: any[] = [];
    let modalClosed = false;
    let alertMessage = '';

    const createSafeElement = () => ({
      value: '',
      innerText: '',
      innerHTML: '',
      style: {},
      classList: {
        _classes: new Set<string>(['active']),
        add(c: string) { this._classes.add(c); },
        remove(c: string) { this._classes.delete(c); },
        contains(c: string) { return this._classes.has(c); },
        toggle(c: string) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute: () => {},
      getAttribute: () => '',
      focus: () => {},
      blur: () => {},
    });

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async (url: string, opts?: any) => {
        if (opts && opts.method === 'POST') {
          const body = JSON.parse(opts.body);
          if (body.action === 'adopt') {
            const adopted = serverPendingProposals.find(p => p.eventId === body.eventId);
            if (adopted) {
              serverPendingProposals = serverPendingProposals.filter(p => p.eventId !== body.eventId);
              serverResolvedProposals.push({
                ...adopted,
                currentImageUrl: body.adoptedImageUrl,
                isPending: false,
                verifiedAt: new Date().toISOString(),
                verifiedBy: 'admin@vayaplan.com',
              });
            }
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: 'Decisión aplicada' })
          };
        }

        const status = (url.includes('status=resolved')) ? 'resolved' : ((url.includes('status=all')) ? 'all' : 'pending');
        const list = status === 'resolved' ? serverResolvedProposals : (status === 'all' ? [...serverPendingProposals, ...serverResolvedProposals] : serverPendingProposals);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            totalPending: serverPendingProposals.length,
            totalResolved: serverResolvedProposals.length,
            proposals: list
          })
        };
      },
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = createSafeElement();
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      localStorage: {
        getItem: () => 'valid-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: (msg: string) => { alertMessage = msg; },
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    const origCloseModal = ctx.window.closeModal;
    ctx.window.closeModal = (id: string) => {
      modalClosed = true;
      if (typeof origCloseModal === 'function') origCloseModal(id);
    };

    // 1. Carga inicial: 2 revisiones pendientes
    await ctx.window.loadBibliotecaImageProposals('pending');
    expect(domElements['proposals-count-text'].innerText).toContain('2 revisiones de imagen pendientes');
    expect(domElements['proposals-count-badge'].innerText).toBe('2 pendientes');
    expect(domElements['proposals-cards-container'].innerHTML).toContain("Exposición de fotografía 'Una mirada sincera'");
    expect(domElements['proposals-cards-container'].innerHTML).toContain('Exposición: «El jazz está en los libros»');

    // 2. Operador abre el modal y confirma "Adoptar Oficial"
    ctx.window.openBibliotecaDecisionModal(9, 'adopt');
    expect(domElements['bib-decision-event-id'].value).toBe('9');
    expect(domElements['bib-decision-action'].value).toBe('adopt');

    await ctx.window.submitBibliotecaDecision();
    expect(modalClosed).toBe(true);
    expect(alertMessage).toContain('Decisión guardada con éxito');

    // 3. Tras recarga automática: la revisión #9 ya no aparece en pendientes
    const updatedCardsHtml = domElements['proposals-cards-container'].innerHTML;
    expect(updatedCardsHtml).not.toContain("Exposición de fotografía 'Una mirada sincera'");
    expect(updatedCardsHtml).toContain('Exposición: «El jazz está en los libros»');
    expect(domElements['proposals-count-text'].innerText).toContain('1 revisión de imagen pendiente');
    expect(domElements['proposals-count-badge'].innerText).toBe('1 pendiente');

    // 4. Salir a otra sección o recargar: volver a Biblioteca mantiene #9 fuera de pendientes
    await ctx.window.loadBibliotecaImageProposals('pending');
    expect(domElements['proposals-cards-container'].innerHTML).not.toContain("Exposición de fotografía 'Una mirada sincera'");

    // 5. En pestaña "Resueltas", la decisión #9 aparece con su auditoría
    await ctx.window.loadBibliotecaImageProposals('resolved');
    const resolvedHtml = domElements['proposals-cards-container'].innerHTML;
    expect(resolvedHtml).toContain("Exposición de fotografía 'Una mirada sincera'");
    expect(resolvedHtml).toContain('✓ Decisión aplicada (admin@vayaplan.com)');
    expect(resolvedHtml).toContain('✓ Revisión resuelta');
    expect(resolvedHtml).not.toContain('✓ Adoptar Oficial');
  });

  test('URLs idénticas sin verificación: permanece en pendientes y muestra aviso de confirmación', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-text': { innerText: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'prop-tab-pending': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
      'prop-tab-resolved': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
      'prop-tab-all': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
    };

    const identicalUrlProposal = [
      {
        eventId: 44,
        eventTitle: 'zo brinviyer con Lachy Torriente',
        editorialDate: '2026-11-18',
        endDate: null,
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'IMAGEN_OFICIAL_EXISTENTE',
        currentImageUrl: 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer/a0b7.webp',
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/zo-brinviyer/a0b7.webp',
        r2Key: 'biblioteca-publica/zo-brinviyer/a0b7.webp',
        sourceImageUrl: 'https://jazzpalencia.es/zo.jpg',
        sourcePageUrl: 'https://jazzpalencia.es/actividades/zo',
        sourceName: 'Festival Jazz Palencia',
        credit: 'Lachy Torriente',
        recommendedAction: 'MANTENER_IMAGEN_ACTUAL',
        isPending: true,
        verifiedAt: null,
        verifiedBy: null,
      }
    ];

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          totalPending: 1,
          totalResolved: 0,
          proposals: identicalUrlProposal
        })
      }),
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              value: '',
              innerText: '',
              innerHTML: '',
              style: {},
              classList: { add: () => {}, remove: () => {}, contains: () => false },
              querySelectorAll: () => [],
              querySelector: () => null,
            };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      localStorage: { getItem: () => 'token' },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: (fn: Function) => fn(),
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    await ctx.window.loadBibliotecaImageProposals('pending');

    const htmlOutput = domElements['proposals-cards-container'].innerHTML;
    expect(htmlOutput).toContain('Misma imagen (pendiente de confirmación)');
    expect(htmlOutput).toContain('✓ Adoptar Oficial');
    expect(htmlOutput).toContain('Mantener');
    expect(domElements['proposals-count-text'].innerText).toContain('1 revisión de imagen pendiente');
  });

  test('Fallo de red en submitBibliotecaDecision no produce éxito visual falso y preserva la tarjeta', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '<div id="bib-card-9">Tarjeta intacta</div>' },
      'bib-decision-event-id': { value: '9' },
      'bib-decision-action': { value: 'adopt' },
      'bib-decision-image-url': { value: 'https://media.vayaplan.com/img.webp' },
      'bib-decision-r2-key': { value: 'key' },
      'bib-decision-credit': { value: 'credit' },
      'bib-decision-notes': { value: '' },
      'bib-decision-alert': { style: {}, innerText: '' },
      'btn-submit-bib-decision': { disabled: false, innerText: '' },
    };

    let modalClosed = false;

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'internal_error', message: 'Fallo simulado en servidor' })
      }),
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              value: '',
              innerText: '',
              innerHTML: '',
              style: {},
              classList: { add: () => {}, remove: () => {}, contains: () => false },
              querySelectorAll: () => [],
              querySelector: () => null,
            };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      localStorage: { getItem: () => 'token' },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: () => {},
      closeModal: () => { modalClosed = true; },
      setTimeout: (fn: Function) => fn(),
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    const origCloseModal = ctx.window.closeModal;
    ctx.window.closeModal = (id: string) => {
      modalClosed = true;
      if (typeof origCloseModal === 'function') origCloseModal(id);
    };

    await ctx.window.submitBibliotecaDecision();

    expect(modalClosed).toBe(false);
    expect(domElements['bib-decision-alert'].innerText).toContain('Fallo simulado en servidor');
    expect(domElements['bib-decision-alert'].style.display).toBe('block');
    expect(domElements['proposals-cards-container'].innerHTML).toContain('Tarjeta intacta');
    expect(domElements['btn-submit-bib-decision'].disabled).toBe(false);
  });

  test('Protección de doble envío bloquea llamadas concurrentes', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'bib-decision-event-id': { value: '9' },
      'bib-decision-action': { value: 'adopt' },
      'bib-decision-image-url': { value: 'https://media.vayaplan.com/img.webp' },
      'bib-decision-r2-key': { value: 'key' },
      'bib-decision-credit': { value: 'credit' },
      'bib-decision-notes': { value: '' },
      'bib-decision-alert': { style: {}, innerText: '' },
      'btn-submit-bib-decision': { disabled: false, innerText: '' },
    };

    let postCallsCount = 0;

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async () => {
        postCallsCount++;
        await new Promise(r => setTimeout(r, 50));
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        };
      },
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              value: '',
              innerText: '',
              innerHTML: '',
              style: {},
              classList: { add: () => {}, remove: () => {}, contains: () => false },
              querySelectorAll: () => [],
              querySelector: () => null,
            };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      localStorage: { getItem: () => 'token' },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: () => {},
      closeModal: () => {},
      setTimeout: (fn: Function) => fn(),
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    const p1 = ctx.window.submitBibliotecaDecision();
    const p2 = ctx.window.submitBibliotecaDecision();
    await Promise.all([p1, p2]);

    expect(postCallsCount).toBe(1);
  });

  test('Aislamiento contra respuestas demoradas: alternar Biblioteca y Propuestas descarta respuestas obsoletas', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-text': { innerText: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'proposal-filter-search': { value: '', style: {} },
      'proposal-filter-search-clear': { style: {} },
      'prop-tab-biblioteca': { innerText: '', title: '', style: {}, classList: { add: () => {}, remove: () => {} } },
      'proposals-header-title': { innerText: '' },
      'proposals-header-desc': { innerText: '' },
      'prop-tab-pending': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
      'prop-tab-resolved': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
      'prop-tab-all': { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} },
    };

    let delayBibliotecaResponse: Function | null = null;

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async (url: string) => {
        if (url.includes('/admin/biblioteca-images/proposals')) {
          await new Promise(r => { delayBibliotecaResponse = r; });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              totalPending: 1,
              proposals: [{ eventId: 9, eventTitle: 'BIBLIOTECA TARDE', isPending: true }]
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            proposals: [{ id: 101, title: 'PROPUESTA INSTAGRAM', classification: 'EVENTO_POSIBLE', review_status: 'pending' }]
          })
        };
      },
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = { value: '', innerText: '', innerHTML: '', style: {}, classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      localStorage: { getItem: () => 'token' },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: (fn: Function) => fn(),
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    // 1. Iniciar carga de Biblioteca (quedará pendiente)
    const bibPromise = ctx.window.loadBibliotecaImageProposals('pending');

    // 2. Antes de que responda Biblioteca, el curador cambia de vuelta a Propuestas
    await ctx.window.loadAdminProposals();
    expect(domElements['proposals-cards-container'].innerHTML).toContain('PROPUESTA INSTAGRAM');

    // 3. Responde tardíamente la petición de Biblioteca
    if (delayBibliotecaResponse) (delayBibliotecaResponse as any)();
    await bibPromise;

    // 4. La respuesta tardía no debe sobreescribir la vista de Propuestas
    expect(domElements['proposals-cards-container'].innerHTML).toContain('PROPUESTA INSTAGRAM');
    expect(domElements['proposals-cards-container'].innerHTML).not.toContain('BIBLIOTECA TARDE');
  });

  test('Ciclo de vida de idempotencyKey: el cliente conserva la misma clave ante reintentos por fallo, y una nueva decisión intencional genera una clave nueva', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));

    const domElements: Record<string, any> = {
      'proposals-cards-container': { innerHTML: '' },
      'bib-decision-event-id': { value: '' },
      'bib-decision-action': { value: '' },
      'bib-decision-image-url': { value: '' },
      'bib-decision-r2-key': { value: '' },
      'bib-decision-credit': { value: '' },
      'bib-decision-notes': { value: '' },
      'bib-decision-idempotency-key': { value: '' },
      'bib-decision-expected-previous-id': { value: '' },
      'bib-decision-alert': { style: {}, innerText: '' },
      'modal-bib-decision-title': { innerText: '' },
      'bib-decision-description-text': { innerText: '' },
      'bib-decision-preview-box': { innerHTML: '' },
      'btn-submit-bib-decision': { disabled: false, innerText: '' },
    };

    const sentPayloads: any[] = [];
    let shouldFail = true;

    const mockBibProposals = [
      {
        eventId: 9,
        eventTitle: 'Exposición Agustín',
        proposedImageUrl: 'https://media.vayaplan.com/8a71.webp',
        r2Key: 'biblioteca-publica/8a71.webp',
        credit: 'BPA',
        isPending: true,
        activeDecision: null,
      },
      {
        eventId: 19,
        eventTitle: 'Jazz',
        proposedImageUrl: 'https://media.vayaplan.com/514f.webp',
        r2Key: 'biblioteca-publica/514f.webp',
        credit: 'Jazz',
        isPending: true,
        activeDecision: { id: 42, action: 'request_search' },
      }
    ];

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async (url: string, opts: any) => {
        if (opts && opts.method === 'POST') {
          const body = JSON.parse(opts.body);
          sentPayloads.push(body);
          if (shouldFail) {
            return {
              ok: false,
              status: 504,
              json: async () => ({ error: 'gateway_timeout', message: 'Tiempo de espera agotado' })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, proposals: mockBibProposals })
        };
      },
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              value: '',
              innerText: '',
              innerHTML: '',
              style: {},
              classList: { add: () => {}, remove: () => {}, contains: () => false },
              querySelectorAll: () => [],
              querySelector: () => null,
            };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      localStorage: { getItem: () => 'token' },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: () => {},
      openModal: () => {},
      closeModal: () => {},
      setTimeout: (fn: Function) => fn(),
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    // Cargar propuestas en el módulo
    await ctx.window.loadBibliotecaImageProposals('pending');

    // 1. Operador abre el modal para adoptar evento #9
    ctx.window.openBibliotecaDecisionModal(9, 'adopt');
    const firstKey = domElements['bib-decision-idempotency-key'].value;
    expect(firstKey).toBeDefined();
    expect(firstKey.length).toBeGreaterThan(10);
    expect(domElements['bib-decision-expected-previous-id'].value).toBe(''); // Null/vacío porque activeDecision era null

    // 2. Primer intento de envío (falla por timeout)
    shouldFail = true;
    await ctx.window.submitBibliotecaDecision();
    expect(sentPayloads.length).toBe(1);
    expect(sentPayloads[0].idempotencyKey).toBe(firstKey);
    expect(sentPayloads[0].expectedPreviousDecisionId).toBeNull();

    // 3. Reintento sobre el mismo modal (el usuario pulsa de nuevo "Confirmar Decisión")
    shouldFail = false;
    await ctx.window.submitBibliotecaDecision();
    expect(sentPayloads.length).toBe(2);
    // Demuestra que conserva exactamente la misma idempotencyKey para el reintento
    expect(sentPayloads[1].idempotencyKey).toBe(firstKey);

    // 4. El operador abre una decisión intencional distinta para otro evento (#19)
    ctx.window.openBibliotecaDecisionModal(19, 'discard');
    const secondKey = domElements['bib-decision-idempotency-key'].value;
    // Demuestra que una decisión intencional nueva genera una clave distinta
    expect(secondKey).not.toBe(firstKey);
    // Y lleva el expectedPreviousDecisionId correspondiente a la última decisión conocida (42)
    expect(domElements['bib-decision-expected-previous-id'].value).toBe('42');
  });
});
