import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';
import { extractExecutableInlineScripts, validateScriptSyntax } from './admin-script-syntax.test';

describe('apps/web — Panel de Administración: Rutas Gastronómicas (admin.ts)', () => {
  const html = renderAdminHtml();

  // ----------------------------------------------------------------------------
  // 1. Estructura HTML y Accesibilidad en Navegación y Sección
  // ----------------------------------------------------------------------------
  describe('Estructura HTML y Controles de la Pestaña', () => {
    test('renderAdminHtml incorpora elementos de navegación accesibles en sidebar y drawer móvil', () => {
      // Sidebar desktop
      expect(html).toContain('id="sidebar-nav-routes"');
      expect(html).toContain("onclick=\"switchSection('routes')\"");
      expect(html).toContain('Rutas Gastronómicas');

      // Drawer móvil
      expect(html).toContain('id="drawer-nav-routes"');
      expect(html).toContain("onclick=\"switchSection('routes'); toggleMobileDrawer(false);\"");
      expect(html).toContain('Rutas Gastronómicas');
    });

    test('renderAdminHtml renderiza la sección #section-routes con toolbar, contador y botón de creación', () => {
      expect(html).toContain('id="section-routes"');
      expect(html).toContain('id="routes-count-badge"');
      expect(html).toContain('openNewRouteModal()');
      expect(html).toContain('+ Nueva Ruta Gastronómica');
    });

    test('renderAdminHtml contiene los controles de filtro por búsqueda, ciudad y estado', () => {
      // Input de búsqueda
      expect(html).toContain('id="route-filter-search"');
      expect(html).toContain('oninput="onRouteSearchInput(this.value)"');
      expect(html).toContain('aria-label="Buscar rutas gastronómicas"');

      // Select de ciudad
      expect(html).toContain('id="route-filter-city"');
      expect(html).toContain('onchange="onRouteFilterChange()"');

      // Select de estado con opciones draft, published, archived y all
      expect(html).toContain('id="route-filter-status"');
      expect(html).toContain('<option value="all">Todos los estados</option>');
      expect(html).toContain('<option value="draft">Borrador</option>');
      expect(html).toContain('<option value="published">Publicada</option>');
      expect(html).toContain('<option value="archived">Archivada</option>');

      // Botón de restablecer filtros
      expect(html).toContain('onclick="resetRouteFilters()"');
    });

    test('renderAdminHtml incluye contenedores tanto para vista desktop (tabla) como vista móvil (tarjetas)', () => {
      // Contenedor desktop
      expect(html).toContain('id="routes-tbody"');
      expect(html).toContain('<th>Título</th>');
      expect(html).toContain('<th>Categoría</th>');
      expect(html).toContain('<th>Estado</th>');
      expect(html).toContain('<th>Locales</th>');
      expect(html).toContain('<th>Fechas</th>');
      expect(html).toContain('<th>Acciones</th>');

      // Contenedor móvil
      expect(html).toContain('id="routes-cards-container"');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Modales del Panel: Creación/Edición, Archivo y Previsualización
  // ----------------------------------------------------------------------------
  describe('Modales de Rutas Gastronómicas y Accesibilidad', () => {
    test('renderAdminHtml incluye el modal #modal-route con pestañas de Datos y Participantes', () => {
      expect(html).toContain('id="modal-route"');
      expect(html).toContain('id="modal-route-title"');
      expect(html).toContain('id="modal-route-status-badge"');

      // Pestañas
      expect(html).toContain('id="tab-btn-route-data"');
      expect(html).toContain("onclick=\"switchRouteModalTab('data')\"");
      expect(html).toContain('id="tab-btn-route-participants"');
      expect(html).toContain("onclick=\"switchRouteModalTab('participants')\"");
      expect(html).toContain('id="route-participants-count-tag"');

      // Contenedores de contenido de pestaña
      expect(html).toContain('id="tab-content-route-data"');
      expect(html).toContain('id="tab-content-route-participants"');
    });

    test('formulario de ruta incluye todos los campos del contrato y alerta de error accesible', () => {
      expect(html).toContain('id="form-route"');
      expect(html).toContain('id="route-id"');
      expect(html).toContain('id="route-city-id"');
      expect(html).toContain('id="route-category"');
      expect(html).toContain('id="route-title"');
      expect(html).toContain('oninput="onRouteTitleInput(this.value)"');
      expect(html).toContain('id="route-slug"');
      expect(html).toContain('id="route-summary"');
      expect(html).toContain('id="route-description"');
      expect(html).toContain('id="route-start-date"');
      expect(html).toContain('id="route-end-date"');
      expect(html).toContain('id="route-price-eur"');
      expect(html).toContain('id="route-badge-label"');
      expect(html).toContain('id="route-image-url"');

      // Alerta de error accesible role="alert"
      expect(html).toContain('id="route-form-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('id="route-form-success"');
    });

    test('modal de participantes incluye selector de venues locales y botón para añadir', () => {
      expect(html).toContain('id="route-add-venue-select"');
      expect(html).toContain('id="participants-container"');
      expect(html).toContain('onclick="addParticipantVenue()"');
      expect(html).toContain('onclick="saveRouteParticipants()"');
      expect(html).toContain('id="btn-save-route-participants"');
    });

    test('renderAdminHtml incluye modal accesible de confirmación de archivado #modal-confirm-archive-route', () => {
      expect(html).toContain('id="modal-confirm-archive-route"');
      expect(html).toContain('id="modal-archive-route-body"');
      expect(html).toContain('onclick="executeArchiveRoute()"');
    });

    test('renderAdminHtml incluye modal de previsualización #modal-route-preview', () => {
      expect(html).toContain('id="modal-route-preview"');
      expect(html).toContain('id="modal-preview-title"');
      expect(html).toContain('id="modal-preview-body"');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Sintaxis JavaScript y Validación de Scripts de Navegador
  // ----------------------------------------------------------------------------
  describe('Sintaxis de Scripts de Navegador', () => {
    test('todos los scripts inline son JavaScript puro para navegador y superan la validación sintáctica de V8', () => {
      const inlineScripts = extractExecutableInlineScripts(html);
      expect(inlineScripts.length).toBeGreaterThan(0);

      inlineScripts.forEach((script) => {
        const res = validateScriptSyntax(script);
        expect(res.valid).toBe(true);
      });
    });

    test('los controladores cliente de rutas gastronómicas están definidos en el script del admin', () => {
      expect(html).toContain('window.loadAdminRoutes =');
      expect(html).toContain('window.renderRoutesList = function renderRoutesList(');
      expect(html).toContain('window.onRouteSearchInput =');
      expect(html).toContain('window.onRouteFilterChange =');
      expect(html).toContain('window.resetRouteFilters =');
      expect(html).toContain('window.openNewRouteModal =');
      expect(html).toContain('window.editRoute =');
      expect(html).toContain('window.switchRouteModalTab =');
      expect(html).toContain('window.onRouteTitleInput =');
      expect(html).toContain('window.saveRouteMetadata =');
      expect(html).toContain('window.addParticipantVenue =');
      expect(html).toContain('window.removeParticipant =');
      expect(html).toContain('window.moveParticipant =');
      expect(html).toContain('window.renderParticipantsEditor = function renderParticipantsEditor(');
      expect(html).toContain('window.saveRouteParticipants =');
      expect(html).toContain('window.publishRoute =');
      expect(html).toContain('window.confirmArchiveRoute =');
      expect(html).toContain('window.executeArchiveRoute =');
      expect(html).toContain('window.previewRoute =');
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Lógica de Funciones Auxiliares y Controladores en Sandbox JS
  // ----------------------------------------------------------------------------
  describe('Lógica de Negocio y Controladores de Rutas', () => {
    // Configuración de un entorno VM simulado para probar las funciones cliente
    function createAdminVmContext() {
      const domElements: Record<string, any> = {
        'route-id': { value: '' },
        'route-city-id': { value: '1' },
        'route-category': { value: 'tapas' },
        'route-title': { value: '' },
        'route-slug': { value: '' },
        'route-summary': { value: '' },
        'route-description': { value: '' },
        'route-start-date': { value: '' },
        'route-end-date': { value: '' },
        'route-price-eur': { value: '' },
        'route-badge-label': { value: '' },
        'route-image-url': { value: '' },
        'route-form-error': { style: {}, innerText: '' },
        'route-form-success': { style: {}, innerText: '' },
        'tab-btn-route-data': { style: {} },
        'tab-btn-route-participants': { style: {} },
        'tab-content-route-data': { style: {} },
        'tab-content-route-participants': { style: {} },
        'btn-save-route-data': { style: {} },
        'btn-save-route-participants': { style: {} },
        'route-participants-count-tag': { innerText: '' },
        'participants-container': { innerHTML: '' },
        'route-add-venue-select': { value: '', innerHTML: '' },
        'modal-route-title': { innerText: '' },
        'modal-route-status-badge': { style: {}, innerHTML: '' },
        'modal-route-secondary-actions': { innerHTML: '' },
        'modal-archive-route-body': { innerHTML: '' },
        'modal-preview-title': { innerText: '' },
        'modal-preview-body': { innerHTML: '' },
        'form-route': { reset: () => {} },
        'routes-tbody': { innerHTML: '' },
        'routes-cards-container': { innerHTML: '' },
        'routes-count-badge': { style: {}, innerText: '' },
        'route-filter-search': { value: '' },
        'route-filter-city': { value: '1' },
        'route-filter-status': { value: 'all' },
      };

      const alerts: string[] = [];
      const fetchCalls: { url: string; options?: any }[] = [];
      let apiFetchMockResponse: any = { ok: true, status: 200, json: async () => ({}) };
      const mockStorage: Record<string, string> = {
        vayaplan_admin_token: 'mock-valid-jwt-token'
      };

      const testVenues = [
        { id: 10, city_id: 1, name: 'Bar Universonoro', slug: 'universonoro', address: 'San Juan 9', latitude: 42.01, longitude: -4.53, is_active: true, google_maps_url: 'https://maps.google.com/1' },
        { id: 20, city_id: 1, name: 'La Abadía', slug: 'la-abadia', address: 'Mayor 12', latitude: 42.02, longitude: -4.52, is_active: true, google_maps_url: 'https://maps.google.com/2' },
        { id: 30, city_id: 1, name: 'El Chaval', slug: 'el-chaval', address: 'Riberas 3', latitude: 42.03, longitude: -4.51, is_active: false, google_maps_url: null }, // inactivo
        { id: 40, city_id: 2, name: 'Mesón Valladolid', slug: 'meson-valladolid', address: 'Plaza 1', latitude: 41.65, longitude: -4.72, is_active: true, google_maps_url: null }, // otra ciudad
      ];

      const sandbox: any = {
        window: {},
        localStorage: {
          getItem: (k: string) => mockStorage[k] || null,
          setItem: (k: string, v: string) => { mockStorage[k] = v; },
          removeItem: (k: string) => { delete mockStorage[k]; },
          clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
        },
        document: {
          getElementById: (id: string) => domElements[id] || null,
          querySelector: () => null,
          querySelectorAll: () => [],
          body: {
            classList: {
              add: () => {},
              remove: () => {},
              toggle: () => {}
            }
          },
          addEventListener: () => {},
        },
        alert: (msg: string) => alerts.push(msg),
        openModal: () => {},
        closeModal: () => {},
        fetch: async (url: string, options?: any) => {
          fetchCalls.push({ url, options });
          const resp = typeof apiFetchMockResponse === 'function' ? await apiFetchMockResponse(url, options) : apiFetchMockResponse;
          return {
            ok: resp.ok !== undefined ? resp.ok : (resp.status >= 200 && resp.status < 300),
            status: resp.status || 200,
            json: resp.json || (async () => resp),
            text: resp.text || (async () => JSON.stringify(resp)),
          };
        },
        cachedVenues: testVenues,
      };

      sandbox.window = sandbox;
      sandbox.window.cachedVenues = testVenues;

      // Extraer el código ejecutable de scripts inline de admin.ts
      const scripts = extractExecutableInlineScripts(html);
      const mainScript = scripts.find(s => s.content.includes('function slugify'));
      if (mainScript) {
        vm.createContext(sandbox);
        vm.runInContext(mainScript.content, sandbox);
      }

      return {
        sandbox,
        domElements,
        alerts,
        fetchCalls,
        setFetchMock: (fnOrResp: any) => { apiFetchMockResponse = fnOrResp; }
      };
    }

    test('slugify genera slugs válidos eliminando acentos, caracteres especiales y normalizando guiones', () => {
      const { sandbox } = createAdminVmContext();
      expect(typeof sandbox.window.slugify || typeof sandbox.slugify).toBe('function');
      const slugifyFn = sandbox.window.slugify || sandbox.slugify;

      expect(slugifyFn('Ruta de las Tapas de Autor 2026')).toBe('ruta-de-las-tapas-de-autor-2026');
      expect(slugifyFn('¡Puchero, Cuchara & Tradición Palentina!')).toBe('puchero-cuchara-tradicion-palentina');
      expect(slugifyFn('   Español con ñ y acentos: áéíóú   ')).toBe('espanol-con-n-y-acentos-aeiou');
      expect(slugifyFn('Café---Bar & Más')).toBe('cafe-bar-mas');
    });

    test('onRouteTitleInput actualiza el slug en creación, pero NO lo sobrescribe si route-id ya existe (modo edición)', () => {
      const { sandbox, domElements } = createAdminVmContext();

      // Modo creación: route-id vacío
      domElements['route-id'].value = '';
      domElements['route-slug'].value = '';
      sandbox.window.onRouteTitleInput('Ruta de las Bravas');
      expect(domElements['route-slug'].value).toBe('ruta-de-las-bravas');

      // Modo edición: route-id establecido
      domElements['route-id'].value = '42';
      domElements['route-slug'].value = 'slug-original-personalizado';
      sandbox.window.onRouteTitleInput('Ruta Modificada');
      // No debe sobrescribirse
      expect(domElements['route-slug'].value).toBe('slug-original-personalizado');
    });

    test('saveRouteMetadata envía POST en creación y PATCH en edición, y NUNCA incluye status en el payload', async () => {
      const { sandbox, domElements, fetchCalls, setFetchMock } = createAdminVmContext();

      setFetchMock(async (url: string, options: any) => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 99, status: 'draft', title: 'Nueva Ruta' })
        };
      });

      // 1. Creación (id vacío)
      domElements['route-id'].value = '';
      domElements['route-city-id'].value = '1';
      domElements['route-category'].value = 'tapas';
      domElements['route-title'].value = 'Ruta de las Tapas';
      domElements['route-slug'].value = 'ruta-de-las-tapas';
      domElements['route-summary'].value = 'Un resumen suculento';
      domElements['route-price-eur'].value = '4.50';

      await sandbox.window.saveRouteMetadata();

      // Debe haber llamado a POST /api/v1/admin/routes
      const createCall = fetchCalls.find(c => c.url === '/api/v1/admin/routes');
      expect(createCall).toBeDefined();
      expect(createCall!.options.method).toBe('POST');
      const createPayload = JSON.parse(createCall!.options.body);
      expect(createPayload.approximate_price_cents).toBe(450);
      expect(createPayload.status).toBeUndefined(); // ¡Regla de oro: status no se envía!

      // 2. Edición (id presente)
      domElements['route-id'].value = '99';
      domElements['route-price-eur'].value = '5.00';
      await sandbox.window.saveRouteMetadata();

      const patchCall = fetchCalls.find(c => c.url === '/api/v1/admin/routes/99' && c.options?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(patchCall!.options.method).toBe('PATCH');
      const patchPayload = JSON.parse(patchCall!.options.body);
      expect(patchPayload.approximate_price_cents).toBe(500);
      expect(patchPayload.status).toBeUndefined(); // ¡Regla de oro: PATCH no envía status!
    });

    test('gestión de participantes: añade local activo, reordena 1..N, elimina y recalcula orden técnico', () => {
      const { sandbox, domElements } = createAdminVmContext();
      sandbox.window.setCurrentEditingRoute({ id: 100, city_id: 1, title: 'Ruta Palencia' });
      sandbox.window.setCurrentEditingParticipants([]);

      // Añadir participante con local activo id=10
      domElements['route-add-venue-select'].value = '10';
      sandbox.window.addParticipantVenue();

      const participantsAfterAdd1 = sandbox.window.getCurrentEditingParticipants();
      expect(participantsAfterAdd1.length).toBe(1);
      expect(participantsAfterAdd1[0].venue_id).toBe(10);
      expect(participantsAfterAdd1[0].display_order).toBe(1);
      expect(participantsAfterAdd1[0].is_active).toBe(true);

      // Añadir segundo participante con local id=20
      domElements['route-add-venue-select'].value = '20';
      sandbox.window.addParticipantVenue();

      const participantsAfterAdd2 = sandbox.window.getCurrentEditingParticipants();
      expect(participantsAfterAdd2.length).toBe(2);
      expect(participantsAfterAdd2[1].venue_id).toBe(20);
      expect(participantsAfterAdd2[1].display_order).toBe(2);

      // Reordenar participante (subir el segundo a la primera posición)
      sandbox.window.moveParticipant(1, -1);
      const participantsAfterMove = sandbox.window.getCurrentEditingParticipants();
      expect(participantsAfterMove[0].venue_id).toBe(20);
      expect(participantsAfterMove[0].display_order).toBe(1);
      expect(participantsAfterMove[1].venue_id).toBe(10);
      expect(participantsAfterMove[1].display_order).toBe(2);

      // Eliminar el primer participante (id=20)
      sandbox.window.removeParticipant(0);
      const participantsAfterRemove = sandbox.window.getCurrentEditingParticipants();
      expect(participantsAfterRemove.length).toBe(1);
      expect(participantsAfterRemove[0].venue_id).toBe(10);
      expect(participantsAfterRemove[0].display_order).toBe(1); // Reajuste correlativo 1..N
    });

    test('renderParticipantsEditor renderiza la etiqueta técnica "Orden de visualización: #[display_order]" sin terminología de itinerarios', () => {
      const { sandbox, domElements } = createAdminVmContext();
      sandbox.window.setCurrentEditingRoute({ id: 100, city_id: 1 });
      sandbox.window.setCurrentEditingParticipants([
        {
          venue_id: 10,
          display_order: 1,
          dish_name: 'Tapa Estrella',
          dish_description: 'Exquisita tapa',
          dish_price_cents: 250,
          dish_image_url: null,
          is_optional: false,
          is_active: true,
          venue: { id: 10, name: 'Bar Universonoro', address: 'San Juan 9' }
        }
      ]);

      sandbox.window.renderParticipantsEditor();
      const editorHtml = domElements['participants-container'].innerHTML;

      // Debe contener la etiqueta técnica
      expect(editorHtml).toContain('Orden de visualización: #1');

      // No debe contener lenguaje de visitas ni de itinerario
      expect(editorHtml).not.toContain('Parada 1');
      expect(editorHtml).not.toContain('Orden de visita');
      expect(editorHtml).not.toContain('Itinerario');
    });

    test('saveRouteParticipants valida nombres obligatorios y envía PUT con display_order correlativo', async () => {
      const { sandbox, domElements, fetchCalls, setFetchMock } = createAdminVmContext();
      sandbox.window.setCurrentEditingRoute({ id: 100, city_id: 1 });

      setFetchMock({
        ok: true,
        status: 200,
        json: async () => ({
          participants: [
            { venue_id: 10, display_order: 1, dish_name: 'Bravas', is_active: true, is_optional: false }
          ]
        })
      });

      // 1. Validación de nombre obligatorio
      sandbox.window.setCurrentEditingParticipants([
        { venue_id: 10, display_order: 1, dish_name: '   ', is_active: true, is_optional: false }
      ]);

      await sandbox.window.saveRouteParticipants();
      expect(domElements['route-form-error'].style.display).toBe('block');
      expect(domElements['route-form-error'].innerText).toContain('debe tener un nombre de propuesta culinaria');
      expect(fetchCalls.length).toBe(0); // No debe llamar a la API

      // 2. Envío correcto cuando los datos son válidos
      sandbox.window.setCurrentEditingParticipants([
        { venue_id: 10, display_order: 1, dish_name: 'Bravas Especiales', dish_price_cents: 300, is_active: true, is_optional: false }
      ]);

      await sandbox.window.saveRouteParticipants();
      const putCall = fetchCalls.find(c => c.url === '/api/v1/admin/routes/100/participants');
      expect(putCall).toBeDefined();
      expect(putCall!.options.method).toBe('PUT');
      const putPayload = JSON.parse(putCall!.options.body);
      expect(putPayload.participants.length).toBe(1);
      expect(putPayload.participants[0].display_order).toBe(1);
      expect(putPayload.participants[0].dish_name).toBe('Bravas Especiales');
    });

    test('publishRoute maneja el error 422 insufficient_stops mostrando mensaje amigable en español', async () => {
      const { sandbox, alerts, setFetchMock } = createAdminVmContext();

      setFetchMock({
        ok: false,
        status: 422,
        json: async () => ({
          error: 'insufficient_stops',
          message: 'Route must have at least 2 active stops'
        })
      });

      await sandbox.window.publishRoute(100);

      expect(alerts.length).toBe(1);
      expect(alerts[0]).toBe('Se necesitan al menos 2 locales participantes activos con su local activo para publicar la ruta.');
    });

    test('confirmArchiveRoute abre modal con confirmación y executeArchiveRoute llama a POST /api/v1/admin/routes/:id/archive', async () => {
      const { sandbox, domElements, fetchCalls, setFetchMock } = createAdminVmContext();

      sandbox.window.setCurrentEditingRoute({ id: 100, title: 'Ruta Bravas Palencia', status: 'published' });

      sandbox.window.confirmArchiveRoute(100);
      expect(sandbox.window.getRouteToArchiveId()).toBe(100);
      expect(domElements['modal-archive-route-body'].innerHTML).toContain('Ruta Bravas Palencia');

      setFetchMock({
        ok: true,
        status: 200,
        json: async () => ({ id: 100, status: 'archived' })
      });

      await sandbox.window.executeArchiveRoute();

      const archiveCall = fetchCalls.find(c => c.url === '/api/v1/admin/routes/100/archive');
      expect(archiveCall).toBeDefined();
      expect(archiveCall!.options.method).toBe('POST');
    });

    test('previewRoute renderiza el contrato público sin exponer display_order ni itinerario ni distancia', async () => {
      const { sandbox, domElements, setFetchMock } = createAdminVmContext();

      const publicRoutePreview = {
        route: {
          id: 100,
          slug: 'ruta-de-las-bravas',
          title: 'Ruta de las Bravas',
          summary: 'Las mejores bravas de la ciudad',
          description: 'Recorrido gastronómico sin igual',
          category: 'bravas',
          status: 'draft',
          is_permanent: true,
          start_date: null,
          end_date: null,
          participants_count: 2,
          participants: [
            {
              venue: {
                id: 10,
                name: 'Bar Universonoro',
                slug: 'universonoro',
                address: 'San Juan 9',
                latitude: 42.01,
                longitude: -4.53,
                google_maps_url: 'https://maps.google.com/?q=42.01,-4.53'
              },
              dish: {
                name: 'Bravas Crujientes',
                description: 'Con salsa casera secreta',
                price_cents: 350,
                price_label: '3,50 €',
                image_url: 'https://images.vayaplan.com/bravas.jpg'
              },
              is_optional: false
            }
          ]
        }
      };

      setFetchMock({
        ok: true,
        status: 200,
        json: async () => publicRoutePreview
      });

      await sandbox.window.previewRoute(100);

      expect(domElements['modal-preview-title'].innerText).toBe('Ruta de las Bravas');
      const previewHtml = domElements['modal-preview-body'].innerHTML;

      // Debe mostrar el local y la propuesta
      expect(previewHtml).toContain('Bar Universonoro');
      expect(previewHtml).toContain('Bravas Crujientes');
      expect(previewHtml).toContain('3,50 €');
      expect(previewHtml).toContain('https://maps.google.com/?q=42.01,-4.53');

      // NO debe exponer display_order, numeración técnica, itinerario ni distancia/duración
      expect(previewHtml).not.toContain('display_order');
      expect(previewHtml).not.toContain('Parada 1');
      expect(previewHtml).not.toContain('Itinerario');
      expect(previewHtml).not.toContain('Distancia');
      expect(previewHtml).not.toContain('Duración');
    });
  });
});
