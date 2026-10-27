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

function createMockElement(id: string) {
  const classes = new Set<string>();
  const attributes: Record<string, string> = {};
  return {
    id,
    value: '',
    innerText: '',
    textContent: '',
    innerHTML: '',
    style: {} as Record<string, any>,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
      has: (c: string) => classes.has(c),
      toggle: (c: string) => {
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      },
    },
    attributes,
    setAttribute: (k: string, v: string) => { attributes[k] = String(v); },
    getAttribute: (k: string) => attributes[k] ?? null,
    removeAttribute: (k: string) => { delete attributes[k]; },
    querySelector: (sel: string) => {
      if (sel === 'button, a') return { focus: () => {} };
      return null;
    },
    querySelectorAll: () => [],
    contains: (_child: any) => false,
    closest: (_sel: string) => null,
    focus: () => {},
  };
}

describe('apps/web — Rediseño de Propuestas: Pruebas de Comportamiento e Interfaz (Fase 1)', () => {
  const html = renderAdminHtml();
  const scripts = extractExecutableInlineScripts(html);
  const mainScript = scripts.find(s => s.content.includes('window.renderProposalsList'));
  expect(mainScript).toBeDefined();

  function createTestEnvironment(customProposals: any[] = [], fetchOverride?: Function) {
    const domElements: Record<string, any> = {};

    function getEl(id: string) {
      if (!domElements[id]) {
        domElements[id] = createMockElement(id);
      }
      return domElements[id];
    }

    // Preinicializar elementos clave
    const pendingTab = getEl('prop-tab-pending');
    pendingTab.classList.add('active');
    pendingTab.setAttribute('aria-selected', 'true');

    const resolvedTab = getEl('prop-tab-resolved');
    resolvedTab.setAttribute('aria-selected', 'false');

    const allTab = getEl('prop-tab-all');
    allTab.setAttribute('aria-selected', 'false');

    getEl('btn-toggle-more-filters').setAttribute('aria-expanded', 'false');
    getEl('more-filters-active-dot').style.display = 'none';
    getEl('proposals-active-chips-bar').style.display = 'none';
    getEl('proposals-more-filters-panel').style.display = 'none';

    // Select de procedencia
    const sourceEl = getEl('proposal-filter-source');
    sourceEl.options = [
      { value: '', text: 'Todas las procedencias' },
      { value: 'INSTAGRAM_POST', text: '📷 Instagram (@posts)' },
      { value: 'WEB_PROGRAMACION', text: '🏛️ Ateneo de Palencia (Web)' },
    ];
    sourceEl.selectedIndex = 0;
    sourceEl.value = '';

    // Select de estado
    const statusEl = getEl('proposal-filter-status');
    statusEl.options = [
      { value: 'pending', text: 'Pendientes de revisión' },
      { value: 'approved_draft', text: 'Aprobados como borrador' },
      { value: 'rejected', text: 'Rechazados' },
      { value: 'archived', text: 'Archivados' },
      { value: 'promotion', text: 'Promociones comerciales' },
      { value: '', text: 'Todos los estados' },
    ];
    statusEl.selectedIndex = 0;
    statusEl.value = 'pending';

    // Select de clasificación
    const classEl = getEl('proposal-filter-classification');
    classEl.options = [
      { value: '', text: 'Todos los tipos' },
      { value: 'events', text: '🎯 Propuestas de eventos estándar' },
      { value: 'no_time', text: '⏰ Eventos sin hora' },
      { value: 'duplicates', text: '⚠️ Posibles duplicados' },
      { value: 'continuous', text: '🏛️ Eventos continuos' },
      { value: 'venue_content', text: '🍸 Contenido de local / ambiente' },
      { value: 'ateneo', text: '🏛️ Programación Ateneo' },
    ];
    classEl.selectedIndex = 0;
    classEl.value = '';

    // Formulario de edición
    getEl('edit-prop-classification-select').value = 'EVENTO_POSIBLE';
    getEl('edit-prop-category-select').value = 'dj_tardeo';
    getEl('edit-prop-price-status-select').value = 'NOT_INFORMED';

    const documentListeners: Record<string, Function[]> = {};
    let lastScrollY = 0;

    const defaultFetch = async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        message: 'OK',
        proposals: customProposals,
      }),
    });

    const activeFetch = fetchOverride || defaultFetch;

    const sandbox: any = {
      window: {},
      URLSearchParams,
      scrollY: 150,
      scrollTo: (_x: number, y: number) => {
        lastScrollY = y;
        sandbox.scrollY = y;
      },
      getLastScrollY: () => lastScrollY,
      fetch: activeFetch,
      apiFetch: activeFetch,
      document: {
        activeElement: null,
        getElementById: (id: string) => getEl(id),
        querySelector: (sel: string) => {
          if (sel === '.modal-overlay.active') {
            for (const key of Object.keys(domElements)) {
              if (key.startsWith('modal-') && domElements[key].classList && domElements[key].classList.contains('active')) {
                return domElements[key];
              }
            }
          }
          return null;
        },
        querySelectorAll: (sel: string) => {
          if (sel === '.modal-overlay.active') {
            return Object.keys(domElements)
              .filter(k => domElements[k].classList && domElements[k].classList.contains('active') && k.startsWith('modal-'))
              .map(k => domElements[k]);
          }
          if (sel === '.proposal-menu-dropdown') {
            return Object.keys(domElements)
              .filter(k => k.startsWith('prop-menu-dropdown-'))
              .map(k => domElements[k]);
          }
          if (sel === '.btn-menu-trigger') {
            return Object.keys(domElements)
              .filter(k => k.startsWith('prop-menu-trigger-'))
              .map(k => domElements[k]);
          }
          return [];
        },
        body: {
          contains: (_el: any) => true,
          classList: {
            classes: new Set<string>(),
            add(c: string) { this.classes.add(c); },
            remove(c: string) { this.classes.delete(c); },
            contains(c: string) { return this.classes.has(c); }
          }
        },
        addEventListener: (event: string, fn: Function) => {
          if (!documentListeners[event]) documentListeners[event] = [];
          documentListeners[event].push(fn);
        },
      },
      localStorage: {
        getItem: () => 'valid-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: () => {},
      confirm: () => true,
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
      editEvent: (id: number) => {
        sandbox.lastEditedEventId = id;
      },
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    return {
      ctx,
      sandbox,
      domElements,
      getEl,
      documentListeners,
      triggerDocumentEvent: (event: string, payload: any) => {
        if (documentListeners[event]) {
          documentListeners[event].forEach(fn => fn(payload));
        }
      }
    };
  }

  test('1. Sincronización bidireccional entre pestañas de estado y selector de estado detallado', async () => {
    let queriedUrl = '';
    const { ctx, getEl } = createTestEnvironment([], async (url: string) => {
      queriedUrl = url;
      return { ok: true, status: 200, json: async () => ({ proposals: [] }) };
    });

    // 1.1 Estado inicial: Pendientes
    await ctx.window.loadAdminProposals();
    expect(queriedUrl).toContain('review_status=pending');
    expect(getEl('prop-tab-pending').classList.contains('active')).toBe(true);
    expect(getEl('prop-tab-pending').getAttribute('aria-selected')).toBe('true');

    // 1.2 Cambiar a pestaña "Resueltas"
    await ctx.window.switchProposalStateTab('resolved');
    expect(ctx.currentProposalStateTab).toBe('resolved');
    expect(getEl('prop-tab-resolved').classList.contains('active')).toBe(true);
    expect(getEl('prop-tab-pending').classList.contains('active')).toBe(false);

    // 1.3 Cambiar a pestaña "Todas"
    await ctx.window.switchProposalStateTab('all');
    expect(ctx.currentProposalStateTab).toBe('all');
    expect(getEl('prop-tab-all').classList.contains('active')).toBe(true);

    // 1.4 Seleccionar estado detallado "rejected" en el select
    getEl('proposal-filter-status').value = 'rejected';
    await ctx.window.onProposalDetailedStatusChange();
    expect(ctx.currentProposalStateTab).toBe('resolved');
    expect(getEl('prop-tab-resolved').classList.contains('active')).toBe(true);

    // 1.5 Seleccionar estado detallado "pending" en el select
    getEl('proposal-filter-status').value = 'pending';
    await ctx.window.onProposalDetailedStatusChange();
    expect(ctx.currentProposalStateTab).toBe('pending');
    expect(getEl('prop-tab-pending').classList.contains('active')).toBe(true);
  });

  test('2. Búsqueda textual y filtro de procedencia sobre >100 propuestas: opera en cliente sobre cargadas y reporta total honesto', async () => {
    const syntheticProposals = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      title: i === 15 ? 'Concierto Especial de Jazz' : (i === 42 ? 'Sesión DJ Electrónica' : 'Evento General #' + (i + 1)),
      venue_id: i === 10 ? 10149 : 10001,
      venue_name: i === 10 ? 'Ateneo de Palencia' : 'Bar Central',
      source_type: i === 10 ? 'WEB_PROGRAMACION' : 'INSTAGRAM_POST',
      instagram_username: i === 10 ? null : 'barcentral_pa',
      review_status: 'pending',
      proposed_date: '2026-11-01',
      proposed_time: '20:00',
      classification: 'EVENTO_POSIBLE',
      confidence: 'ALTA',
      category: 'musica_en_vivo',
      price_status: 'FREE',
    }));

    const { ctx, getEl } = createTestEnvironment(syntheticProposals);
    await ctx.window.loadAdminProposals();

    // Sin filtros de página: total del servidor
    expect(getEl('proposals-count-text').innerText).toBe('120 propuestas cargadas (servidor)');
    expect(getEl('proposals-count-badge').innerText).toBe('120 propuestas');

    // Búsqueda textual específica
    ctx.window.onProposalSearchInput('jazz');
    expect(getEl('proposals-cards-container').innerHTML).toContain('Concierto Especial de Jazz');
    expect(getEl('proposals-cards-container').innerHTML).not.toContain('Sesión DJ Electrónica');
    expect(getEl('proposals-count-text').innerText).toBe('1 de 120 cargadas (filtro en página)');
    expect(getEl('proposals-count-badge').innerText).toBe('1 coincidencia');

    // Búsqueda textual por cuenta de usuario Instagram
    ctx.window.onProposalSearchInput('barcentral');
    expect(getEl('proposals-count-text').innerText).toBe('119 de 120 cargadas (filtro en página)');

    // Limpiar búsqueda
    ctx.window.clearProposalSearch();
    expect(getEl('proposals-count-text').innerText).toBe('120 propuestas cargadas (servidor)');

    // Filtrar procedencia: Ateneo (Web)
    getEl('proposal-filter-source').value = 'WEB_PROGRAMACION';
    ctx.window.renderProposalsList(syntheticProposals);
    expect(getEl('proposals-cards-container').innerHTML).toContain('Ateneo de Palencia');
    expect(getEl('proposals-count-text').innerText).toBe('1 de 120 cargadas (filtro en página)');

    // Filtrar procedencia: Instagram
    getEl('proposal-filter-source').value = 'INSTAGRAM_POST';
    ctx.window.renderProposalsList(syntheticProposals);
    expect(getEl('proposals-count-text').innerText).toBe('119 de 120 cargadas (filtro en página)');
  });

  test('3. Estado vacío descriptivo y contadores honestos cuando no hay coincidencias', async () => {
    const mockProposals = [
      {
        id: 1,
        title: 'Cata de Vinos',
        venue_id: 10001,
        venue_name: 'Bodega Central',
        review_status: 'pending',
        classification: 'EVENTO_POSIBLE',
        proposed_date: '2026-11-05',
        proposed_time: '19:00',
      }
    ];

    const { ctx, getEl } = createTestEnvironment(mockProposals);
    await ctx.window.loadAdminProposals();

    // Búsqueda sin coincidencia
    ctx.window.onProposalSearchInput('monologo comedia no existente');
    expect(getEl('proposals-cards-container').innerHTML).toContain('No se encontraron propuestas');
    expect(getEl('proposals-cards-container').innerHTML).toContain('Ajusta los filtros o la pestaña para ver otros registros.');
    expect(getEl('proposals-count-text').innerText).toBe('0 de 1 cargadas (filtro en página)');
    expect(getEl('proposals-count-badge').innerText).toBe('0 coincidencias');
  });

  test('4. Barra de chips activos: eliminación individual y botón Limpiar filtros restaura todos los campos', async () => {
    const mockProposals = [
      { id: 1, title: 'Fiesta Retro', venue_id: 10001, review_status: 'pending', classification: 'EVENTO_POSIBLE' }
    ];

    const { ctx, getEl } = createTestEnvironment(mockProposals);
    await ctx.window.loadAdminProposals();

    // Activar varios filtros mediante las funciones reales
    ctx.window.onProposalSearchInput('retro');
    getEl('proposal-filter-source').value = 'INSTAGRAM_POST';
    getEl('proposal-filter-source').selectedIndex = 1;
    getEl('proposal-filter-classification').value = 'no_time';
    getEl('proposal-filter-classification').selectedIndex = 2;
    ctx.window.renderProposalsList(mockProposals);

    expect(getEl('proposals-active-chips-bar').style.display).toBe('flex');
    expect(getEl('proposals-active-chips-bar').innerHTML).toContain('Búsqueda: &quot;retro&quot;');
    expect(getEl('proposals-active-chips-bar').innerHTML).toContain('Procedencia:');
    expect(getEl('proposals-active-chips-bar').innerHTML).toContain('Tipo:');

    // Eliminar chip de búsqueda individual
    ctx.window.removeProposalFilterChip('search');
    expect(getEl('proposal-filter-search').value).toBe('');

    // Eliminar chip de procedencia
    ctx.window.removeProposalFilterChip('source');
    expect(getEl('proposal-filter-source').value).toBe('');

    // Limpiar todos los filtros
    ctx.window.resetProposalFilters();
    await ctx.window.loadAdminProposals();
    expect(getEl('proposal-filter-search').value).toBe('');
    expect(getEl('proposal-filter-source').value).toBe('');
    expect(getEl('proposal-filter-classification').value).toBe('');
    expect(getEl('proposal-filter-status').value).toBe('pending');
    expect(ctx.currentProposalStateTab).toBe('pending');
    expect(getEl('proposals-active-chips-bar').style.display).toBe('none');
  });

  test('5. Accesos visibles: botón #prop-tab-ateneo filtra programación de Ateneo y #prop-tab-biblioteca carga imágenes oficiales', async () => {
    let bibliotecaProposalsLoaded = false;
    const { ctx, getEl } = createTestEnvironment([
      { id: 10, title: 'Conferencia Ateneo', venue_id: 10149, source_type: 'WEB_PROGRAMACION', review_status: 'pending' },
      { id: 20, title: 'Concierto Bar', venue_id: 10001, source_type: 'INSTAGRAM_POST', review_status: 'pending' },
    ]);
    ctx.window.loadBibliotecaImageProposals = () => { bibliotecaProposalsLoaded = true; };

    await ctx.window.loadAdminProposals();

    // Clic en botón Ateneo
    expect(html).toContain('id="prop-tab-ateneo"');
    await ctx.window.filterAteneoProposals();
    expect(getEl('proposal-filter-source').value).toBe('WEB_PROGRAMACION');
    expect(getEl('proposals-cards-container').innerHTML).toContain('Conferencia Ateneo');
    expect(getEl('proposals-cards-container').innerHTML).not.toContain('Concierto Bar');

    // Clic en pestaña Biblioteca Pública
    expect(html).toContain('id="prop-tab-biblioteca"');
    ctx.window.switchProposalTab('biblioteca');
    expect(bibliotecaProposalsLoaded).toBe(true);
  });

  test('6. Acciones contextuales por estado: hora por completar, duplicados y evento publicado editEvent()', async () => {
    const mockProposals = [
      {
        id: 101,
        title: 'Fiesta Sin Hora',
        classification: 'EVENTO_POSIBLE_SIN_HORA',
        proposed_date: '2026-11-10',
        proposed_time: null,
        review_status: 'pending',
      },
      {
        id: 102,
        title: 'Concierto Duplicado',
        classification: 'DUPLICADO_POSIBLE',
        matched_event_id: 88,
        matched_event_title: 'Concierto en Sala',
        review_status: 'pending',
      },
      {
        id: 103,
        title: 'Evento Ya Aprobado',
        review_status: 'approved_draft',
        created_event_id: 555,
      }
    ];

    const { ctx, getEl } = createTestEnvironment(mockProposals);
    ctx.currentProposalStateTab = 'all';
    await ctx.window.loadAdminProposals();

    const cardsHtml = getEl('proposals-cards-container').innerHTML;

    // 6.1 Propuesta sin hora: botón de aprobación exige hora
    expect(cardsHtml).toContain('⏰ Asignar Hora y Aprobar');
    expect(cardsHtml).toContain('⏰ Hora por completar');

    // 6.2 Propuesta con match duplicado: botón 🔗 Vincular
    expect(cardsHtml).toContain('⚠️ Posible duplicado:');
    expect(cardsHtml).toContain('confirmLinkProposal(102, 88)');
    expect(cardsHtml).toContain('🔗 Vincular');

    // 6.3 Propuesta resuelta (approved_draft): botón directo 🎯 Ver evento #555 llamando a editEvent(555)
    expect(cardsHtml).toContain('🎯 Ver evento #555');
    expect(cardsHtml).toContain('onclick="editEvent(555)"');
    expect(cardsHtml).not.toContain('(Draft)'); // No asume "(Draft)"

    // Simular llamada a editEvent
    expect(typeof ctx.window.editEvent).toBe('function');
    let editEventCalledId: number | null = null;
    ctx.window.editEvent = (id: number) => { editEventCalledId = id; };
    ctx.window.editEvent(555);
    expect(editEventCalledId).toBe(555);
  });

  test('7. Distinción de enlaces y procedencia: ↗ Ver en Instagram (posts IG) vs ↗ Ver publicación original (web Ateneo)', async () => {
    const mockProposals = [
      {
        id: 201,
        title: 'Post de Instagram',
        source_type: 'INSTAGRAM_POST',
        source_url: 'https://www.instagram.com/p/Cxyz123/',
        instagram_username: 'bardeluxe',
        review_status: 'pending',
      },
      {
        id: 202,
        title: 'Acto de Ateneo',
        source_type: 'WEB_PROGRAMACION',
        venue_id: 10149,
        source_url: 'https://ateneopalencia.com/actividades/202',
        review_status: 'pending',
      }
    ];

    const { ctx, getEl } = createTestEnvironment(mockProposals);
    await ctx.window.loadAdminProposals();

    const item201 = getEl('proposals-cards-container').innerHTML;
    // Instagram
    expect(item201).toContain('📷 Instagram');
    expect(item201).toContain('(@bardeluxe)');
    expect(item201).toContain('↗ Ver en Instagram');

    // Ateneo Web
    expect(item201).toContain('🏛️ Ateneo (Web)');
    expect(item201).toContain('↗ Ver publicación original');
  });

  test('8. submitEditProposal preserva filtros activos y posición de scroll tras guardar', async () => {
    let patchUrl = '';
    let patchBody: any = null;

    const mockProposals = [
      { id: 301, title: 'Obra Teatral', review_status: 'pending', classification: 'EVENTO_POSIBLE' }
    ];

    const { ctx, sandbox, getEl } = createTestEnvironment(mockProposals, async (url: string, opts: any) => {
      if (opts && opts.method === 'PATCH') {
        patchUrl = url;
        patchBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ message: 'Guardado con éxito' }) };
      }
      return { ok: true, status: 200, json: async () => ({ proposals: mockProposals }) };
    });

    await ctx.window.loadAdminProposals();

    // Simular que el usuario estaba en scroll Y = 420 y tenía un filtro de local activo
    sandbox.scrollY = 420;
    getEl('proposal-filter-venue').value = '10001';
    getEl('edit-prop-id').value = '301';
    getEl('edit-prop-title-input').value = 'Obra Teatral Modificada';
    getEl('edit-prop-classification-select').value = 'EVENTO_POSIBLE';

    await ctx.window.submitEditProposal();

    expect(patchUrl).toBe('/api/v1/admin/proposals/301');
    expect(patchBody.title).toBe('Obra Teatral Modificada');
    // Verifica que tras guardar restauró la posición de scroll
    expect(sandbox.getLastScrollY()).toBe(420);
    // Verifica que el filtro de local sigue intacto
    expect(getEl('proposal-filter-venue').value).toBe('10001');
  });

  test('9. Menú secundario •••: apertura, autocierre con Escape, clic fuera y retorno de foco al trigger', async () => {
    const mockProposals = [
      { id: 401, title: 'Taller de Pintura', review_status: 'pending', classification: 'EVENTO_POSIBLE' }
    ];

    const { ctx, getEl, triggerDocumentEvent } = createTestEnvironment(mockProposals);
    await ctx.window.loadAdminProposals();

    const triggerEl = getEl('prop-menu-trigger-401');
    const dropdownEl = getEl('prop-menu-dropdown-401');

    // 9.1 Apertura
    ctx.window.toggleProposalActionsMenu(401, { stopPropagation: () => {} });
    expect(ctx.activeProposalOpenMenuId).toBe(401);
    expect(dropdownEl.style.display).toBe('flex');
    expect(triggerEl.getAttribute('aria-expanded')).toBe('true');

    // 9.2 Tecla Escape cierra el menú secundario
    let stopPropagationCalled = false;
    triggerDocumentEvent('keydown', { key: 'Escape', stopPropagation: () => { stopPropagationCalled = true; } });
    expect(ctx.activeProposalOpenMenuId).toBeNull();
    expect(dropdownEl.style.display).toBe('none');
    expect(triggerEl.getAttribute('aria-expanded')).toBe('false');
    expect(stopPropagationCalled).toBe(true);

    // 9.3 Abrir de nuevo y cerrar con clic fuera
    ctx.window.toggleProposalActionsMenu(401, { stopPropagation: () => {} });
    expect(ctx.activeProposalOpenMenuId).toBe(401);
    triggerDocumentEvent('click', { target: { closest: () => null } });
    expect(ctx.activeProposalOpenMenuId).toBeNull();
    expect(dropdownEl.style.display).toBe('none');
  });

  test('10. Visor de imagen: valida protocolo seguro (descarta URLs no seguras), foco inicial, Escape y retorno de foco', async () => {
    const mockProposals = [
      {
        id: 501,
        title: 'Cartel Legítimo',
        image_url: 'https://media.vayaplan.com/bars/cartel.webp',
        review_status: 'pending'
      },
      {
        id: 502,
        title: 'Intento XSS',
        image_url: 'javascript:alert(document.cookie)',
        review_status: 'pending'
      }
    ];

    const { ctx, getEl, triggerDocumentEvent } = createTestEnvironment(mockProposals);
    await ctx.window.loadAdminProposals();

    // 10.1 Imagen legítima: se abre el modal y se configuran src, alt y título
    ctx.window.openProposalImageModal(501);
    expect(getEl('modal-proposal-image').classList.contains('active')).toBe(true);
    expect(getEl('modal-prop-img-element').src).toBe('https://media.vayaplan.com/bars/cartel.webp');
    expect(getEl('modal-prop-img-external').href).toBe('https://media.vayaplan.com/bars/cartel.webp');
    expect(ctx.document.body.classList.contains('modal-open')).toBe(true);

    // 10.2 Tecla Escape cierra el modal
    triggerDocumentEvent('keydown', { key: 'Escape', stopPropagation: () => {} });
    expect(getEl('modal-proposal-image').classList.contains('active')).toBe(false);
    expect(ctx.document.body.classList.contains('modal-open')).toBe(false);

    // 10.3 URL no segura (javascript:): openProposalImageModal la rechaza y no abre el modal
    ctx.window.openProposalImageModal(502);
    expect(getEl('modal-proposal-image').classList.contains('active')).toBe(false);
    expect(ctx.document.body.classList.contains('modal-open')).toBe(false);
  });

  test('11. Aprobación de continuos sin hora vs eventos puntuales: texto de acción y flujo/modal que abre', async () => {
    const mockProposals = [
      {
        id: 601,
        title: 'Exposición Temporal sin hora',
        classification: 'EVENTO_CONTINUO',
        proposed_date: '2026-11-01',
        proposed_end_date: '2026-11-30',
        proposed_time: null,
        review_status: 'pending',
        venue_id: 10150,
      },
      {
        id: 602,
        title: 'Festival Multidía sin hora por rango de fechas',
        classification: 'EVENTO_POSIBLE',
        proposed_date: '2026-11-10',
        proposed_end_date: '2026-11-12',
        proposed_time: null,
        review_status: 'pending',
        venue_id: 10001,
      },
      {
        id: 603,
        title: 'Concierto Puntual sin hora',
        classification: 'EVENTO_POSIBLE',
        proposed_date: '2026-11-20',
        proposed_end_date: null,
        proposed_time: null,
        review_status: 'pending',
        venue_id: 10001,
      },
    ];

    const { ctx, getEl } = createTestEnvironment(mockProposals);
    await ctx.window.loadAdminProposals();

    const cardsHtml = getEl('proposals-cards-container').innerHTML;

    // 11.1 Los eventos continuos sin hora (#601 y #602) NO muestran "⏰ Asignar Hora y Aprobar"
    // sino que muestran el botón estándar "✓ Aprobar Borrador" y horario de sala por defecto
    expect(cardsHtml).toContain('De 08:00 a 18:00');
    expect(cardsHtml).toContain('Exposición Temporal sin hora');
    expect(cardsHtml).toContain('Festival Multidía sin hora');

    // 11.2 El evento puntual sin hora (#603) SÍ muestra "⏰ Asignar Hora y Aprobar" y "⏰ Hora por completar"
    expect(cardsHtml).toContain('⏰ Asignar Hora y Aprobar');
    expect(cardsHtml).toContain('⏰ Hora por completar');

    // 11.3 Apertura del modal de aprobación para continuo (#601):
    // Debe mostrar badge de continuo y el hint opcional de horario de sala
    ctx.window.openApproveProposalModal(601);
    expect(getEl('approve-prop-continuous-badge').style.display).toBe('block');
    expect(getEl('approve-prop-continuous-text').innerText).toBe('Del 2026-11-01 al 2026-11-30');
    expect(getEl('approve-prop-time-hint').innerText).toBe('Opcional para eventos continuos (horario de sala)');
    expect(getEl('modal-approve-proposal').classList.contains('active')).toBe(true);

    // 11.4 Apertura del modal de aprobación para puntual (#603):
    // Debe ocultar badge de continuo y el hint debe exigir hora obligatoria
    ctx.window.openApproveProposalModal(603);
    expect(getEl('approve-prop-continuous-badge').style.display).toBe('none');
    expect(getEl('approve-prop-time-hint').innerText).toBe('Obligatorio para eventos puntuales');
  });

  test('12. Secuencia Ateneo tras filtro de otro local/fecha y descarte de respuestas demoradas (concurrencia)', async () => {
    const fetchedUrls: string[] = [];
    let resolveSlowFetch: ((val: any) => void) | null = null;

    const mockAteneoProposals = [
      { id: 701, title: 'Charla Ateneo', venue_id: 10149, source_type: 'WEB_PROGRAMACION', review_status: 'pending' },
    ];
    const mockOldVenueProposals = [
      { id: 801, title: 'Cine Club Antiguo', venue_id: 10001, source_type: 'INSTAGRAM_POST', review_status: 'pending' },
    ];

    const { ctx, getEl } = createTestEnvironment([], async (url: string) => {
      fetchedUrls.push(url);
      if (url.includes('venue_id=10001')) {
        // Simular petición demorada
        return new Promise((resolve) => {
          resolveSlowFetch = () => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ proposals: mockOldVenueProposals }),
            });
          };
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ proposals: mockAteneoProposals }),
      };
    });

    // 12.1 Simular filtros previos de otro local y fecha
    getEl('proposal-filter-venue').value = '10001';
    getEl('proposal-filter-date').value = '2026-11-15';
    getEl('proposal-filter-classification').value = 'events';

    // Lanzar la carga inicial con esos filtros (queda en vuelo porque es lenta)
    const slowLoadPromise = ctx.window.loadAdminProposals();

    // 12.2 Usuario pulsa el botón Ateneo mientras la petición anterior sigue en vuelo
    const ateneoPromise = ctx.window.filterAteneoProposals();

    // Comprobar que los filtros incompatibles se limpiaron y procedencia es Ateneo
    expect(getEl('proposal-filter-venue').value).toBe('');
    expect(getEl('proposal-filter-date').value).toBe('');
    expect(getEl('proposal-filter-classification').value).toBe('');
    expect(getEl('proposal-filter-source').value).toBe('WEB_PROGRAMACION');

    // Esperar a que termine la petición de Ateneo
    await ateneoPromise;

    // La UI y los datos cargados corresponden a Ateneo
    expect(getEl('proposals-cards-container').innerHTML).toContain('Charla Ateneo');

    // 12.3 Ahora resuelve tardíamente la petición anterior demorada (#801)
    if (resolveSlowFetch) {
      (resolveSlowFetch as Function)();
    }
    await slowLoadPromise;

    // La protección currentReqId !== adminProposalsRequestId descartó la respuesta obsoleta
    // Los datos mostrados siguen siendo los de Ateneo y NO fueron sustituidos por mockOldVenueProposals
    expect(getEl('proposals-cards-container').innerHTML).toContain('Charla Ateneo');
    expect(getEl('proposals-cards-container').innerHTML).not.toContain('Cine Club Antiguo');
  });
});
