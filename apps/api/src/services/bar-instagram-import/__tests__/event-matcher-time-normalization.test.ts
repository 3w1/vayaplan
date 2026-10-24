import { describe, expect, test } from 'bun:test';
import {
  toTimeString,
  isTimeSimilar,
  evaluateDateProximity,
  matchPostWithPublishedEvents,
  type MatchCandidate,
  type ExistingEventRecord,
} from '../event-matcher';

describe('Hotfix Event Matcher — Normalización Temporal y Robustez de start_time (Date vs String)', () => {
  // 1. start_time como Date
  test('1. toTimeString normaliza correctamente un objeto Date a HH:mm en UTC', () => {
    const dateObj = new Date('2026-10-24T21:00:00.000Z');
    expect(toTimeString(dateObj)).toBe('21:00');

    const morningDate = new Date('2026-10-24T09:30:00.000Z');
    expect(toTimeString(morningDate)).toBe('09:30');
  });

  // 2. start_time como string ISO
  test('2. toTimeString normaliza correctamente un string ISO a HH:mm', () => {
    expect(toTimeString('2026-10-24T21:00:00Z')).toBe('21:00');
    expect(toTimeString('2026-10-24T21:00:00.000Z')).toBe('21:00');
    expect(toTimeString('2026-10-24 21:00:00')).toBe('21:00');
    expect(toTimeString('21:00')).toBe('21:00');
    expect(toTimeString('9:30')).toBe('09:30');
  });

  // 3. start_time como null
  test('3. toTimeString maneja null de forma segura devolviendo null', () => {
    expect(toTimeString(null)).toBeNull();
  });

  // 4. start_time como undefined
  test('4. toTimeString maneja undefined de forma segura devolviendo null', () => {
    expect(toTimeString(undefined)).toBeNull();
    expect(toTimeString('')).toBeNull();
    expect(toTimeString('   ')).toBeNull();
    expect(toTimeString('invalido')).toBeNull();
    expect(toTimeString(new Date('fecha invalida'))).toBeNull();
  });

  // 5. Propuesta con hora
  test('5. Propuesta con hora ("21:00") se normaliza y compara correctamente con start_time Date', () => {
    const candidateTime = toTimeString('21:00');
    const evTime = toTimeString(new Date('2026-10-24T21:00:00Z'));
    expect(candidateTime).toBe('21:00');
    expect(evTime).toBe('21:00');
    expect(isTimeSimilar(candidateTime, evTime, 30)).toBe(true);
  });

  // 6. Propuesta sin hora
  test('6. Propuesta sin hora (null) no lanza excepción y retorna null en toTimeString', () => {
    const candidateTime = toTimeString(null);
    const evTime = toTimeString(new Date('2026-10-24T21:00:00Z'));
    expect(candidateTime).toBeNull();
    expect(isTimeSimilar(candidateTime, evTime)).toBe(false);
  });

  // 7. Evento con hora distinta
  test('7. Evento con hora distinta (21:00 vs 18:00) detecta discrepancia horaria sin excepción', () => {
    const evDate = new Date('2026-10-24T18:00:00Z');
    expect(isTimeSimilar('21:00', evDate, 60)).toBe(false);
  });

  // 8. Evento con misma hora
  test('8. Evento con misma hora (21:00 vs 21:00) detecta coincidencia exacta entre String y Date', () => {
    const evDate = new Date('2026-10-24T21:00:00Z');
    expect(isTimeSimilar('21:00', evDate, 10)).toBe(true);
    expect(isTimeSimilar('21:15', evDate, 30)).toBe(true);
  });

  // 9. Matching alto con misma fecha y misma hora (ev.start_time como Date de PostgreSQL)
  test('9. matchPostWithPublishedEvents produce MATCH_ALTO con misma fecha y misma hora cuando ev.start_time es un Date', () => {
    const candidate: MatchCandidate = {
      venueId: 10052,
      proposedDate: '2026-10-24',
      proposedTime: '21:00',
      title: 'Héroes El Culto Tributo',
      caption: 'Concierto tributo a Héroes del Silencio en Sala Infinity',
    };

    const existingEvents: ExistingEventRecord[] = [
      {
        id: 78,
        venue_id: 10052,
        venue_name: 'Sala Infinity',
        editorial_date: '2026-10-24',
        start_time: new Date('2026-10-24T21:00:00Z'), // Objeto Date devuelto por pg
        title: 'Héroes El Culto (Tributo a Héroes del Silencio) — Sala Infinity',
        status: 'published',
      },
    ];

    expect(() => matchPostWithPublishedEvents(candidate, existingEvents)).not.toThrow();
    const result = matchPostWithPublishedEvents(candidate, existingEvents);

    expect(result.matchedEvent).not.toBeNull();
    expect(result.matchedEvent?.id).toBe(78);
    expect(['MATCH_EXACTO', 'MATCH_ALTO']).toContain(result.matchLevel);
    expect(result.signals.some((s) => s.includes('Hora similar'))).toBe(true);
  });

  // 10. Matching posible con misma fecha pero sin hora en propuesta
  test('10. Matching posible con misma fecha pero sin hora en propuesta no lanza excepción', () => {
    const candidateNoTime: MatchCandidate = {
      venueId: 10052,
      proposedDate: '2026-10-24',
      proposedTime: null,
      title: 'Héroes El Culto',
      caption: 'Entradas en taquilla para esta noche',
    };

    const existingEvents: ExistingEventRecord[] = [
      {
        id: 78,
        venue_id: 10052,
        venue_name: 'Sala Infinity',
        editorial_date: '2026-10-24',
        start_time: new Date('2026-10-24T21:00:00Z'),
        title: 'Héroes El Culto (Tributo a Héroes del Silencio) — Sala Infinity',
        status: 'published',
      },
    ];

    expect(() => matchPostWithPublishedEvents(candidateNoTime, existingEvents)).not.toThrow();
    const result = matchPostWithPublishedEvents(candidateNoTime, existingEvents);

    expect(result.matchedEvent).not.toBeNull();
    expect(result.matchedEvent?.id).toBe(78);
    expect(result.matchLevel).not.toBe('SIN_MATCH');
  });

  // 11. Ninguna excepción durante el matching con inputs heterogéneos
  test('11. Ninguna excepción durante el matching con inputs heterogéneos (null, undefined, Date, string)', () => {
    const candidates: MatchCandidate[] = [
      {
        venueId: 10052,
        proposedDate: '2026-10-24',
        proposedTime: '21:00',
        title: 'Evento Test 1',
        caption: 'Caption con texto variado',
      },
      {
        venueId: 10052,
        proposedDate: '2026-10-24',
        proposedTime: null,
        title: 'Evento Test 2',
        caption: 'Caption sin hora',
      },
      {
        venueId: null,
        proposedDate: null,
        proposedTime: null,
        title: 'Post de ambiente',
        caption: 'Feliz fin de semana',
        hasNoDateAndTime: true,
      },
    ];

    const heterogenousEvents: ExistingEventRecord[] = [
      {
        id: 101,
        venue_id: 10052,
        editorial_date: '2026-10-24',
        start_time: new Date('2026-10-24T21:00:00Z'),
        title: 'Evento con Date',
        status: 'published',
      },
      {
        id: 102,
        venue_id: 10052,
        editorial_date: '2026-10-24',
        start_time: '2026-10-24T22:00:00Z',
        title: 'Evento con String ISO',
        status: 'published',
      },
      {
        id: 103,
        venue_id: 10052,
        editorial_date: '2026-10-24',
        start_time: null,
        title: 'Evento con start_time null',
        status: 'draft',
      },
      {
        id: 104,
        venue_id: 10052,
        editorial_date: '2026-10-24',
        start_time: undefined,
        title: 'Evento con start_time undefined',
        status: 'tentative',
      },
    ];

    for (const cand of candidates) {
      expect(() => matchPostWithPublishedEvents(cand, heterogenousEvents)).not.toThrow();
      const evalRes = matchPostWithPublishedEvents(cand, heterogenousEvents);
      expect(evalRes).toBeDefined();
      expect(typeof evalRes.score).toBe('number');
      expect(Array.isArray(evalRes.signals)).toBe(true);
    }
  });
});
