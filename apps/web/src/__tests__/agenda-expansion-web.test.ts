import { describe, expect, test } from 'bun:test';
import {
  extractEventActionSource,
  formatEventDateTimeInMadrid,
  buildWhatsAppMessage,
  buildShareText,
  computeCalendarState,
  generateIcsCalendar,
  renderEventActionsHtml,
  type EventActionSource,
} from '../event-actions';
import type { PublicEventItem } from '@vayaplan/types';

describe('apps/web — Pruebas Dirigidas de Ampliación de Agenda (agenda-expansion-web)', () => {
  const basePendingEvent: EventActionSource = {
    id: 101,
    title: 'Palencia Baloncesto vs Real Betis Baloncesto',
    status: 'published',
    start_time: null,
    end_time: null,
    time_status: 'pending_time',
    editorial_date: '2026-10-24',
    venue_name: 'Pabellón Municipal de Deportes «Marta Domínguez»',
    venue_address: 'Av. Obispo Barberá, s/n',
    city: 'Palencia',
    latitude: 42.005,
    longitude: -4.53,
    maps_url: 'https://maps.google.com/?cid=101',
    price_is_free: false,
    price_amount_cents: 1500,
    price_label: '15,00 €',
    canonical_url: 'https://vayaplan.com/events/101',
  };

  const baseExhibitionEvent: EventActionSource = {
    id: 102,
    title: 'Exposición de Fotografía Histórica: Palencia en el Tiempo',
    status: 'published',
    start_time: '2026-10-15T10:00:00.000Z',
    end_time: '2026-11-20T20:00:00.000Z',
    time_status: 'confirmed',
    editorial_date: '2026-10-15',
    end_date: '2026-11-20',
    schedule_text: 'De lunes a viernes de 10:00 a 14:00 y de 17:00 a 20:30 h. Sábados de 11:00 a 14:00 h.',
    venue_name: 'Ateneo de Palencia',
    venue_address: 'Calle Mayor, 54',
    city: 'Palencia',
    latitude: 42.012,
    longitude: -4.532,
    maps_url: 'https://maps.google.com/?cid=102',
    price_is_free: true,
    price_amount_cents: 0,
    price_label: 'Entrada libre',
    canonical_url: 'https://vayaplan.com/events/102',
  };

  describe('1. Formateo de Fecha/Hora sin Horas Ficticias', () => {
    test('evento con horario pendiente (start_time nulo) muestra "Horario por confirmar" sin horas inventadas', () => {
      const formatted = formatEventDateTimeInMadrid(null, null, {
        time_status: 'pending_time',
        editorial_date: '2026-10-24',
      });
      expect(formatted).toBe('Sábado, 24 de octubre · Horario por confirmar');
      expect(formatted).not.toContain('12:00');
      expect(formatted).not.toContain('00:00');
    });

    test('exposición continuada muestra periodo "Del [Inicio] al [Fin]" en lugar de hora de apertura', () => {
      const formatted = formatEventDateTimeInMadrid(
        baseExhibitionEvent.start_time,
        baseExhibitionEvent.end_time,
        {
          editorial_date: baseExhibitionEvent.editorial_date,
          end_date: baseExhibitionEvent.end_date,
        }
      );
      expect(formatted).toBe('Del 15 de octubre al 20 de noviembre');
      expect(formatted).not.toContain('10:00');
      expect(formatted).not.toContain('20:00');
    });

    test('exposición en el mismo mes compacta elegantemente el rango de días', () => {
      const formatted = formatEventDateTimeInMadrid(null, null, {
        editorial_date: '2026-10-05',
        end_date: '2026-10-25',
      });
      expect(formatted).toBe('Del 5 al 25 de octubre');
    });
  });

  describe('2. WhatsApp y Diálogo Nativo de Compartir', () => {
    test('mensaje de WhatsApp para partido con horario pendiente no contiene hora ficticia', () => {
      const msg = buildWhatsAppMessage(basePendingEvent);
      expect(msg.startsWith('¿Nos apuntamos a este plan?\n\n')).toBe(true);
      expect(msg).toContain('Palencia Baloncesto vs Real Betis Baloncesto');
      expect(msg).toContain('📅 Sábado, 24 de octubre · Horario por confirmar');
      expect(msg).not.toContain('12:00');
      expect(msg).not.toContain('00:00');
      expect(msg).toContain('📍 Pabellón Municipal de Deportes «Marta Domínguez»');
      expect(msg).toContain('🎟️ 15,00 €');
      expect(msg).toContain('Más información en VayaPlan:\nhttps://vayaplan.com/events/101');
    });

    test('mensaje de WhatsApp para exposición continuada muestra el periodo de fechas', () => {
      const msg = buildWhatsAppMessage(baseExhibitionEvent);
      expect(msg).toContain('Exposición de Fotografía Histórica: Palencia en el Tiempo');
      expect(msg).toContain('📅 Del 15 de octubre al 20 de noviembre');
      expect(msg).toContain('📍 Ateneo de Palencia');
      expect(msg).toContain('🎟️ Gratis');
      expect(msg).toContain('Más información en VayaPlan:\nhttps://vayaplan.com/events/102');
    });

    test('buildShareText conserva la misma estructura factual sin duplicar la URL', () => {
      const shareText = buildShareText(basePendingEvent);
      expect(shareText).toContain('📅 Sábado, 24 de octubre · Horario por confirmar');
      expect(shareText).not.toContain('https://vayaplan.com');
    });
  });

  describe('3. Estados de Calendario (.ics)', () => {
    test('evento con horario pendiente desactiva calendario con aviso explicativo', () => {
      const calState = computeCalendarState(basePendingEvent);
      expect(calState.allowed).toBe(false);
      expect(calState.status).toBe('pending_time');
      expect(calState.notice).toBe('Horario pendiente de confirmación. Consulta esta ficha para comprobar si se ha publicado la hora definitiva.');
    });

    test('generateIcsCalendar rechaza generar archivo para eventos con horario pendiente', () => {
      expect(() => generateIcsCalendar(basePendingEvent)).toThrow(
        /Horario no confirmado/i
      );
    });

    test('exposición continuada desactiva calendario con aviso de periodo continuado', () => {
      const calState = computeCalendarState(baseExhibitionEvent);
      expect(calState.allowed).toBe(false);
      expect(calState.status).toBe('exhibition_period');
      expect(calState.notice).toBe('Período de exposición continuado. Consulta el horario de visita en el recinto.');
    });

    test('generateIcsCalendar rechaza generar archivo para exposiciones continuadas', () => {
      expect(() => generateIcsCalendar(baseExhibitionEvent)).toThrow(
        /Exposición continuada/i
      );
    });
  });

  describe('4. Marcado HTML de Acciones de Evento', () => {
    test('renderEventActionsHtml renderiza botón deshabilitado y nota para horario pendiente', () => {
      const html = renderEventActionsHtml(basePendingEvent);
      expect(html).toContain('is-disabled');
      expect(html).toContain('disabled');
      expect(html).toContain('Horario pendiente de confirmación. Consulta esta ficha para comprobar si se ha publicado la hora definitiva.');
      expect(html).toContain('action-temporal-note');
    });

    test('renderEventActionsHtml renderiza botón deshabilitado y nota para exposiciones', () => {
      const html = renderEventActionsHtml(baseExhibitionEvent);
      expect(html).toContain('is-disabled');
      expect(html).toContain('disabled');
      expect(html).toContain('Período de exposición continuado. Consulta el horario de visita en el recinto.');
      expect(html).toContain('action-temporal-note');
    });
  });

  describe('5. Extracción Fidedigna con Nuevos Campos', () => {
    test('extractEventActionSource traslada correctamente time_status, end_date y schedule_text', () => {
      const publicItem: PublicEventItem = {
        id: 200,
        title: 'Partido Palencia Rugby Club',
        category: 'rugby',
        start_time: null,
        end_time: null,
        time_status: 'pending_time',
        editorial_date: '2026-10-25',
        editorial_label: 'Domingo',
        approximate_schedule: 'Jornada matinal (por confirmar)',
        venue: {
          id: 50,
          name: 'Estadio Municipal Nueva Balastera',
          slug: 'estadio-municipal-nueva-balastera',
          latitude: 42.015,
          longitude: -4.52,
          google_maps_url: 'https://maps.google.com/?cid=50',
        },
        price: { amount_cents: 0, is_free: true, label: 'Entrada libre' },
        status: 'published',
        actions: {
          maps_url: 'https://maps.google.com/?cid=50',
          tickets_url: null,
          booking_url: null,
          whatsapp_url: null,
        },
      };

      const extracted = extractEventActionSource(publicItem, 'https://vayaplan.com/events/200');
      expect(extracted.time_status).toBe('pending_time');
      expect(extracted.start_time).toBeNull();
      expect(extracted.approximate_schedule).toBe('Jornada matinal (por confirmar)');
      expect(extracted.editorial_date).toBe('2026-10-25');
      expect(extracted.venue_name).toBe('Estadio Municipal Nueva Balastera');
    });
  });

  describe('6. Integración en Plantilla Pública HTML (public-page.ts)', () => {
    test('renderPublicHtml incorpora estilos y scripts para horarios pendientes y exposiciones', () => {
      const { renderPublicHtml } = require('../public-page');
      const html = renderPublicHtml();
      expect(html).toContain('.badge-status-pending');
      expect(html).toContain('.card-time-pending');
      expect(html).toContain('.card-time-exhibition');
      expect(html).toContain('.event-pending-notice');
      expect(html).toContain('.event-festival-banner');
      expect(html).toContain('Horario por confirmar');
      expect(html).toContain('Exposición en curso');
      expect(html).toContain('Forma parte de');
    });
  });

  describe('7. Ficha Web Navegable de Festival (festival-page.ts)', () => {
    test('renderFestivalHtml renderiza cabecera, programa agrupado y enlaces a fichas individuales', () => {
      const { renderFestivalHtml } = require('../festival-page');
      const mockFestivalData = {
        city: { id: 1, name: 'Palencia', slug: 'palencia' },
        festival: {
          id: 10,
          name: 'XIII Jazz Palencia Festival',
          edition: 'XIII Edición',
          slug: 'jazz-palencia-2026',
          description: 'Festival de Jazz en el Teatro Principal',
          start_date: '2026-11-01',
          end_date: '2026-11-20',
          official_url: 'https://jazzpalencia.es',
        },
        events: [
          {
            id: 501,
            title: 'Antonio Serrano & Kaele Jiménez (Jazz CaLó)',
            category: 'musica_directo',
            time_status: 'confirmed',
            start_time: '2026-11-07T19:30:00.000Z',
            editorial_date: '2026-11-07',
            editorial_label: 'Sábado',
            venue: {
              id: 2,
              name: 'Teatro Principal de Palencia',
              slug: 'teatro-principal',
            },
            price: { amount_cents: 2800, is_free: false, label: '28,00 €' },
            status: 'published',
            actions: { maps_url: null, booking_url: null, tickets_url: null, whatsapp_url: null },
            verification: { source: 'manual', verified_at: null },
            promotion: null,
          },
        ],
      };

      const html = renderFestivalHtml(mockFestivalData, 'https://vayaplan.com/festivals/jazz-palencia-2026');
      expect(html).toContain('XIII Jazz Palencia Festival');
      expect(html).toContain('XIII Edición');
      expect(html).toContain('Antonio Serrano &amp; Kaele Jiménez (Jazz CaLó)');
      expect(html).toContain('Teatro Principal de Palencia');
      expect(html).toContain('href="/events/501"');
      expect(html).toContain('href="https://jazzpalencia.es"');
    });

    test('renderFestivalHtml muestra estado vacío accesible cuando no hay actividades publicadas', () => {
      const { renderFestivalHtml } = require('../festival-page');
      const emptyData = {
        city: { id: 1, name: 'Palencia', slug: 'palencia' },
        festival: {
          id: 11,
          name: 'Festival Vacío',
          edition: null,
          slug: 'festival-vacio',
          description: null,
          start_date: '2026-12-01',
          end_date: '2026-12-05',
          official_url: null,
        },
        events: [],
      };

      const html = renderFestivalHtml(emptyData, 'https://vayaplan.com/festivals/festival-vacio');
      expect(html).toContain('Festival Vacío');
      expect(html).toContain('No hay actividades publicadas para este ciclo en este momento.');
    });
  });

  describe('8. Tratamiento Conservador de Fin Desconocido en Exposiciones', () => {
    test('exposición sin end_date muestra "Desde el [Inicio]" sin inventar fecha de fin ni vigencia indefinida', () => {
      const formatted = formatEventDateTimeInMadrid(null, null, {
        time_status: 'continuous',
        editorial_date: '2026-11-05',
        end_date: null,
      });
      expect(formatted).toBe('Desde el 5 de noviembre');
      expect(formatted).not.toContain('Del');
      expect(formatted).not.toContain('al');
    });
  });
});
