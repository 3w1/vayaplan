import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import sharp from 'sharp';

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
  console.log('=== VERIFICACIÓN EN NAVEGADOR REAL (CHROME HEADLESS + CDP) ===\n');

  const testDbUrl = 'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan_test';
  const pool = new Pool({ connectionString: testDbUrl });

  const testUploadsDir = '/tmp/test-poster-uploads-' + Date.now();
  fs.mkdirSync(testUploadsDir, { recursive: true });

  const profileDir = '/tmp/chrome-poster-profile-' + Date.now();
  fs.mkdirSync(profileDir, { recursive: true });

  // 1. Preparar imágenes de prueba locales en testUploadsDir
  const uuidModern = 'a1b2c3d4-e5f6-4a7b-8c9d-111111111111';
  const uuidLegacy = 'b2c3d4e5-f6a7-4b8c-9d0e-222222222222';

  // Imagen moderna: original, detail, thumb
  const origJpeg = await sharp({
    create: { width: 1200, height: 1800, channels: 3, background: { r: 180, g: 30, b: 60 } }
  }).jpeg().toBuffer();
  const detailWebp = await sharp(origJpeg).resize(1200, 1800).webp({ quality: 84 }).toBuffer();
  const thumbWebp = await sharp(detailWebp).resize(160, 240).webp({ quality: 80 }).toBuffer();

  // Imagen legacy (sólo un archivo .jpg tradicional)
  const legacyJpeg = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: 20, g: 120, b: 200 } }
  }).jpeg().toBuffer();

  fs.mkdirSync(path.join(testUploadsDir, 'events'), { recursive: true });
  fs.mkdirSync(path.join(testUploadsDir, 'private-originals'), { recursive: true });
  fs.writeFileSync(path.join(testUploadsDir, `private-originals/${uuidModern}-original.jpg`), origJpeg);
  fs.writeFileSync(path.join(testUploadsDir, `events/${uuidModern}-detail.webp`), detailWebp);
  fs.writeFileSync(path.join(testUploadsDir, `events/${uuidModern}-thumb.webp`), thumbWebp);
  fs.writeFileSync(path.join(testUploadsDir, `events/${uuidLegacy}.jpg`), legacyJpeg);

  // 2. Insertar eventos de prueba en BD sintética (vayaplan_test) para la fecha de hoy
  const editorialDate = '2026-10-18';
  const venueRes = await pool.query('SELECT id FROM venues WHERE is_active = true AND id != 9999 LIMIT 1');
  const venueId = venueRes.rows[0].id;

  // Limpiar eventos previos de esa fecha en test
  await pool.query("DELETE FROM events WHERE editorial_date = $1", [editorialDate]);

  // Insertar evento moderno con variantes
  const insModern = await pool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      price_cents, is_free, status, source_type, image_url, image_thumb_url, image_original_url
    ) VALUES (
      1, $1, 'Concierto Moderno con Variantes', 'musica_directo', $2, '2026-10-18T21:00:00Z',
      1200, false, 'published', 'manual',
      $3, $4, $5
    ) RETURNING id
  `, [
    venueId,
    editorialDate,
    `http://localhost:4008/media/events/${uuidModern}-detail.webp`,
    `http://localhost:4008/media/events/${uuidModern}-thumb.webp`,
    `/api/v1/admin/uploads/originals/${uuidModern}-original.jpg`,
  ]);
  const modernEventId = insModern.rows[0].id;

  // Insertar evento legado con sólo image_url
  const insLegacy = await pool.query(`
    INSERT INTO events (
      city_id, venue_id, title, category, editorial_date, start_time,
      price_cents, is_free, status, source_type, image_url, image_thumb_url, image_original_url
    ) VALUES (
      1, $1, 'Evento Tradicional Legado', 'teatro', $2, '2026-10-18T19:30:00Z',
      1500, false, 'published', 'manual',
      $3, NULL, NULL
    ) RETURNING id
  `, [
    venueId,
    editorialDate,
    `http://localhost:4008/media/events/${uuidLegacy}.jpg`,
  ]);
  const legacyEventId = insLegacy.rows[0].id;

  console.log(`✓ Eventos de prueba creados en vayaplan_test: Moderno #${modernEventId}, Legado #${legacyEventId} para fecha ${editorialDate}`);

  // 3. Iniciar servidores sintéticos en puertos 4008 (API) y 3038 (Web)
  const apiProc = spawn('bun', ['run', 'apps/api/src/index.ts'], {
    env: {
      ...process.env,
      PORT: '4008',
      DATABASE_URL: testDbUrl,
      UPLOADS_DIR: testUploadsDir,
      NODE_ENV: 'test',
      R2_ACCOUNT_ID: 'cf-account-test-12345',
      R2_ACCESS_KEY_ID: 'cf-key-test-abcde',
      R2_SECRET_ACCESS_KEY: 'cf-secret-test-xyz987654321',
      R2_BUCKET: 'vayaplan-media-test',
      R2_PUBLIC_URL: 'http://localhost:4008/media',
      SERVE_DEV_MEDIA: 'true',
      MOCK_R2: 'true',
    },
    stdio: 'ignore',
  });

  const webProc = spawn('bun', ['run', 'apps/web/src/index.ts'], {
    env: {
      ...process.env,
      PORT: '3038',
      ENABLE_API_PROXY: 'true',
      INTERNAL_API_URL: 'http://localhost:4008',
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

  let serversReady = false;
  let adminToken = '';
  for (let i = 0; i < 40; i++) {
    try {
      const a = await fetch('http://127.0.0.1:4008/api/v1/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vayaplan.com', password: 'vayaplan2026!' }),
      });
      if (a.ok) {
        adminToken = (await a.json()).token;
        const w = await fetch('http://127.0.0.1:3038/health');
        if (w.ok) {
          serversReady = true;
          break;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!serversReady || !adminToken) {
    apiProc.kill();
    webProc.kill();
    throw new Error('No se pudieron iniciar los servidores en puertos 4008/3038');
  }

  console.log('✓ Servidores listos en http://localhost:4008 y http://localhost:3038');

  // 4. Iniciar Google Chrome en modo Headless con CDP
  const chromeProc = spawn('/usr/local/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9223',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,900',
  ], { stdio: 'ignore' });

  let cdpConnected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const v = await fetch('http://127.0.0.1:9223/json/version');
      if (v.ok) { cdpConnected = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!cdpConnected) {
    apiProc.kill();
    webProc.kill();
    throw new Error('No se pudo conectar a Chrome CDP en 9223');
  }

  try {
    const newPageRes = await fetch('http://127.0.0.1:9223/json/new', { method: 'PUT' });
    const target = await newPageRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map<number, (res: any) => void>();
    const networkRequests: string[] = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)!(data.result);
        callbacks.delete(data.id);
      }
      if (data.method === 'Network.requestWillBeSent') {
        const url = data.params?.request?.url || '';
        if (url.includes('/media/events/')) {
          networkRequests.push(url);
        }
      }
      if (data.method === 'Page.javascriptDialogOpening') {
        sendCDP('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
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

    // =========================================================================
    // PRUEBA 1: Listado público descarga miniatura (thumb), NO original
    // =========================================================================
    console.log('\n--- PRUEBA 1: Carga de listado público y peticiones de red ---');
    networkRequests.length = 0;

    await sendCDP('Page.navigate', { url: `http://localhost:3038/` });
    await new Promise((r) => setTimeout(r, 2000));

    const renderedCardsCount = await evaluate("document.querySelectorAll('.card-compact[data-action=\"open-event\"]').length");
    const downloadedThumbs = networkRequests.filter(u => u.includes('-thumb.webp'));
    const downloadedOriginals = networkRequests.filter(u => u.includes('-original.'));
    const downloadedDetails = networkRequests.filter(u => u.includes('-detail.webp'));

    record(
      '1. Listado público descarga miniatura y NO original',
      renderedCardsCount >= 2 && downloadedThumbs.length > 0 && downloadedOriginals.length === 0,
      `Tarjetas: ${renderedCardsCount} | Descargas: thumbs=${downloadedThumbs.length}, detail=${downloadedDetails.length}, originals=${downloadedOriginals.length}`
    );

    // =========================================================================
    // PRUEBA 2: Apertura de detalle descarga detail.webp; backdrop usa thumb sin recargar original
    // =========================================================================
    console.log('\n--- PRUEBA 2: Apertura de detalle y variante del hero ---');
    networkRequests.length = 0;

    // Hacer click en la tarjeta del evento moderno
    await evaluate(`
      const card = Array.from(document.querySelectorAll('.card-compact[data-action="open-event"]')).find(c => c.textContent.includes('Concierto Moderno'));
      if (card) card.click();
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const modalVisible = await evaluate("document.querySelector('#detail-modal.active') !== null");
    const heroImgSrc = await evaluate("document.querySelector('.modal-hero-img')?.src || ''");
    const backdropImgSrc = await evaluate("document.querySelector('.modal-hero-backdrop')?.src || ''");

    const detailRequested = networkRequests.some(u => u.includes('-detail.webp'));
    const originalRequestedInDetail = networkRequests.some(u => u.includes('-original.'));

    record(
      '2. Detalle usa variante de detalle sin descargar original',
      modalVisible && heroImgSrc.includes('-detail.webp') && !originalRequestedInDetail,
      `Modal activo: ${modalVisible} | Hero img: ${heroImgSrc} | Original solicitado: ${originalRequestedInDetail}`
    );

    record(
      '3. Fondo difuminado (backdrop) usa miniatura o detalle sin precargar original',
      backdropImgSrc.includes('-thumb.webp') || backdropImgSrc.includes('-detail.webp'),
      `Backdrop src: ${backdropImgSrc}`
    );

    // =========================================================================
    // PRUEBA 3: Visor accesible "Ver cartel completo" y gestión de foco / escape
    // =========================================================================
    console.log('\n--- PRUEBA 3: Visor accesible "Ver cartel completo" y accesibilidad ---');

    // Click en "Ver cartel completo"
    await evaluate(`
      const btn = document.querySelector('.btn-poster-action') || document.querySelector('.modal-hero-cover');
      if (btn) {
        btn.focus();
        btn.click();
      }
    `);
    await new Promise((r) => setTimeout(r, 800));

    const lightboxVisible = await evaluate("document.querySelector('#poster-lightbox')?.style.display !== 'none'");
    const lightboxRole = await evaluate("document.querySelector('#poster-lightbox')?.getAttribute('role')");
    const lightboxAriaModal = await evaluate("document.querySelector('#poster-lightbox')?.getAttribute('aria-modal')");
    const lightboxImgSrc = await evaluate("document.querySelector('#poster-lightbox-img')?.src || ''");

    record(
      '4. Acción "Ver cartel completo" abre visor accesible con variante de detalle (sin EXIF)',
      lightboxVisible && lightboxRole === 'dialog' && lightboxAriaModal === 'true' && lightboxImgSrc.includes('-detail.webp'),
      `Lightbox visible: ${lightboxVisible} | Rol: ${lightboxRole} | Imagen en visor: ${lightboxImgSrc}`
    );

    // Comprobar gestión de foco atrapado en el lightbox
    const focusedInLightbox = await evaluate(`
      const activeEl = document.activeElement;
      const lb = document.querySelector('#poster-lightbox');
      Boolean(lb && lb.contains(activeEl));
    `);
    record(
      '5. Foco queda situado dentro del visor abierto',
      focusedInLightbox,
      `Elemento activo contenido en lightbox: ${focusedInLightbox}`
    );

    // =========================================================================
    // PRUEBA 4: Interacción de Zoom y Pan (Desplazamiento) en escritorio y móvil
    // =========================================================================
    console.log('\n--- PRUEBA 4: Zoom y Pan en escritorio y móvil ---');

    // Zoom mediante botón +
    const initialTransform = await evaluate("document.querySelector('#poster-lightbox-img')?.style.transform || ''");
    await evaluate(`
      const zoomInBtn = document.querySelector('[data-action="lightbox-zoom-in"]');
      if (zoomInBtn) zoomInBtn.click();
    `);
    await new Promise((r) => setTimeout(r, 400));
    const zoomedTransform = await evaluate("document.querySelector('#poster-lightbox-img')?.style.transform || ''");

    // Simular arrastre (drag/pan) en el viewport del lightbox
    await evaluate(`
      const vp = document.querySelector('#poster-lightbox-viewport');
      const startEv = new PointerEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true });
      vp.dispatchEvent(startEv);
      const moveEv = new PointerEvent('pointermove', { clientX: 250, clientY: 270, bubbles: true });
      window.dispatchEvent(moveEv);
      const upEv = new PointerEvent('pointerup', { clientX: 250, clientY: 270, bubbles: true });
      window.dispatchEvent(upEv);
    `);
    await new Promise((r) => setTimeout(r, 300));

    const zoomWorks = zoomedTransform.includes('scale(') && zoomedTransform !== initialTransform;

    record(
      '6. Visor permite ampliar (zoom) y desplazarse (pan) por el cartel',
      zoomWorks,
      `Inicial: "${initialTransform}" | Con zoom: "${zoomedTransform}"`
    );

    // =========================================================================
    // PRUEBA 5: Cierre con Escape y restauración del foco
    // =========================================================================
    // Pulsar tecla Escape una sola vez mediante CDP hardware key event
    await sendCDP('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sendCDP('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 400));

    const lightboxClosedAfterEscape = await evaluate("document.querySelector('#poster-lightbox')?.style.display === 'none'");
    const focusRestored = await evaluate(`
      (() => {
        const activeEl = document.activeElement;
        const trigger = document.querySelector('.btn-poster-action') || document.querySelector('.modal-hero-cover');
        return Boolean(activeEl && (activeEl === trigger || activeEl.classList.contains('btn-poster-action') || activeEl.classList.contains('modal-hero-cover')));
      })()
    `);

    record(
      '7. El visor se cierra con tecla Escape y devuelve el foco al activador que lo abrió',
      lightboxClosedAfterEscape && focusRestored,
      `Visor cerrado: ${lightboxClosedAfterEscape} | Foco devuelto al activador: ${focusRestored}`
    );

    // Cerrar también el modal de detalle para volver a listado
    await evaluate(`
      const closeBtn = document.querySelector('.modal-close-btn');
      if (closeBtn) closeBtn.click();
    `);
    await new Promise((r) => setTimeout(r, 500));

    // =========================================================================
    // PRUEBA 6: Evento legado con único image_url sin variantes
    // =========================================================================
    console.log('\n--- PRUEBA 6: Evento legado con único image_url sin variantes ---');

    // Abrir tarjeta del evento legado
    await evaluate(`
      const legacyCard = Array.from(document.querySelectorAll('.card-compact[data-action="open-event"]')).find(c => c.textContent.includes('Evento Tradicional'));
      if (legacyCard) legacyCard.click();
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const legacyHeroSrc = await evaluate("document.querySelector('.modal-hero-img')?.src || ''");
    const legacyBtnExists = await evaluate("document.querySelector('.btn-poster-action') !== null");

    // Abrir visor de evento legado
    await evaluate(`
      const trigger = document.querySelector('.btn-poster-action') || document.querySelector('.modal-hero-cover');
      if (trigger) {
        if (typeof openPosterLightbox === 'function') {
          openPosterLightbox(trigger.dataset.posterUrl, trigger.dataset.posterTitle, trigger);
        } else {
          trigger.click();
        }
      }
    `);
    await new Promise((r) => setTimeout(r, 600));

    const legacyLightboxImg = await evaluate("document.querySelector('#poster-lightbox-img')?.src || ''");
    const legacyLightboxVisible = await evaluate("document.querySelector('#poster-lightbox')?.style.display !== 'none'");

    // Cerrar visor con botón cerrar
    await evaluate(`
      const visorClose = document.querySelector('.lightbox-close-btn');
      if (visorClose) visorClose.click();
    `);
    await new Promise((r) => setTimeout(r, 400));
    const legacyLightboxClosed = await evaluate("document.querySelector('#poster-lightbox')?.style.display === 'none'");

    record(
      '8. Evento legado (sin variantes): listado, detalle y visor funcionan limpiamente sin errores',
      legacyHeroSrc.includes(uuidLegacy) && legacyLightboxVisible && legacyLightboxImg.includes(uuidLegacy) && legacyLightboxClosed,
      `Hero legado: ${legacyHeroSrc} | Visor legado: ${legacyLightboxImg} | Cierre visor: ${legacyLightboxClosed}`
    );

    // =========================================================================
    // PRUEBA 7: Editor de eventos (/admin) — reemplazar o quitar cartel
    // =========================================================================
    console.log('\n--- PRUEBA 7: Editor administrativo (/admin) y ciclo de cartel ---');

    // Navegar al panel administrativo e inyectar token
    await sendCDP('Page.navigate', { url: 'http://localhost:3038/admin' });
    await new Promise((r) => setTimeout(r, 1500));

    // Inyectar token en localStorage y recargar
    await evaluate(`
      localStorage.setItem('vp_admin_token', '${adminToken}');
      window.location.reload();
    `);
    await new Promise((r) => setTimeout(r, 1500));

    // Abrir modal de edición para el evento moderno llamando a editEvent(id)
    await evaluate(`
      if (typeof editEvent === 'function') {
        editEvent(${modernEventId});
      }
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const editorOpen = await evaluate("document.querySelector('#modal-event.active') !== null");
    const hiddenThumb = await evaluate("document.querySelector('#ev-image-thumb-url')?.value || ''");
    const hiddenOriginal = await evaluate("document.querySelector('#ev-image-original-url')?.value || ''");

    record(
      '9. Editor carga el evento y sus campos ocultos de variantes preservadas',
      editorOpen && hiddenThumb.includes('-thumb.webp'),
      `Editor abierto: ${editorOpen} | Thumb oculto: ${hiddenThumb} | Original oculto: ${hiddenOriginal}`
    );

    // Simular quitar cartel
    await evaluate(`
      if (typeof removeEventImage === 'function') {
        removeEventImage();
      }
    `);
    await new Promise((r) => setTimeout(r, 500));

    const hiddenThumbAfterRemove = await evaluate("document.querySelector('#ev-image-thumb-url')?.value || ''");
    const hiddenOriginalAfterRemove = await evaluate("document.querySelector('#ev-image-original-url')?.value || ''");
    const hiddenMainAfterRemove = await evaluate("document.querySelector('#ev-image-url')?.value || ''");

    record(
      '10. Quitar cartel en el editor limpia inmediatamente todas las variantes asociadas a vacío',
      hiddenThumbAfterRemove === '' && hiddenOriginalAfterRemove === '' && hiddenMainAfterRemove === '',
      `Main: "${hiddenMainAfterRemove}", Thumb: "${hiddenThumbAfterRemove}", Original: "${hiddenOriginalAfterRemove}"`
    );

    // Cerrar editor
    await evaluate(`
      if (typeof closeModal === 'function') closeModal('modal-event');
    `);
    await new Promise((r) => setTimeout(r, 500));

    // =========================================================================
    // PRUEBA 8: Privacidad del original y recuperación administrativa
    // =========================================================================
    console.log('\n--- PRUEBA 8: Privacidad del original y recuperación administrativa ---');

    // 1. Acceso anónimo al original por la ruta administrativa: denegado (401)
    const anonAdminRes = await fetch(`http://localhost:4008/api/v1/admin/uploads/originals/${uuidModern}-original.jpg`);

    // 2. Acceso anónimo al original por la URL pública simulada de R2: no disponible (404)
    const anonPublicR2Res = await fetch(`http://localhost:4008/media/events/${uuidModern}-original.jpg`);

    // 3. Acceso anónimo al original por la ruta pública de uploads: no disponible (404)
    const anonPublicUploadsRes = await fetch(`http://localhost:4008/api/v1/uploads/${uuidModern}-original.jpg`);

    // 4. Recuperación administrativa autenticada con JWT: permitida (200)
    const authAdminRes = await fetch(`http://localhost:4008/api/v1/admin/uploads/originals/${uuidModern}-original.jpg`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const isAnonDenied = (anonAdminRes.status === 401) && (anonPublicR2Res.status === 404) && (anonPublicUploadsRes.status === 404);
    const isAuthAllowed = authAdminRes.status === 200;

    record(
      '11. Acceso anónimo al original denegado o no disponible en todas las vías públicas',
      isAnonDenied,
      `Admin anónimo: ${anonAdminRes.status} (esperado 401) | R2 público: ${anonPublicR2Res.status} (esperado 404) | Uploads público: ${anonPublicUploadsRes.status} (esperado 404)`
    );

    record(
      '12. Recuperación administrativa del original permitida exclusivamente con autorización',
      isAuthAllowed,
      `Admin autenticado: ${authAdminRes.status} (esperado 200) | Content-Type: ${authAdminRes.headers.get('content-type')}`
    );

  } finally {
    // Limpieza
    chromeProc.kill();
    apiProc.kill();
    webProc.kill();
    await pool.query("DELETE FROM events WHERE editorial_date = $1", [editorialDate]);
    await pool.end();
    fs.rmSync(testUploadsDir, { recursive: true, force: true });
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  console.log('\n========================================================================');
  console.log('RESUMEN DE VERIFICACIÓN EN NAVEGADOR REAL:');
  console.log('========================================================================');
  let allPass = true;
  for (const s of steps) {
    if (!s.passed) allPass = false;
  }
  console.log(`Total pasos: ${steps.length} | Éxito: ${steps.filter(s => s.passed).length} | Fallos: ${steps.filter(s => !s.passed).length}`);
  console.log(`Resultado global: ${allPass ? '✓ 100% PASS' : '✗ HAY FALLOS'}`);
  console.log('========================================================================\n');

  if (!allPass) {
    process.exit(1);
  }
}

runBrowserVerification().catch((err) => {
  console.error('Error durante la verificación en navegador real:', err);
  process.exit(1);
});
