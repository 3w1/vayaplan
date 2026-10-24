/**
 * VayaPlan — Motor de Matching y Detección de Duplicados para Ingesta de Instagram.
 *
 * Niveles de coincidencia:
 * - MATCH_EXACTO: Mismo venue, misma fecha y título muy similar.
 * - MATCH_ALTO: Mismo venue, misma fecha y coincidencia fuerte en título, hora o imagen.
 * - MATCH_POSIBLE: Mismo venue, fecha cercana o coincidencia parcial en título, imagen o caption.
 * - SIN_MATCH: No hay coincidencia suficiente.
 *
 * Reglas de seguridad:
 * - Si el reel/post no tiene fecha ni hora, NUNCA forzar el vínculo aunque exista un evento publicado del mismo venue.
 * - Nunca publicar, vincular ni descartar eventos automáticamente.
 */

import type { EventMatchLevel } from './bar-types';

export interface MatchCandidate {
  venueId: number | null;
  proposedDate: string | null; // YYYY-MM-DD
  proposedTime: string | null; // HH:mm
  title: string;
  caption: string;
  imageUrl?: string | null;
  postPublishedAt?: string | null;
  hasNoDateAndTime?: boolean;
}

export interface ExistingEventRecord {
  id: number;
  venue_id: number | null;
  venue_name?: string | null;
  editorial_date: string | Date; // YYYY-MM-DD
  start_time: string | Date | null | undefined;
  title: string;
  description?: string | null;
  status: string; // 'published' | 'draft' | etc.
  image_url?: string | null;
}

export interface MatchEvaluation {
  matchLevel: EventMatchLevel;
  matchedEvent: ExistingEventRecord | null;
  score: number; // 0 a 100
  signals: string[];
  recommendedAction: string;
  recommendedClassification: 'DUPLICADO_POSIBLE' | 'EVENTO_POSIBLE' | 'EVENTO_POSIBLE_SIN_HORA' | 'CONTENIDO_VENUE';
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'en', 'con', 'para', 'por', 'a', 'al', 'del',
  'bar', 'sala', 'pub', 'palencia', 'evento', 'concierto', 'sesion',
  'directo', 'live', 'fiesta', 'tardeo', 'dj', 'musica', 'este', 'esta',
  'fin', 'semana', 'nos', 'vemos', 'te', 'esperamos', 'desde', 'hasta',
]);

/**
 * Normaliza y tokeniza un texto eliminando tildes, signos y stopwords.
 */
export function extractKeywords(text: string): Set<string> {
  if (!text) return new Set();
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const tokens = clean.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Calcula similitud de Jaccard entre dos conjuntos de palabras clave (0 a 1.0).
 */
export function calculateKeywordSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

export const MADRID_TIMEZONE = 'Europe/Madrid';

const madridTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const madridDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Normaliza cualquier representación temporal a formato de hora "HH:mm" en la zona horaria 'Europe/Madrid'.
 * Soporta de manera defensiva:
 * - Instancias de Date (convierte a Europe/Madrid usando Intl.DateTimeFormat)
 * - Strings ISO completos (con 'Z' o con offset, convirtiendo a Europe/Madrid)
 * - Strings solo con hora (ej. "23:30", "9:30") interpretados como hora de pared local
 * - null, undefined o valores no válidos (retorna null sin lanzar excepción)
 */
export function toTimeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    try {
      return madridTimeFormatter.format(value);
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return null;

    // Si ya viene solo como hora local de pared (HH:mm, HH:mm:ss o H:mm) sin componentes de fecha
    if (!str.includes('-') && !str.includes('/') && !str.includes('T')) {
      const match = str.match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        const h = match[1].padStart(2, '0');
        const m = match[2];
        const hNum = parseInt(h, 10);
        const mNum = parseInt(m, 10);
        if (hNum >= 0 && hNum <= 23 && mNum >= 0 && mNum <= 59) {
          return `${h}:${m}`;
        }
      }
      return null;
    }

    // Si tiene formato ISO completo o con fecha (ej. "2026-10-24T21:30:00Z" o "2026-10-24 23:30:00+02:00")
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      try {
        return madridTimeFormatter.format(parsed);
      } catch {
        return null;
      }
    }

    return null;
  }

  return null;
}

/**
 * Normaliza cualquier representación temporal a formato de fecha "YYYY-MM-DD" en la zona horaria 'Europe/Madrid'.
 * Soporta de manera defensiva:
 * - Instancias de Date (convierte a Europe/Madrid usando Intl.DateTimeFormat)
 * - Strings ISO completos (con 'Z' o con offset, convirtiendo a la fecha en Europe/Madrid)
 * - Strings solo con fecha (ej. "2026-10-24") interpretados como fecha de pared local
 * - null, undefined o valores no válidos (retorna null sin lanzar excepción)
 */
export function toDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    try {
      return madridDateFormatter.format(value);
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return null;

    // Si ya es un formato simple YYYY-MM-DD sin hora ni zona
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    // Si es un ISO datetime completo
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      try {
        return madridDateFormatter.format(parsed);
      } catch {
        return null;
      }
    }

    return null;
  }

  return null;
}

/**
 * Comprueba si dos fechas YYYY-MM-DD son idénticas o adyacentes (+/- 1 día natural),
 * normalizando ambas fechas en la zona horaria 'Europe/Madrid'.
 */
export function evaluateDateProximity(
  dateA: unknown,
  dateB: unknown
): { sameDate: boolean; daysDiff: number } {
  const normA = toDateString(dateA);
  const normB = toDateString(dateB);
  if (!normA || !normB) return { sameDate: false, daysDiff: 999 };
  if (normA === normB) return { sameDate: true, daysDiff: 0 };

  const [yA, mA, dA] = normA.split('-').map(Number);
  const [yB, mB, dB] = normB.split('-').map(Number);
  if (!yA || !mA || !dA || !yB || !mB || !dB) return { sameDate: false, daysDiff: 999 };

  const msA = Date.UTC(yA, mA - 1, dA, 12, 0, 0);
  const msB = Date.UTC(yB, mB - 1, dB, 12, 0, 0);
  const daysDiff = Math.abs(Math.round((msA - msB) / (1000 * 60 * 60 * 24)));
  return { sameDate: daysDiff === 0, daysDiff };
}

/**
 * Comprueba si dos horas HH:mm están dentro de una ventana de tolerancia en minutos,
 * normalizando ambas horas en la zona horaria 'Europe/Madrid'.
 */
export function isTimeSimilar(timeA: unknown, timeB: unknown, maxMinutes = 60): boolean {
  const normA = toTimeString(timeA);
  const normB = toTimeString(timeB);
  if (!normA || !normB) return false;

  const matchA = normA.match(/^(\d{1,2}):(\d{2})/);
  const matchB = normB.match(/^(\d{1,2}):(\d{2})/);
  if (!matchA || !matchB) return false;

  const minA = parseInt(matchA[1], 10) * 60 + parseInt(matchA[2], 10);
  const minB = parseInt(matchB[1], 10) * 60 + parseInt(matchB[2], 10);
  return Math.abs(minA - minB) <= maxMinutes;
}

/**
 * Evalúa un candidato contra la lista de eventos ya existentes en el catálogo.
 */
export function matchPostWithPublishedEvents(
  candidate: MatchCandidate,
  existingEvents: ExistingEventRecord[]
): MatchEvaluation {
  // Regla estricta: Si el reel o post no dispone de fecha ni hora fiables,
  // NO se fuerza vínculo aunque coincida el local. Se clasifica como CONTENIDO_VENUE.
  const isNoDateTime =
    candidate.hasNoDateAndTime ||
    (!candidate.proposedDate && !candidate.proposedTime);

  if (isNoDateTime) {
    return {
      matchLevel: 'SIN_MATCH',
      matchedEvent: null,
      score: 0,
      signals: [
        'Post sin fecha ni hora fiables: por regla editorial estricta no se vincula a eventos de agenda aunque comparta local.',
      ],
      recommendedAction:
        'Conservar como contenido de ambiente del local o archivar. No aprobable como evento.',
      recommendedClassification: 'CONTENIDO_VENUE',
    };
  }

  const candidateTitleWords = extractKeywords(candidate.title);
  const candidateCaptionWords = extractKeywords(candidate.caption);

  let bestMatch: ExistingEventRecord | null = null;
  let bestScore = 0;
  let bestLevel: EventMatchLevel = 'SIN_MATCH';
  let bestSignals: string[] = [];

  for (const ev of existingEvents) {
    const signals: string[] = [];
    let score = 0;

    // 1. Venue
    const isSameVenue =
      candidate.venueId !== null &&
      ev.venue_id !== null &&
      Number(candidate.venueId) === Number(ev.venue_id);

    if (isSameVenue) {
      score += 35;
      signals.push(`Mismo local (venue ID ${candidate.venueId})`);
    }

    // 2. Fecha
    const dateProx = evaluateDateProximity(candidate.proposedDate, ev.editorial_date);
    const evDateStr = toDateString(ev.editorial_date);
    const candDateStr = toDateString(candidate.proposedDate);
    if (dateProx.sameDate) {
      score += 35;
      signals.push(`Misma fecha editorial (${evDateStr || ev.editorial_date})`);
    } else if (dateProx.daysDiff === 1) {
      score += 15;
      signals.push(`Fecha adyacente (diferencia de 1 día: ${candDateStr} vs ${evDateStr})`);
    }

    // 3. Título del evento
    const evTitleWords = extractKeywords(ev.title);
    const titleSim = calculateKeywordSimilarity(candidateTitleWords, evTitleWords);
    if (titleSim >= 0.7) {
      score += 25;
      signals.push(`Título altamente coincidente (${Math.round(titleSim * 100)}% similitud)`);
    } else if (titleSim >= 0.35) {
      score += 15;
      signals.push(`Coincidencia parcial de título (${Math.round(titleSim * 100)}% similitud)`);
    }

    // 4. Mención en caption del título existente
    const captionSim = calculateKeywordSimilarity(candidateCaptionWords, evTitleWords);
    if (captionSim >= 0.4) {
      score += 10;
      signals.push(`Caption contiene palabras clave del evento existente (${ev.title})`);
    }

    // 5. Hora (evaluada en Europe/Madrid)
    const evTime = toTimeString(ev.start_time);
    const candidateTime = toTimeString(candidate.proposedTime);
    if (candidateTime && evTime && isTimeSimilar(candidateTime, evTime, 60)) {
      score += 10;
      signals.push(`Hora similar en Europe/Madrid (${candidateTime} vs ${evTime})`);
    }

    // Determinar nivel de coincidencia según señales ponderadas
    let level: EventMatchLevel = 'SIN_MATCH';

    if (isSameVenue && dateProx.sameDate && (titleSim >= 0.7 || score >= 85)) {
      level = 'MATCH_EXACTO';
    } else if (isSameVenue && dateProx.sameDate && (titleSim >= 0.35 || captionSim >= 0.35 || score >= 70)) {
      level = 'MATCH_ALTO';
    } else if (
      (isSameVenue && (dateProx.daysDiff <= 1 || titleSim >= 0.25 || captionSim >= 0.25)) ||
      (!isSameVenue && dateProx.sameDate && titleSim >= 0.75)
    ) {
      level = 'MATCH_POSIBLE';
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ev;
      bestLevel = level;
      bestSignals = signals;
    }
  }

  // Clasificación y acción recomendada
  if (bestLevel === 'MATCH_EXACTO' || bestLevel === 'MATCH_ALTO') {
    return {
      matchLevel: bestLevel,
      matchedEvent: bestMatch,
      score: bestScore,
      signals: bestSignals,
      recommendedAction: `Coincidencia alta con evento existente #${bestMatch?.id} ("${bestMatch?.title}"). Vincular a evento existente con confirmación humana o rechazar duplicado. No crear evento nuevo.`,
      recommendedClassification: 'DUPLICADO_POSIBLE',
    };
  }

  if (bestLevel === 'MATCH_POSIBLE') {
    return {
      matchLevel: 'MATCH_POSIBLE',
      matchedEvent: bestMatch,
      score: bestScore,
      signals: bestSignals,
      recommendedAction: `Posible relación con evento existente #${bestMatch?.id} ("${bestMatch?.title}"). Verificar antes de crear un nuevo borrador.`,
      recommendedClassification: 'DUPLICADO_POSIBLE',
    };
  }

  // Si no hay match con eventos publicados:
  if (!candidate.proposedTime) {
    return {
      matchLevel: 'SIN_MATCH',
      matchedEvent: null,
      score: 0,
      signals: ['Sin coincidencia con eventos publicados. Fecha detectada pero sin hora confirmada.'],
      recommendedAction: 'Añadir hora válida (HH:mm) antes de aprobar borrador.',
      recommendedClassification: 'EVENTO_POSIBLE_SIN_HORA',
    };
  }

  return {
    matchLevel: 'SIN_MATCH',
    matchedEvent: null,
    score: 0,
    signals: ['Nueva propuesta sin duplicados. Fecha y hora detectadas.'],
    recommendedAction: 'Revisar datos y aprobar como borrador.',
    recommendedClassification: 'EVENTO_POSIBLE',
  };
}
