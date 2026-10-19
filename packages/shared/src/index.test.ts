import { describe, expect, test } from 'bun:test';
import { computeEditorialDate } from './index';

describe('computeEditorialDate', () => {
  describe('Horario de verano (CEST, UTC+2)', () => {
    test('23:59 (mismo día natural)', () => {
      expect(computeEditorialDate('2026-07-15T23:59:00+02:00')).toBe('2026-07-15');
    });

    test('00:00 (madrugada -> día anterior)', () => {
      expect(computeEditorialDate('2026-07-16T00:00:00+02:00')).toBe('2026-07-15');
    });

    test('01:30 (madrugada -> día anterior)', () => {
      expect(computeEditorialDate('2026-07-16T01:30:00+02:00')).toBe('2026-07-15');
    });

    test('05:59 (último minuto de la madrugada -> día anterior)', () => {
      expect(computeEditorialDate('2026-07-16T05:59:00+02:00')).toBe('2026-07-15');
    });

    test('06:00 (inicio de jornada matinal -> mismo día)', () => {
      expect(computeEditorialDate('2026-07-16T06:00:00+02:00')).toBe('2026-07-16');
    });

    test('12:00 (mediodía -> mismo día)', () => {
      expect(computeEditorialDate('2026-07-16T12:00:00+02:00')).toBe('2026-07-16');
    });
  });

  describe('Horario de invierno (CET, UTC+1)', () => {
    test('23:59 (mismo día natural)', () => {
      expect(computeEditorialDate('2026-01-15T23:59:00+01:00')).toBe('2026-01-15');
    });

    test('00:00 (madrugada -> día anterior)', () => {
      expect(computeEditorialDate('2026-01-16T00:00:00+01:00')).toBe('2026-01-15');
    });

    test('01:30 (madrugada -> día anterior)', () => {
      expect(computeEditorialDate('2026-01-16T01:30:00+01:00')).toBe('2026-01-15');
    });

    test('05:59 (madrugada -> día anterior)', () => {
      expect(computeEditorialDate('2026-01-16T05:59:00+01:00')).toBe('2026-01-15');
    });

    test('06:00 (inicio de jornada -> mismo día)', () => {
      expect(computeEditorialDate('2026-01-16T06:00:00+01:00')).toBe('2026-01-16');
    });

    test('12:00 (mediodía -> mismo día)', () => {
      expect(computeEditorialDate('2026-01-16T12:00:00+01:00')).toBe('2026-01-16');
    });
  });

  describe('Independencia del huso horario del servidor (timestamps en UTC)', () => {
    test('22:30 UTC en verano = 00:30 CEST -> día anterior', () => {
      expect(computeEditorialDate('2026-07-15T22:30:00Z')).toBe('2026-07-15');
    });

    test('00:30 UTC en invierno = 01:30 CET -> día anterior', () => {
      expect(computeEditorialDate('2026-01-16T00:30:00Z')).toBe('2026-01-15');
    });

    test('05:00 UTC en invierno = 06:00 CET -> mismo día', () => {
      expect(computeEditorialDate('2026-01-16T05:00:00Z')).toBe('2026-01-16');
    });
  });

  describe('Casos de frontera (Fin de mes y Cambio de año)', () => {
    test('Fin de febrero a 1 de marzo de madrugada (02:00 CET -> 28 feb)', () => {
      expect(computeEditorialDate('2026-03-01T02:00:00+01:00')).toBe('2026-02-28');
    });

    test('Cambio de año: Nochevieja / Año Nuevo a las 01:30 CET -> 31 dic', () => {
      expect(computeEditorialDate('2026-01-01T01:30:00+01:00')).toBe('2025-12-31');
    });

    test('Cambio de año a las 06:00 CET -> 1 ene', () => {
      expect(computeEditorialDate('2026-01-01T06:00:00+01:00')).toBe('2026-01-01');
    });
  });

  describe('Manejo de errores', () => {
    test('Fecha inválida lanza excepción descriptiva', () => {
      expect(() => computeEditorialDate('not-a-date')).toThrow('Fecha inválida');
    });
  });
});

describe('Piloto de Ampliación de Agenda — Categorías y Etiquetas', () => {
  test('VALID_EVENT_CATEGORIES incluye deporte y conferencias manteniendo las existentes', () => {
    const { VALID_EVENT_CATEGORIES } = require('./index');
    expect(VALID_EVENT_CATEGORIES).toContain('musica_directo');
    expect(VALID_EVENT_CATEGORIES).toContain('cine');
    expect(VALID_EVENT_CATEGORIES).toContain('teatro');
    expect(VALID_EVENT_CATEGORIES).toContain('exposicion');
    expect(VALID_EVENT_CATEGORIES).toContain('baloncesto');
    expect(VALID_EVENT_CATEGORIES).toContain('futbol');
    expect(VALID_EVENT_CATEGORIES).toContain('rugby');
    expect(VALID_EVENT_CATEGORIES).toContain('conferencia');
  });

  test('computeEditorialLabel devuelve el nombre del día sin errores cuando startTimeIso es null o indefinido', () => {
    const { computeEditorialLabel } = require('./index');
    // 2026-11-08 es Domingo
    expect(computeEditorialLabel('2026-11-08', null)).toBe('Domingo');
    expect(computeEditorialLabel('2026-11-08', undefined)).toBe('Domingo');
    expect(computeEditorialLabel('2026-11-08', '')).toBe('Domingo');
    // 2026-10-24 es Sábado
    expect(computeEditorialLabel('2026-10-24', null)).toBe('Sábado');
  });
});

describe('Conversión Horaria Robusta — Europe/Madrid a UTC (parseMadridWallClockToUtc)', () => {
  const { parseMadridWallClockToUtc } = require('./index');

  test('Horario de verano (CEST, UTC+2): 20:30 en julio convierte a 18:30:00Z', () => {
    const res = parseMadridWallClockToUtc('2026-07-15', '20:30');
    expect(res.valid).toBe(true);
    expect(res.utcIso).toBe('2026-07-15T18:30:00.000Z');
    expect(res.offsetHours).toBe(2);
  });

  test('Horario de verano (CEST, UTC+2): 20:30 en octubre antes del cambio convierte a 18:30:00Z', () => {
    const res = parseMadridWallClockToUtc('2026-10-15', '20:30');
    expect(res.valid).toBe(true);
    expect(res.utcIso).toBe('2026-10-15T18:30:00.000Z');
    expect(res.offsetHours).toBe(2);
  });

  test('Horario de invierno (CET, UTC+1): 20:30 en noviembre convierte a 19:30:00Z', () => {
    const res = parseMadridWallClockToUtc('2026-11-10', '20:30');
    expect(res.valid).toBe(true);
    expect(res.utcIso).toBe('2026-11-10T19:30:00.000Z');
    expect(res.offsetHours).toBe(1);
  });

  test('Horario de invierno (CET, UTC+1): 12:30 matinal en noviembre convierte a 11:30:00Z', () => {
    const res = parseMadridWallClockToUtc('2026-11-10', '12:30');
    expect(res.valid).toBe(true);
    expect(res.utcIso).toBe('2026-11-10T11:30:00.000Z');
    expect(res.offsetHours).toBe(1);
  });

  test('Cambio estacional de primavera: hora inexistente (29 de marzo 2026 a las 02:30) se rechaza para revisión', () => {
    const res = parseMadridWallClockToUtc('2026-03-29', '02:30');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('nonexistent_dst_time');
    expect(res.utcIso).toBeUndefined();
  });

  test('Cambio estacional de otoño: hora ambigua (25 de octubre 2026 a las 02:30) se rechaza para revisión', () => {
    const res = parseMadridWallClockToUtc('2026-10-25', '02:30');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('ambiguous_dst_time');
    expect(res.utcIso).toBeUndefined();
  });

  test('Cambio estacional de otoño: hora no ambigua el mismo día (25 de octubre 2026 a las 12:30) convierte a 11:30:00Z (CET)', () => {
    const res = parseMadridWallClockToUtc('2026-10-25', '12:30');
    expect(res.valid).toBe(true);
    expect(res.utcIso).toBe('2026-10-25T11:30:00.000Z');
    expect(res.offsetHours).toBe(1);
  });

  test('Recorrido completo: publicada -> Europe/Madrid -> UTC -> Web/WhatsApp -> ICS DTSTART', () => {
    // 1. Hora publicada: 20:30 el 15 de octubre de 2026 (Verano)
    const pubSummer = parseMadridWallClockToUtc('2026-10-15', '20:30');
    expect(pubSummer.utcIso).toBe('2026-10-15T18:30:00.000Z');

    // 2. Formateo en Web / WhatsApp (Intl Europe/Madrid)
    const dtSummer = new Date(pubSummer.utcIso!);
    const timeFormattedSummer = dtSummer.toLocaleTimeString('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(timeFormattedSummer).toBe('20:30');

    // 3. iCalendar RFC 5545 DTSTART (debe ser UTC con sufijo Z)
    const yearS = dtSummer.getUTCFullYear();
    const monthS = String(dtSummer.getUTCMonth() + 1).padStart(2, '0');
    const dayS = String(dtSummer.getUTCDate()).padStart(2, '0');
    const hourS = String(dtSummer.getUTCHours()).padStart(2, '0');
    const minS = String(dtSummer.getUTCMinutes()).padStart(2, '0');
    const icsDtstartSummer = `${yearS}${monthS}${dayS}T${hourS}${minS}00Z`;
    expect(icsDtstartSummer).toBe('20261015T183000Z');

    // 4. Mismo recorrido en invierno: 20:30 el 10 de noviembre de 2026
    const pubWinter = parseMadridWallClockToUtc('2026-11-10', '20:30');
    expect(pubWinter.utcIso).toBe('2026-11-10T19:30:00.000Z');

    const dtWinter = new Date(pubWinter.utcIso!);
    const timeFormattedWinter = dtWinter.toLocaleTimeString('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(timeFormattedWinter).toBe('20:30');

    const yearW = dtWinter.getUTCFullYear();
    const monthW = String(dtWinter.getUTCMonth() + 1).padStart(2, '0');
    const dayW = String(dtWinter.getUTCDate()).padStart(2, '0');
    const hourW = String(dtWinter.getUTCHours()).padStart(2, '0');
    const minW = String(dtWinter.getUTCMinutes()).padStart(2, '0');
    const icsDtstartWinter = `${yearW}${monthW}${dayW}T${hourW}${minW}00Z`;
    expect(icsDtstartWinter).toBe('20261110T193000Z');
  });
});
