import { Hono } from 'hono';

const app = new Hono();

// ==============================================================================
// Health Check
// ==============================================================================
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'vayaplan-web' });
});

// ==============================================================================
// Web App Manifest
// ==============================================================================
app.get('/manifest.json', (c) => {
  const manifest = {
    name: 'VayaPlan — Agenda Palencia',
    short_name: 'VayaPlan',
    description: 'Agenda hiperlocal de eventos y cultura en Palencia sin registro ni fricción.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#090d16',
    theme_color: '#090d16',
    categories: ['lifestyle', 'entertainment', 'travel'],
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };

  return c.json(manifest, 200, {
    'Content-Type': 'application/manifest+json; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  });
});

// ==============================================================================
// Service Worker (Shell Offline & Cache)
// ==============================================================================
app.get('/sw.js', (c) => {
  const swCode = `// VayaPlan Service Worker v1.2
const CACHE_NAME = 'vayaplan-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Peticiones de API: Network-first con fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline', message: 'Sin conexión a internet' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Assets estáticos de navegación: Network-first con fallback a caché
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
`;

  return new Response(swCode, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

// ==============================================================================
// Icono SVG Vectorial PWA
// ==============================================================================
app.get('/icons/icon.svg', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#ea580c"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <!-- Base redondeada PWA -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <rect x="8" y="8" width="496" height="496" rx="104" fill="none" stroke="#334155" stroke-width="6"/>
  <!-- Pin de localización -->
  <path d="M256 100 C185 100 128 157 128 228 C128 316 236 404 251 416 C254 418 258 418 261 416 C276 404 384 316 384 228 C384 157 327 100 256 100 Z" fill="url(#pinGrad)" filter="url(#glow)"/>
  <!-- Centro del pin -->
  <circle cx="256" cy="224" r="54" fill="#090d16"/>
  <!-- Rayo / Chispa central de plan -->
  <path d="M260 188 L236 226 L254 226 L248 264 L276 222 L258 222 Z" fill="url(#sparkGrad)"/>
  <!-- Destello de energía superior derecho -->
  <circle cx="360" cy="140" r="16" fill="#38bdf8" filter="url(#glow)"/>
  <circle cx="395" cy="175" r="8" fill="#38bdf8"/>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// ==============================================================================
// PWA Zero-Form UI — Aplicación Principal
// ==============================================================================
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>VayaPlan — ¿Qué hacer hoy en Palencia? Agenda Hiperlocal</title>
  <meta name="description" content="Agenda hiperlocal sin filtros ni registro. Conciertos, teatro, cine y tardeo en Palencia en menos de 30 segundos.">
  
  <!-- Open Graph / WhatsApp Preview -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="VayaPlan — ¿Qué hacer hoy en Palencia?">
  <meta property="og:description" content="Agenda hiperlocal sin filtros ni registro. Conciertos, teatro, cine y tardeo en Palencia en 30 segundos.">
  <meta property="og:image" content="https://vayaplan.com/icons/icon.svg">
  <meta property="og:url" content="https://vayaplan.com/">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="VayaPlan — Agenda Palencia">
  <meta name="twitter:description" content="Conciertos, teatro, cine y tardeo en Palencia en 30 segundos.">
  <meta name="twitter:image" content="https://vayaplan.com/icons/icon.svg">

  <!-- PWA & Mobile Meta -->
  <meta name="theme-color" content="#090d16">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="VayaPlan">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <link rel="apple-touch-icon" href="/icons/icon.svg">

  <style>
    :root {
      --bg-dark: #090d16;
      --bg-card: #131b2e;
      --bg-card-hover: #18223a;
      --border-card: #222f4c;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-blue: #38bdf8;
      --accent-primary: #2563eb;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-pill: 9999px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 5rem;
    }

    .app-container {
      width: 100%;
      max-width: 600px;
      padding: 0 1rem;
    }

    /* Header y Ciudad */
    header {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(9, 13, 22, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-card);
      padding: 0.875rem 1rem;
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .header-inner {
      width: 100%;
      max-width: 600px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      text-decoration: none;
      color: var(--text-main);
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      box-shadow: 0 2px 8px rgba(56, 189, 248, 0.35);
    }

    .brand-logo svg {
      width: 20px;
      height: 20px;
      fill: #ffffff;
    }

    .brand-title {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      background: linear-gradient(to right, #ffffff, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .city-pill {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      background-color: #1e293b;
      border: 1px solid var(--border-card);
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-pill);
      font-size: 0.8125rem;
      font-weight: 600;
      color: #cbd5e1;
    }

    .city-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--accent-emerald);
      box-shadow: 0 0 6px var(--accent-emerald);
    }

    /* Selector temporal (Hoy / Fin de semana / Calendario) */
    .time-selector-bar {
      margin-top: 1.25rem;
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 0.5rem;
      background-color: #111827;
      padding: 0.35rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-card);
    }

    .time-tab {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.625rem 0.25rem;
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .time-tab.active {
      background-color: var(--accent-primary);
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.4);
    }

    .calendar-picker-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .calendar-input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    /* Chips de Intención / Categoría */
    .filter-chips-container {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.25rem;
      scrollbar-width: none;
    }

    .filter-chips-container::-webkit-scrollbar {
      display: none;
    }

    .filter-chip {
      padding: 0.45rem 0.95rem;
      background-color: #162035;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-pill);
      color: #94a3b8;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .filter-chip:hover {
      border-color: #3b82f6;
      color: #ffffff;
    }

    .filter-chip.active {
      background-color: #1e3a8a;
      border-color: var(--accent-blue);
      color: #38bdf8;
    }

    /* Título de sección activa */
    .section-header {
      margin-top: 1.25rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .section-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-pill);
      background-color: #1e293b;
      color: #94a3b8;
    }

    /* Lista y Tarjetas de Eventos */
    .events-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .event-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: var(--radius-md);
      padding: 1.125rem;
      cursor: pointer;
      position: relative;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .event-card:hover {
      background-color: var(--bg-card-hover);
      border-color: #334870;
      transform: translateY(-1px);
    }

    /* Resalte destacado para evento Promocionado */
    .event-card.promoted {
      border: 1.5px solid var(--accent-amber);
      background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, #131b2e 100%);
      box-shadow: 0 4px 18px rgba(245, 158, 11, 0.15);
    }

    .promoted-tag {
      position: absolute;
      top: 0.875rem;
      right: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #0f172a;
      font-size: 0.6875rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      letter-spacing: 0.04em;
    }

    /* Estado visual para evento Cancelado */
    .event-card.cancelled {
      border-color: rgba(239, 68, 68, 0.4);
      background-color: rgba(239, 68, 68, 0.04);
      opacity: 0.85;
    }

    .cancelled-tag {
      position: absolute;
      top: 0.875rem;
      right: 0.875rem;
      background-color: var(--accent-red);
      color: #ffffff;
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.2rem 0.5rem;
      border-radius: var(--radius-pill);
    }

    .event-card.cancelled .event-title {
      text-decoration: line-through;
      color: #cbd5e1;
    }

    /* Encabezado tarjeta */
    .card-top {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .time-badge {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--accent-blue);
      background-color: #0f2744;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
    }

    .label-badge {
      font-size: 0.75rem;
      font-weight: 600;
      color: #cbd5e1;
    }

    .category-badge {
      font-size: 0.7188rem;
      font-weight: 600;
      color: #94a3b8;
      background-color: #1e293b;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }

    .event-title {
      font-size: 1.125rem;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
      margin-bottom: 0.35rem;
      padding-right: 2rem;
    }

    .event-venue {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: #94a3b8;
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
    }

    .event-venue svg {
      width: 14px;
      height: 14px;
      fill: var(--accent-blue);
      flex-shrink: 0;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding-top: 0.65rem;
      border-top: 1px solid #1c2742;
      flex-wrap: wrap;
    }

    .price-pill {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--accent-emerald);
      background-color: rgba(16, 185, 129, 0.12);
      padding: 0.25rem 0.625rem;
      border-radius: var(--radius-pill);
    }

    .price-pill.paid {
      color: #cbd5e1;
      background-color: #1e293b;
    }

    .card-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7813rem;
      font-weight: 600;
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius-sm);
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }

    .btn-maps {
      background-color: #1e293b;
      color: #38bdf8;
      border-color: #334870;
    }

    .btn-maps:hover {
      background-color: #27354d;
    }

    .btn-tickets {
      background-color: var(--accent-primary);
      color: #ffffff;
    }

    .btn-tickets:hover {
      background-color: #1d4ed8;
    }

    .btn-whatsapp {
      background-color: #065f46;
      color: #6ee7b7;
    }

    .btn-whatsapp:hover {
      background-color: #047857;
    }

    /* Recurrencias: "Cada [día]" */
    .recurrence-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background-color: #1e1b4b;
      color: #c7d2fe;
      border: 1px solid #3730a3;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      font-size: 0.75rem;
      font-weight: 700;
      margin-bottom: 0.35rem;
    }

    /* Places: "Siempre disponible" */
    .place-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background-color: #142a24;
      color: #6ee7b7;
      border: 1px solid #065f46;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      font-size: 0.75rem;
      font-weight: 700;
      margin-bottom: 0.35rem;
    }

    .place-highlight {
      font-size: 0.8438rem;
      color: #cbd5e1;
      margin-bottom: 0.5rem;
    }

    .place-hours {
      font-size: 0.8125rem;
      color: #94a3b8;
      margin-bottom: 0.5rem;
    }

    /* Agrupador de Fin de Semana */
    .weekend-day-group {
      margin-bottom: 1.5rem;
    }

    .weekend-day-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.625rem 0.875rem;
      background-color: #111a2e;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-sm);
      margin-bottom: 0.75rem;
    }

    .weekend-day-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--accent-blue);
    }

    .weekend-day-date {
      font-size: 0.8125rem;
      color: #94a3b8;
    }

    /* Modal / Ficha Detallada */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(4, 7, 13, 0.82);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 100;
      align-items: flex-end;
      justify-content: center;
    }

    .modal-overlay.active {
      display: flex;
    }

    @media (min-width: 640px) {
      .modal-overlay {
        align-items: center;
      }
    }

    .modal-sheet {
      background-color: #111827;
      border: 1px solid #2d3748;
      width: 100%;
      max-width: 580px;
      max-height: 85vh;
      border-radius: 20px 20px 0 0;
      overflow-y: auto;
      padding: 1.5rem;
      box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.7);
      animation: slideUp 0.25s ease-out;
    }

    @media (min-width: 640px) {
      .modal-sheet {
        border-radius: 20px;
        max-height: 80vh;
      }
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .modal-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .modal-close-btn {
      background: #1e293b;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      color: #cbd5e1;
      font-size: 1.125rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-title {
      font-size: 1.35rem;
      font-weight: 800;
      line-height: 1.3;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }

    .modal-meta-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.625rem;
      background-color: #172033;
      padding: 0.875rem;
      border-radius: var(--radius-sm);
      margin: 1rem 0;
      font-size: 0.875rem;
    }

    .modal-meta-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #cbd5e1;
    }

    .modal-meta-item svg {
      width: 16px;
      height: 16px;
      fill: var(--accent-blue);
      flex-shrink: 0;
    }

    .modal-description {
      font-size: 0.9375rem;
      color: #cbd5e1;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }

    .modal-verification {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.7813rem;
      color: #10b981;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius-sm);
      margin-bottom: 1.25rem;
    }

    .modal-actions-container {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .btn-full {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.85rem;
      border-radius: var(--radius-sm);
      font-size: 0.9375rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s ease;
    }

    .btn-full:hover {
      opacity: 0.92;
    }

    /* Estado vacío y carga */
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      background-color: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: var(--radius-md);
      margin-top: 1rem;
    }

    .empty-state h3 {
      font-size: 1.15rem;
      margin-bottom: 0.5rem;
      color: #f1f5f9;
    }

    .empty-state p {
      font-size: 0.875rem;
      color: var(--text-muted);
      max-width: 380px;
      margin: 0 auto 1.25rem auto;
    }

    .loader-spinner {
      border: 3px solid rgba(56, 189, 248, 0.15);
      border-top: 3px solid var(--accent-blue);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      animation: spin 0.7s linear infinite;
      margin: 2rem auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>

  <!-- Header Superior -->
  <header>
    <div class="header-inner">
      <a href="/" class="brand">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        </div>
        <span class="brand-title">VayaPlan</span>
      </a>

      <div class="city-pill">
        <span class="city-dot"></span>
        <span>Palencia</span>
      </div>
    </div>
  </header>

  <main class="app-container">

    <!-- Selector Temporal: Hoy / Fin de semana / Calendario -->
    <section class="time-selector-bar">
      <button class="time-tab active" id="tab-today" onclick="switchView('today')">
        Hoy
      </button>
      <button class="time-tab" id="tab-weekend" onclick="switchView('weekend')">
        Fin de semana
      </button>
      <div class="calendar-picker-wrapper">
        <button class="time-tab" id="tab-calendar">
          <span>📅</span> <span id="calendar-label">Fecha</span>
        </button>
        <input type="date" class="calendar-input" id="date-input" onchange="onDatePicked(this.value)">
      </div>
    </section>

    <!-- Chips de Intención / Filtros Rápidos -->
    <section class="filter-chips-container" id="chips-container">
      <button class="filter-chip active" data-filter="all" onclick="setFilter('all')">Todos</button>
      <button class="filter-chip" data-filter="now" onclick="setFilter('now')">Ahora / Esta noche</button>
      <button class="filter-chip" data-filter="tardeo" onclick="setFilter('tardeo')">Tardeo</button>
      <button class="filter-chip" data-filter="musica" onclick="setFilter('musica')">Música</button>
      <button class="filter-chip" data-filter="cultura" onclick="setFilter('cultura')">Cine / Cultura</button>
    </section>

    <!-- Encabezado de la vista activa -->
    <div class="section-header">
      <div class="section-title">
        <span id="view-title">Agenda de hoy</span>
      </div>
      <span class="section-badge" id="events-count">Cargando...</span>
    </div>

    <!-- Contenedor dinámico de eventos y recurrencias -->
    <div id="content-container">
      <div class="loader-spinner"></div>
    </div>

  </main>

  <!-- Modal Ficha de Evento y Lugar -->
  <div class="modal-overlay" id="detail-modal" onclick="closeModalOnBackdrop(event)">
    <div class="modal-sheet" id="modal-content">
      <!-- Se inyecta dinámicamente -->
    </div>
  </div>

  <script type="module">
    // ==============================================================================
    // Estado y variables globales
    // ==============================================================================
    let currentView = 'today';
    let currentFilter = 'all';
    let selectedDate = getTodayDateString();
    let currentData = null; // Almacena respuesta de API

    // ==============================================================================
    // Métricas y Session Hash efímero (sessionStorage, sin cookies, RGPD)
    // ==============================================================================
    function getSessionHash() {
      try {
        let hash = sessionStorage.getItem('vp_session_hash');
        if (!hash) {
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);
          hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
          sessionStorage.setItem('vp_session_hash', hash);
        }
        return hash;
      } catch (e) {
        return 'ephemeral-session-' + Date.now();
      }
    }

    window.trackMetric = function(eventId, metricType, promotionId = null) {
      if (!eventId) return;
      try {
        fetch('/api/v1/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: Number(eventId),
            promotion_id: promotionId ? Number(promotionId) : null,
            metric_type: metricType,
            channel: 'web',
            session_hash: getSessionHash(),
          }),
          keepalive: true,
        }).catch(() => {});
      } catch (err) {}
    };

    // ==============================================================================
    // Fechas auxiliares
    // ==============================================================================
    function getTodayDateString() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return \`\${y}-\${m}-\${d}\`;
    }

    function formatDateSpanish(dateStr) {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return date.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }

    function formatTime(isoString) {
      if (!isoString) return '';
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getCategoryLabel(category) {
      const labels = {
        musica_directo: 'Música en directo',
        dj_tardeo: 'DJ & Tardeo',
        monologo: 'Monólogo',
        cine: 'Cine',
        teatro: 'Teatro',
        exposicion: 'Exposición',
        cultura: 'Cultura',
      };
      return labels[category] || category || 'Plan';
    }

    // ==============================================================================
    // Carga de datos mediante rutas relativas /api/v1/...
    // ==============================================================================
    async function loadData() {
      const container = document.getElementById('content-container');
      container.innerHTML = '<div class="loader-spinner"></div>';

      try {
        if (currentView === 'today' || currentView === 'calendar') {
          const res = await fetch(\`/api/v1/cities/palencia/events?date=\${selectedDate}\`);
          if (!res.ok) throw new Error('Error al cargar agenda');
          currentData = await res.json();
          renderDayAgenda();
        } else if (currentView === 'weekend') {
          const res = await fetch('/api/v1/cities/palencia/weekend');
          if (!res.ok) throw new Error('Error al cargar fin de semana');
          currentData = await res.json();
          renderWeekendAgenda();
        }
      } catch (err) {
        container.innerHTML = \`
          <div class="empty-state">
            <h3>No se pudo cargar la agenda</h3>
            <p>Comprueba tu conexión o vuelve a intentarlo en unos instantes.</p>
            <button class="btn-action btn-tickets" onclick="loadData()">Reintentar</button>
          </div>
        \`;
      }
    }

    // ==============================================================================
    // Filtros de intención
    // ==============================================================================
    function filterEvents(events) {
      if (!events || events.length === 0) return [];
      if (currentFilter === 'all') return events;

      return events.filter((ev) => {
        if (currentFilter === 'now') {
          const now = new Date();
          const eventTime = new Date(ev.start_time);
          const hour = eventTime.getHours();
          return hour >= 20 || (hour >= now.getHours() - 1 && hour <= now.getHours() + 3);
        }
        if (currentFilter === 'tardeo') {
          const hour = new Date(ev.start_time).getHours();
          return ev.category === 'dj_tardeo' || (hour >= 16 && hour < 21);
        }
        if (currentFilter === 'musica') {
          return ev.category === 'musica_directo' || ev.category === 'dj_tardeo';
        }
        if (currentFilter === 'cultura') {
          return ['cine', 'teatro', 'exposicion', 'cultura', 'monologo'].includes(ev.category);
        }
        return true;
      });
    }

    // ==============================================================================
    // Renderizado: Agenda de Hoy / Día Seleccionado
    // ==============================================================================
    function renderDayAgenda() {
      const container = document.getElementById('content-container');
      const countEl = document.getElementById('events-count');
      const viewTitleEl = document.getElementById('view-title');

      if (!currentData) return;

      const filteredEvents = filterEvents(currentData.events || []);
      const recurrences = currentData.recurrences || [];
      const places = currentData.places || [];

      const totalItems = filteredEvents.length + recurrences.length + places.length;
      countEl.innerText = \`\${totalItems} \${totalItems === 1 ? 'plan' : 'planes'}\`;

      if (currentView === 'today') {
        viewTitleEl.innerText = 'Agenda de hoy';
      } else {
        viewTitleEl.innerText = formatDateSpanish(selectedDate);
      }

      if (totalItems === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <h3>No hay eventos publicados para este día</h3>
            <p>Puedes consultar la agenda del fin de semana o explorar los planes permanentes.</p>
            <button class="btn-action btn-tickets" onclick="switchView('weekend')">Ver Fin de Semana</button>
          </div>
        \`;
        return;
      }

      let html = '<div class="events-list">';

      // 1. Eventos puntuales (con destacado para Promocionado)
      for (const ev of filteredEvents) {
        const isPromoted = Boolean(ev.promotion && ev.promotion.status === 'active');
        const isCancelled = ev.status === 'cancelled';
        const promoId = ev.promotion ? ev.promotion.id : null;

        html += \`
          <div class="event-card \${isPromoted ? 'promoted' : ''} \${isCancelled ? 'cancelled' : ''}" 
               onclick="openEventModal(\${ev.id})">
            
            \${isPromoted ? '<span class="promoted-tag">★ Promocionado</span>' : ''}
            \${isCancelled ? '<span class="cancelled-tag">Cancelado</span>' : ''}

            <div class="card-top">
              <span class="time-badge">\${formatTime(ev.start_time)}</span>
              <span class="label-badge">\${escapeHtml(ev.editorial_label)}</span>
              <span class="category-badge">\${escapeHtml(getCategoryLabel(ev.category))}</span>
            </div>

            <h3 class="event-title">\${escapeHtml(ev.title)}</h3>

            <div class="event-venue">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <span>\${escapeHtml(ev.venue.name)}</span>
            </div>

            <div class="card-footer">
              <span class="price-pill \${ev.price.is_free ? '' : 'paid'}">\${escapeHtml(ev.price.label)}</span>
              
              <div class="card-actions" onclick="event.stopPropagation()">
                \${ev.actions.maps_url ? \`
                  <a href="\${escapeHtml(ev.actions.maps_url)}" target="_blank" rel="noopener" 
                     class="btn-action btn-maps"
                     onclick="trackMetric(\${ev.id}, 'map_click', \${promoId})">
                     Cómo llegar
                  </a>
                \` : ''}

                \${ev.actions.tickets_url ? \`
                  <a href="\${escapeHtml(ev.actions.tickets_url)}" target="_blank" rel="noopener" 
                     class="btn-action btn-tickets"
                     onclick="trackMetric(\${ev.id}, 'ticket_click', \${promoId})">
                     Entradas
                  </a>
                \` : ''}

                \${ev.actions.whatsapp_url ? \`
                  <a href="\${escapeHtml(ev.actions.whatsapp_url)}" target="_blank" rel="noopener" 
                     class="btn-action btn-whatsapp"
                     onclick="trackMetric(\${ev.id}, 'whatsapp_click', \${promoId})">
                     WhatsApp
                  </a>
                \` : ''}
              </div>
            </div>

          </div>
        \`;
      }

      // 2. Recurrencias: Etiquetadas como "Cada [día]"
      for (const rec of recurrences) {
        const dayLabel = getDayNameFromNumber(rec.day_of_week);
        html += \`
          <div class="event-card" onclick="openRecurrenceInfo('\${escapeHtml(rec.title)}', '\${escapeHtml(rec.venue_name)}')">
            <div class="recurrence-badge">
              <span>↻ Cada \${dayLabel}</span>
            </div>
            <div class="card-top">
              <span class="time-badge">\${escapeHtml(rec.start_time.slice(0, 5))}</span>
              <span class="category-badge">\${escapeHtml(getCategoryLabel(rec.category))}</span>
            </div>
            <h3 class="event-title">\${escapeHtml(rec.title)}</h3>
            <div class="event-venue">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <span>\${escapeHtml(rec.venue_name)}</span>
            </div>
            <div class="card-footer">
              <span class="price-pill \${rec.is_free ? '' : 'paid'}">
                \${rec.is_free ? 'Entrada libre' : ((rec.price_cents / 100).toFixed(2).replace('.', ',') + ' €')}
              </span>
              <span class="label-badge">Actividad periódica</span>
            </div>
          </div>
        \`;
      }

      // 3. Lugares permanentes: Etiquetados como "Siempre disponible"
      for (const place of places) {
        html += \`
          <div class="event-card" onclick="openPlaceModal(\${place.id})">
            <div class="place-badge">
              <span>★ Siempre disponible</span>
            </div>
            <h3 class="event-title">\${escapeHtml(place.name)}</h3>
            <p class="place-highlight">\${escapeHtml(place.highlight_text)}</p>
            \${place.opening_hours_text ? \`<p class="place-hours">⏰ \${escapeHtml(place.opening_hours_text)}</p>\` : ''}
            <div class="card-footer">
              <span class="price-pill">\${escapeHtml(place.price_text || 'Consultar')}</span>
              <div class="card-actions" onclick="event.stopPropagation()">
                \${place.google_maps_url ? \`
                  <a href="\${escapeHtml(place.google_maps_url)}" target="_blank" rel="noopener" class="btn-action btn-maps">
                    Cómo llegar
                  </a>
                \` : ''}
              </div>
            </div>
          </div>
        \`;
      }

      html += '</div>';
      container.innerHTML = html;
    }

    // ==============================================================================
    // Renderizado: Agenda de Fin de Semana (Agrupada por editorial_date)
    // ==============================================================================
    function renderWeekendAgenda() {
      const container = document.getElementById('content-container');
      const countEl = document.getElementById('events-count');
      const viewTitleEl = document.getElementById('view-title');

      if (!currentData || !currentData.days) return;

      viewTitleEl.innerText = 'Fin de semana en Palencia';

      let totalWeekendEvents = 0;
      let html = '';

      for (const day of currentData.days) {
        const filteredEvents = filterEvents(day.events || []);
        totalWeekendEvents += filteredEvents.length + day.recurrences.length;

        html += \`
          <div class="weekend-day-group">
            <div class="weekend-day-header">
              <span class="weekend-day-title">\${escapeHtml(day.editorial_label)}</span>
              <span class="weekend-day-date">\${formatDateSpanish(day.editorial_date)}</span>
            </div>
            <div class="events-list">
        \`;

        if (filteredEvents.length === 0 && day.recurrences.length === 0) {
          html += \`
            <div class="event-card" style="padding: 0.875rem; text-align: center; color: #94a3b8; font-size: 0.8125rem;">
              Sin planes específicos registrados para este día.
            </div>
          \`;
        }

        // Eventos del día
        for (const ev of filteredEvents) {
          const isPromoted = Boolean(ev.promotion && ev.promotion.status === 'active');
          const isCancelled = ev.status === 'cancelled';
          const promoId = ev.promotion ? ev.promotion.id : null;

          html += \`
            <div class="event-card \${isPromoted ? 'promoted' : ''} \${isCancelled ? 'cancelled' : ''}" 
                 onclick="openEventModal(\${ev.id})">
              
              \${isPromoted ? '<span class="promoted-tag">★ Promocionado</span>' : ''}
              \${isCancelled ? '<span class="cancelled-tag">Cancelado</span>' : ''}

              <div class="card-top">
                <span class="time-badge">\${formatTime(ev.start_time)}</span>
                <span class="category-badge">\${escapeHtml(getCategoryLabel(ev.category))}</span>
              </div>

              <h3 class="event-title">\${escapeHtml(ev.title)}</h3>

              <div class="event-venue">
                <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                <span>\${escapeHtml(ev.venue.name)}</span>
              </div>

              <div class="card-footer">
                <span class="price-pill \${ev.price.is_free ? '' : 'paid'}">\${escapeHtml(ev.price.label)}</span>
                
                <div class="card-actions" onclick="event.stopPropagation()">
                  \${ev.actions.maps_url ? \`
                    <a href="\${escapeHtml(ev.actions.maps_url)}" target="_blank" rel="noopener" 
                       class="btn-action btn-maps"
                       onclick="trackMetric(\${ev.id}, 'map_click', \${promoId})">
                       Cómo llegar
                    </a>
                  \` : ''}

                  \${ev.actions.tickets_url ? \`
                    <a href="\${escapeHtml(ev.actions.tickets_url)}" target="_blank" rel="noopener" 
                       class="btn-action btn-tickets"
                       onclick="trackMetric(\${ev.id}, 'ticket_click', \${promoId})">
                       Entradas
                    </a>
                  \` : ''}
                </div>
              </div>
            </div>
          \`;
        }

        // Recurrencias del día
        for (const rec of day.recurrences) {
          html += \`
            <div class="event-card" onclick="openRecurrenceInfo('\${escapeHtml(rec.title)}', '\${escapeHtml(rec.venue_name)}')">
              <div class="recurrence-badge">
                <span>↻ Cada \${escapeHtml(day.editorial_label)}</span>
              </div>
              <div class="card-top">
                <span class="time-badge">\${escapeHtml(rec.start_time.slice(0, 5))}</span>
                <span class="category-badge">\${escapeHtml(getCategoryLabel(rec.category))}</span>
              </div>
              <h3 class="event-title">\${escapeHtml(rec.title)}</h3>
              <div class="event-venue">
                <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                <span>\${escapeHtml(rec.venue_name)}</span>
              </div>
              <div class="card-footer">
                <span class="price-pill \${rec.is_free ? '' : 'paid'}">
                  \${rec.is_free ? 'Entrada libre' : ((rec.price_cents / 100).toFixed(2).replace('.', ',') + ' €')}
                </span>
                <span class="label-badge">Actividad periódica</span>
              </div>
            </div>
          \`;
        }

        html += '</div></div>';
      }

      // Planes permanentes al final del fin de semana
      if (currentData.places && currentData.places.length > 0) {
        html += \`
          <div class="weekend-day-group">
            <div class="weekend-day-header">
              <span class="weekend-day-title">Planes permanentes</span>
              <span class="weekend-day-date">Siempre disponibles</span>
            </div>
            <div class="events-list">
        \`;
        for (const p of currentData.places) {
          html += \`
            <div class="event-card" onclick="openPlaceModal(\${p.id})">
              <div class="place-badge"><span>★ Siempre disponible</span></div>
              <h3 class="event-title">\${escapeHtml(p.name)}</h3>
              <p class="place-highlight">\${escapeHtml(p.highlight_text)}</p>
              \${p.opening_hours_text ? \`<p class="place-hours">⏰ \${escapeHtml(p.opening_hours_text)}</p>\` : ''}
              <div class="card-footer">
                <span class="price-pill">\${escapeHtml(p.price_text || 'Consultar')}</span>
                <div class="card-actions" onclick="event.stopPropagation()">
                  \${p.google_maps_url ? \`
                    <a href="\${escapeHtml(p.google_maps_url)}" target="_blank" rel="noopener" class="btn-action btn-maps">
                      Cómo llegar
                    </a>
                  \` : ''}
                </div>
              </div>
            </div>
          \`;
        }
        html += '</div></div>';
      }

      countEl.innerText = \`\${totalWeekendEvents} planes\`;
      container.innerHTML = html;
    }

    // ==============================================================================
    // Ficha Modal de Evento Individual
    // ==============================================================================
    window.openEventModal = async function(eventId) {
      const modal = document.getElementById('detail-modal');
      const sheet = document.getElementById('modal-content');

      sheet.innerHTML = '<div class="loader-spinner"></div>';
      modal.classList.add('active');

      try {
        const res = await fetch(\`/api/v1/events/\${eventId}\`);
        if (!res.ok) throw new Error('Evento no encontrado');
        const data = await res.json();
        const ev = data.event;
        const promoId = ev.promotion ? ev.promotion.id : null;

        // Registrar métrica de impresión de ficha
        trackMetric(ev.id, 'impression', promoId);

        const shareUrl = encodeURIComponent(window.location.origin);
        const shareText = encodeURIComponent(\`¡Mira este plan en Palencia! "\${ev.title}" en \${ev.venue.name} (\${formatTime(ev.start_time)}). \${window.location.origin}\`);
        const waShareUrl = \`https://wa.me/?text=\${shareText}\`;

        sheet.innerHTML = \`
          <div class="modal-top-bar">
            <div>
              \${ev.promotion ? '<span class="promoted-tag" style="position:static">★ Promocionado</span>' : ''}
              \${ev.status === 'cancelled' ? '<span class="cancelled-tag" style="position:static">Cancelado</span>' : ''}
            </div>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>

          <h2 class="modal-title">\${escapeHtml(ev.title)}</h2>

          <div class="modal-meta-grid">
            <div class="modal-meta-item">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <strong>\${escapeHtml(ev.venue.name)}</strong>
            </div>
            <div class="modal-meta-item">
              <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 nominal 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              <span>\${formatDateSpanish(ev.editorial_date)} a las \${formatTime(ev.start_time)}</span>
            </div>
            <div class="modal-meta-item">
              <svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
              <strong style="color:var(--accent-emerald)">\${escapeHtml(ev.price.label)}</strong>
            </div>
          </div>

          \${ev.description ? \`<p class="modal-description">\${escapeHtml(ev.description)}</p>\` : ''}

          <div class="modal-verification">
            <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span>Verificado por equipo VayaPlan</span>
          </div>

          <div class="modal-actions-container">
            \${ev.actions.maps_url ? \`
              <a href="\${escapeHtml(ev.actions.maps_url)}" target="_blank" rel="noopener"
                 class="btn-full btn-maps"
                 onclick="trackMetric(\${ev.id}, 'map_click', \${promoId})">
                 📍 Cómo llegar (Google Maps)
              </a>
            \` : ''}

            \${ev.actions.tickets_url ? \`
              <a href="\${escapeHtml(ev.actions.tickets_url)}" target="_blank" rel="noopener"
                 class="btn-full btn-tickets"
                 onclick="trackMetric(\${ev.id}, 'ticket_click', \${promoId})">
                 🎟 Comprar entradas / Web oficial
              </a>
            \` : ''}

            \${ev.actions.whatsapp_url ? \`
              <a href="\${escapeHtml(ev.actions.whatsapp_url)}" target="_blank" rel="noopener"
                 class="btn-full btn-whatsapp"
                 onclick="trackMetric(\${ev.id}, 'whatsapp_click', \${promoId})">
                 💬 Contactar por WhatsApp
              </a>
            \` : ''}

            <a href="\${waShareUrl}" target="_blank" rel="noopener" class="btn-full btn-whatsapp">
              ↗ Compartir por WhatsApp
            </a>
          </div>
        \`;
      } catch (err) {
        sheet.innerHTML = \`
          <div class="modal-top-bar">
            <h3>Error</h3>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>
          <p class="modal-description">No se pudo cargar la ficha del evento.</p>
        \`;
      }
    };

    // ==============================================================================
    // Ficha Modal de Lugar Permanente
    // ==============================================================================
    window.openPlaceModal = function(placeId) {
      if (!currentData || !currentData.places) return;
      const place = currentData.places.find((p) => p.id === placeId);
      if (!place) return;

      const modal = document.getElementById('detail-modal');
      const sheet = document.getElementById('modal-content');

      sheet.innerHTML = \`
        <div class="modal-top-bar">
          <span class="place-badge" style="position:static">★ Siempre disponible</span>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>

        <h2 class="modal-title">\${escapeHtml(place.name)}</h2>
        <p class="place-highlight" style="font-size:1rem; margin-bottom:1rem;">\${escapeHtml(place.highlight_text)}</p>

        \${place.description ? \`<p class="modal-description">\${escapeHtml(place.description)}</p>\` : ''}

        <div class="modal-meta-grid">
          \${place.opening_hours_text ? \`
            <div class="modal-meta-item">
              <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              <span>Horario: \${escapeHtml(place.opening_hours_text)}</span>
            </div>
          \` : ''}
          \${place.price_text ? \`
            <div class="modal-meta-item">
              <svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
              <strong style="color:var(--accent-emerald)">Precio: \${escapeHtml(place.price_text)}</strong>
            </div>
          \` : ''}
        </div>

        <div class="modal-actions-container">
          \${place.google_maps_url ? \`
            <a href="\${escapeHtml(place.google_maps_url)}" target="_blank" rel="noopener" class="btn-full btn-maps">
              📍 Cómo llegar (Google Maps)
            </a>
          \` : ''}
        </div>
      \`;

      modal.classList.add('active');
    };

    window.openRecurrenceInfo = function(title, venue) {
      const modal = document.getElementById('detail-modal');
      const sheet = document.getElementById('modal-content');

      sheet.innerHTML = \`
        <div class="modal-top-bar">
          <span class="recurrence-badge" style="position:static">↻ Actividad periódica</span>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <h2 class="modal-title">\${escapeHtml(title)}</h2>
        <p class="modal-description">Plan recurrente habitual en <strong>\${escapeHtml(venue)}</strong>. Consulta directamente con el local los posibles cambios puntuales de programación.</p>
      \`;
      modal.classList.add('active');
    };

    window.closeModal = function() {
      document.getElementById('detail-modal').classList.remove('active');
    };

    window.closeModalOnBackdrop = function(e) {
      if (e.target.id === 'detail-modal') {
        window.closeModal();
      }
    };

    // ==============================================================================
    // Controladores de interfaz y navegación
    // ==============================================================================
    window.switchView = function(view) {
      currentView = view;
      document.querySelectorAll('.time-tab').forEach((el) => el.classList.remove('active'));

      if (view === 'today') {
        document.getElementById('tab-today').classList.add('active');
        selectedDate = getTodayDateString();
        document.getElementById('calendar-label').innerText = 'Fecha';
      } else if (view === 'weekend') {
        document.getElementById('tab-weekend').classList.add('active');
        document.getElementById('calendar-label').innerText = 'Fecha';
      } else if (view === 'calendar') {
        document.getElementById('tab-calendar').classList.add('active');
      }

      loadData();
    };

    window.onDatePicked = function(pickedDate) {
      if (!pickedDate) return;
      selectedDate = pickedDate;
      currentView = 'calendar';
      document.querySelectorAll('.time-tab').forEach((el) => el.classList.remove('active'));
      document.getElementById('tab-calendar').classList.add('active');
      
      const [y, m, d] = pickedDate.split('-');
      document.getElementById('calendar-label').innerText = \`\${d}/\${m}\`;
      loadData();
    };

    window.setFilter = function(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-chip').forEach((el) => {
        el.classList.toggle('active', el.dataset.filter === filter);
      });

      if (currentView === 'weekend') {
        renderWeekendAgenda();
      } else {
        renderDayAgenda();
      }
    };

    function getDayNameFromNumber(dow) {
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return days[dow] || 'día';
    }

    // ==============================================================================
    // Registro de Service Worker PWA
    // ==============================================================================
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }

    // Inicialización al cargar la página
    document.addEventListener('DOMContentLoaded', () => {
      getSessionHash();
      loadData();
    });
  </script>
</body>
</html>`;

  return c.html(html);
});

// ==============================================================================
// Puerto y arranque del servidor web
// ==============================================================================
const port = Number(process.env.PORT || 3000);

console.log(
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Servidor web PWA VayaPlan iniciando en puerto ${port}`,
    port,
  })
);

export default {
  port,
  fetch: app.fetch,
};
