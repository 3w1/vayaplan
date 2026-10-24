import { describe, expect, test } from 'bun:test';
import {
  toTimeString,
  toDateString,
  isTimeSimilar,
  evaluateDateProximity,
  matchPostWithPublishedEvents,
  MADRID_TIMEZONE,
  type MatchCandidate,
  type ExistingEventRecord,
} from '../event-matcher';

describe('Ajuste Obligatorio al Hotfix del Event Matcher — Zona Horaria Europe/Madrid', () => {
  // Constante de zona horaria
  test('MADRID_TIMEZONE está configurado explícitamente en "Europe/Madrid"', () => {
    expect(MADRID_TIMEZONE).toBe('Europe/Madrid');
  });

  // 1. Date en UTC durante horario de verano (CEST, UTC+2)
  test('1. Date 2026-10-24T21:30:00Z en horario de verano (CEST, UTC+2) -> 23:30 Europe/Madrid', () => {
    const summerDateUtc = new Date('2026-10-24T21:30:00.000Z');
    expect(toTimeString(summerDateUtc)).toBe('23:30');
  });

  // 2. Date con offset explícito +02:00 en Europe/Madrid
  test('2. Date 2026-10-24T23:30:00+02:00 -> 23:30 Europe/Madrid', () => {
    const dateWithOffset = new Date('2026-10-24T23:30:00+02:00');
    expect(toTimeString(dateWithOffset)).toBe('23:30');
  });

  // 3. String ISO con 'Z'
  test('3. String ISO con Z ("2026-10-24T21:30:00Z") se convierte a 23:30 Europe/Madrid', () => {
    expect(toTimeString('2026-10-24T21:30:00Z')).toBe('23:30');
    expect(toTimeString('2026-10-24T21:30:00.000Z')).toBe('23:30');
  });

  // 4. String ISO con offset +02:00
  test('4. String ISO con offset +02:00 ("2026-10-24T23:30:00+02:00") -> 23:30 Europe/Madrid', () => {
    expect(toTimeString('2026-10-24T23:30:00+02:00')).toBe('23:30');
  });

  // 5. String solo con hora (interpretada como hora de pared local en Europe/Madrid)
  test('5. String solo con hora ("23:30", "9:30") se normaliza a HH:mm', () => {
    expect(toTimeString('23:30')).toBe('23:30');
    expect(toTimeString('9:30')).toBe('09:30');
    expect(toTimeString('00:15')).toBe('00:15');
    expect(toTimeString('23:30:00')).toBe('23:30');
  });

  // 6. null
  test('6. null retorna null de forma segura en toTimeString y toDateString', () => {
    expect(toTimeString(null)).toBeNull();
    expect(toDateString(null)).toBeNull();
  });

  // 7. undefined
  test('7. undefined retorna null de forma segura en toTimeString y toDateString', () => {
    expect(toTimeString(undefined)).toBeNull();
    expect(toDateString(undefined)).toBeNull();
    expect(toTimeString('')).toBeNull();
    expect(toDateString('')).toBeNull();
  });

  // 8. Fecha inválida
  test('8. Fecha o formato inválido retorna null sin lanzar excepción', () => {
    expect(toTimeString('invalido')).toBeNull();
    expect(toDateString('invalido')).toBeNull();
    expect(toTimeString(new Date('fecha invalida'))).toBeNull();
    expect(toDateString(new Date('fecha invalida'))).toBeNull();
    expect(toTimeString(12345)).toBeNull();
    expect(toDateString({})).toBeNull();
  });

  // 9. Comparación de propuesta 23:30 con evento 23:30 Europe/Madrid
  test('9. Comparación de propuesta con hora "23:30" coincide plenamente con evento 23:30 Europe/Madrid', () => {
    const candidateTime = '23:30';
    const evTimeStr = '23:30';
    expect(isTimeSimilar(candidateTime, evTimeStr, 15)).toBe(true);
  });

  // 10. Comparación de propuesta 23:30 con evento 21:30 UTC
  test('10. Comparación de propuesta con hora "23:30" coincide con evento guardado como 21:30 UTC en verano', () => {
    const candidateTime = '23:30';
    // Evento guardado en pg como Date con 21:30:00 UTC (equivale a 23:30 CEST en Europe/Madrid)
    const evDateUtc = new Date('2026-10-24T21:30:00.000Z');
    
    // toTimeString normaliza evDateUtc a 23:30 en Europe/Madrid
    expect(toTimeString(evDateUtc)).toBe('23:30');
    expect(isTimeSimilar(candidateTime, evDateUtc, 15)).toBe(true);
  });

  // 11. Fecha límite de cambio de hora estacional (25 de octubre 2026)
  test('11. Fecha límite de cambio de hora (25 de octubre 2026): transición CEST (UTC+2) a CET (UTC+1)', () => {
    // Sábado 24 de octubre 2026 (Horario de verano, CEST, UTC+2):
    // 21:30 UTC -> 23:30 Europe/Madrid
    const summerDate = new Date('2026-10-24T21:30:00.000Z');
    expect(toTimeString(summerDate)).toBe('23:30');

    // Domingo 25 de octubre 2026 a las 12:00 UTC (Ya en horario de invierno, CET, UTC+1):
    // 12:00 UTC -> 13:00 Europe/Madrid
    const postChangeDate = new Date('2026-10-25T12:00:00.000Z');
    expect(toTimeString(postChangeDate)).toBe('13:00');

    // Viernes 30 de octubre 2026 (Horario de invierno, CET, UTC+1):
    // 22:30 UTC -> 23:30 Europe/Madrid
    const winterDate = new Date('2026-10-30T22:30:00.000Z');
    expect(toTimeString(winterDate)).toBe('23:30');
  });

  // 12. toDateString normaliza fechas en Europe/Madrid
  test('12. toDateString convierte correctamente timestamps UTC a la fecha local de Europe/Madrid', () => {
    // 2026-10-24 a las 23:00 UTC corresponde a las 01:00 CEST del 2026-10-25 en Europe/Madrid
    const lateNightDate = new Date('2026-10-24T23:00:00.000Z');
    expect(toDateString(lateNightDate)).toBe('2026-10-25');

    // String fecha simple se conserva
    expect(toDateString('2026-10-24')).toBe('2026-10-24');
    // Timestamp ISO antes de medianoche local se mantiene en el mismo día
    expect(toDateString('2026-10-24T18:00:00Z')).toBe('2026-10-24');
  });

  // 13. evaluateDateProximity evalúa fechas en Europe/Madrid
  test('13. evaluateDateProximity compara fechas en Europe/Madrid', () => {
    // Misma fecha en Madrid
    const prox1 = evaluateDateProximity('2026-10-24', new Date('2026-10-24T18:00:00Z'));
    expect(prox1.sameDate).toBe(true);
    expect(prox1.daysDiff).toBe(0);

    // Fechas adyacentes (+1 día)
    const prox2 = evaluateDateProximity('2026-10-24', '2026-10-25');
    expect(prox2.sameDate).toBe(false);
    expect(prox2.daysDiff).toBe(1);
  });

  // 14. Matching defensivo completo con start_time Date y propuesta con hora en Europe/Madrid
  test('14. matchPostWithPublishedEvents empareja propuesta 21:00 con evento 19:00 UTC (21:00 Madrid)', () => {
    const candidate: MatchCandidate = {
      venueId: 10052,
      proposedDate: '2026-10-24',
      proposedTime: '21:00', // Hora local de Palencia detectada en el flyer
      title: 'Héroes El Culto Tributo',
      caption: 'Concierto en directo en Sala Infinity a las 21:00',
    };

    const existingEvents: ExistingEventRecord[] = [
      {
        id: 78,
        venue_id: 10052,
        venue_name: 'Sala Infinity',
        editorial_date: '2026-10-24',
        // Evento almacenado en DB con start_time 19:00:00Z (que son las 21:00 CEST en Europe/Madrid)
        start_time: new Date('2026-10-24T19:00:00.000Z'),
        title: 'Héroes El Culto (Tributo a Héroes del Silencio) — Sala Infinity',
        status: 'published',
      },
    ];

    const result = matchPostWithPublishedEvents(candidate, existingEvents);

    expect(result.matchedEvent).not.toBeNull();
    expect(result.matchedEvent?.id).toBe(78);
    expect(['MATCH_EXACTO', 'MATCH_ALTO']).toContain(result.matchLevel);
    expect(result.signals.some((s) => s.includes('Hora similar en Europe/Madrid (21:00 vs 21:00)'))).toBe(true);
  });
});
