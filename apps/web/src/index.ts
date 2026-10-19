import { Hono } from 'hono';
import * as path from 'path';
import * as fs from 'fs';
import { renderAdminHtml } from './admin';
import { renderPublicHtml } from './public-page';

const app = new Hono();

// ==============================================================================
// Health Check
// ==============================================================================
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'vayaplan-web' });
});

// ==============================================================================
// Redirección y Tracking de Códigos QR desde Web (puerto 3030)
// ==============================================================================
app.get('/qr/:qrCode', async (c) => {
  const qrCode = c.req.param('qrCode');
  const internalApi = process.env.INTERNAL_API_URL || 'http://api:4000';
  try {
    // Registra el escaneo en la API interna de forma asíncrona
    await fetch(`${internalApi.replace(/\/$/, '')}/api/v1/qr/${encodeURIComponent(qrCode)}`, { method: 'POST' }).catch(() => {});
  } catch (err) {}
  return c.redirect('/?origin=qr_hotel', 302);
});

// ==============================================================================
// Panel de Curación Administrativo (/admin)
// ==============================================================================
app.get('/admin', (c) => {
  return c.html(renderAdminHtml());
});

// ==============================================================================
// Proxy inverso explícito para previsualización aislada
// Exige INTERNAL_API_URL cuando ENABLE_API_PROXY=true (sin fallback automático a producción)
// ==============================================================================
if (process.env.ENABLE_API_PROXY === 'true') {
  const internalApiUrl = process.env.INTERNAL_API_URL;
  if (!internalApiUrl || internalApiUrl.trim() === '') {
    throw new Error('CONFIG_ERROR: ENABLE_API_PROXY=true requiere INTERNAL_API_URL explícito. No se permite fallback automático.');
  }

  app.all('/api/*', async (c) => {
    const targetUrl = new URL(c.req.raw.url);
    const upstreamUrl = `${internalApiUrl.replace(/\/$/, '')}${targetUrl.pathname}${targetUrl.search}`;
    try {
      const response = await fetch(upstreamUrl, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.raw.clone().arrayBuffer(),
      });
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (err) {
      return c.json({ error: 'upstream_unavailable', message: 'Servicio API de pruebas no disponible' }, 502);
    }
  });
}

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
    background_color: '#FFFFFF',
    theme_color: '#6C3BFF',
    categories: ['lifestyle', 'entertainment', 'travel'],
    icons: [
      {
        src: '/icons/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
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
  const swCode = `// VayaPlan Service Worker v1.4
const CACHE_NAME = 'vayaplan-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
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
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});

// ==============================================================================
// Assets e Iconos PWA y Favicon
// ==============================================================================
const ICONS_DIR = path.resolve(__dirname, '../public/icons');

app.get('/favicon.ico', (c) => {
  return c.redirect('/icons/favicon.svg', 302);
});

app.get('/favicon.svg', (c) => {
  return c.redirect('/icons/favicon.svg', 301);
});

app.get('/icons/:filename', (c) => {
  const filename = c.req.param('filename');
  const allowed = [
    'favicon.svg',
    'icon.svg',
    'icon-192x192.png',
    'icon-512x512.png',
    'icon-maskable-192x192.png',
    'icon-maskable-512x512.png',
    'logo-light.svg',
    'logo-dark.svg',
  ];
  if (!allowed.includes(filename)) {
    return c.text('Not found', 404);
  }
  const filePath = path.join(ICONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return c.text('Not found', 404);
  }
  const file = fs.readFileSync(filePath);
  const contentType = filename.endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : 'image/png';
  return new Response(file, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// ==============================================================================
// PWA Zero-Form UI — Aplicación Principal
// ==============================================================================
app.get('/', (c) => {
  return c.html(renderPublicHtml());
});

// ==============================================================================
// Puerto y arranque del servidor web
// ==============================================================================
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || '0.0.0.0';

console.log(
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Servidor web PWA VayaPlan iniciando en puerto ${port} (${hostname})`,
    port,
    hostname,
  })
);

export default {
  port,
  hostname,
  fetch: app.fetch,
};
