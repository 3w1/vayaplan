import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Pool } from 'pg';
import { normalizePrice } from '@vayaplan/shared';
import {
  SALA_INFINITY_VENUE_ID,
  contrastProposalWithTaquilla,
  type TaquillaEventMetadata,
} from '../taquilla-contrast';

let rawTestDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://vayaplan_user:vayaplan_dev_secret_2026@172.20.0.3:5432/vayaplan';

if (rawTestDbUrl.includes('@db:')) {
  // Cuando se ejecuta en el host fuera de la red docker donde 'db' no resuelve directamente
  rawTestDbUrl = rawTestDbUrl.replace('@db:', '@172.20.0.3:');
}

const pool = new Pool({ connectionString: rawTestDbUrl.trim() });

describe('Auditoría de Eventos e Integración de Taquilla.com para Sala Infinity (15 Pruebas)', () => {
  afterAll(async () => {
    await pool.end();
  });

  // 1. Recuento actual de eventos
  test('1. Recuento actual de eventos: Total exacto de 75 eventos en catálogo', async () => {
    const res = await pool.query(`SELECT COUNT(*)::int AS total FROM events;`);
    expect(res.rows[0].total).toBe(75);

    const statusRes = await pool.query(`
      SELECT status, COUNT(*)::int AS count 
      FROM events 
      GROUP BY status 
      ORDER BY count DESC;
    `);
    const statusMap = Object.fromEntries(statusRes.rows.map(r => [r.status, r.count]));
    
    // 48 publicados, 14 borradores, 13 históricos/otros (total 75)
    expect(statusMap.published).toBe(48);
    expect(statusMap.draft).toBe(14);
    const historicalCount =
      (statusMap.outdated || 0) +
      (statusMap.archived || 0) +
      (statusMap.tentative || 0) +
      (statusMap.cancelled || 0);
    expect(historicalCount).toBe(13);
    expect(statusMap.published + statusMap.draft + historicalCount).toBe(75);
  });

  // 2. Trazabilidad de los 4 eventos creados manualmente
  test('2. Trazabilidad de los 4 eventos creados manualmente desde propuestas del piloto', async () => {
    const res = await pool.query(`
      SELECT 
        e.id AS event_id,
        e.title AS event_title,
        p.id AS proposal_id,
        p.review_status,
        p.reviewed_by
      FROM curation_proposals p
      JOIN events e ON p.created_event_id = e.id
      ORDER BY e.id ASC;
    `);

    expect(res.rows.length).toBe(4);
    const eventIds = res.rows.map(r => r.event_id);
    expect(eventIds).toEqual([76, 77, 78, 79]);

    // Verificar que los 4 fueron aprobados por el administrador
    for (const row of res.rows) {
      expect(row.review_status).toBe('approved_draft');
      expect(row.reviewed_by).toBe('admin@vayaplan.com');
    }
  });

  // 3. Precio “12,50” correcto
  test('3. Precio “12,50” con coma decimal se normaliza a 12.50 y 1250 céntimos', () => {
    const norm = normalizePrice('12,50');
    expect(norm.amount).toBe(12.50);
    expect(norm.priceCents).toBe(1250);
    expect(norm.formatted).toBe('12,50 €');
    expect(norm.isFree).toBe(false);
  });

  // 4. Precio “12.50” correcto
  test('4. Precio “12.50” con punto decimal se normaliza a 12.50 y 1250 céntimos', () => {
    const norm = normalizePrice('12.50');
    expect(norm.amount).toBe(12.50);
    expect(norm.priceCents).toBe(1250);
    expect(norm.formatted).toBe('12,50 €');
    expect(norm.isFree).toBe(false);
  });

  // 5. Precio inválido rechazado
  test('5. Precio no numérico ("abc") o negativo ("-5") es rechazado con excepción descriptiva', () => {
    expect(() => normalizePrice('abc')).toThrow();
    try {
      normalizePrice('abc');
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain('no num');
    }

    try {
      normalizePrice('-5');
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain('negativo');
    }

    try {
      normalizePrice('');
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain('vacío');
    }
  });

  // 6. Reel sin fecha ni hora clasificado como CONTENIDO_VENUE
  test('6. Reel sin fecha ni hora se clasifica como CONTENIDO_VENUE y no como evento', async () => {
    const { classifyBarPost } = await import('../bar-classifier');
    const result = classifyBarPost({
      caption: 'Esta semana nos regalan una hora más para disfrutar de la buena música... El domingo cambia la hora en Salvaje',
      type: 'Video',
      timestamp: '2026-10-24T12:00:00Z',
    });
    expect(result.classification).toBe('CONTENIDO_VENUE');
    expect(result.detectedDate).toBeNull();
    expect(result.detectedTime).toBeNull();
  });

  // 7. Post con fecha pero sin hora clasificado como EVENTO_POSIBLE_SIN_HORA
  test('7. Post con fecha pero sin hora se clasifica como EVENTO_POSIBLE_SIN_HORA', async () => {
    const { classifyBarPost } = await import('../bar-classifier');
    const result = classifyBarPost({
      caption: 'El próximo 15 de noviembre gran concierto de rock en directo. No te lo pierdas.',
      type: 'Image',
      timestamp: '2026-10-24T12:00:00Z',
    });
    expect(result.classification).toBe('EVENTO_POSIBLE_SIN_HORA');
    expect(result.detectedDate).toBe('2026-11-15');
    expect(result.detectedTime).toBeNull();
  });

  // Mock de datos de Taquilla.com para Sala Infinity
  const mockTaquillaEvents: TaquillaEventMetadata[] = [
    {
      title: 'Héroes El Culto — Concierto Tributo Héroes del Silencio',
      date: '2026-10-24',
      time: '20:30',
      price: 12.50,
      priceMin: 12.50,
      priceMax: 15.00,
      ticketUrl: 'https://www.taquilla.com/entradas/heroes-el-culto-palencia',
      isAvailable: true,
      lastCheckedAt: '2026-10-24T14:00:00Z',
    },
    {
      title: 'Pallantia Extreme Fest 2026',
      date: '2026-11-21',
      time: '19:00',
      price: 10.00,
      priceMin: 10.00,
      priceMax: 10.00,
      ticketUrl: 'https://www.taquilla.com/entradas/pallantia-extreme-fest',
      isAvailable: true,
      lastCheckedAt: '2026-10-24T14:00:00Z',
    },
    {
      title: 'Deathbats — Tributo a Avenged Sevenfold',
      date: '2026-11-28',
      time: '21:30',
      price: 12.37,
      priceMin: 12.37,
      priceMax: 15.47,
      ticketUrl: 'https://www.taquilla.com/entradas/deathbats-tributo-a-avenged-sevenfold',
      isAvailable: true,
      lastCheckedAt: '2026-10-24T14:00:00Z',
    },
  ];

  // 8. Propuesta de Sala Infinity con match exacto en Taquilla
  test('8. Propuesta de Sala Infinity con coincidencia exacta (título, fecha, hora) produce TAQUILLA_MATCH_EXACTO', () => {
    const contrast = contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Héroes El Culto — Concierto Tributo Héroes del Silencio',
        proposedDate: '2026-10-24',
        proposedTime: '20:30',
        price: 12.50,
      },
      mockTaquillaEvents
    );

    expect(contrast.isApplicableVenue).toBe(true);
    expect(contrast.matchLevel).toBe('TAQUILLA_MATCH_EXACTO');
    expect(contrast.matchedEvent?.title).toContain('Héroes El Culto');
    expect(contrast.priceDiscrepancy).toBeNull();
    expect(contrast.timeDiscrepancy).toBeNull();
  });

  // 9. Propuesta de Sala Infinity con match alto en Taquilla
  test('9. Propuesta de Sala Infinity con fecha y título idéntico pero sin hora en Instagram produce TAQUILLA_MATCH_ALTO y sugiere hora', () => {
    const contrast = contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Deathbats — Tributo a Avenged Sevenfold en Sala Infinity',
        proposedDate: '2026-11-28',
        proposedTime: null, // Sin hora en post
        price: null,
      },
      mockTaquillaEvents
    );

    expect(contrast.matchLevel).toBe('TAQUILLA_MATCH_ALTO');
    expect(contrast.matchedEvent?.title).toContain('Deathbats');
    // Taquilla sugiere la hora y el precio para revisión del curador
    expect(contrast.suggestedTime).toBe('21:30');
    expect(contrast.suggestedPrice).toBe(12.37);
  });

  // 10. Propuesta de Sala Infinity sin match en Taquilla
  test('10. Propuesta de Sala Infinity sin evento coincidente en Taquilla produce TAQUILLA_SIN_MATCH', () => {
    const contrast = contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Monólogo de Comedia Exclusivo',
        proposedDate: '2026-12-15',
        proposedTime: '22:00',
        price: 8.00,
      },
      mockTaquillaEvents
    );

    expect(contrast.matchLevel).toBe('TAQUILLA_SIN_MATCH');
    expect(contrast.matchedEvent).toBeNull();
  });

  // 11. Discrepancia de precio entre Instagram y Taquilla
  test('11. Detecta discrepancia de precio cuando Instagram y Taquilla muestran valores distintos', () => {
    const contrast = contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Pallantia Extreme Fest 2026',
        proposedDate: '2026-11-21',
        proposedTime: '19:00',
        price: 15.00, // Instagram dice 15.00 €, Taquilla dice 10.00 €
      },
      mockTaquillaEvents
    );

    expect(contrast.priceDiscrepancy).not.toBeNull();
    expect(contrast.priceDiscrepancy?.instagramValue).toBe(15.00);
    expect(contrast.priceDiscrepancy?.taquillaValue).toBe(10.00);
    expect(contrast.differencesDetected.length).toBeGreaterThan(0);
  });

  // 12. Discrepancia de hora entre Instagram y Taquilla
  test('12. Detecta discrepancia de hora cuando Instagram y Taquilla muestran horarios diferentes', () => {
    const contrast = contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Pallantia Extreme Fest 2026',
        proposedDate: '2026-11-21',
        proposedTime: '21:00', // Instagram dice 21:00, Taquilla lista 19:00
        price: 10.00,
      },
      mockTaquillaEvents
    );

    expect(contrast.timeDiscrepancy).not.toBeNull();
    expect(contrast.timeDiscrepancy?.instagramValue).toBe('21:00');
    expect(contrast.timeDiscrepancy?.taquillaValue).toBe('19:00');
    expect(contrast.differencesDetected[0]).toContain('Discrepancia de horario');
  });

  // 13. Ninguna creación automática de eventos desde Taquilla
  test('13. La consulta de contraste con Taquilla no crea ningún evento en la base de datos', async () => {
    const beforeCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events;`);
    const countBefore = beforeCountRes.rows[0].count;

    // Ejecutar contraste con Taquilla
    contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Deathbats — Tributo a Avenged Sevenfold',
        proposedDate: '2026-11-28',
      },
      mockTaquillaEvents
    );

    const afterCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events;`);
    expect(afterCountRes.rows[0].count).toBe(countBefore);
  });

  // 14. Ninguna publicación automática desde Taquilla
  test('14. Taquilla no altera el estado de ningún evento ni publica borradores', async () => {
    const draftRes = await pool.query(`SELECT id, status FROM events WHERE status = 'draft' LIMIT 1;`);
    if (draftRes.rows.length > 0) {
      const draftId = draftRes.rows[0].id;

      // Ejecutar contraste
      contrastProposalWithTaquilla(
        {
          venueId: SALA_INFINITY_VENUE_ID,
          title: 'Héroes El Culto',
          proposedDate: '2026-10-24',
        },
        mockTaquillaEvents
      );

      // Verificar que el borrador sigue en draft
      const checkDraft = await pool.query(`SELECT status FROM events WHERE id = $1;`, [draftId]);
      expect(checkDraft.rows[0].status).toBe('draft');
    }
  });

  // 15. Ninguna modificación automática de eventos existentes
  test('15. Taquilla no modifica los datos de eventos existentes (evento 78 permanece idéntico)', async () => {
    const evBefore = await pool.query(`SELECT price_cents, status, title FROM events WHERE id = 78;`);
    const initialPrice = evBefore.rows[0].price_cents;
    const initialStatus = evBefore.rows[0].status;

    // Ejecutar múltiples consultas de contraste
    contrastProposalWithTaquilla(
      {
        venueId: SALA_INFINITY_VENUE_ID,
        title: 'Héroes El Culto (Tributo a Héroes del Silencio) — Sala Infinity',
        proposedDate: '2026-10-24',
        proposedTime: '20:30',
        price: 20.00, // Discrepancia intencionada para comprobar inmunidad
      },
      mockTaquillaEvents
    );

    const evAfter = await pool.query(`SELECT price_cents, status, title FROM events WHERE id = 78;`);
    expect(evAfter.rows[0].price_cents).toBe(initialPrice); // 1250 céntimos inalterado
    expect(evAfter.rows[0].status).toBe(initialStatus);     // published inalterado
    expect(evAfter.rows[0].title).toBe(evBefore.rows[0].title);
  });
});
