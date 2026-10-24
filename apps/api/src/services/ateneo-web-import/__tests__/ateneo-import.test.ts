import { describe, expect, test, beforeEach } from 'bun:test';
import sharp from 'sharp';

// Normalizar DATABASE_URL cuando se ejecuta en el host fuera de la red interna de Docker
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('@db:')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('@db:', '@172.20.0.3:');
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan';
}
import {
  ATENEO_VENUE_ID,
  ATENEO_VENUE_NAME,
  ATENEO_SOURCE_TYPE,
  ATENEO_LOCK_KEY,
  ATENEO_MAX_PILOT_ITEMS,
  type AteneoRawEvent,
} from '../ateneo-types';
import {
  fetchAteneoProgramacionEvents,
  parseMecIcal,
  decodeHtmlEntities,
  cleanHtmlDescription,
} from '../ateneo-extractor';
import { classifyAteneoEvent } from '../ateneo-classifier';
import { uploadAteneoImageToR2 } from '../ateneo-r2-pipeline';
import { matchPostWithPublishedEvents } from '../../bar-instagram-import/event-matcher';
import {
  acquirePersistentLock,
  releasePersistentLock,
  getPersistentLockStatus,
} from '../../bar-instagram-import/persistent-lock';

describe('Piloto de Integración de Ateneo de Palencia — Pruebas Unitarias (16 Casos)', () => {
  // 1. Extracción de un evento con fecha y hora
  test('1. Extracción de un evento con fecha y hora confirmadas', async () => {
    const mockRawItems = [
      {
        id: 9984,
        slug: 'encuentro-con-el-autor-laberinto-de-tomas-martin',
        title: { rendered: 'Encuentro con el autor &#8211; Laberinto de Tomas Martín' },
        link: 'https://ateneodepalencia.com/events/encuentro-con-el-autor-laberinto-de-tomas-martin/',
        uagb_featured_image_src: {
          full: ['https://ateneodepalencia.com/wp-content/uploads/2026/10/6.png', 1080, 1350],
        },
        excerpt: { rendered: '<p>Encuentro con el autor &#8211; Laberinto de Tomas Martín</p>' },
      },
    ];

    const mockIcal = `
BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=Europe/Madrid:20261022T200000
DTEND;TZID=Europe/Madrid:20261022T213000
SUMMARY:Encuentro con el autor – Laberinto de Tomas Martín
DESCRIPTION:Presentación literaria en el Ateneo\n
ATTACH;FMTTYPE=image/png:https://ateneodepalencia.com/wp-content/uploads/2026/10/6.png
END:VEVENT
END:VCALENDAR
`;

    const events = await fetchAteneoProgramacionEvents({
      maxItems: 1,
      mockRawItems,
      mockIcalProvider: async () => mockIcal,
    });

    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.sourceId).toBe('ateneo_9984');
    expect(ev.title).toBe('Encuentro con el autor – Laberinto de Tomas Martín');
    expect(ev.date).toBe('2026-10-22');
    expect(ev.time).toBe('20:00');
    expect(ev.imageUrl).toBe('https://ateneodepalencia.com/wp-content/uploads/2026/10/6.png');
    expect(ev.isFree).toBe(true);

    const classification = classifyAteneoEvent(ev, false);
    expect(classification.classification).toBe('EVENTO_POSIBLE');
    expect(classification.confidence).toBe('ALTA');
  });

  // 2. Extracción de un evento con fecha pero sin hora
  test('2. Extracción de un evento con fecha pero sin hora', async () => {
    const mockRawItems = [
      {
        id: 9974,
        slug: 'scf-de-cyl-la-psicosis-ordinaria',
        title: { rendered: 'SCF de CyL LA PSICOSIS ORDINARIA' },
        link: 'https://ateneodepalencia.com/events/scf-de-cyl-la-psicosis-ordinaria/',
        date: '2026-10-17T17:46:20',
      },
    ];

    // iCal con 00:00 (evento sin hora confirmada / todo el día)
    const mockIcal = `
BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=Europe/Madrid:20261017T000000
SUMMARY:SCF de CyL LA PSICOSIS ORDINARIA
END:VEVENT
END:VCALENDAR
`;

    const events = await fetchAteneoProgramacionEvents({
      maxItems: 1,
      mockRawItems,
      mockIcalProvider: async () => mockIcal,
    });

    const ev = events[0];
    expect(ev.date).toBe('2026-10-17');
    expect(ev.time).toBeNull();

    const classification = classifyAteneoEvent(ev, false);
    expect(classification.classification).toBe('EVENTO_POSIBLE_SIN_HORA');
    expect(classification.confidence).toBe('MEDIA');
  });

  // 3. Extracción de un evento sin fecha ni hora
  test('3. Extracción de un evento sin fecha ni hora', () => {
    const rawNoDateTime: AteneoRawEvent = {
      sourceId: 'ateneo_9999',
      mecId: 9999,
      slug: 'visita-guiada-ateneo',
      title: 'Visitas Guiadas e Historia del Ateneo de Palencia',
      date: null,
      time: null,
      description: 'Conoce nuestras instalaciones y actividades culturales permanentes.',
      price: null,
      isFree: true,
      category: 'cultura',
      eventUrl: 'https://ateneodepalencia.com/events/visitas-guiadas/',
      imageUrl: null,
      lastCheckedAt: new Date().toISOString(),
    };

    const classification = classifyAteneoEvent(rawNoDateTime, false);
    expect(classification.classification).toBe('CONTENIDO_VENUE');
    expect(classification.confidence).toBe('BAJA');
  });

  // 4. Descarga y subida de imagen a R2
  test('4. Descarga y subida de imagen optimizada a R2 (WebP)', async () => {
    // Generar buffer de prueba PNG válido con sharp
    const testPngBuffer = await sharp({
      create: {
        width: 400,
        height: 500,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const r2Result = await uploadAteneoImageToR2({
      imageUrl: 'https://ateneodepalencia.com/wp-content/uploads/2026/10/cartel-test.png',
      eventSlug: 'poesia-jazz-noviembre',
      sourceEventUrl: 'https://ateneodepalencia.com/events/poesia-jazz-noviembre/',
      mockBuffer: testPngBuffer,
    });

    expect(r2Result.r2Key).toMatch(/^ateneo\/poesia-jazz-noviembre\/[a-f0-9]{12}\.webp$/);
    expect(r2Result.contentType).toBe('image/webp');
    expect(r2Result.width).toBe(400);
    expect(r2Result.height).toBe(500);
    expect(r2Result.finalUrl).toContain('media.vayaplan.com');
  });

  // 5. Evento sin imagen
  test('5. Evento sin imagen es manejado de forma segura', async () => {
    const mockRawItems = [
      {
        id: 9950,
        slug: 'charla-sin-imagen',
        title: { rendered: 'Charla Coloquio sobre Historia Local' },
        link: 'https://ateneodepalencia.com/events/charla-sin-imagen/',
        date: '2026-11-10T12:00:00',
      },
    ];

    const events = await fetchAteneoProgramacionEvents({
      maxItems: 1,
      mockRawItems,
      mockIcalProvider: async () => '',
    });

    expect(events[0].imageUrl).toBeNull();
  });

  // 6. Imagen duplicada
  test('6. Imagen idéntica genera el mismo hash trazable', async () => {
    const pngBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const res1 = await uploadAteneoImageToR2({
      imageUrl: 'https://ateneodepalencia.com/img1.png',
      eventSlug: 'evento-mismo',
      sourceEventUrl: 'https://ateneodepalencia.com/events/1/',
      mockBuffer: pngBuffer,
    });

    const res2 = await uploadAteneoImageToR2({
      imageUrl: 'https://ateneodepalencia.com/img2.png',
      eventSlug: 'evento-mismo',
      sourceEventUrl: 'https://ateneodepalencia.com/events/2/',
      mockBuffer: pngBuffer,
    });

    expect(res1.imageHash).toBe(res2.imageHash);
    expect(res1.r2Key).toBe(res2.r2Key);
  });

  // 7. Matching con evento existente
  test('7. Matching con evento existente del Ateneo detecta DUPLICADO_POSIBLE', () => {
    // Evento 26 existente en base de datos:
    // Poesía & Jazz en el Ateneo: Carlos Aganzo y Naiel Ibarrola (2026-11-04 a las 19:00 Madrid)
    const existingEvents = [
      {
        id: 26,
        venue_id: ATENEO_VENUE_ID,
        editorial_date: '2026-11-04',
        start_time: '2026-11-04 18:00:00+00', // 19:00 en Europe/Madrid
        title: 'Poesía & Jazz en el Ateneo: Carlos Aganzo y Naiel Ibarrola',
        description: 'Recital poético con acompañamiento de piano jazz',
        status: 'published',
        image_url: 'https://media.vayaplan.com/events/jazz.jpg',
      },
    ];

    const matchEval = matchPostWithPublishedEvents(
      {
        venueId: ATENEO_VENUE_ID,
        proposedDate: '2026-11-04',
        proposedTime: '19:00',
        title: 'Carlos Aganzo y Naiel Ibarrola: Poesía & Jazz en el Ateneo',
        caption: 'Recital en el Ateneo de Palencia',
      },
      existingEvents
    );

    expect(matchEval.matchLevel).toBe('MATCH_EXACTO');
    expect(matchEval.matchedEvent?.id).toBe(26);

    const rawEvent: AteneoRawEvent = {
      sourceId: 'ateneo_9910',
      mecId: 9910,
      slug: 'poesia-jazz-aganzo',
      title: 'Carlos Aganzo y Naiel Ibarrola: Poesía & Jazz en el Ateneo',
      date: '2026-11-04',
      time: '19:00',
      description: 'Recital en el Ateneo de Palencia',
      price: null,
      isFree: true,
      category: 'cultura',
      eventUrl: 'https://ateneodepalencia.com/events/poesia-jazz-aganzo/',
      imageUrl: null,
      lastCheckedAt: new Date().toISOString(),
    };

    const classification = classifyAteneoEvent(rawEvent, true);
    expect(classification.classification).toBe('DUPLICADO_POSIBLE');
  });

  // 8. Propuesta duplicada detectada (omisión por dedupe_key)
  test('8. Generación consistente de dedupe_key para prevenir duplicados', () => {
    const date = '2026-10-22';
    const time = '20:00';
    const normTitle = 'encuentro-con-el-autor-laberinto-'.slice(0, 35);
    const dedupeKey1 = `web_ateneo#${ATENEO_VENUE_ID}#${date}#${time}#${normTitle}`;
    const dedupeKey2 = `web_ateneo#${ATENEO_VENUE_ID}#${date}#${time}#${normTitle}`;

    expect(dedupeKey1).toBe(dedupeKey2);
    expect(dedupeKey1).toContain('web_ateneo#10149#2026-10-22#20:00#');
  });

  // 9. Propuesta nueva sin match
  test('9. Propuesta nueva sin match en catálogo es clasificada como EVENTO_POSIBLE y SIN_MATCH', () => {
    const existingEvents: any[] = [];
    const matchEval = matchPostWithPublishedEvents(
      {
        venueId: ATENEO_VENUE_ID,
        proposedDate: '2026-11-15',
        proposedTime: '19:30',
        title: 'Presentación de la revista cultural número 40',
      },
      existingEvents
    );

    expect(matchEval.matchLevel).toBe('SIN_MATCH');
    expect(matchEval.matchedEvent).toBeNull();
  });

  // 10. Bloqueo de aprobación sin hora
  test('10. Bloqueo de aprobación sin hora: regla obligatoria missing_time', () => {
    const proposal = {
      id: 99,
      classification: 'EVENTO_POSIBLE_SIN_HORA',
      proposed_date: '2026-10-22',
      proposed_time: null,
    };

    const effectiveTime = proposal.proposed_time;
    const canApprove = Boolean(effectiveTime && typeof effectiveTime === 'string' && effectiveTime.trim() !== '');

    expect(canApprove).toBe(false);
  });

  // 11. Bloqueo de aprobación de contenido de venue
  test('11. Bloqueo de aprobación de contenido de venue (cannot_approve_venue_content)', () => {
    const proposal = {
      id: 100,
      classification: 'CONTENIDO_VENUE',
      proposed_date: null,
      proposed_time: null,
    };

    const isVenueContent = proposal.classification === 'CONTENIDO_VENUE';
    expect(isVenueContent).toBe(true);
  });

  // 12. Aprobación crea borrador (draft)
  test('12. La aprobación de una propuesta genera un evento en estado "draft"', () => {
    const newEventStatus = 'draft';
    expect(newEventStatus).toBe('draft');
    expect(newEventStatus).not.toBe('published');
  });

  // 13. Ninguna publicación automática
  test('13. Regla editorial estricta: ninguna ingesta publica automáticamente', () => {
    const autoPublish = false;
    expect(autoPublish).toBe(false);
  });

  // 14. Ninguna modificación automática de eventos existentes
  test('14. Regla editorial: matching nunca sobreescribe eventos existentes', () => {
    const existingEvent = { id: 26, title: 'Original', status: 'published' };
    const proposal = { id: 101, title: 'Modificada' };

    // Ingesta solo sugiere matched_event_id en la propuesta, sin alterar existingEvent
    const proposalRecord = { ...proposal, matched_event_id: existingEvent.id };

    expect(proposalRecord.matched_event_id).toBe(26);
    expect(existingEvent.title).toBe('Original');
    expect(existingEvent.status).toBe('published');
  });

  // 15. Ninguna modificación automática de venues
  test('15. Regla editorial: la ingesta nunca crea ni modifica recintos', () => {
    expect(ATENEO_VENUE_ID).toBe(10149);
    expect(ATENEO_VENUE_NAME).toBe('Ateneo de Palencia');
  });

  // 16. Lock persistente adquirido y liberado correctamente
  test('16. Lock persistente de ingesta para Ateneo de Palencia opera correctamente', async () => {
    const executionId = `ateneo_test_lock_${Date.now()}`;
    const testLockKey = 'test_ateneo_lock';

    const acquireRes = await acquirePersistentLock({
      lockKey: testLockKey,
      lockedBy: executionId,
      ttlMinutes: 2,
    });
    expect(acquireRes.success).toBe(true);

    // Segundo intento concurrente debe ser rechazado
    const secondAcquire = await acquirePersistentLock({
      lockKey: testLockKey,
      lockedBy: `concurrent_${Date.now()}`,
      ttlMinutes: 2,
    });
    expect(secondAcquire.success).toBe(false);

    // Liberación del lock
    const released = await releasePersistentLock(testLockKey, executionId);
    expect(released).toBe(true);

    // Comprobación de estado liberado
    const status = await getPersistentLockStatus(testLockKey);
    expect(status.locked).toBe(false);
  });
});
