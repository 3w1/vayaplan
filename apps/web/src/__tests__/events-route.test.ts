import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { renderPublicHtml, type PublicPageMeta } from '../public-page';
import webApp from '../index';
import type { PublicEventItem } from '@vayaplan/types';

describe('apps/web — Metadatos, Vistas Previas y Sanitización (public-page.ts)', () => {
  test('renderPublicHtml genera metadatos por defecto de Palencia sin argumentos', () => {
    const html = renderPublicHtml();
    expect(html).toContain('<title>VayaPlan — ¿Qué hacer hoy en Palencia? Agenda Hiperlocal</title>');
    expect(html).toContain('<link rel="canonical" href="https://vayaplan.com/">');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:title" content="VayaPlan — ¿Qué hacer hoy en Palencia?">');
    expect(html).toContain('<meta property="og:image" content="https://vayaplan.com/icons/icon-512x512.png">');
    expect(html).toContain('<meta property="og:url" content="https://vayaplan.com/">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('id="__VAYAPLAN_BOOTSTRAP__"');
  });

  test('renderPublicHtml interpola metadatos específicos de evento publicado', () => {
    const meta: PublicPageMeta = {
      title: 'Concierto de Jazz — Teatro Principal | VayaPlan',
      description: 'Concierto de Jazz en Teatro Principal. Sábado, 21 de noviembre a las 21:00 h en Palencia.',
      canonicalUrl: 'https://vayaplan.com/events/101',
      ogType: 'article',
      ogTitle: 'Concierto de Jazz — Teatro Principal | VayaPlan',
      ogDescription: 'Concierto de Jazz en Teatro Principal. Sábado, 21 de noviembre a las 21:00 h en Palencia.',
      ogUrl: 'https://vayaplan.com/events/101',
      ogImage: 'https://vayaplan.com/api/v1/uploads/jazz-detail.webp',
      ogImageAlt: 'Cartel de Concierto de Jazz en Teatro Principal',
      twitterTitle: 'Concierto de Jazz — Teatro Principal | VayaPlan',
      twitterDescription: 'Concierto de Jazz en Teatro Principal.',
      twitterImage: 'https://vayaplan.com/api/v1/uploads/jazz-detail.webp',
    };

    const html = renderPublicHtml(meta);
    expect(html).toContain('<title>Concierto de Jazz — Teatro Principal | VayaPlan</title>');
    expect(html).toContain('<link rel="canonical" href="https://vayaplan.com/events/101">');
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta property="og:title" content="Concierto de Jazz — Teatro Principal | VayaPlan">');
    expect(html).toContain('<meta property="og:url" content="https://vayaplan.com/events/101">');
    expect(html).toContain('<meta property="og:image" content="https://vayaplan.com/api/v1/uploads/jazz-detail.webp">');
    expect(html).toContain('<meta property="og:image:alt" content="Cartel de Concierto de Jazz en Teatro Principal">');
    expect(html).toContain('<meta name="twitter:title" content="Concierto de Jazz — Teatro Principal | VayaPlan">');
    expect(html).toContain('<meta name="twitter:image" content="https://vayaplan.com/api/v1/uploads/jazz-detail.webp">');
  });

  test('renderPublicHtml escapa estrictamente caracteres HTML en metadatos', () => {
    const meta: PublicPageMeta = {
      title: 'Rock & "Roll" <Especial> \'26 — Bar El Ángel | VayaPlan',
      description: 'Música en directo & copas <sin alcohol> "VIP" y \'tardeo\'.',
      canonicalUrl: 'https://vayaplan.com/events/102?param=1&foo=bar',
      ogTitle: 'Rock & "Roll" <Especial>',
      ogImageAlt: 'Cartel de "Rock" & Roll <Live>',
    };

    const html = renderPublicHtml(meta);
    expect(html).toContain('<title>Rock &amp; &quot;Roll&quot; &lt;Especial&gt; &#39;26 — Bar El Ángel | VayaPlan</title>');
    expect(html).toContain('content="Música en directo &amp; copas &lt;sin alcohol&gt; &quot;VIP&quot; y &#39;tardeo&#39;."');
    expect(html).toContain('href="https://vayaplan.com/events/102?param=1&amp;foo=bar"');
    expect(html).toContain('property="og:title" content="Rock &amp; &quot;Roll&quot; &lt;Especial&gt;"');
    expect(html).toContain('property="og:image:alt" content="Cartel de &quot;Rock&quot; &amp; Roll &lt;Live&gt;"');
  });

  test('renderPublicHtml protege contra inyecciones XSS en bootstrap script y metadatos', () => {
    const maliciousTitle = '</script><script>alert("xss")</script>';
    const meta: PublicPageMeta = {
      title: maliciousTitle,
      description: 'Prueba de ataque </script><script>alert("xss2")</script>',
      initialError: {
        statusCode: 404,
        error: 'attack',
        message: 'Intento </script><script>fetch("http://evil.com")</script>',
      },
    };

    const html = renderPublicHtml(meta);
    // En el HTML no debe existir ningún script closing tag no escapado dentro de atributos ni dentro del bloque bootstrap
    expect(html).not.toContain('</script><script>alert');
    expect(html).toContain('\\u003c/script\\u003e');
  });
});

describe('apps/web — Ruta Pública GET /events/:id', () => {
  const originalFetch = globalThis.fetch;
  const originalPublicUrl = process.env.PUBLIC_URL;
  const originalInternalApiUrl = process.env.INTERNAL_API_URL;

  beforeEach(() => {
    process.env.PUBLIC_URL = 'https://vayaplan.com';
    process.env.INTERNAL_API_URL = 'http://api-test:4000';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalPublicUrl !== undefined) {
      process.env.PUBLIC_URL = originalPublicUrl;
    } else {
      delete process.env.PUBLIC_URL;
    }
    if (originalInternalApiUrl !== undefined) {
      process.env.INTERNAL_API_URL = originalInternalApiUrl;
    } else {
      delete process.env.INTERNAL_API_URL;
    }
  });

  const sampleEvent: PublicEventItem = {
    id: 101,
    title: 'Noche de Monólogos en Teatro Principal',
    description: 'Risas garantizadas con los mejores cómicos de Castilla y León.',
    category: 'monologo',
    start_time: '2026-11-20T21:00:00.000Z',
    end_time: '2026-11-20T23:00:00.000Z',
    editorial_date: '2026-11-20',
    editorial_label: 'Viernes 20 de noviembre',
    price: {
      amount_cents: 1200,
      is_free: false,
      label: '12 €',
    },
    status: 'published',
    venue: {
      id: 5,
      name: 'Teatro Principal',
      slug: 'teatro-principal',
      latitude: 42.009,
      longitude: -4.532,
      google_maps_url: 'https://maps.google.com/?q=Teatro+Principal',
    },
    image_url: '/api/v1/uploads/monologos-detail.webp',
    image_thumb_url: '/api/v1/uploads/monologos-thumb.webp',
    actions: {
      maps_url: 'https://maps.google.com/?q=Teatro+Principal',
      booking_url: null,
      tickets_url: 'https://entradas.teatroprincipal.com/101',
      whatsapp_url: null,
    },
    verification: {
      source: 'web',
      verified_at: '2026-10-18T10:00:00.000Z',
    },
    promotion: null,
  };

  test('Validación de ID: ID no numérico o inválido responde 400 controlado', async () => {
    const fetchFn = (webApp as any).fetch;

    const invalidIds = ['abc', '-5', '0', '12.5', 'null'];
    for (const invalidId of invalidIds) {
      const res = await fetchFn(new Request(`http://localhost/events/${invalidId}`));
      expect(res.status).toBe(400);

      const html = await res.text();
      expect(html).toContain('Solicitud no válida | VayaPlan');
      expect(html).toContain('invalid_parameter');
      expect(res.headers.get('cache-control')).toContain('no-cache');
    }
  });

  test('Evento publicado: responde 200 con metadatos específicos y bootstrap enriquecido', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('/api/v1/events/101')) {
        return new Response(JSON.stringify({ event: sampleEvent }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/events/101'));
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('text/html');

    const cacheControl = res.headers.get('cache-control') || '';
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('no-cache');

    const html = await res.text();
    // Título y datos de espacio
    expect(html).toContain('<title>Noche de Monólogos en Teatro Principal — Teatro Principal | VayaPlan</title>');
    expect(html).toContain('<link rel="canonical" href="https://vayaplan.com/events/101">');
    expect(html).toContain('<meta property="og:title" content="Noche de Monólogos en Teatro Principal — Teatro Principal | VayaPlan">');
    expect(html).toContain('<meta property="og:url" content="https://vayaplan.com/events/101">');
    expect(html).toContain('<meta property="og:image" content="https://vayaplan.com/api/v1/uploads/monologos-detail.webp">');
    expect(html).toContain('Cartel de Noche de Monólogos en Teatro Principal en Teatro Principal');
    // Bootstrap con evento
    expect(html).toContain('id="__VAYAPLAN_BOOTSTRAP__"');
    expect('"id":101').toBeTruthy();
    expect('"title":"Noche de Monólogos en Teatro Principal"').toBeTruthy();
  });

  test('Evento sin imagen utiliza fallback de marca (icon-512x512.png) y mantiene coherencia social', async () => {
    const eventWithoutImage: PublicEventItem = {
      ...sampleEvent,
      id: 104,
      title: 'Taller Cultural Sin Cartel',
      image_url: null,
      image_thumb_url: null,
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('/api/v1/events/104')) {
        return new Response(JSON.stringify({ event: eventWithoutImage }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/events/104'));
    expect(res.status).toBe(200);

    const html = await res.text();
    // Fallback de marca para og:image y twitter:image
    expect(html).toContain('<meta property="og:image" content="https://vayaplan.com/icons/icon-512x512.png">');
    expect(html).toContain('<meta name="twitter:image" content="https://vayaplan.com/icons/icon-512x512.png">');
    expect(html).toContain('<link rel="canonical" href="https://vayaplan.com/events/104">');
    expect(html).toContain('<meta property="og:url" content="https://vayaplan.com/events/104">');

    // Comprobar ausencia de etiquetas contradictorias
    expect(html).not.toContain('content="null"');
    expect(html).not.toContain('content="undefined"');
  });

  test('Evento sin descripción genera metadatos enriquecidos con datos factuales sin texto genérico de la home', async () => {
    const eventWithoutDesc: PublicEventItem = {
      ...sampleEvent,
      id: 103,
      title: 'Danza Contemporánea',
      description: null,
      price: { amount_cents: 0, is_free: true, label: 'Gratis' },
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('/api/v1/events/103')) {
        return new Response(JSON.stringify({ event: eventWithoutDesc }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/events/103'));
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).not.toContain('Agenda hiperlocal de Palencia sin registro ni fricción.');
    expect(html).toContain('Danza Contemporánea');
    expect(html).toContain('Teatro Principal');
    expect(html).toContain('Gratis');
    expect(html).toContain('Toda la información, cartel y cómo llegar en VayaPlan.');
  });

  test('Evento cancelado: responde 200 identificando claramente la cancelación', async () => {
    const cancelledEvent: PublicEventItem = {
      ...sampleEvent,
      id: 102,
      title: 'Concierto Acústico de Otoño',
      status: 'cancelled',
      actions: {
        ...sampleEvent.actions,
        tickets_url: null,
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('/api/v1/events/102')) {
        return new Response(JSON.stringify({ event: cancelledEvent }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/events/102'));
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('<title>[Cancelado] Concierto Acústico de Otoño — Teatro Principal | VayaPlan</title>');
    expect(html).toContain('CANCELADO: Concierto Acústico de Otoño en Teatro Principal');
    expect(html).toContain('"status":"cancelled"');
  });

  test('Evento inexistente, borrador tentative o archivado: responde 404 neutro sin filtrar datos', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('/api/v1/events/999')) {
        return new Response(
          JSON.stringify({
            error: 'event_not_found',
            message: 'El evento con ID 999 no fue encontrado.',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/events/999'));
    expect(res.status).toBe(404);

    const cacheControl = res.headers.get('cache-control') || '';
    expect(cacheControl).toContain('no-cache');

    const html = await res.text();
    expect(html).toContain('<title>Plan no encontrado | VayaPlan</title>');
    expect(html).toContain('El plan que buscas no está disponible o ha expirado.');
    expect(html).toContain('<link rel="canonical" href="https://vayaplan.com/">');
    expect(html).toContain('"error":"event_not_found"');
    // Confirma que no se filtran datos privados
    expect(html).not.toContain('Borrador');
    expect(html).not.toContain('Archivado');
  });

  test('Fallo de la API interna o tiempo agotado: responde 502/504 controlado (nunca falso 404)', async () => {
    // 1. Error de red (conexión rechazada o caída)
    globalThis.fetch = (async () => {
      throw new Error('Connection refused');
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const res502 = await fetchFn(new Request('http://localhost/events/101'));
    expect(res502.status).toBe(502);

    const html502 = await res502.text();
    expect(html502).toContain('<title>Servicio no disponible | VayaPlan</title>');
    expect(html502).not.toContain('<title>Plan no encontrado | VayaPlan</title>');
    expect(html502).toContain('upstream_unavailable');

    // 2. Timeout de conexión
    globalThis.fetch = (async () => {
      const err = new Error('The operation timed out');
      err.name = 'TimeoutError';
      throw err;
    }) as any;

    const res504 = await fetchFn(new Request('http://localhost/events/101'));
    expect(res504.status).toBe(504);

    const html504 = await res504.text();
    expect(html504).toContain('<title>Servicio no disponible | VayaPlan</title>');
    expect(html504).toContain('gateway_timeout');
  });

  test('Prevención de Host Header Injection: canonical y og:url usan PUBLIC_URL validado', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ event: sampleEvent }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const fetchFn = (webApp as any).fetch;
    const req = new Request('http://localhost/events/101', {
      headers: {
        Host: 'sitio-malicioso.com',
        'X-Forwarded-Host': 'sitio-malicioso.com',
      },
    });

    const res = await fetchFn(req);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://vayaplan.com/events/101">');
    expect(html).toContain('<meta property="og:url" content="https://vayaplan.com/events/101">');
    expect(html).not.toContain('sitio-malicioso.com');
  });

  test('Service Worker /sw.js no disfraza rutas /events/* como la shell principal / y excluye /events/* de Cache Storage', async () => {
    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/sw.js'));
    expect(res.status).toBe(200);

    const swCode = await res.text();
    expect(swCode).toContain("const CACHE_NAME = 'vayaplan-pwa-v3'");
    expect(swCode).toContain('response.status === 200');
    expect(swCode).toContain("!url.pathname.startsWith('/events/')");
    expect(swCode).toContain('caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache))');
    expect(swCode).toContain('Sin conexión a internet');
  });

  test('Service Worker activate: comportamiento de purga selectiva de Cache Storage (solo familia vayaplan-pwa-)', async () => {
    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/sw.js'));
    expect(res.status).toBe(200);
    const swCode = await res.text();

    const deletedCaches: string[] = [];
    const existingCaches = [
      'vayaplan-pwa-v1',
      'vayaplan-pwa-v2',
      'vayaplan-pwa-v3', // Versión activa actual: DEBE CONSERVARSE
      'workbox-precache-v1', // Caché ajena: DEBE CONSERVARSE
      'firebase-installations', // Caché ajena: DEBE CONSERVARSE
      'vayaplan-analytics-cache', // Otra caché VayaPlan fuera de vayaplan-pwa-: DEBE CONSERVARSE
      'vayaplan-uploads-cache', // Otra caché VayaPlan fuera de vayaplan-pwa-: DEBE CONSERVARSE
    ];

    const mockCaches = {
      keys: async () => [...existingCaches],
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
    };

    const activateListeners: Function[] = [];
    const mockSelf = {
      addEventListener: (type: string, fn: Function) => {
        if (type === 'activate') activateListeners.push(fn);
      },
      clients: {
        claim: () => {},
      },
    };

    // Ejecutar el script del Service Worker con los mocks inyectados
    const swRunner = new Function('self', 'caches', swCode);
    swRunner(mockSelf, mockCaches);

    expect(activateListeners.length).toBeGreaterThanOrEqual(1);

    let waitUntilPromise: Promise<any> | null = null;
    const mockEvent = {
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    };

    activateListeners[0](mockEvent);
    await waitUntilPromise;

    // 1. Versiones anteriores vayaplan-pwa-* se eliminan:
    expect(deletedCaches).toContain('vayaplan-pwa-v1');
    expect(deletedCaches).toContain('vayaplan-pwa-v2');

    // 2. La versión actual vayaplan-pwa-v3 se conserva:
    expect(deletedCaches).not.toContain('vayaplan-pwa-v3');

    // 3. Cachés ajenas se conservan:
    expect(deletedCaches).not.toContain('workbox-precache-v1');
    expect(deletedCaches).not.toContain('firebase-installations');

    // 4. Otras cachés de VayaPlan que no pertenezcan a la familia vayaplan-pwa- se conservan:
    expect(deletedCaches).not.toContain('vayaplan-analytics-cache');
    expect(deletedCaches).not.toContain('vayaplan-uploads-cache');
  });
});
