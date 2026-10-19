import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import webApp from '../index';
import type { PublicEventItem } from '@vayaplan/types';

describe('apps/web — Ruta de Descarga de Calendario GET /events/:id/calendar.ics', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.INTERNAL_API_URL = 'http://internal-mock-api:4000';
    process.env.PUBLIC_URL = 'https://vayaplan.com';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createMockPublicEvent(overrides: Partial<PublicEventItem> = {}): PublicEventItem {
    return {
      id: 200,
      title: 'Festival Internacional de Cortometrajes',
      description: 'Proyección oficial y coloquio con directores.',
      category: 'cine',
      start_time: '2026-11-15T19:00:00.000Z',
      end_time: '2026-11-15T21:30:00.000Z',
      editorial_date: '2026-11-15',
      editorial_label: 'Domingo tarde',
      price: { amount_cents: 600, is_free: false, label: '6,00 €' },
      status: 'published',
      venue: {
        id: 10,
        name: 'Cine Teatro Ortega',
        slug: 'cine-ortega',
        latitude: 42.008,
        longitude: -4.532,
        google_maps_url: 'https://maps.google.com/?cid=12345',
      },
      image_url: 'https://media.vayaplan.com/events/cinema.webp',
      image_thumb_url: 'https://media.vayaplan.com/events/cinema-thumb.webp',
      actions: {
        maps_url: 'https://maps.google.com/?cid=12345',
        booking_url: null,
        tickets_url: 'https://entradas.cineortega.es',
        whatsapp_url: null,
      },
      verification: { source: 'web', verified_at: '2026-10-18T10:00:00.000Z' },
      promotion: null,
      ...overrides,
    };
  }

  async function requestApp(path: string, init?: RequestInit): Promise<Response> {
    const fetchFn = (webApp as any).fetch;
    return fetchFn(new Request(`http://localhost${path}`, init));
  }

  test('Validación de ID: IDs no numéricos o negativos responden 400 Bad Request', async () => {
    const resAlpha = await requestApp('/events/abc/calendar.ics');
    expect(resAlpha.status).toBe(400);
    const bodyAlpha = await resAlpha.text();
    expect(bodyAlpha).toContain('número entero positivo');

    const resNegative = await requestApp('/events/-10/calendar.ics');
    expect(resNegative.status).toBe(400);

    const resZero = await requestApp('/events/0/calendar.ics');
    expect(resZero.status).toBe(400);
  });

  test('Evento publicado y válido responde 200 OK con cabeceras correctas y archivo .ics RFC 5545', async () => {
    const mockEvent = createMockPublicEvent();

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/events/200')) {
        return new Response(JSON.stringify({ event: mockEvent }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const res = await requestApp('/events/200/calendar.ics');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="evento-200.ics"');
    expect(res.headers.get('Cache-Control')).toContain('no-store');

    const icsText = await res.text();
    expect(icsText).toContain('BEGIN:VCALENDAR');
    expect(icsText).toContain('VERSION:2.0');
    expect(icsText).toContain('BEGIN:VEVENT');
    expect(icsText).toContain('UID:event-200@vayaplan.com');
    expect(icsText).toContain('DTSTART:20261115T190000Z');
    expect(icsText).toContain('DTEND:20261115T213000Z');
    expect(icsText).toContain('SUMMARY:Festival Internacional de Cortometrajes');
    expect(icsText).toContain('LOCATION:Cine Teatro Ortega\\, Palencia');
    expect(icsText).toContain('URL:https://vayaplan.com/events/200');
    expect(icsText).toContain('END:VEVENT');
    expect(icsText).toContain('END:VCALENDAR');
  });

  test('Restricción en servidor: evento cancelado responde 400 impidiendo descarga', async () => {
    const mockCancelled = createMockPublicEvent({ status: 'cancelled' });

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/events/200')) {
        return new Response(JSON.stringify({ event: mockCancelled }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const res = await requestApp('/events/200/calendar.ics');
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('cancelado');
  });

  test('Restricción en servidor: evento finalizado con end_time conocido responde 400', async () => {
    // Evento en el pasado
    const mockFinished = createMockPublicEvent({
      start_time: '2020-01-01T10:00:00.000Z',
      end_time: '2020-01-01T12:00:00.000Z',
    });

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/events/200')) {
        return new Response(JSON.stringify({ event: mockFinished }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const res = await requestApp('/events/200/calendar.ics');
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('finalizado');
  });

  test('Visibilidad: evento no publicado, borrador tentative o inexistente responde 404', async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/events/99999')) {
        return new Response(JSON.stringify({ error: 'event_not_found', message: 'No encontrado' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const res = await requestApp('/events/99999/calendar.ics');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('no existe o no está publicado');
  });

  test('Fallo de servicio interno responde 502 controlado', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as any;

    const res = await requestApp('/events/200/calendar.ics');
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain('no está disponible');
  });
});
