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
    // 1. Portada y Listado de Eventos
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 1: Carga de Portada y Listado ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    await sendCDP('Page.navigate', { url: `http://127.0.0.1:${testPort}/?city=palencia&date=2026-10-19` });
    await new Promise((r) => setTimeout(r, 2000));

    const pageTitle = await evaluate('document.title');
    record('Título de Portada', pageTitle.includes('VayaPlan'), `Título recibido: "${pageTitle}"`);

    const eventCardsCount = await evaluate("document.querySelectorAll('.card-compact[data-action=\"open-event\"]').length");
    record('Listado de Eventos Renderizado', eventCardsCount > 0, `Tarjetas de eventos encontradas: ${eventCardsCount}`);

    record('Ausencia de Errores JS en Portada', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 2. Ficha de Detalle y Visor de Cartel (Lightbox)
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 2: Ficha de Detalle y Visor de Cartel ---');
    consoleErrors.length = 0;
    jsExceptions.length = 0;

    await evaluate("document.querySelector('.card-compact[data-action=\"open-event\"]').click()");
    await new Promise((r) => setTimeout(r, 600));

    const isDetailModalOpen = await evaluate("document.getElementById('detail-modal')?.classList.contains('active')");
    record('Apertura Modal Detalle', !!isDetailModalOpen, `Modal detail activo: ${isDetailModalOpen}`);

    const hasPosterButton = await evaluate("!!document.querySelector('[data-action=\"open-full-poster\"]')");
    record('Disparador de Cartel Presente', hasPosterButton, `Botón open-full-poster detectado: ${hasPosterButton}`);

    if (hasPosterButton) {
      await evaluate("document.querySelector('[data-action=\"open-full-poster\"]').click()");
      await new Promise((r) => setTimeout(r, 500));

      const lightboxVisible = await evaluate("document.getElementById('poster-lightbox')?.style.display !== 'none'");
      record('Apertura Visor de Cartel', !!lightboxVisible, `Lightbox display visible: ${lightboxVisible}`);

      // Presionar Escape para cerrar Lightbox
      await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
      await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
      await new Promise((r) => setTimeout(r, 400));

      const lightboxClosed = await evaluate("document.getElementById('poster-lightbox')?.style.display === 'none'");
      record('Cierre Visor de Cartel con Escape', !!lightboxClosed, `Lightbox cerrado: ${lightboxClosed}`);

      const focusedTag = await evaluate("document.activeElement?.getAttribute('data-action') || document.activeElement?.tagName");
      record('Restauración de Foco al Disparador', focusedTag === 'open-full-poster', `Elemento enfocado: ${focusedTag}`);
    }

    // Presionar Escape para cerrar Modal Detalle
    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 300));

    const isDetailModalClosed = await evaluate("!document.getElementById('detail-modal')?.classList.contains('active')");
    record('Cierre Modal Detalle con Escape', !!isDetailModalClosed, `Modal cerrado: ${isDetailModalClosed}`);

    record('Ausencia de Errores JS en Detalle/Cartel', consoleErrors.length === 0 && jsExceptions.length === 0,
      `Console errors: ${consoleErrors.length}, Exceptions: ${jsExceptions.length}`);

    // -------------------------------------------------------------------------
    // 3. Panel de Curación (/admin)
    // -------------------------------------------------------------------------
    console.log('\n--- PRUEBA 3: Panel de Curación (/admin) ---');
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
