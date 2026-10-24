import type { EventCategory, EventStatus, EventSourceType, VenueCategory, GastronomicRouteCategory, PriceStatus } from '@vayaplan/types';
export type { PriceStatus };

/**
 * Categorías válidas de venues en VayaPlan.
 * El orden determina el orden de aparición en los desplegables del administrador.
 */
export const VALID_VENUE_CATEGORIES: readonly VenueCategory[] = [
  'bar',
  'bar_musical',
  'cine',
  'cultura',
  'disco_bar',
  'discoteca',
  'general',
  'pub',
  'restaurante',
  'sala_conciertos',
  'teatro',
] as const;

/**
 * Etiquetas visibles para las categorías de venues, en español.
 */
export const VENUE_CATEGORY_LABELS: Readonly<Record<VenueCategory, string>> = {
  bar: 'Bar',
  bar_musical: 'Bar Musical',
  cine: 'Cine',
  cultura: 'Cultura',
  disco_bar: 'Disco Bar',
  discoteca: 'Discoteca',
  general: 'General',
  pub: 'Pub',
  restaurante: 'Restaurante',
  sala_conciertos: 'Sala de Conciertos',
  teatro: 'Teatro',
};

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
  'draft',
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
 * Normaliza y devuelve la etiqueta de precio para un evento según su estado
 */
export function formatPriceLabel(
  priceCents: number | null | undefined,
  isFree?: boolean,
  priceStatus?: PriceStatus,
  hasOfficialChannel?: boolean,
): string {
  if (priceStatus) {
    switch (priceStatus) {
      case 'FREE':
        return 'Gratis';
      case 'CHECK_BOX_OFFICE':
        return 'Consultar en taquilla';
      case 'NOT_INFORMED':
        return 'Precio no informado';
      case 'CONFIRMED':
        if (priceCents !== null && priceCents !== undefined) {
          const euros = (priceCents / 100).toFixed(2).replace('.', ',');
          return `${euros} €`;
        }
        return 'Precio confirmado';
      case 'UNKNOWN':
        return hasOfficialChannel ? 'Consultar' : '';
    }
  }

  // Fallback retrocompatible para llamadas previas sin priceStatus explícito
  if (isFree) {
    return 'Entrada libre';
  }

  if (priceCents !== null && priceCents !== undefined && priceCents > 0) {
    const euros = (priceCents / 100)
      .toFixed(2)
      .replace('.', ',');

    return `${euros} €`;
  }

  return 'Entradas en taquilla / festival';
}

export interface PriceDetectionResult {
  priceCents: number | null;
  amount: number | null;
  priceStatus: PriceStatus;
  isFree: boolean;
  priceNote?: string | null;
  formatted?: string | null;
}

/**
 * Reglas de ingesta canónica de precio a partir del texto del post o web:
 * 1. "entrada libre", "gratuito", "gratis", "free" -> price_status = FREE, price_cents = 0, isFree = true.
 * 2. Si hay un precio explícito numérico (ej. 12€, 12,50 €) -> price_status = CONFIRMED, price_cents normalizado.
 * 3. "consultar en taquilla", "entradas en taquilla" -> price_status = CHECK_BOX_OFFICE, price_cents = null, isFree = false.
 * 4. Sin mención alguna de precio -> price_status = NOT_INFORMED, price_cents = null, isFree = false.
 * 5. NUNCA infiere gratuidad por ausencia de precio.
 */
export function detectPriceFromText(text: string | null | undefined): PriceDetectionResult {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {
      priceCents: null,
      amount: null,
      priceStatus: 'NOT_INFORMED',
      isFree: false,
      priceNote: null,
      formatted: 'Precio no informado',
    };
  }

  const clean = text.trim();

  // 1. Detección de gratuidad explícita
  const isFreeExplicit = /\b(?:entrada\s+(?:libre|gratuita|gratis)|acceso\s+libre|gratuito|gratuita|gratis|free)\b/i.test(clean);
  if (isFreeExplicit) {
    return {
      priceCents: 0,
      amount: 0,
      priceStatus: 'FREE',
      isFree: true,
      priceNote: null,
      formatted: 'Gratis',
    };
  }

  // 2. Detección de precio explícito numérico
  const priceMatch = clean.match(/(?:^|[^\d])(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?\b)/i);
  if (priceMatch) {
    try {
      const norm = normalizePrice(priceMatch[1]);
      let note: string | null = null;
      if (/\b(?:en\s+taquilla|taquilla)\b/i.test(clean)) {
        note = 'En taquilla';
      }
      return {
        priceCents: norm.priceCents,
        amount: norm.amount,
        priceStatus: 'CONFIRMED',
        isFree: norm.priceCents === 0,
        priceNote: note,
        formatted: norm.formatted,
      };
    } catch {
      // Si la normalización falla, continuar evaluando
    }
  }

  // 3. Detección de taquilla sin precio explícito
  const isBoxOffice = /\b(?:consultar\s+en\s+taquilla|entradas?\s+en\s+taquilla|precio\s+en\s+taquilla|venta\s+en\s+taquilla|en\s+taquilla)\b/i.test(clean);
  if (isBoxOffice) {
    return {
      priceCents: null,
      amount: null,
      priceStatus: 'CHECK_BOX_OFFICE',
      isFree: false,
      priceNote: 'Consultar en taquilla',
      formatted: 'Consultar en taquilla',
    };
  }

  // 4. Ausencia de mención de precio -> NOT_INFORMED (nunca inferir gratuidad)
  return {
    priceCents: null,
    amount: null,
    priceStatus: 'NOT_INFORMED',
    isFree: false,
    priceNote: null,
    formatted: 'Precio no informado',
  };
}

export interface NormalizedPrice {
  amount: number;         // Valor decimal numérico (ej. 12.50)
  numericString: string;  // Cadena en formato SQL numeric(10,2) (ej. "12.50")
  priceCents: number;     // Entero exacto en céntimos para events.price_cents (ej. 1250)
  formatted: string;      // Etiqueta legible en formato español (ej. "12,50 €")
  isFree: boolean;        // true solo si el importe es 0
}

/**
 * Función única de validación y normalización de precios en formato español / estándar.
 *
 * Reglas:
 * - Acepta "12,50", "12.50", "12,5" y "12".
 * - Elimina espacios, "€", "EUR" y símbolos innecesarios.
 * - Trata la coma como separador decimal en formato español.
 * - Convierte "12,50" a 12.50 numérico y 1250 céntimos.
 * - Soporta separador de miles con punto en formato español (ej. "1.234,56" -> 1234.56).
 * - Rechaza formatos anglosajones ambiguos con coma de miles (ej. "1,234.56").
 * - Rechaza valores negativos (ej. "-5").
 * - Rechaza valores no numéricos (ej. "abc").
 * - Permite precio 0 solo si el evento es gratuito (isFree = true).
 * - Guarda el valor como numeric(10,2) (numericString = "12.50").
 * - Devuelve el precio formateado como "12,50 €" en la interfaz.
 */
export function normalizePrice(raw: unknown): NormalizedPrice {
  if (raw === null || raw === undefined || raw === '') {
    throw new Error('El precio es obligatorio y no puede estar vacío');
  }

  let str = String(raw).trim();

  // Eliminar símbolos de moneda y texto redundante
  str = str.replace(/€|EUR|eur/gi, '').trim();

  // Rechazar negativos explícitamente
  if (str.startsWith('-') || str.includes('-')) {
    throw new Error('El precio no puede ser negativo');
  }

  // Quitar espacios internos (ej. "12 , 50")
  str = str.replace(/\s+/g, '');

  // Comprobar caracteres no permitidos
  if (/[^\d.,]/.test(str)) {
    throw new Error(`Valor de precio no numérico: "${raw}"`);
  }

  // Caso 1: Contiene tanto punto como coma
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');

    if (lastDot < lastComma) {
      // Formato español: punto como separador de miles, coma como decimal (ej. 1.234,56)
      const cleanThousands = str.replace(/\./g, '');
      if ((cleanThousands.match(/,/g) || []).length !== 1) {
        throw new Error(`Formato de precio inválido: "${raw}"`);
      }
      str = cleanThousands.replace(',', '.');
    } else {
      // Formato anglosajón con coma de miles (ej. 1,234.56) -> Rechazar explícitamente
      throw new Error(`Formato de separador de miles anglosajón no permitido ("${raw}"). Utilice el formato español 1.234,56 o sin separador de miles.`);
    }
  } else if (str.includes(',')) {
    // Solo coma(s): debe haber una única coma decimal
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      throw new Error(`Múltiples separadores decimales no válidos: "${raw}"`);
    }
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    // Solo punto(s)
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      throw new Error(`Múltiples puntos no válidos en el precio: "${raw}"`);
    }
    const parts = str.split('.');
    if (parts[1] && parts[1].length > 2) {
      throw new Error(`Formato de decimales no válido (máximo 2 decimales): "${raw}"`);
    }
  }

  const num = Number(str);
  if (isNaN(num)) {
    throw new Error(`Valor de precio no numérico: "${raw}"`);
  }

  if (num < 0) {
    throw new Error('El precio no puede ser negativo');
  }

  const roundedAmount = Math.round(num * 100) / 100;
  const priceCents = Math.round(roundedAmount * 100);
  const numericString = roundedAmount.toFixed(2);
  const [integerPart, decimalPart] = numericString.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `${formattedInteger},${decimalPart} €`;
  const isFree = priceCents === 0;

  return {
    amount: roundedAmount,
    numericString,
    priceCents,
    formatted,
    isFree,
  };
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

// ==============================================================================
// RUTAS GASTRONÓMICAS — CONSTANTES Y REGLAS EDITORIALES
// ==============================================================================

/**
 * Categorías válidas de rutas gastronómicas en VayaPlan.
 * Lista cerrada garantizada por restricción CHECK en base de datos.
 */
export const VALID_GASTRONOMIC_ROUTE_CATEGORIES: readonly GastronomicRouteCategory[] = [
  'tapas',
  'bravas',
  'puchero',
  'reposteria',
  'vino',
  'general',
] as const;

/**
 * Etiquetas públicas y de administración para las categorías de rutas gastronómicas.
 */
export const GASTRONOMIC_ROUTE_CATEGORY_LABELS: Readonly<Record<GastronomicRouteCategory, string>> = {
  tapas: 'Tapas de Autor',
  bravas: 'Ruta de las Bravas',
  puchero: 'Puchero y Cuchara',
  reposteria: 'Repostería y Dulces',
  vino: 'Vinos y Maridaje',
  general: 'Selección Gastronómica',
};

/**
 * Formatea el precio de una propuesta gastronómica (tapa o plato).
 * Si priceCents es null o undefined, retorna null.
 * Si priceCents es numérico, formatea a euros con coma decimal (ej. 350 -> "3,50 €", 0 -> "0,00 €").
 */
export function formatDishPriceLabel(priceCents: number | null | undefined): string | null {
  if (priceCents === null || priceCents === undefined) {
    return null;
  }
  const euros = (priceCents / 100).toFixed(2).replace('.', ',');
  return `${euros} €`;
}

export interface RouteParticipantPublicationCandidate {
  is_active: boolean;          // Estado de la participación del local en la ruta
  venue_is_active: boolean;    // Estado censal del local en la tabla venues
}

export interface RoutePublishValidationResult {
  canPublish: boolean;
  activeParticipantsCount: number;
  reason?: string;
}

/**
 * Valida si una ruta gastronómica cumple con la regla defensiva para pasar a estado 'published'.
 * Exige estrictamente al menos 2 participantes con is_active = true y cuyo venue asociado
 * tenga también venue_is_active = true.
 */
export function validateRoutePublication(
  participants: RouteParticipantPublicationCandidate[]
): RoutePublishValidationResult {
  const activeCount = participants.filter(
    (p) => p.is_active === true && p.venue_is_active === true
  ).length;

  if (activeCount < 2) {
    return {
      canPublish: false,
      activeParticipantsCount: activeCount,
      reason: 'Una ruta gastronómica debe contar con al menos 2 locales participantes activos (con participación activa y local activo) para poder ser publicada.',
    };
  }

  return {
    canPublish: true,
    activeParticipantsCount: activeCount,
  };
}

export interface ParsedInstagramResult {
  isValid: boolean;
  username: string | null;
  canonicalUrl: string | null;
  error?: string;
}

/**
 * Normaliza y valida una entrada de Instagram procedente de un usuario, handle o enlace de perfil.
 * - Acepta: 'usuario', '@usuario', 'https://www.instagram.com/usuario/', 'https://instagram.com/usuario?igsh=...'
 * - Rechaza: URLs a publicaciones (/p/), reels (/reel/), stories, dominios no oficiales y cadenas vacías o inválidas.
 * - Genera: username en minúsculas y canonicalUrl sin parámetros de seguimiento.
 */
export function parseAndNormalizeInstagramInput(input: unknown): ParsedInstagramResult {
  if (input === null || input === undefined) {
    return { isValid: false, username: null, canonicalUrl: null, error: 'Valor de Instagram no proporcionado.' };
  }
  if (typeof input !== 'string') {
    return { isValid: false, username: null, canonicalUrl: null, error: 'Formato de entrada no válido.' };
  }
  const raw = input.trim();
  if (raw === '') {
    return { isValid: false, username: null, canonicalUrl: null, error: 'El campo de Instagram no puede estar vacío.' };
  }

  // Si contiene http:// o https:// o slashes o "instagram.com", procesarlo como URL
  if (/^https?:\/\//i.test(raw) || raw.includes('instagram.com') || raw.includes('/')) {
    let parsed: URL;
    try {
      const urlToParse = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      parsed = new URL(urlToParse);
    } catch {
      return { isValid: false, username: null, canonicalUrl: null, error: 'La URL de Instagram no tiene un formato válido.' };
    }

    const host = parsed.hostname.toLowerCase();
    const isInstagramHost = host === 'instagram.com' || host === 'www.instagram.com' || host === 'm.instagram.com';
    if (!isInstagramHost) {
      return { isValid: false, username: null, canonicalUrl: null, error: 'El enlace debe pertenecer al dominio oficial instagram.com.' };
    }

    // Limpiar path
    const pathParts = parsed.pathname.split('/').filter((p) => p.trim() !== '');
    if (pathParts.length === 0) {
      return { isValid: false, username: null, canonicalUrl: null, error: 'La URL debe incluir el nombre de usuario del perfil.' };
    }

    const firstSegment = pathParts[0].toLowerCase();
    const disallowedPrefixes = ['p', 'reel', 'reels', 'stories', 'explore', 'tags', 'direct', 'accounts', 'developer', 'about'];
    if (disallowedPrefixes.includes(firstSegment)) {
      const label = firstSegment === 'p' ? 'publicaciones' : (firstSegment === 'reel' || firstSegment === 'reels') ? 'reels' : firstSegment;
      return { isValid: false, username: null, canonicalUrl: null, error: `No se admiten enlaces a ${label}. Debe ser la URL del perfil principal.` };
    }

    const cleanUsername = firstSegment.replace(/^@+/, '');
    if (!/^[a-zA-Z0-9._]{2,30}$/.test(cleanUsername)) {
      return { isValid: false, username: null, canonicalUrl: null, error: 'El usuario de Instagram en la URL debe tener entre 2 y 30 caracteres válidos.' };
    }

    return {
      isValid: true,
      username: cleanUsername,
      canonicalUrl: `https://www.instagram.com/${cleanUsername}/`,
    };
  }

  // Si es un username directo o @username
  const cleanUsername = raw.replace(/^@+/, '').toLowerCase();
  if (!/^[a-zA-Z0-9._]{2,30}$/.test(cleanUsername)) {
    return {
      isValid: false,
      username: null,
      canonicalUrl: null,
      error: 'El usuario de Instagram debe tener entre 2 y 30 caracteres (letras, números, puntos y guiones bajos).',
    };
  }

  return {
    isValid: true,
    username: cleanUsername,
    canonicalUrl: `https://www.instagram.com/${cleanUsername}/`,
  };
}

