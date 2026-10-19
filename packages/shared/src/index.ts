import type { EventCategory, EventStatus, EventSourceType } from '@vayaplan/types';

/**
 * Categorías válidas en VayaPlan
 */
export const VALID_EVENT_CATEGORIES: readonly EventCategory[] = [
  'musica_directo',
  'dj_tardeo',
  'monologo',
  'cine',
  'teatro',
  'exposicion',
  'cultura',
  'baloncesto',
  'futbol',
  'rugby',
  'conferencia',
] as const;

/**
 * Estados de evento válidos
 */
export const VALID_EVENT_STATUSES: readonly EventStatus[] = [
  'tentative',
  'published',
  'outdated',
  'cancelled',
  'archived',
  'duplicate',
] as const;

/**
 * Tipos de fuentes de evento
 */
export const VALID_EVENT_SOURCES: readonly EventSourceType[] = [
  'whatsapp',
  'manual',
  'web',
  'scraper',
  'api',
  'user_report',
] as const;

/**
 * Normaliza y devuelve la etiqueta de precio para un evento
 */
export function formatPriceLabel(priceCents: number, isFree: boolean): string {
  if (isFree || priceCents === 0) {
    return 'Entrada libre';
  }
  const euros = (priceCents / 100).toFixed(2).replace('.', ',');
  return `${euros} €`;
}

/**
 * Parsea una fecha (YYYY-MM-DD) y hora (HH:mm) en la zona horaria 'Europe/Madrid'
 * y calcula su equivalente exacto en UTC.
 * 
 * Reglas de seguridad:
 * - Aplica el desfase oficial exacto para esa fecha (CEST UTC+2 en verano, CET UTC+1 en invierno).
 * - Detecta horas inexistentes (adelanto de primavera) o ambiguas (retraso de otoño),
 *   devolviendo valid=false y la causa específica para revisión editorial.
 * - No depende de la zona horaria del servidor o del navegador.
 */
export function parseMadridWallClockToUtc(
  dateStr: string,
  timeStr: string
): {
  valid: boolean;
  utcIso?: string;
  offsetHours?: number;
  reason?: 'invalid_format' | 'invalid_range' | 'nonexistent_dst_time' | 'ambiguous_dst_time';
  message?: string;
} {
  if (!dateStr || !timeStr) {
    return { valid: false, reason: 'invalid_format', message: 'Fecha u hora vacía' };
  }

  const dateParts = dateStr.trim().split('-');
  const timeParts = timeStr.trim().split(':');

  if (dateParts.length !== 3 || timeParts.length < 2) {
    return { valid: false, reason: 'invalid_format', message: 'Formato inválido (esperado YYYY-MM-DD y HH:mm)' };
  }

  const y = Number(dateParts[0]);
  const m = Number(dateParts[1]);
  const d = Number(dateParts[2]);
  const h = Number(timeParts[0]);
  const min = Number(timeParts[1]);

  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h) || isNaN(min)) {
    return { valid: false, reason: 'invalid_format', message: 'Valores numéricos inválidos' };
  }

  if (m < 1 || m > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) {
    return { valid: false, reason: 'invalid_range', message: 'Rango de fecha u hora fuera de límites' };
  }

  // Candidatos de offset en España peninsular: +01:00 (CET) y +02:00 (CEST)
  const candidateOffsets = [1, 2];
  const matchingCandidates: { utcIso: string; offsetHours: number }[] = [];

  for (const offset of candidateOffsets) {
    const utcMs = Date.UTC(y, m - 1, d, h - offset, min, 0);
    const dateObj = new Date(utcMs);

    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = dtf.formatToParts(dateObj);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const formattedYear = Number(partMap.year);
    const formattedMonth = Number(partMap.month);
    const formattedDay = Number(partMap.day);
    const formattedHour = Number(partMap.hour === '24' ? 0 : partMap.hour);
    const formattedMin = Number(partMap.minute);

    if (
      formattedYear === y &&
      formattedMonth === m &&
      formattedDay === d &&
      formattedHour === h &&
      formattedMin === min
    ) {
      matchingCandidates.push({ utcIso: dateObj.toISOString(), offsetHours: offset });
    }
  }

  if (matchingCandidates.length === 0) {
    return {
      valid: false,
      reason: 'nonexistent_dst_time',
      message: 'Hora inexistente por cambio de hora estacional (adelanto de primavera en Europe/Madrid).',
    };
  }

  if (matchingCandidates.length > 1) {
    return {
      valid: false,
      reason: 'ambiguous_dst_time',
      message: 'Hora ambigua por cambio de hora estacional (retraso de otoño en Europe/Madrid). Requiere revisión editorial.',
    };
  }

  return {
    valid: true,
    utcIso: matchingCandidates[0].utcIso,
    offsetHours: matchingCandidates[0].offsetHours,
  };
}

/**
 * Calcula la etiqueta editorial para una fecha y hora dadas
 * Ejemplos: "Viernes", "Viernes noche", "Sábado", "Domingo tarde"
 */
export function computeEditorialLabel(editorialDateStr: string, startTimeIso?: string | null): string {
  const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  const [year, month, day] = editorialDateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayName = daysOfWeek[dateObj.getUTCDay()] ?? 'Fecha';

  if (!startTimeIso || startTimeIso.trim().length === 0) {
    return dayName;
  }

  const startDate = new Date(startTimeIso);
  if (Number.isNaN(startDate.getTime())) {
    return dayName;
  }

  // Extraer la hora específicamente en la zona horaria Europe/Madrid
  const madridHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hour12: false,
  }).format(startDate);
  const hour = Number(madridHourStr === '24' ? 0 : madridHourStr);

  if (hour >= 20 || hour < 6) {
    if (dayName === 'Viernes' || dayName === 'Sábado') {
      return `${dayName} noche`;
    }
  } else if (hour >= 13 && hour < 20) {
    if (dayName === 'Sábado' || dayName === 'Domingo') {
      return `${dayName} tarde`;
    }
  }

  return dayName;
}

/**
 * Resuelve la URL de Google Maps para un local o lugar
 * Prioridad: 1. google_maps_url verificado, 2. coordenadas generadas, 3. null
 */
export function resolveGoogleMapsUrl(
  googleMapsUrl: string | null | undefined,
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined
): string | null {
  if (googleMapsUrl && googleMapsUrl.trim().length > 0) {
    return googleMapsUrl.trim();
  }

  if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    }
  }

  return null;
}

/**
 * Normaliza un número de contacto para enlace directo de WhatsApp
 */
export function resolveWhatsAppUrl(contact: string | null | undefined): string | null {
  if (!contact || contact.trim().length === 0) {
    return null;
  }
  const cleanNumber = contact.replace(/[^0-9]/g, '');
  if (cleanNumber.length < 9) {
    return null;
  }
  return `https://wa.me/${cleanNumber}`;
}

/**
 * Devuelve la fecha actual en formato YYYY-MM-DD para una zona horaria dada (por defecto Europe/Madrid)
 */
export function getCurrentDateInTimezone(timeZone: string = 'Europe/Madrid'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Valida si una cadena es una fecha válida en formato YYYY-MM-DD
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

/**
 * Normaliza y calcula el día editorial (YYYY-MM-DD) para un timestamp ISO en zona horaria Europe/Madrid.
 * Regla de negocio VayaPlan:
 * - Si cae entre las 00:00 y las 05:59 (hora de Palencia/Madrid, Europe/Madrid), el día editorial es la fecha del día anterior.
 * - Si cae a partir de las 06:00, el día editorial es la fecha del mismo día natural.
 * Evalúa explícitamente la hora local en Europe/Madrid sin depender de la timezone del servidor.
 */
export function computeEditorialDate(startTimeIso: string, timeZone: string = 'Europe/Madrid'): string {
  const date = new Date(startTimeIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida para computeEditorialDate: ${startTimeIso}`);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  const hour = parseInt(partMap.hour, 10);

  // Si la hora local en Europe/Madrid es anterior a las 06:00, pertenece a la jornada editorial del día anterior
  const localUtcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (hour < 6) {
    localUtcDate.setUTCDate(localUtcDate.getUTCDate() - 1);
  }

  const y = localUtcDate.getUTCFullYear();
  const m = String(localUtcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(localUtcDate.getUTCDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}
