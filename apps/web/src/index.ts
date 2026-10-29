import { Hono } from 'hono';
import * as path from 'path';
import * as fs from 'fs';
import { renderAdminHtml } from './admin';
import { renderPublicHtml } from './public-page';
import { renderFestivalHtml } from './festival-page';
import { renderRoutesHtml } from './routes-page';
import { extractEventActionSource, computeCalendarState, generateIcsCalendar } from './event-actions';
import type { PublicEventItem } from '@vayaplan/types';

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
  const swCode = `// VayaPlan Service Worker v1.6
const CACHE_NAME = 'vayaplan-pwa-v4';
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
          if (key.startsWith('vayaplan-pwa-') && key !== CACHE_NAME) {
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
        // Solo cachear respuestas 200 OK para evitar enmascarar errores (404, 5xx)
        // y excluir expresamente rutas dinámicas de eventos /events/, festivales /festivals/, rutas /rutas y ciudades /ciudades/
        if (response && response.status === 200 && !url.pathname.startsWith('/events/') && !url.pathname.startsWith('/festivals/') && !url.pathname.startsWith('/rutas') && !url.pathname.startsWith('/ciudades/')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // No disfrazar rutas de eventos /events/, festivales /festivals/, rutas /rutas ni ciudades /ciudades/ como la página principal '/'
          if (event.request.mode === 'navigate' && !url.pathname.startsWith('/events/') && !url.pathname.startsWith('/festivals/') && !url.pathname.startsWith('/rutas') && !url.pathname.startsWith('/ciudades/')) {
            return caches.match('/');
          }
          return new Response('Sin conexión a internet', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
      })
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
const IMAGES_DIR = path.resolve(__dirname, '../public/images');

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

app.get('/images/*', (c) => {
  const relativePath = c.req.path.replace(/^\/images\//, '');
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(IMAGES_DIR, safePath);
  if (!filePath.startsWith(IMAGES_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return c.text('Not found', 404);
  }
  const file = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.svg') contentType = 'image/svg+xml; charset=utf-8';
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
// Descarga de Calendario de Evento (.ics): GET /events/:id/calendar.ics
// ==============================================================================
app.get('/events/:id/calendar.ics', async (c) => {
  const rawId = c.req.param('id')?.trim();
  const eventId = Number(rawId);

  // 1. Validación de ID: debe ser número entero positivo
  if (!rawId || Number.isNaN(eventId) || !Number.isInteger(eventId) || eventId <= 0) {
    return c.text('El identificador del evento debe ser un número entero positivo.', 400, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  // 2. Consulta a la API interna pública (aplica visibilidad WHERE status IN ('published', 'cancelled'))
  const internalApi = (process.env.INTERNAL_API_URL || 'http://api:4000').replace(/\/$/, '');
  const apiUrl = `${internalApi}/api/v1/events/${eventId}`;

  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });
  } catch (err: any) {
    return c.text('El servicio no está disponible en este momento.', 502, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  if (apiRes.status === 404) {
    return c.text('El evento solicitado no existe o no está publicado.', 404, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  if (!apiRes.ok) {
    return c.text('Error al consultar el servicio interno de eventos.', 502, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  let data: { event: PublicEventItem };
  try {
    data = (await apiRes.json()) as { event: PublicEventItem };
  } catch {
    return c.text('Respuesta inválida del servicio interno de eventos.', 502, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  const ev = data.event;
  const publicOrigin = (process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '');
  const actionSource = extractEventActionSource(ev, `${publicOrigin}/events/${ev.id}`);

  // 3. Aplica en servidor las restricciones del calendario (no sólo en el botón)
  const calState = computeCalendarState(actionSource);
  if (!calState.allowed) {
    return c.text(calState.notice || 'No es posible añadir este evento al calendario.', 400, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  // 4. Genera contenido iCalendar RFC 5545
  let icsContent: string;
  try {
    icsContent = generateIcsCalendar(actionSource);
  } catch (err: any) {
    return c.text(err?.message || 'Error al generar el archivo de calendario.', 400, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
  }

  return new Response(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="evento-${ev.id}.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});

// ==============================================================================
// Ficha Pública de Evento Individual: GET /events/:id
// ==============================================================================
app.get('/events/:id', async (c) => {
  const rawId = c.req.param('id')?.trim();
  const eventId = Number(rawId);

  // Origen público seguro y validado (evita host header injection)
  const publicOrigin = (process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '');

  // 1. Validación de ID: debe ser número entero positivo
  if (!rawId || Number.isNaN(eventId) || !Number.isInteger(eventId) || eventId <= 0) {
    return c.html(
      renderPublicHtml({
        title: 'Solicitud no válida | VayaPlan',
        description: 'El identificador del evento debe ser un número entero positivo.',
        canonicalUrl: `${publicOrigin}/`,
        initialError: {
          statusCode: 400,
          error: 'invalid_parameter',
          message: 'El identificador del evento debe ser un número entero positivo.',
        },
      }),
      400,
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    );
  }

  // 2. Consulta a la API interna con timeout explícito
  const internalApi = (process.env.INTERNAL_API_URL || 'http://api:4000').replace(/\/$/, '');
  const apiUrl = `${internalApi}/api/v1/events/${eventId}`;

  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(3000),
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err: any) {
    // Si la API falla o agota el tiempo, responde error controlado 502/504 (nunca un falso 404)
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const statusCode = isTimeout ? 504 : 502;
    return c.html(
      renderPublicHtml({
        title: 'Servicio no disponible | VayaPlan',
        description: 'No se pudo conectar con el servicio de eventos. Inténtalo de nuevo en unos instantes.',
        canonicalUrl: `${publicOrigin}/events/${eventId}`,
        initialError: {
          statusCode,
          error: isTimeout ? 'gateway_timeout' : 'upstream_unavailable',
          message: 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos instantes.',
        },
      }),
      statusCode,
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    );
  }

  // 3. Si la API devuelve 404 (inexistente, borrador tentative, archivado, etc.)
  if (apiRes.status === 404) {
    return c.html(
      renderPublicHtml({
        title: 'Plan no encontrado | VayaPlan',
        description: 'El plan que buscas no está disponible o ha expirado. Descubre los mejores planes de hoy en Palencia con VayaPlan.',
        canonicalUrl: `${publicOrigin}/`,
        initialError: {
          statusCode: 404,
          error: 'event_not_found',
          message: 'El plan que buscas no está disponible o ha expirado.',
        },
      }),
      404,
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    );
  }

  // 4. Si la API devuelve otro código de error (500, etc.)
  if (!apiRes.ok) {
    return c.html(
      renderPublicHtml({
        title: 'Error al consultar evento | VayaPlan',
        description: 'Ocurrió un error al cargar la información del evento.',
        canonicalUrl: `${publicOrigin}/events/${eventId}`,
        initialError: {
          statusCode: 502,
          error: 'upstream_error',
          message: 'Error al consultar el servicio interno de eventos.',
        },
      }),
      502,
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    );
  }

  // 5. API respondió 200 con evento publicado o cancelado
  let data: { event: PublicEventItem };
  try {
    data = (await apiRes.json()) as { event: PublicEventItem };
  } catch {
    return c.html(
      renderPublicHtml({
        title: 'Error al consultar evento | VayaPlan',
        description: 'Respuesta inválida del servicio interno de eventos.',
        canonicalUrl: `${publicOrigin}/events/${eventId}`,
        initialError: {
          statusCode: 502,
          error: 'invalid_upstream_response',
          message: 'Respuesta inválida del servicio interno de eventos.',
        },
      }),
      502,
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    );
  }

  const ev = data.event;
  const isCancelled = ev.status === 'cancelled';

  // Metadatos específicos
  const pageTitle = isCancelled
    ? `[Cancelado] ${ev.title} — ${ev.venue.name} | VayaPlan`
    : `${ev.title} — ${ev.venue.name} | VayaPlan`;

  const isContinuous = ev.time_status === 'continuous' || Boolean(ev.end_date && ev.editorial_date && ev.end_date > ev.editorial_date);
  const isPendingTime = !isContinuous && (ev.time_status === 'pending_time' || !ev.start_time);

  let temporalDetail = '';
  let timeForCancelled = '';

  const formatIsoDate = (dStr?: string | null): string => {
    if (!dStr) return '';
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const year = Number(parts[0]);
        const month = Number(parts[1]) - 1;
        const day = Number(parts[2]);
        const date = new Date(year, month, day);
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const months = [
          'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
          'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
        ];
        return `${days[date.getDay()]}, ${day} de ${months[month]} de ${year}`;
      }
    } catch {}
    return dStr;
  };

  if (isContinuous) {
    const startFormatted = formatIsoDate(ev.editorial_date);
    const endFormatted = ev.end_date ? formatIsoDate(ev.end_date) : '';
    const periodText = endFormatted ? `Del ${startFormatted} al ${endFormatted}` : `Desde el ${startFormatted}`;
    temporalDetail = ev.schedule_text ? `${periodText} (${ev.schedule_text})` : periodText;
    timeForCancelled = periodText;
  } else if (isPendingTime) {
    const dateFormatted = formatIsoDate(ev.editorial_date);
    const dateFormattedCap = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
    temporalDetail = `${dateFormattedCap} · Horario por confirmar`;
    timeForCancelled = `${dateFormatted}, horario pendiente`;
  } else {
    const dt = new Date(ev.start_time!);
    const timeFormatted = dt.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Madrid',
    });
    const dateFormatted = dt.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Madrid',
    });
    const dateFormattedCap = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
    temporalDetail = `${dateFormattedCap} · ${timeFormatted} h`;
    timeForCancelled = `${dateFormatted}, ${timeFormatted} h`;
  }

  let priceText = '';
  if (ev.price) {
    if (ev.price.is_free || ev.price.amount_cents === 0) {
      priceText = 'Gratis';
    } else if (ev.price.amount_cents !== null && ev.price.amount_cents !== undefined) {
      priceText = `${(ev.price.amount_cents / 100).toFixed(2).replace('.', ',')} €`;
    } else if (ev.price.label) {
      priceText = ev.price.label;
    }
  }

  const descSnippet = ev.description ? ev.description.trim() : '';

  let pageDescription: string;
  if (isCancelled) {
    pageDescription = `CANCELADO: ${ev.title} en ${ev.venue.name} (${timeForCancelled}). Consulta detalles y estado en VayaPlan.`;
  } else {
    const details = [
      temporalDetail,
      ev.venue.name,
      priceText ? `Precio: ${priceText}` : '',
    ].filter(Boolean).join(' · ');

    if (descSnippet) {
      const excerpt = descSnippet.length > 130 ? descSnippet.slice(0, 130) + '...' : descSnippet;
      pageDescription = `${ev.title} — ${details}. ${excerpt}`;
    } else {
      pageDescription = `${ev.title} — ${details}. Toda la información, cartel y cómo llegar en VayaPlan.`;
    }
  }

  const canonicalUrl = `${publicOrigin}/events/${ev.id}`;

  // Imagen: Usar image_url (detalle pública). Preponderar URL absoluta si es relativa
  let ogImage = `${publicOrigin}/icons/icon-512x512.png`;
  if (ev.image_url) {
    ogImage = ev.image_url.startsWith('http')
      ? ev.image_url
      : `${publicOrigin}${ev.image_url.startsWith('/') ? '' : '/'}${ev.image_url}`;
  }

  const ogImageAlt = `Cartel de ${ev.title} en ${ev.venue.name}`;

  return c.html(
    renderPublicHtml({
      title: pageTitle,
      description: pageDescription,
      canonicalUrl,
      ogTitle: pageTitle,
      ogDescription: pageDescription,
      ogUrl: canonicalUrl,
      ogImage,
      ogImageAlt,
      ogType: 'article',
      twitterTitle: pageTitle,
      twitterDescription: pageDescription,
      twitterImage: ogImage,
      initialEvent: ev,
    }),
    200,
    {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  );
});

// ==============================================================================
// Ficha Pública de Festival / Ciclo: GET /festivals/:slug
// ==============================================================================
const handleFestivalRoute = async (c: any) => {
  const slug = c.req.param('slug')?.trim();
  const citySlug = c.req.param('citySlug')?.trim() || 'palencia';

  if (!slug) {
    return c.text('El identificador del festival es obligatorio.', 400);
  }

  const internalApi = (process.env.INTERNAL_API_URL || 'http://api:4000').replace(/\/$/, '');
  const apiUrl = `${internalApi}/api/v1/cities/${encodeURIComponent(citySlug)}/festivals/${encodeURIComponent(slug)}`;

  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });
  } catch {
    return c.text('El servicio no está disponible en este momento.', 502);
  }

  if (apiRes.status === 404) {
    return c.html(
      renderPublicHtml({
        title: 'Festival no encontrado | VayaPlan',
        description: 'El festival o ciclo solicitado no existe o no está publicado.',
        canonicalUrl: `${(process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '')}/`,
        initialError: {
          statusCode: 404,
          error: 'festival_not_found',
          message: 'El festival o ciclo solicitado no existe o no está disponible.',
        },
      }),
      404,
      { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    );
  }

  if (!apiRes.ok) {
    return c.text('Error al consultar el festival.', 502);
  }

  const data = await apiRes.json();
  const publicOrigin = (process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '');
  const canonicalUrl = `${publicOrigin}/festivals/${encodeURIComponent(slug)}`;

  return c.html(renderFestivalHtml(data, canonicalUrl), 200, {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
};

app.get('/festivals/:slug', handleFestivalRoute);
app.get('/ciudades/:citySlug/festivals/:slug', handleFestivalRoute);

// ==============================================================================
// Rutas Gastronómicas Públicas: GET /rutas y GET /ciudades/:citySlug/rutas
// ==============================================================================
const handleRoutesRoute = async (c: any) => {
  const citySlug = c.req.param('citySlug')?.trim() || 'palencia';
  const internalApi = (process.env.INTERNAL_API_URL || 'http://api:4000').replace(/\/$/, '');
  const apiUrl = `${internalApi}/api/v1/cities/${encodeURIComponent(citySlug)}/routes`;

  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });
  } catch {
    return c.text('El servicio no está disponible en este momento.', 502);
  }

  if (apiRes.status === 404) {
    return c.html(
      renderPublicHtml({
        title: 'Rutas no encontradas | VayaPlan',
        description: 'No hay rutas gastronómicas disponibles para esta ciudad.',
        canonicalUrl: `${(process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '')}/`,
        initialError: {
          statusCode: 404,
          error: 'routes_not_found',
          message: 'No hay rutas gastronómicas publicadas en esta ciudad.',
        },
      }),
      404,
      { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    );
  }

  if (!apiRes.ok) {
    return c.text('Error al consultar las rutas gastronómicas.', 502);
  }

  const data = await apiRes.json();
  const publicOrigin = (process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '');
  const canonicalUrl = `${publicOrigin}/rutas`;

  return c.html(renderRoutesHtml(data, canonicalUrl), 200, {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
};

app.get('/rutas', handleRoutesRoute);
app.get('/ciudades/:citySlug/rutas', handleRoutesRoute);

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
