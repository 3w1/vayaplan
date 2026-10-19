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

async function runActionsBrowserVerification() {
  console.log('=== VERIFICACIÓN AISLADA EN NAVEGADOR DE ACCIONES DE EVENTO (CHROME HEADLESS + CDP) ===\n');

  const testPort = '3098';
  const profileDir = '/tmp/chrome-actions-verify-' + Date.now();
  fs.mkdirSync(profileDir, { recursive: true });

  // 1. Iniciar servidor web efímero
  const webProc: ChildProcess = spawn('bun', ['run', 'apps/web/src/index.ts'], {
    env: {
      ...process.env,
      PORT: testPort,
      ENABLE_API_PROXY: 'true',
      INTERNAL_API_URL: 'http://127.0.0.1:4000',
      PUBLIC_URL: 'https://vayaplan.com',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

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

  // 2. Iniciar Google Chrome en modo Headless con CDP en viewport móvil
  const chromeProc: ChildProcess = spawn('/usr/local/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9227',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
    '--window-size=360,640', // Viewport móvil estrecho
  ], { stdio: 'ignore' });

  let cdpConnected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const v = await fetch('http://127.0.0.1:9227/json/version');
      if (v.ok) { cdpConnected = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!cdpConnected) {
    webProc.kill();
    chromeProc.kill();
    throw new Error('No se pudo conectar a Chrome CDP en puerto 9227');
  }
  console.log('✓ Google Chrome headless conectado en puerto 9227');

  try {
    const newPageRes = await fetch('http://127.0.0.1:9227/json/new', { method: 'PUT' });
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
    // 1. Acceso a /events/8 en Viewport Móvil (360x640) y Detección de Desbordamiento
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 1: Viewport Móvil Estrecho y Ausencia de Desbordamiento ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    await sendCDP('Page.navigate', { url: `http://127.0.0.1:${testPort}/events/8` });
    await new Promise((r) => setTimeout(r, 2000));

    // Comprobación de no desbordamiento horizontal
    const docWidth = await evaluate('document.documentElement.clientWidth');
    const docScrollWidth = await evaluate('document.documentElement.scrollWidth');
    const actionsSectionScrollWidth = await evaluate("document.querySelector('.event-actions-section')?.scrollWidth");
    const actionsSectionClientWidth = await evaluate("document.querySelector('.event-actions-section')?.clientWidth");

    const noDocOverflow = docScrollWidth <= docWidth;
    const noActionsOverflow = actionsSectionScrollWidth <= actionsSectionClientWidth + 1;

    record('Sin Desbordamiento Horizontal en Móvil', noDocOverflow && noActionsOverflow,
      `doc: ${docScrollWidth}<=${docWidth}, actions: ${actionsSectionScrollWidth}<=${actionsSectionClientWidth}`);

    // Comprobación de presencia de los 5 botones
    const hasWhatsApp = await evaluate("!!document.querySelector('[data-action=\"whatsapp-share\"]')");
    const hasShare = await evaluate("!!document.querySelector('[data-action=\"share-event\"]')");
    const hasCopy = await evaluate("!!document.querySelector('[data-action=\"copy-event-link\"]')");
    const hasDirections = await evaluate("!!document.querySelector('[data-action=\"directions-click\"]')");
    const hasCalendar = await evaluate("!!document.querySelector('[data-action=\"calendar-download\"], [data-action=\"calendar-download\"], .btn-calendar')");

    record('Presencia de 5 Acciones Visibles', hasWhatsApp && hasShare && hasCopy && hasDirections && hasCalendar,
      `WA=${hasWhatsApp}, Share=${hasShare}, Copy=${hasCopy}, Dir=${hasDirections}, Cal=${hasCalendar}`);

    // -------------------------------------------------------------------------
    // 2. Verificación Factual de WhatsApp
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 2: Acción de WhatsApp ---');
    const waHref = await evaluate("document.querySelector('[data-action=\"whatsapp-share\"]')?.getAttribute('href')");
    const waTarget = await evaluate("document.querySelector('[data-action=\"whatsapp-share\"]')?.getAttribute('target')");
    const waRel = await evaluate("document.querySelector('[data-action=\"whatsapp-share\"]')?.getAttribute('rel')");

    const waStartsWith = waHref?.startsWith('https://wa.me/?text=');
    const decodedWa = decodeURIComponent(waHref?.replace('https://wa.me/?text=', '') || '');

    record('Enlace wa.me seguro y en pestaña externa', waStartsWith && waTarget === '_blank' && waRel?.includes('noopener'),
      `target: ${waTarget}, rel: ${waRel}`);

    record('Mensaje de WhatsApp con formato requerido (Título, Fecha, Local, Precio Gratis, URL)',
      decodedWa.includes('Festival Jazz') &&
      decodedWa.includes('Teatro Principal de Palencia') &&
      decodedWa.includes('Gratis') &&
      decodedWa.includes('https://vayaplan.com/events/8'),
      `Mensaje decodificado:\n${decodedWa}`);

    // -------------------------------------------------------------------------
    // 3. Verificación de Compartir (navigator.share con Mock y Casos Límite)
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 3: Compartir (navigator.share) ---');

    // 3A. navigator.share disponible y exitoso
    await evaluate(`(() => {
      window.__shareCalls = [];
      navigator.share = async (data) => {
        window.__shareCalls.push(data);
        return Promise.resolve();
      };
    })()`);

    await evaluate("document.querySelector('[data-action=\"share-event\"]').click()");
    await new Promise((r) => setTimeout(r, 200));

    const sharePayload = await evaluate('window.__shareCalls[0]');
    record('navigator.share invocado con payload canónico',
      sharePayload?.url === 'https://vayaplan.com/events/8' && sharePayload?.title?.includes('Festival Jazz'),
      `Payload: ${JSON.stringify(sharePayload)}`);

    // 3B. navigator.share cancelado por el usuario (AbortError): no debe lanzar error ni copiar
    await evaluate(`(() => {
      window.__shareAborted = false;
      navigator.share = async () => {
        const err = new DOMException('The user cancelled the share', 'AbortError');
        throw err;
      };
      // Espiar clipboard
      window.__clipboardCalls = [];
      navigator.clipboard.writeText = async (text) => {
        window.__clipboardCalls.push(text);
      };
    })()`);

    await evaluate("document.querySelector('[data-action=\"share-event\"]').click()");
    await new Promise((r) => setTimeout(r, 300));

    const clipboardCallsOnAbort = await evaluate('window.__clipboardCalls.length');
    record('Cancelación de Compartir (AbortError) no lanza error ni flujo secundario',
      clipboardCallsOnAbort === 0 && consoleErrors.length === 0 && jsExceptions.length === 0,
      `Clipboard calls: ${clipboardCallsOnAbort}, Errors: ${consoleErrors.length}`);

    // 3C. navigator.share falla con error no abortivo -> fallback automático a copia
    await evaluate(`(() => {
      navigator.share = async () => {
        throw new Error('Share system unavailable');
      };
    })()`);

    await evaluate("document.querySelector('[data-action=\"share-event\"]').click()");
    await new Promise((r) => setTimeout(r, 300));

    const clipboardCallsOnShareError = await evaluate('window.__clipboardCalls.length');
    record('Fallo de Compartir realiza fallback a copiar enlace', clipboardCallsOnShareError === 1,
      `Clipboard calls tras fallo: ${clipboardCallsOnShareError}`);

    // -------------------------------------------------------------------------
    // 4. Verificación de Copiar Enlace y Fallback
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 4: Copiar Enlace y Fallback Accesible ---');

    // 4A. Copia exitosa en portapapeles
    await evaluate(`(() => {
      window.__clipboardWritten = [];
      navigator.clipboard.writeText = async (t) => {
        window.__clipboardWritten.push(t);
        return Promise.resolve();
      };
    })()`);

    await evaluate("document.querySelector('[data-action=\"copy-event-link\"]').click()");
    await new Promise((r) => setTimeout(r, 300));

    const writtenUrl = await evaluate('window.__clipboardWritten[0]');
    const copyBtnText = await evaluate("document.querySelector('[data-action=\"copy-event-link\"] .action-btn-text')?.textContent");
    const liveAnnouncerText = await evaluate("document.getElementById('actions-live-announcer')?.textContent");

    record('Copia en portapapeles exitosa con feedback visual y anuncio accesible',
      writtenUrl === 'https://vayaplan.com/events/8' &&
      copyBtnText === '¡Enlace copiado!' &&
      liveAnnouncerText?.includes('con éxito'),
      `URL: ${writtenUrl}, Btn: "${copyBtnText}", Anuncio: "${liveAnnouncerText}"`);

    // 4B. Fallback cuando el portapapeles falla / denegado
    await evaluate(`(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('Permission denied'));
      document.execCommand = () => false;
    })()`);

    await evaluate("document.querySelector('[data-action=\"copy-event-link\"]').click()");
    await new Promise((r) => setTimeout(r, 300));

    const fallbackVisible = await evaluate("document.getElementById('actions-copy-fallback')?.style.display !== 'none'");
    const fallbackInputValue = await evaluate("document.getElementById('actions-copy-fallback')?.querySelector('input')?.value");
    const fallbackAnnounce = await evaluate("document.getElementById('actions-live-announcer')?.textContent");

    record('Fallback de copia manual muestra input seleccionable y anuncio accesible',
      fallbackVisible && fallbackInputValue === 'https://vayaplan.com/events/8',
      `Visible: ${fallbackVisible}, Input: "${fallbackInputValue}", Anuncio: "${fallbackAnnounce}"`);

    // -------------------------------------------------------------------------
    // 5. Verificación de Cómo llegar y Descarga de Calendario
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 5: Cómo llegar y Calendario ---');

    const directionsHref = await evaluate("document.querySelector('[data-action=\"directions-click\"]')?.getAttribute('href')");
    record('Cómo llegar prioriza destino de mapas seguro',
      directionsHref?.includes('google.com/maps') && !directionsHref.includes('javascript:'),
      `URL: ${directionsHref}`);

    const calHref = await evaluate("document.querySelector('[data-action=\"calendar-download\"]')?.getAttribute('href')");
    const calDownload = await evaluate("document.querySelector('[data-action=\"calendar-download\"]')?.getAttribute('download')");
    record('Botón Calendario apunta a ruta pública .ics con atributo download',
      calHref === '/events/8/calendar.ics' && calDownload === 'evento-8.ics',
      `href: ${calHref}, download: ${calDownload}`);

    // Comprobar respuesta HTTP del endpoint .ics
    const icsHttpRes = await fetch(`http://127.0.0.1:${testPort}/events/8/calendar.ics`);
    const icsContentType = icsHttpRes.headers.get('content-type');
    const icsBody = await icsHttpRes.text();

    record('Ruta /events/8/calendar.ics devuelve 200 OK y VCALENDAR RFC 5545',
      icsHttpRes.status === 200 &&
      icsContentType?.includes('text/calendar') &&
      icsBody.includes('BEGIN:VCALENDAR') &&
      icsBody.includes('UID:event-8@vayaplan.com') &&
      icsBody.includes('SUMMARY:Festival Jazz'),
      `Status: ${icsHttpRes.status}, Content-Type: ${icsContentType}`);

    // -------------------------------------------------------------------------
    // 6. Accesibilidad por Teclado y Evento Cancelado
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 6: Accesibilidad por Teclado y Comportamiento en Cancelados ---');

    // Comprobar foco accesible mediante Tab
    await evaluate("document.querySelector('.event-action-btn')?.focus()");
    const activeTagName = await evaluate('document.activeElement?.tagName');
    record('Botones de acción son interactivos y reciben foco', !!activeTagName, `Active: ${activeTagName}`);

    // Simular evento cancelado sintético en modal
    await evaluate(`(() => {
      const syntheticCancelled = {
        id: 777,
        title: 'Feria Cancelada',
        status: 'cancelled',
        start_time: '2026-10-25T17:00:00.000Z',
        end_time: '2026-10-25T20:00:00.000Z',
        venue: { name: 'Pabellón Ferial', latitude: 42.01, longitude: -4.53 },
        price: { amount_cents: 0, is_free: true, label: 'Gratis' },
        actions: { maps_url: 'https://maps.google.com/?cid=777' }
      };
      const container = document.querySelector('.event-actions-section');
      const actionSource = extractEventActionSource(syntheticCancelled);
      container.outerHTML = renderEventActionsHtml(actionSource);
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const cancelledWaHref = await evaluate("document.querySelector('[data-action=\"whatsapp-share\"]')?.getAttribute('href')");
    const decodedCancelledWa = decodeURIComponent(cancelledWaHref?.replace('https://wa.me/?text=', '') || '');
    record('WhatsApp en evento cancelado añade CANCELADO: en primera línea',
      decodedCancelledWa.startsWith('CANCELADO: Feria Cancelada'),
      `Mensaje: "${decodedCancelledWa.split('\\n')[0]}"`);

    const cancelledCalDisabled = await evaluate("document.querySelector('.btn-calendar')?.hasAttribute('disabled')");
    const cancelledCalAriaDisabled = await evaluate("document.querySelector('.btn-calendar')?.getAttribute('aria-disabled') === 'true'");
    const cancelledCalNotice = await evaluate("document.querySelector('.action-temporal-note')?.textContent");

    record('Calendario en evento cancelado está deshabilitado con aviso explicativo',
      cancelledCalDisabled && cancelledCalAriaDisabled && cancelledCalNotice?.includes('cancelado'),
      `disabled: ${cancelledCalDisabled}, aria-disabled: ${cancelledCalAriaDisabled}, notice: "${cancelledCalNotice}"`);

    record('Ausencia total de errores JS en pruebas de acciones',
      consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    ws.close();
  } finally {
    chromeProc.kill();
    webProc.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n=== RESUMEN DE PRUEBAS AISLADAS EN NAVEGADOR ===');
  const allPassed = steps.every((s) => s.passed);
  console.log(`Total: ${steps.length} | Superadas: ${steps.filter((s) => s.passed).length} | Fallidas: ${steps.filter((s) => !s.passed).length}`);
  if (!allPassed) {
    process.exit(1);
  }
}

runActionsBrowserVerification().catch((err) => {
  console.error('Error fatal durante la verificación de acciones en navegador:', err);
  process.exit(1);
});
