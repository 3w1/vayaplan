/**
 * VayaPlan — Servicio de Contraste con Taquilla.com para Sala Infinity
 * 
 * Reglas de Arquitectura:
 * 1. Fuente externa de contraste asociada EXCLUSIVAMENTE al venue Sala Infinity (ID 10052).
 * 2. Solo extrae y procesa metadatos editoriales (título, fecha, hora, precio, URL de ficha).
 * 3. NO almacena imágenes ni descripciones protegidas con copyright.
 * 4. NUNCA crea, publica ni modifica eventos automáticamente.
 * 5. NUNCA aprueba ni rechaza propuestas automáticamente; solo sugiere contrastes para el curador humano.
 */

import { normalizePrice } from '@vayaplan/shared';

export const SALA_INFINITY_VENUE_ID = 10052;
export const TAQUILLA_SALA_INFINITY_URL = 'https://www.taquilla.com/palencia/sala-infinity-palencia';
export const TAQUILLA_API_ENDPOINT = 'https://www.taquilla.com/json2/search/entities?lang=es&t10venue=266051';

export type TaquillaMatchLevel =
  | 'TAQUILLA_MATCH_EXACTO'
  | 'TAQUILLA_MATCH_ALTO'
  | 'TAQUILLA_MATCH_POSIBLE'
  | 'TAQUILLA_SIN_MATCH';

export interface TaquillaEventMetadata {
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm
  price: number | null; // euros
  priceMin?: number | null;
  priceMax?: number | null;
  ticketUrl: string;
  isAvailable: boolean;
  lastCheckedAt: string;
}

export interface TaquillaDiscrepancy<T> {
  instagramValue: T;
  taquillaValue: T;
  diffMessage: string;
}

export interface TaquillaContrastResult {
  isApplicableVenue: boolean;
  venueId: number;
  sourceUrl: string;
  matchLevel: TaquillaMatchLevel;
  matchedEvent: TaquillaEventMetadata | null;
  suggestedDate?: string | null;
  suggestedTime?: string | null;
  suggestedPrice?: number | null;
  suggestedPriceFormatted?: string | null;
  priceDiscrepancy?: TaquillaDiscrepancy<number | null> | null;
  timeDiscrepancy?: TaquillaDiscrepancy<string | null> | null;
  lastCheckedAt: string;
  differencesDetected: string[];
  recommendedAction: string;
}

/**
 * Normaliza y tokeniza un texto eliminando tildes, signos de puntuación y palabras vacías.
 */
function tokenizeText(text: string): Set<string> {
  const stopWords = new Set([
    'concierto', 'tributo', 'sala', 'infinity', 'palencia', 'en', 'de', 'del',
    'la', 'el', 'los', 'las', 'un', 'una', 'y', 'a', 'para', 'por', 'directo',
    'musica', 'sesion', 'live', 'tour', 'gira', 'entradas', 'taquilla'
  ]);

  const clean = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const tokens = clean
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return new Set(tokens);
}

/**
 * Calcula similitud léxica Jaccard entre dos cadenas de texto.
 */
function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = tokenizeText(textA);
  const setB = tokenizeText(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Coteja una propuesta de Instagram contra el catálogo de eventos de Taquilla.com para Sala Infinity.
 */
export function contrastProposalWithTaquilla(
  proposal: {
    venueId: number;
    title: string;
    proposedDate?: string | null;
    proposedTime?: string | null;
    price?: number | null;
    caption?: string | null;
  },
  taquillaEvents: TaquillaEventMetadata[]
): TaquillaContrastResult {
  const isApplicable = proposal.venueId === SALA_INFINITY_VENUE_ID;
  const now = new Date().toISOString();

  if (!isApplicable) {
    return {
      isApplicableVenue: false,
      venueId: proposal.venueId,
      sourceUrl: TAQUILLA_SALA_INFINITY_URL,
      matchLevel: 'TAQUILLA_SIN_MATCH',
      matchedEvent: null,
      lastCheckedAt: now,
      differencesDetected: [],
      recommendedAction: 'La fuente de contraste Taquilla.com aplica exclusivamente al venue Sala Infinity (ID 10052).',
    };
  }

  if (!taquillaEvents || taquillaEvents.length === 0) {
    return {
      isApplicableVenue: true,
      venueId: SALA_INFINITY_VENUE_ID,
      sourceUrl: TAQUILLA_SALA_INFINITY_URL,
      matchLevel: 'TAQUILLA_SIN_MATCH',
      matchedEvent: null,
      lastCheckedAt: now,
      differencesDetected: [],
      recommendedAction: 'No se encontraron eventos activos en Taquilla.com para contrastar.',
    };
  }

  let bestMatch: TaquillaEventMetadata | null = null;
  let bestScore = -1;
  let bestMatchLevel: TaquillaMatchLevel = 'TAQUILLA_SIN_MATCH';

  const propDate = (proposal.proposedDate || '').trim();
  const propTime = (proposal.proposedTime || '').trim();
  const fullPropText = `${proposal.title || ''} ${proposal.caption || ''}`;

  for (const tEvent of taquillaEvents) {
    const sameDate = Boolean(propDate && tEvent.date && propDate === tEvent.date);
    const titleSim = calculateJaccardSimilarity(proposal.title, tEvent.title);
    const captionSim = calculateJaccardSimilarity(fullPropText, tEvent.title);
    const maxSim = Math.max(titleSim, captionSim);

    const sameTime = Boolean(
      propTime &&
      tEvent.time &&
      propTime.slice(0, 5) === tEvent.time.slice(0, 5)
    );

    let level: TaquillaMatchLevel = 'TAQUILLA_SIN_MATCH';
    let score = 0;

    if (sameDate && maxSim >= 0.5 && sameTime) {
      level = 'TAQUILLA_MATCH_EXACTO';
      score = 100 + maxSim * 10;
    } else if (sameDate && (maxSim >= 0.4 || (maxSim >= 0.25 && sameTime))) {
      level = 'TAQUILLA_MATCH_ALTO';
      score = 80 + maxSim * 10;
    } else if (sameDate || maxSim >= 0.4) {
      level = 'TAQUILLA_MATCH_POSIBLE';
      score = 40 + maxSim * 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = tEvent;
      bestMatchLevel = level;
    }
  }

  if (!bestMatch || bestMatchLevel === 'TAQUILLA_SIN_MATCH') {
    return {
      isApplicableVenue: true,
      venueId: SALA_INFINITY_VENUE_ID,
      sourceUrl: TAQUILLA_SALA_INFINITY_URL,
      matchLevel: 'TAQUILLA_SIN_MATCH',
      matchedEvent: null,
      lastCheckedAt: now,
      differencesDetected: [],
      recommendedAction: 'Sin coincidencia en Taquilla.com. Proceder con revisión estándar de Instagram.',
    };
  }

  const differences: string[] = [];
  let priceDiscrepancy: TaquillaDiscrepancy<number | null> | null = null;
  let timeDiscrepancy: TaquillaDiscrepancy<string | null> | null = null;

  // 1. Detección de discrepancia de precio
  const instPrice = proposal.price !== undefined && proposal.price !== null ? Number(proposal.price) : null;
  const taqPrice = bestMatch.price !== undefined && bestMatch.price !== null ? Number(bestMatch.price) : null;

  if (instPrice !== null && taqPrice !== null && Math.abs(instPrice - taqPrice) > 0.01) {
    const diffMsg = `Discrepancia de precio: Instagram detectó ${instPrice.toFixed(2).replace('.', ',')} € pero Taquilla.com lista ${taqPrice.toFixed(2).replace('.', ',')} €.`;
    differences.push(diffMsg);
    priceDiscrepancy = {
      instagramValue: instPrice,
      taquillaValue: taqPrice,
      diffMessage: diffMsg,
    };
  }

  // 2. Detección de discrepancia de horario
  if (propTime && bestMatch.time && propTime.slice(0, 5) !== bestMatch.time.slice(0, 5)) {
    const diffMsg = `Discrepancia de horario: Instagram indica ${propTime} h pero Taquilla.com lista ${bestMatch.time} h.`;
    differences.push(diffMsg);
    timeDiscrepancy = {
      instagramValue: propTime,
      taquillaValue: bestMatch.time,
      diffMessage: diffMsg,
    };
  }

  // 3. Elaborar sugerencias y acción recomendada
  let suggestedPrice: number | null = null;
  let suggestedPriceFormatted: string | null = null;
  if (bestMatch.price !== null && bestMatch.price !== undefined) {
    try {
      const norm = normalizePrice(bestMatch.price);
      suggestedPrice = norm.amount;
      suggestedPriceFormatted = norm.formatted;
    } catch {
      suggestedPrice = bestMatch.price;
      suggestedPriceFormatted = `${bestMatch.price} €`;
    }
  }

  let recommendedAction = 'Revisar datos de Taquilla.com y confirmar manualmente antes de aprobar.';
  if (bestMatchLevel === 'TAQUILLA_MATCH_EXACTO') {
    recommendedAction = 'Coincidencia exacta con Taquilla.com. Datos altamente fiables para contrastar y crear borrador.';
  } else if (bestMatchLevel === 'TAQUILLA_MATCH_ALTO') {
    if (!propTime && bestMatch.time) {
      recommendedAction = `Taquilla.com confirma horario (${bestMatch.time} h). El operador puede adoptarlo para resolver el evento sin hora.`;
    } else if (priceDiscrepancy) {
      recommendedAction = 'Atención a discrepancia de precio entre fuentes. Decisión editorial requerida.';
    } else {
      recommendedAction = 'Coincidencia alta con Taquilla.com. Verificar detalles y confirmar antes de aprobar.';
    }
  } else if (bestMatchLevel === 'TAQUILLA_MATCH_POSIBLE') {
    recommendedAction = 'Coincidencia parcial. Comprobar si se trata del mismo evento o de una gira con fechas distintas.';
  }

  return {
    isApplicableVenue: true,
    venueId: SALA_INFINITY_VENUE_ID,
    sourceUrl: TAQUILLA_SALA_INFINITY_URL,
    matchLevel: bestMatchLevel,
    matchedEvent: bestMatch,
    suggestedDate: bestMatch.date,
    suggestedTime: bestMatch.time,
    suggestedPrice,
    suggestedPriceFormatted,
    priceDiscrepancy,
    timeDiscrepancy,
    lastCheckedAt: now,
    differencesDetected: differences,
    recommendedAction,
  };
}

/**
 * Consulta la API de Taquilla.com para obtener metadatos de Sala Infinity.
 * Extrae estrictamente campos mínimos para cotejo editorial (sin copyright de textos ni imágenes).
 */
export async function fetchSalaInfinityTaquillaEvents(
  customFetcher?: typeof fetch
): Promise<TaquillaEventMetadata[]> {
  const fetchFn = customFetcher || fetch;
  const now = new Date().toISOString();

  try {
    const res = await fetchFn(TAQUILLA_API_ENDPOINT, {
      headers: {
        'User-Agent': 'VayaPlan-Editorial-Contrast/1.0 (+https://vayaplan.com)',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return [];
    }

    const data: any = await res.json();
    if (!data || !Array.isArray(data.objects)) {
      return [];
    }

    const events: TaquillaEventMetadata[] = [];

    for (const obj of data.objects) {
      const details = obj.details;
      if (!details) continue;

      const title = obj.entity_name || details.name || '';
      const urlSlug = obj.full_entity_name_url || (details.name_url ? `/entradas/${details.name_url}` : '');
      const ticketUrl = urlSlug.startsWith('http') ? urlSlug : `https://www.taquilla.com${urlSlug}`;

      // Extraer fechas específicas para Palencia (Sala Infinity id 266051)
      const palenciaDates: string[] = details.cities_dates?.Palencia || [];
      const minPriceStr = details.minprice || obj.fixed_minprice;
      const maxPriceStr = details.maxprice;

      let parsedPrice: number | null = null;
      let minPrice: number | null = null;
      let maxPrice: number | null = null;

      if (minPriceStr) {
        try {
          const norm = normalizePrice(minPriceStr);
          parsedPrice = norm.amount;
          minPrice = norm.amount;
        } catch {
          // Si no es parseable directamente, ignorar
        }
      }
      if (maxPriceStr) {
        try {
          const normMax = normalizePrice(maxPriceStr);
          maxPrice = normMax.amount;
        } catch {
          // Ignorar
        }
      }

      // Si hay fechas concretas para Palencia, generar un registro por fecha
      if (palenciaDates.length > 0) {
        for (const dateStr of palenciaDates) {
          events.push({
            title: title.trim(),
            date: dateStr,
            time: null, // Taquilla suele colocar el horario dentro de la sesión
            price: parsedPrice,
            priceMin: minPrice,
            priceMax: maxPrice,
            ticketUrl,
            isAvailable: true,
            lastCheckedAt: now,
          });
        }
      } else if (details.mindate) {
        events.push({
          title: title.trim(),
          date: details.mindate,
          time: null,
          price: parsedPrice,
          priceMin: minPrice,
          priceMax: maxPrice,
          ticketUrl,
          isAvailable: true,
          lastCheckedAt: now,
        });
      }
    }

    return events;
  } catch {
    return [];
  }
}
