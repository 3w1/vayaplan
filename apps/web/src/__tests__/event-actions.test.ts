import { describe, expect, test } from 'bun:test';
import {
  extractEventActionSource,
  formatEventDateTimeInMadrid,
  formatConfirmedPrice,
  buildWhatsAppMessage,
  buildWhatsAppShareUrl,
  buildShareText,
  isValidCoordinate,
  isValidExternalMapUrl,
  buildDirectionsUrl,
  computeCalendarState,
  escapeIcsText,
  foldIcsLine,
  formatUtcIcs,
  generateIcsCalendar,
  renderEventActionsHtml,
  renderVenueDirectionsHtml,
  type EventActionSource,
} from '../event-actions';
import type { PublicEventItem } from '@vayaplan/types';

describe('apps/web — Módulo de Acciones de Evento (event-actions.ts)', () => {
  const baseSyntheticEvent: EventActionSource = {
    id: 42,
    title: 'Concierto de Jazz & Blues 🎷',
    status: 'published',
    start_time: '2026-10-19T18:00:00.000Z', // 20:00 CEST en Europe/Madrid
    end_time: '2026-10-19T20:30:00.000Z',   // 22:30 CEST en Europe/Madrid
    venue_name: 'Teatro Principal de Palencia',
    venue_address: 'Calle Mayor, 5',
    city: 'Palencia',
    latitude: 42.0094,
    longitude: -4.5298,
    maps_url: 'https://maps.google.com/?cid=9876543210',
    price_is_free: false,
    price_amount_cents: 1500,
    price_label: '15,00 €',
    canonical_url: 'https://vayaplan.com/events/42',
  };

  describe('1. Formateo de Fechas en Europe/Madrid', () => {
    test('formatea correctamente fecha y hora reales diurnas en Europe/Madrid con mayúscula inicial', () => {
      // 18:00 UTC en horario de verano (CEST) = 20:00
      const formatted = formatEventDateTimeInMadrid('2026-10-19T18:00:00.000Z');
      expect(formatted).toBe('Lunes, 19 de octubre · 20:00 h');
    });

    test('formatea rango de inicio y fin en el mismo día con separador de punto medio', () => {
      const formatted = formatEventDateTimeInMadrid(
        '2026-10-19T18:00:00.000Z',
        '2026-10-19T20:30:00.000Z'
      );
      expect(formatted).toBe('Lunes, 19 de octubre · 20:00 - 22:30 h');
    });

    test('gestiona eventos de madrugada con cambio de día real en Europe/Madrid', () => {
      // 2026-10-19T23:30:00.000Z en UTC = 2026-10-20 01:30 CEST en Madrid (martes)
      const formatted = formatEventDateTimeInMadrid('2026-10-19T23:30:00.000Z');
      expect(formatted).toBe('Martes, 20 de octubre · 01:30 h');
    });

    test('gestiona eventos que cruzan la medianoche entre dos días diferentes', () => {
      // Inicio 23:00 CEST (21:00 UTC) el sábado 24 -> Fin en domingo 25 tras cambio de hora de otoño en España (01:00 UTC = 02:00 CET)
      const formatted = formatEventDateTimeInMadrid(
        '2026-10-24T21:00:00.000Z',
        '2026-10-25T01:00:00.000Z'
      );
      expect(formatted).toContain('Sábado, 24 de octubre · 23:00 h');
      expect(formatted).toContain('Domingo, 25 de octubre · 02:00 h');
    });
  });

  describe('2. Precio Confirmado ("Gratis", no "Entrada libre")', () => {
    test('evento gratuito devuelve estrictamente "Gratis"', () => {
      const free1 = formatConfirmedPrice({ ...baseSyntheticEvent, price_is_free: true, price_amount_cents: 0 });
      expect(free1).toBe('Gratis');

      const free2 = formatConfirmedPrice({ ...baseSyntheticEvent, price_is_free: false, price_amount_cents: 0 });
      expect(free2).toBe('Gratis');
    });

    test('evento de pago confirmado devuelve importe en euros', () => {
      const paid = formatConfirmedPrice({ ...baseSyntheticEvent, price_is_free: false, price_amount_cents: 1250 });
      expect(paid).toBe('12,50 €');
    });

    test('precio desconocido o no confirmado devuelve null (se omite del mensaje)', () => {
      const unknown1 = formatConfirmedPrice({ ...baseSyntheticEvent, price_is_free: false, price_amount_cents: null });
      expect(unknown1).toBeNull();

      const unknown2 = formatConfirmedPrice({ ...baseSyntheticEvent, price_is_free: undefined, price_amount_cents: undefined });
      expect(unknown2).toBeNull();
    });
  });

  describe('3. WhatsApp: Mensaje y URL Codificada', () => {
    test('mensaje estándar con datos completos, tildes y emojis conforme al formato aprobado', () => {
      const msg = buildWhatsAppMessage(baseSyntheticEvent);
      // Estructura aprobada exacta
      expect(msg.startsWith('¿Nos apuntamos a este plan?\n\n')).toBe(true);
      expect(msg).not.toContain('¡Mira este plan en Palencia!');
      expect(msg).toContain('Concierto de Jazz & Blues 🎷');
      expect(msg).toContain('📅 Lunes, 19 de octubre · 20:00 - 22:30 h');
      expect(msg).toContain('📍 Teatro Principal de Palencia');
      expect(msg).toContain('🎟️ 15,00 €');
      expect(msg).toContain('Más información en VayaPlan:\nhttps://vayaplan.com/events/42');

      // Exigir que la URL aparezca una sola vez en el mensaje
      const urlOccurrences = (msg.match(/https:\/\/vayaplan\.com\/events\/42/g) || []).length;
      expect(urlOccurrences).toBe(1);
    });

    test('evento cancelado incluye el prefijo CANCELADO: en la primera línea', () => {
      const msg = buildWhatsAppMessage({ ...baseSyntheticEvent, status: 'cancelled' });
      expect(msg).toContain('¿Nos apuntamos a este plan?');
      expect(msg).not.toContain('¡Mira este plan en Palencia!');
      expect(msg).toContain('CANCELADO: Concierto de Jazz & Blues 🎷');
      const urlOccurrences = (msg.match(/https:\/\/vayaplan\.com\/events\/42/g) || []).length;
      expect(urlOccurrences).toBe(1);
    });

    test('omite datos ausentes sin inventarlos (sin precio confirmado y sin fin)', () => {
      const msg = buildWhatsAppMessage({
        ...baseSyntheticEvent,
        end_time: null,
        price_amount_cents: null,
        price_is_free: false,
      });
      expect(msg).toContain('¿Nos apuntamos a este plan?');
      expect(msg).not.toContain('¡Mira este plan en Palencia!');
      expect(msg).toContain('Concierto de Jazz & Blues 🎷');
      expect(msg).toContain('📅 Lunes, 19 de octubre · 20:00 h');
      expect(msg).toContain('📍 Teatro Principal de Palencia');
      expect(msg).not.toContain('🎟️');
      expect(msg).toContain('Más información en VayaPlan:\nhttps://vayaplan.com/events/42');
      const urlOccurrences = (msg.match(/https:\/\/vayaplan\.com\/events\/42/g) || []).length;
      expect(urlOccurrences).toBe(1);
    });

    test('buildShareText genera texto estructurado para el diálogo nativo de compartir sin duplicar URL', () => {
      const text = buildShareText(baseSyntheticEvent);
      expect(text.startsWith('¿Nos apuntamos a este plan?\n\n')).toBe(true);
      expect(text).not.toContain('¡Mira este plan en Palencia!');
      expect(text).toContain('Concierto de Jazz & Blues 🎷');
      expect(text).toContain('📅 Lunes, 19 de octubre · 20:00 - 22:30 h');
      expect(text).toContain('📍 Teatro Principal de Palencia');
      expect(text).toContain('🎟️ 15,00 €');
      // No debe contener la URL para que navigator.share ({ title, text, url }) no la duplique
      expect(text).not.toContain('https://');
      expect(text).not.toContain('http://');
    });

    test('buildWhatsAppShareUrl codifica completamente el mensaje para wa.me con URL única', () => {
      const url = buildWhatsAppShareUrl(baseSyntheticEvent);
      expect(url.startsWith('https://wa.me/?text=')).toBe(true);

      const encodedText = url.replace('https://wa.me/?text=', '');
      const decoded = decodeURIComponent(encodedText);
      expect(decoded).toContain('¿Nos apuntamos a este plan?');
      expect(decoded).not.toContain('¡Mira este plan en Palencia!');
      expect(decoded).toContain('Concierto de Jazz & Blues 🎷');
      expect(decoded).toContain('15,00 €');
      expect(decoded).toContain('https://vayaplan.com/events/42');

      const urlOccurrences = (decoded.match(/https:\/\/vayaplan\.com\/events\/42/g) || []).length;
      expect(urlOccurrences).toBe(1);
    });
  });

  describe('4. Cómo llegar (Validación de Ubicación y Destino)', () => {
    test('prioriza coordenadas numéricas válidas del local', () => {
      const url = buildDirectionsUrl({
        latitude: 42.0094,
        longitude: -4.5298,
        maps_url: 'https://maps.google.com/?cid=123',
        venue_address: 'Calle Mayor, 1',
        city: 'Palencia',
      });
      expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=42.0094,-4.5298');
    });

    test('utiliza maps_url externa validada si no hay coordenadas', () => {
      const url = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: 'https://maps.google.com/?cid=9876543210',
        venue_address: 'Calle Mayor, 1',
        city: 'Palencia',
      });
      expect(url).toBe('https://maps.google.com/?cid=9876543210');
    });

    test('utiliza dirección y ciudad únicamente si ambos existen', () => {
      const url = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: null,
        venue_address: 'Plaza Mayor, 1',
        city: 'Palencia',
      });
      expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=Plaza%20Mayor%2C%201%2C%20Palencia');
    });

    test('dirección sin ciudad devuelve null y no asume silenciosamente Palencia', () => {
      const urlNullCity = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: null,
        venue_address: 'Calle Mayor, 1',
        city: null,
      });
      expect(urlNullCity).toBeNull();

      const urlEmptyCity = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: null,
        venue_address: 'Calle Mayor, 1',
        city: '   ',
      });
      expect(urlEmptyCity).toBeNull();
    });

    test('valida estrictamente dominios de mapas permitidos (Google Maps y OpenStreetMap)', () => {
      // Dominios autorizados
      expect(isValidExternalMapUrl('https://maps.google.com/?cid=123')).toBe(true);
      expect(isValidExternalMapUrl('https://maps.app.goo.gl/xyz123')).toBe(true);
      expect(isValidExternalMapUrl('https://www.google.com/maps/dir/?api=1')).toBe(true);
      expect(isValidExternalMapUrl('https://google.com/maps?q=Palencia')).toBe(true);
      expect(isValidExternalMapUrl('https://www.openstreetmap.org/directions')).toBe(true);
      expect(isValidExternalMapUrl('https://openstreetmap.org/node/12345')).toBe(true);

      // Dominios no permitidos, spoofing o subdominios manipulados
      expect(isValidExternalMapUrl('https://google.com.ejemplo.test/maps')).toBe(false);
      expect(isValidExternalMapUrl('https://maps.google.com.attacker.com')).toBe(false);
      expect(isValidExternalMapUrl('https://www.google.com/search?q=maps')).toBe(false);
      expect(isValidExternalMapUrl('https://sitio-malicioso.com')).toBe(false);
      expect(isValidExternalMapUrl('https://malicious.com/?https://maps.google.com')).toBe(false);
      expect(isValidExternalMapUrl('javascript:alert(1)')).toBe(false);
      expect(isValidExternalMapUrl('data:text/html,evil')).toBe(false);
    });

    test('buildDirectionsUrl rechaza maps_url de dominios no permitidos', () => {
      const url = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: 'https://google.com.ejemplo.test/maps',
        venue_address: null,
        city: null,
      });
      expect(url).toBeNull();
    });

    test('devuelve null si no hay información de destino suficiente (no engañosa)', () => {
      const url = buildDirectionsUrl({
        latitude: null,
        longitude: null,
        maps_url: null,
        venue_address: null,
        city: null,
      });
      expect(url).toBeNull();
    });
  });

  describe('5. Estados del Calendario (.ics)', () => {
    const fixedNow = new Date('2026-10-19T15:00:00.000Z');

    test('evento futuro/próximo: disponible sin aviso', () => {
      const state = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T18:00:00.000Z',
        end_time: '2026-10-19T20:00:00.000Z',
      }, fixedNow);
      expect(state.allowed).toBe(true);
      expect(state.status).toBe('upcoming');
    });

    test('evento cancelado: deshabilitado con explicación', () => {
      const state = computeCalendarState({
        status: 'cancelled',
        start_time: '2026-10-19T18:00:00.000Z',
        end_time: '2026-10-19T20:00:00.000Z',
      }, fixedNow);
      expect(state.allowed).toBe(false);
      expect(state.status).toBe('cancelled');
      expect(state.notice).toContain('cancelado');
    });

    test('evento finalizado con end_time conocido: deshabilitado', () => {
      const state = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T10:00:00.000Z',
        end_time: '2026-10-19T12:00:00.000Z',
      }, fixedNow);
      expect(state.allowed).toBe(false);
      expect(state.status).toBe('finished');
      expect(state.notice).toContain('finalizado');
    });

    test('evento en curso: disponible con aviso', () => {
      const state = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T14:00:00.000Z',
        end_time: '2026-10-19T17:00:00.000Z',
      }, fixedNow);
      expect(state.allowed).toBe(true);
      expect(state.status).toBe('in_progress');
      expect(state.notice).toContain('en curso');
    });

    test('evento iniciado sin end_time: disponible con aviso factual de comienzo', () => {
      const state = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T14:00:00.000Z',
        end_time: null,
      }, fixedNow);
      expect(state.allowed).toBe(true);
      expect(state.status).toBe('started_no_end');
      expect(state.notice).toContain('comenzado');
      expect(state.notice).not.toContain('finalizado');
    });

    test('start_time inválido o no disponible: deshabilitado con aviso controlado', () => {
      const state = computeCalendarState({
        status: 'published',
        start_time: 'formato-invalido',
        end_time: '2026-10-19T20:00:00.000Z',
      }, fixedNow);
      expect(state.allowed).toBe(false);
      expect(state.status).toBe('invalid_dates');
      expect(state.notice).toContain('no válido');
    });

    test('end_time con formato inválido: deshabilitado con error controlado (no se oculta como ausente)', () => {
      const state = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T18:00:00.000Z',
        end_time: 'fecha-corrupta',
      }, fixedNow);
      expect(state.allowed).toBe(false);
      expect(state.status).toBe('invalid_dates');
      expect(state.notice).toContain('Horario de finalización no válido');
    });

    test('end_time no posterior a start_time: deshabilitado con error controlado', () => {
      // end_time anterior a start_time
      const statePrior = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T18:00:00.000Z',
        end_time: '2026-10-19T17:00:00.000Z',
      }, fixedNow);
      expect(statePrior.allowed).toBe(false);
      expect(statePrior.status).toBe('invalid_dates');
      expect(statePrior.notice).toContain('Horario de finalización no válido');

      // end_time igual a start_time
      const stateEqual = computeCalendarState({
        status: 'published',
        start_time: '2026-10-19T18:00:00.000Z',
        end_time: '2026-10-19T18:00:00.000Z',
      }, fixedNow);
      expect(stateEqual.allowed).toBe(false);
      expect(stateEqual.status).toBe('invalid_dates');
      expect(stateEqual.notice).toContain('Horario de finalización no válido');
    });
  });

  describe('6. Generación de iCalendar RFC 5545', () => {
    test('genera iCalendar válido con start_time y end_time en UTC', () => {
      const ics = generateIcsCalendar(baseSyntheticEvent, { now: new Date('2026-10-19T12:00:00.000Z') });

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('VERSION:2.0\r\n');
      expect(ics).toContain('BEGIN:VEVENT\r\n');
      expect(ics).toContain('UID:event-42@vayaplan.com\r\n');
      expect(ics).toContain('DTSTAMP:20261019T120000Z\r\n');
      expect(ics).toContain('DTSTART:20261019T180000Z\r\n');
      expect(ics).toContain('DTEND:20261019T203000Z\r\n');
      expect(ics).toContain('SUMMARY:Concierto de Jazz & Blues 🎷\r\n');
      expect(ics).toContain('LOCATION:Teatro Principal de Palencia\\, Calle Mayor\\, 5\\, Palencia\r\n');
      expect(ics).toContain('URL:https://vayaplan.com/events/42\r\n');
      expect(ics).toContain('STATUS:CONFIRMED\r\n');
      expect(ics).toContain('END:VEVENT\r\n');
      expect(ics).toContain('END:VCALENDAR\r\n');
    });

    test('end_time ausente: exporta sin DTEND ni duración inventada', () => {
      const ics = generateIcsCalendar({
        ...baseSyntheticEvent,
        end_time: null,
      });
      expect(ics).toContain('DTSTART:20261019T180000Z\r\n');
      expect(ics).not.toContain('DTEND');
      expect(ics).not.toContain('DURATION');
    });

    test('end_time no posterior a start_time: lanza error controlado y no genera .ics aparentemente válido', () => {
      expect(() => {
        generateIcsCalendar({
          ...baseSyntheticEvent,
          end_time: '2026-10-19T17:00:00.000Z', // anterior a start_time (18:00)
        });
      }).toThrow(/inconsistente/i);

      expect(() => {
        generateIcsCalendar({
          ...baseSyntheticEvent,
          end_time: '2026-10-19T18:00:00.000Z', // igual a start_time
        });
      }).toThrow(/inconsistente/i);
    });

    test('end_time con formato inválido: lanza error controlado', () => {
      expect(() => {
        generateIcsCalendar({
          ...baseSyntheticEvent,
          end_time: 'fecha-invalida',
        });
      }).toThrow(/inválida/i);
    });

    test('start_time inválido: lanza error controlado', () => {
      expect(() => {
        generateIcsCalendar({
          ...baseSyntheticEvent,
          start_time: 'invalido',
        });
      }).toThrow(/inválida/i);
    });

    test('protege contra inyección de propiedades iCalendar escapando saltos de línea', () => {
      const maliciousEvent: EventActionSource = {
        ...baseSyntheticEvent,
        title: 'Título Normal\r\nATTENDEE:mailto:hacker@example.com\r\nSUMMARY:Sobrescrito',
        venue_name: 'Local\nLOCATION:Falsa',
      };
      const ics = generateIcsCalendar(maliciousEvent);

      // Los saltos de línea deben transformarse en \n literal escapado, no líneas nuevas de iCalendar
      expect(ics).not.toContain('\r\nATTENDEE:');
      expect(ics).not.toContain('\nATTENDEE:');
      expect(ics).toContain('Título Normal\\nATTENDEE:mailto:hacker@example.com');
    });

    test('aplica plegado de líneas (line folding) en contenidos mayores a 75 octetos', () => {
      const longTitle = 'Título Excesivamente Largo para Comprobar el Plegado Estricto de Líneas Según la Especificación Oficial RFC 5545 de iCalendar';
      const folded = foldIcsLine(`SUMMARY:${longTitle}`);

      const lines = folded.split('\r\n');
      expect(lines.length).toBeGreaterThan(1);
      // Cada línea plegada de continuación debe comenzar con un espacio
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].startsWith(' ')).toBe(true);
      }
    });

    test('formatea fechas en UTC con sufijo Z sin ambigüedad', () => {
      const dt = new Date('2026-12-31T23:59:59.000Z');
      expect(formatUtcIcs(dt)).toBe('20261231T235959Z');
    });
  });

  describe('7. Marcado HTML de la Barra de Acciones y Cómo Llegar', () => {
    test('renderiza exactamente las 4 acciones de compartir y guardar en cuadrícula 2x2 sin duplicar Cómo llegar', () => {
      const html = renderEventActionsHtml(baseSyntheticEvent, new Date('2026-10-19T10:00:00.000Z'));

      expect(html).toContain('class="event-actions-section"');
      expect(html).toContain('WhatsApp');
      expect(html).toContain('Compartir');
      expect(html).toContain('Copiar enlace');
      expect(html).toContain('Calendario');

      // Comprueba que Cómo llegar ya no se duplica dentro de la cuadrícula de compartir y guardar
      expect(html).not.toContain('Cómo llegar');
      expect(html).not.toContain('data-action="directions-click"');

      expect(html).toContain('data-action="whatsapp-share"');
      expect(html).toContain('data-action="share-event"');
      expect(html).toContain('data-action="copy-event-link"');
      expect(html).toContain('data-action="calendar-download"');

      // Región accesible en vivo y fallback de copia
      expect(html).toContain('id="actions-live-announcer"');
      expect(html).toContain('id="actions-copy-fallback"');
    });

    test('renderVenueDirectionsHtml genera el botón de Cómo llegar directo asociado al local', () => {
      const btnHtml = renderVenueDirectionsHtml(baseSyntheticEvent);

      expect(btnHtml).toContain('class="btn-directions-link"');
      expect(btnHtml).toContain('data-action="directions-click"');
      expect(btnHtml).toContain('Cómo llegar ↗');
      expect(btnHtml).toContain('destination=42.0094,-4.5298');
    });

    test('renderVenueDirectionsHtml devuelve cadena vacía si no hay coordenadas ni dirección suficiente', () => {
      const emptyHtml = renderVenueDirectionsHtml({
        ...baseSyntheticEvent,
        latitude: null,
        longitude: null,
        maps_url: null,
        venue_address: null,
      });
      expect(emptyHtml).toBe('');
    });

    test('deshabilita botón de Calendario en evento cancelado con explicación accesible', () => {
      const html = renderEventActionsHtml({
        ...baseSyntheticEvent,
        status: 'cancelled',
      });

      expect(html).toContain('btn-calendar is-disabled');
      expect(html).toContain('disabled');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('cancelado por la organización');
    });
  });

  describe('8. Extracción Fidedigna desde PublicEventItem', () => {
    test('extractEventActionSource no expone campos administrativos ni privados', () => {
      const fullPublicItem: PublicEventItem = {
        id: 99,
        title: 'Fiesta Mayor',
        description: 'Descripción privada original no transferida',
        category: 'musica_directo',
        start_time: '2026-10-20T20:00:00.000Z',
        end_time: '2026-10-21T01:00:00.000Z',
        editorial_date: '2026-10-20',
        editorial_label: 'Martes noche',
        price: { amount_cents: 0, is_free: true, label: 'Entrada libre' },
        status: 'published',
        venue: {
          id: 5,
          name: 'Plaza Mayor',
          slug: 'plaza-mayor',
          latitude: 42.01,
          longitude: -4.53,
          google_maps_url: 'https://maps.google.com/?cid=99',
        },
        actions: {
          maps_url: 'https://maps.google.com/?cid=99',
          booking_url: null,
          tickets_url: 'https://entradas.example.com',
          whatsapp_url: null,
        },
        verification: { source: 'web', verified_at: '2026-10-18T10:00:00Z' },
        promotion: { id: 1, price_cents: 500, status: 'active' },
      };

      const extracted = extractEventActionSource(fullPublicItem, 'https://vayaplan.com/events/99');

      expect(extracted.id).toBe(99);
      expect(extracted.title).toBe('Fiesta Mayor');
      expect(extracted.price_is_free).toBe(true);
      expect(extracted.price_amount_cents).toBe(0);
      expect((extracted as any).verification).toBeUndefined();
      expect((extracted as any).promotion).toBeUndefined();
      expect((extracted as any).editorial_label).toBeUndefined();
      expect(extracted.editorial_date).toBe('2026-10-20');
    });
  });
});
