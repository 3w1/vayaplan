import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';

interface StepResult {
  name: string;
  passed: boolean;
  details: string;
}

const steps: StepResult[] = [];
function record(name: string, passed: boolean, details: string) {
  steps.push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
}

async function runBrowserVerification() {
  console.log('=== VERIFICACIÓN AISLADA DE NAVEGADOR (PÁGINA PÚBLICA EXTRAÍDA) ===\n');

  const testPort = '3099';
  const profileDir = '/tmp/chrome-web-verify-' + Date.now();
  fs.mkdirSync(profileDir, { recursive: true });

  // 1. Iniciar servidor web de prueba en puerto 3099 con proxy hacia API local
  const webProc: ChildProcess = spawn('bun', ['run', 'apps/web/src/index.ts'], {
    env: {
      ...process.env,
      PORT: testPort,
      ENABLE_API_PROXY: 'true',
      INTERNAL_API_URL: 'http://127.0.0.1:4000',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

  // Esperar a que el servidor web responda
  let webReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${testPort}/health`);
      if (res.ok) {
        webReady = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!webReady) {
    webProc.kill();
    throw new Error(`El servidor web efímero no respondió en el puerto ${testPort}`);
  }
  console.log(`✓ Servidor web de pruebas listo en http://127.0.0.1:${testPort}`);

  // 2. Iniciar Google Chrome en modo Headless con CDP
  const chromeProc: ChildProcess = spawn('/usr/local/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,900',
  ], { stdio: 'ignore' });

  let cdpConnected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const v = await fetch('http://127.0.0.1:9225/json/version');
      if (v.ok) { cdpConnected = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!cdpConnected) {
    webProc.kill();
    chromeProc.kill();
    throw new Error('No se pudo conectar a Chrome CDP en puerto 9225');
  }
  console.log('✓ Google Chrome headless conectado en puerto 9225');

  try {
    const newPageRes = await fetch('http://127.0.0.1:9225/json/new', { method: 'PUT' });
    const target = await newPageRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map<number, (res: any) => void>();
    const consoleErrors: string[] = [];
    const jsExceptions: string[] = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)!(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        const type = data.params?.type;
        const text = data.params?.args?.map((a: any) => a.value || a.description).join(' ') || '';
        if (type === 'error') {
          consoleErrors.push(text);
        }
      }
      if (data.method === 'Runtime.exceptionThrown') {
        const desc = data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text || '';
        jsExceptions.push(desc);
      }
    };

    function sendCDP(method: string, params: any = {}): Promise<any> {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression: string): Promise<any> {
      const res = await sendCDP('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return res?.result?.value;
    }

    await sendCDP('Page.enable');
    await sendCDP('Runtime.enable');
    await sendCDP('Network.enable');

    // -------------------------------------------------------------------------
    // 1. Portada y Listado con Filtros Activos y Sincronización de URL
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 1: Carga de Portada con Filtros Activos (ciudad, fecha, categoría) ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    const initialListingUrl = `http://127.0.0.1:${testPort}/?city=palencia&date=2026-10-19&cat=musica`;
    await sendCDP('Page.navigate', { url: initialListingUrl });
    await new Promise((r) => setTimeout(r, 2000));

    const pageTitle = await evaluate('document.title');
    record('Título de Portada', pageTitle.includes('VayaPlan'), `Título recibido: "${pageTitle}"`);

    const currentSearch = await evaluate('window.location.search');
    record('Preservación de Query Params en URL de Listado', currentSearch.includes('city=palencia') && currentSearch.includes('cat=musica'), `Search: "${currentSearch}"`);

    const isMusicaTabActive = await evaluate("document.querySelector('.cat-btn[data-cat=\"musica\"]')?.classList.contains('active')");
    record('Botón de Categoría Música Activo', !!isMusicaTabActive, `cat-btn[musica] active: ${isMusicaTabActive}`);

    const isFilterBarVisible = await evaluate("document.getElementById('active-filters-bar')?.classList.contains('visible')");
    const chipsContent = await evaluate("document.getElementById('chips-list')?.textContent?.trim()");
    record('Barra de Filtros Activos Visible con Chip de Música', !!(isFilterBarVisible && chipsContent?.includes('Música')), `Barra visible: ${isFilterBarVisible}, Chip: "${chipsContent}"`);

    const eventCardsCount = await evaluate("document.querySelectorAll('.card-compact[data-action=\"open-event\"]').length");
    record('Listado de Eventos Filtrados Renderizado', eventCardsCount > 0, `Tarjetas de eventos encontradas: ${eventCardsCount}`);

    record('Ausencia de Errores JS en Portada con Filtros', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 2. Ficha de Detalle, Retorno con Filtros, Scroll e Historial
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 2: Ficha de Detalle, Retorno a Listado con Filtros y Scroll ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    // Simular desplazamiento de scroll en el listado antes de abrir evento
    await evaluate("document.body.style.minHeight = '2500px'");
    await evaluate('window.scrollTo(0, 320)');
    await new Promise((r) => setTimeout(r, 200));
    const scrollBeforeOpen = await evaluate('window.scrollY');

    await evaluate("document.querySelector('.card-compact[data-action=\"open-event\"]').click()");
    await new Promise((r) => setTimeout(r, 600));

    const isDetailModalOpen = await evaluate("document.getElementById('detail-modal')?.classList.contains('active')");
    record('Apertura Modal Detalle', !!isDetailModalOpen, `Modal detail activo: ${isDetailModalOpen}`);

    const urlAfterCardClick = await evaluate('window.location.pathname');
    record('Actualización de URL a /events/:id via pushState', urlAfterCardClick.startsWith('/events/'), `URL actual: ${urlAfterCardClick}`);

    const eventTitleInModal = await evaluate("document.getElementById('modal-title-main')?.textContent?.trim()");
    record('Título de Evento en Modal', !!eventTitleInModal, `Título en modal: "${eventTitleInModal}"`);

    const titleAfterOpen = await evaluate('document.title');
    record('Actualización de document.title con datos del evento', titleAfterOpen.includes(eventTitleInModal || 'VayaPlan'), `Título recibido: "${titleAfterOpen}"`);

    const priceText = await evaluate("document.querySelector('.modal-price-display')?.textContent?.trim()");
    record('Visualización Factual de Precio', !!priceText, `Etiqueta de precio: "${priceText}"`);

    const hasPosterButton = await evaluate("!!document.querySelector('[data-action=\"open-full-poster\"]')");
    record('Disparador de Cartel Presente', hasPosterButton, `Botón open-full-poster detectado: ${hasPosterButton}`);

    if (hasPosterButton) {
      await evaluate("document.querySelector('[data-action=\"open-full-poster\"]').click()");
      await new Promise((r) => setTimeout(r, 500));

      const lightboxVisible = await evaluate("document.getElementById('poster-lightbox')?.style.display !== 'none'");
      record('Apertura Visor de Cartel', !!lightboxVisible, `Lightbox display visible: ${lightboxVisible}`);

      // Presionar Escape para cerrar Lightbox (Primer Escape)
      await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
      await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
      await new Promise((r) => setTimeout(r, 400));

      const lightboxClosed = await evaluate("document.getElementById('poster-lightbox')?.style.display === 'none'");
      const modalStillOpen = await evaluate("document.getElementById('detail-modal')?.classList.contains('active')");
      record('Prioridad Escape en Lightbox: Cierra solo visor, modal permanece abierto', !!(lightboxClosed && modalStillOpen), `Lightbox cerrado: ${lightboxClosed}, Modal sigue activo: ${modalStillOpen}`);

      const focusedTag = await evaluate("document.activeElement?.getAttribute('data-action') || document.activeElement?.tagName");
      record('Restauración de Foco al Disparador', focusedTag === 'open-full-poster', `Elemento enfocado: ${focusedTag}`);
    }

    // 2A. Cierre mediante botón de cerrar ficha y comprobación de restauración de filtros, URL y scroll
    await evaluate("document.querySelector('.modal-close-btn')?.click()");
    await new Promise((r) => setTimeout(r, 400));

    const isClosedByBtn = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    const fullUrlAfterBtnClose = await evaluate('window.location.pathname + window.location.search');
    const expectedListingPath = '/?city=palencia&date=2026-10-19&cat=musica';
    record('Cierre con Botón restaura exactamente URL y parámetros de listado', isClosedByBtn && fullUrlAfterBtnClose === expectedListingPath, `URL restaurada: ${fullUrlAfterBtnClose}`);

    const filterAfterBtnClose = await evaluate("document.querySelector('.cat-btn[data-cat=\"musica\"]')?.classList.contains('active')");
    record('Filtro de Música sigue activo tras cerrar modal', !!filterAfterBtnClose, `Filtro música activo: ${filterAfterBtnClose}`);

    const scrollAfterBtnClose = await evaluate('window.scrollY');
    record('Scroll previo restaurado fielmente tras cierre', Math.abs(scrollAfterBtnClose - scrollBeforeOpen) <= 5, `Scroll: antes=${scrollBeforeOpen}, después=${scrollAfterBtnClose}`);

    // Restaurar estilo temporal de scroll
    await evaluate("document.body.style.minHeight = ''");

    // 2B. Reapertura y Cierre mediante tecla Escape
    await evaluate("document.querySelector('.card-compact[data-action=\"open-event\"]').click()");
    await new Promise((r) => setTimeout(r, 500));

    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    const isClosedByEscape = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    const fullUrlAfterEscape = await evaluate('window.location.pathname + window.location.search');
    record('Cierre con Escape restaura exactamente URL de listado con filtros', isClosedByEscape && fullUrlAfterEscape === expectedListingPath, `URL: ${fullUrlAfterEscape}`);

    // 2C. Navegación adelante/atrás en historial del navegador
    await evaluate('window.history.forward()');
    await new Promise((r) => setTimeout(r, 500));
    const modalReopenedOnForward = await evaluate("document.getElementById('detail-modal')?.classList.contains('active')");
    const forwardUrl = await evaluate('window.location.pathname');
    record('Navegación Adelante (forward) reabre modal y actualiza URL a /events/:id', !!(modalReopenedOnForward && forwardUrl.startsWith('/events/')), `Modal: ${modalReopenedOnForward}, URL: ${forwardUrl}`);

    await evaluate('window.history.back()');
    await new Promise((r) => setTimeout(r, 500));
    const modalClosedOnBack = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    const backFullUrl = await evaluate('window.location.pathname + window.location.search');
    record('Navegación Atrás (back) cierra modal y sincroniza URL con filtros', !!(modalClosedOnBack && backFullUrl === expectedListingPath), `Modal cerrado: ${modalClosedOnBack}, URL: ${backFullUrl}`);

    record('Ausencia de Errores JS en Detalle e Historial', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 2D. Consultas Pendientes, Respuestas Demoradas y Cancelación Segura
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 2D: Cancelación de Peticiones en Vuelo y Respuestas Demoradas ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    // Configurar mock de fetch con control de retardos y datos sintéticos
    await evaluate(`(() => {
      window.__realFetch = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        // Petición A (evento 8): demora de 800ms
        if (url.includes('/api/v1/events/8')) {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(async () => {
              try {
                const res = await window.__realFetch(input, init);
                resolve(res);
              } catch (e) {
                reject(e);
              }
            }, 800);
            if (init && init.signal) {
              init.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          });
        }
        // Petición B (evento 9991): respuesta rápida sintética de 150ms
        if (url.includes('/api/v1/events/9991')) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(new Response(JSON.stringify({
                event: {
                  id: 9991,
                  title: 'Evento B Concierto',
                  start_time: '2026-10-19T21:00:00.000Z',
                  end_time: null,
                  status: 'published',
                  venue: { name: 'Sala B' },
                  price: { is_free: true, amount_cents: 0 },
                  actions: {},
                  category: 'musica_directo'
                }
              }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }, 150);
          });
        }
        return window.__realFetch(input, init);
      };
    })()`);

    // Caso A: Abrir evento y cerrar inmediatamente antes de que llegue la respuesta
    const listingTitleBeforeSlow = await evaluate('document.title');
    await evaluate('(() => { window.openEventModal(8, { pushHistory: true }); })()');
    await new Promise((r) => setTimeout(r, 60)); // Espera corta para que inicie la petición asíncrona
    const spinnerVisibleWhileLoading = await evaluate("!!document.querySelector('.loader-spinner')");
    record('Spinner visible durante petición demorada', spinnerVisibleWhileLoading, `Spinner presente: ${spinnerVisibleWhileLoading}`);

    // Cerrar modal de inmediato antes de que transcurran los 800ms
    await evaluate('window.closeModal()');
    await new Promise((r) => setTimeout(r, 1000)); // Esperar a que venza el temporizador de la petición abortada

    const modalStaysClosedAfterDelayedFetch = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    record('Petición Demorada Cancelada: Modal permanece cerrado', modalStaysClosedAfterDelayedFetch, `Modal cerrado tras resolución tardía: ${modalStaysClosedAfterDelayedFetch}`);

    const titleRemainsListingAfterAbort = await evaluate('document.title');
    record('Petición Demorada Cancelada: Título no es sobrescrito', titleRemainsListingAfterAbort === listingTitleBeforeSlow, `Título: "${titleRemainsListingAfterAbort}"`);

    const urlRemainsListingAfterAbort = await evaluate('window.location.pathname + window.location.search');
    record('Petición Demorada Cancelada: URL permanece en listado con filtros', urlRemainsListingAfterAbort === expectedListingPath, `URL: ${urlRemainsListingAfterAbort}`);

    // Caso B: Abrir A y pulsar Atrás antes de recibir respuesta (no debe revertir navegación)
    await evaluate('(() => { window.openEventModal(8, { pushHistory: true }); })()');
    await new Promise((r) => setTimeout(r, 50));
    await evaluate('window.history.back()');
    await new Promise((r) => setTimeout(r, 1000));

    const modalClosedAfterBackOnLoading = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    const urlAfterBackOnLoading = await evaluate('window.location.pathname + window.location.search');
    record('Abrir A y pulsar Atrás antes de recibir: Modal cerrado y navegación no revertida',
      modalClosedAfterBackOnLoading && urlAfterBackOnLoading === expectedListingPath,
      `Modal cerrado: ${modalClosedAfterBackOnLoading}, URL: ${urlAfterBackOnLoading}`);

    // Caso C: Abrir A y después B (A demorado no sustituye a B rápido)
    await evaluate('(() => { window.openEventModal(8, { pushHistory: true }); })()');
    await new Promise((r) => setTimeout(r, 50));
    await evaluate('(() => { window.openEventModal(9991, { pushHistory: true }); })()');
    // Esperar 250ms para que B responda (150ms)
    await new Promise((r) => setTimeout(r, 250));
    const titleModalB = await evaluate("document.getElementById('modal-title-main')?.textContent?.trim()");
    record('Evento B rápido se renderiza en modal', titleModalB === 'Evento B Concierto', `Título en modal: "${titleModalB}"`);

    // Esperar 800ms adicionales para que la respuesta de A venza si no hubiese sido abortada
    await new Promise((r) => setTimeout(r, 800));
    const titleModalStillB = await evaluate("document.getElementById('modal-title-main')?.textContent?.trim()");
    record('Evento A demorado nunca sustituye ni sobrescribe a B', titleModalStillB === 'Evento B Concierto', `Título en modal: "${titleModalStillB}"`);

    // Cerrar modal tras Caso C
    await evaluate('window.closeModal()');
    await new Promise((r) => setTimeout(r, 400));

    // Caso D: Rápida alternancia Atrás/Adelante durante peticiones en curso
    await evaluate('window.history.forward()');
    await new Promise((r) => setTimeout(r, 80));
    await evaluate('window.history.back()');
    await new Promise((r) => setTimeout(r, 80));
    await evaluate('window.history.forward()');
    await new Promise((r) => setTimeout(r, 80));
    await evaluate('window.history.back()');
    await new Promise((r) => setTimeout(r, 400));

    const modalInSyncAfterRapidNav = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    const urlInSyncAfterRapidNav = await evaluate('window.location.pathname + window.location.search');
    record('Rápida navegación Atrás/Adelante sincroniza estado y URL', modalInSyncAfterRapidNav && urlInSyncAfterRapidNav === expectedListingPath,
      `Modal cerrado: ${modalInSyncAfterRapidNav}, URL: ${urlInSyncAfterRapidNav}`);

    // Restaurar fetch original
    await evaluate('window.fetch = window.__realFetch');

    record('Ausencia de Errores JS en Cancelación y Respuestas Demoradas', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 3. Entrada Directa por URL (/events/:id) y Cierre Seguro
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 3: Entrada Directa por URL (/events/8) ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    await sendCDP('Page.navigate', { url: `http://127.0.0.1:${testPort}/events/8` });
    await new Promise((r) => setTimeout(r, 2000));

    const directTitle = await evaluate('document.title');
    record('Metadatos SSR en Entrada Directa', directTitle.includes('Festival Jazz'), `Título recibido: "${directTitle}"`);

    const directCanonical = await evaluate("document.querySelector('link[rel=\"canonical\"]')?.getAttribute('href')");
    record('Canonical link en Entrada Directa', directCanonical === 'https://vayaplan.com/events/8', `Canonical recibido: "${directCanonical}"`);

    const directModalOpen = await evaluate("document.getElementById('detail-modal')?.classList.contains('active')");
    record('Modal desplegado inmediatamente en Entrada Directa', !!directModalOpen, `Modal activo: ${directModalOpen}`);

    // Cerrar modal en entrada directa: no debe hacer history.back() ciego ni salir del sitio
    await evaluate("document.querySelector('.modal-close-btn')?.click()");
    await new Promise((r) => setTimeout(r, 500));

    const directClosed = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    const directUrlAfterClose = await evaluate('window.location.pathname');
    record('Cierre Seguro tras Entrada Directa navega a / sin abandonar el sitio', !!(directClosed && directUrlAfterClose === '/'), `Modal cerrado: ${directClosed}, URL: ${directUrlAfterClose}`);

    record('Ausencia de Errores JS en Entrada Directa', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 4. Entrada Directa a Evento Inexistente (404) y Malformado (400)
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 4: Control de Errores 404 y 400 ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    await sendCDP('Page.navigate', { url: `http://127.0.0.1:${testPort}/events/99999` });
    await new Promise((r) => setTimeout(r, 2000));

    const notFoundTitle = await evaluate('document.title');
    record('Título Neutro en 404', notFoundTitle.includes('Plan no encontrado'), `Título recibido: "${notFoundTitle}"`);

    const notFoundBtn = await evaluate("!!document.querySelector('[data-action=\"navigate-home\"]')");
    record('Botón para explorar agenda presente en 404', notFoundBtn, `Botón navigate-home: ${notFoundBtn}`);

    if (notFoundBtn) {
      await evaluate("document.querySelector('[data-action=\"navigate-home\"]').click()");
      await new Promise((r) => setTimeout(r, 500));
      const notFoundUrlAfterNav = await evaluate('window.location.pathname');
      record('Botón de 404 navega a /', notFoundUrlAfterNav === '/', `URL tras click: ${notFoundUrlAfterNav}`);
    }

    // Comprobación de status 400 en ID malformado
    const malformedRes = await fetch(`http://127.0.0.1:${testPort}/events/abc`);
    record('Respuesta 400 en ID malformado', malformedRes.status === 400, `Status HTTP recibido: ${malformedRes.status}`);

    // Comprobación de status 404 en ID no publicado
    const notFoundRes = await fetch(`http://127.0.0.1:${testPort}/events/99999`);
    record('Respuesta 404 en ID inexistente', notFoundRes.status === 404, `Status HTTP recibido: ${notFoundRes.status}`);

    record('Ausencia de Errores JS en Flujo 404', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 5. Panel de Curación (/admin)
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 5: Panel de Curación (/admin) ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    await sendCDP('Page.navigate', { url: `http://127.0.0.1:${testPort}/admin` });
    await new Promise((r) => setTimeout(r, 2000));

    const adminTitle = await evaluate('document.title');
    record('Carga Panel Admin', adminTitle.includes('Panel de Curación'), `Título recibido: "${adminTitle}"`);

    const openedEditor = await evaluate(`(() => {
      if (typeof openNewEventModal === 'function') {
        openNewEventModal();
        return true;
      }
      return false;
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const isEditorActive = await evaluate("document.getElementById('modal-event')?.classList.contains('active')");
    record('Apertura Editor en Admin', !!(openedEditor && isEditorActive), `Editor abierto: ${openedEditor}, active: ${isEditorActive}`);

    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    const isEditorClosed = await evaluate("!document.getElementById('modal-event')?.classList.contains('active')");
    record('Cierre Editor en Admin con Escape', !!isEditorClosed, `Editor cerrado tras Escape: ${isEditorClosed}`);

    record('Ausencia de Errores JS en Admin', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    ws.close();
  } finally {
    chromeProc.kill();
    webProc.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n=== RESUMEN FINAL DE PRUEBAS EN NAVEGADOR ===');
  const allPassed = steps.every((s) => s.passed);
  console.log(`Total: ${steps.length} | Superadas: ${steps.filter((s) => s.passed).length} | Fallidas: ${steps.filter((s) => !s.passed).length}`);
  if (!allPassed) {
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error('Error fatal durante la verificación en navegador:', err);
  process.exit(1);
});
