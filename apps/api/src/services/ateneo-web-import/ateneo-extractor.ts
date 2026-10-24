/**
 * VayaPlan — Extractor Editorial para el Ateneo de Palencia
 *
 * Fuente: https://ateneodepalencia.com/programacion/
 * Soporta extracción estructurada mediante la API REST nativa de WordPress (MEC Events)
 * y resolución de fechas/horas canónicas con iCal / HTML fallback en Europe/Madrid.
 */

import {
  ATENEO_MEC_API_URL,
  ATENEO_MAX_PILOT_ITEMS,
  type AteneoRawEvent,
} from './ateneo-types';
import { detectPriceFromText } from '@vayaplan/shared';

/**
 * Decodifica entidades HTML habituales de títulos de WordPress
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpia texto HTML de descripciones a texto plano breve
 */
export function cleanHtmlDescription(html: string, maxLength = 300): string {
  if (!html) return '';
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const decoded = decodeHtmlEntities(text);
  if (decoded.length <= maxLength) return decoded;
  return decoded.slice(0, maxLength).trim() + '...';
}

/**
 * Determina si una hora es verosímil para un evento cultural puntual en España.
 * Filtra horas inverosímiles (e.g. 07:00, 08:00) o placeholders de día completo / rangos amplios (>= 6h)
 * generados por Modern Events Calendar Lite cuando no hay hora específica asignada.
 */
export function isPlausibleEventTime(time: string | null, endTime?: string | null): boolean {
  if (!time) return false;
  if (time === '00:00') return false;

  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;

  const hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);

  // En España, las presentaciones/actos culturales de ateneos no se inician entre las 01:00 y las 08:59.
  // Horas como 07:00 u 08:00 corresponden a placeholders de apertura administrativa o día completo de MEC.
  if (hh >= 1 && hh < 9) {
    return false;
  }

  // Si se dispone de endTime y la duración abarca 6 horas o más (e.g., 07:00 - 18:00, 08:00 - 18:00),
  // se trata de una franja de disponibilidad de sala / jornada completa, no de una sesión puntual.
  if (endTime && endTime !== '00:00') {
    const endMatch = endTime.match(/^(\d{1,2}):(\d{2})$/);
    if (endMatch) {
      const eh = parseInt(endMatch[1], 10);
      const em = parseInt(endMatch[2], 10);
      const startMin = hh * 60 + mm;
      const endMin = eh * 60 + em;
      if (endMin > startMin && endMin - startMin >= 6 * 60) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Parsea fechas y horas desde el contenido iCal (bloque VEVENT) de un evento MEC
 */
export function parseMecIcal(icalText: string): {
  date: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  summary?: string;
  imageUrl?: string;
} {
  let date: string | null = null;
  let time: string | null = null;
  let endDate: string | null = null;
  let endTime: string | null = null;
  let summary: string | undefined;
  let imageUrl: string | undefined;

  // Aislar el bloque VEVENT para ignorar definiciones de zona horaria VTIMEZONE/DAYLIGHT/STANDARD
  const veventMatch = icalText.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
  const targetText = veventMatch ? veventMatch[1] : icalText;

  const lines = targetText.split(/\r?\n/);
  for (const line of lines) {
    // DTSTART;TZID=Europe/Madrid:20261022T200000
    // DTSTART:20261022T200000Z
    const dtStartMatch = line.match(/^DTSTART(?:;[^:]+)?:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (dtStartMatch) {
      const [, y, m, d, hh, mm] = dtStartMatch;
      date = `${y}-${m}-${d}`;
      if (hh !== undefined && mm !== undefined) {
        time = `${hh}:${mm}`;
      }
    }

    const dtEndMatch = line.match(/^DTEND(?:;[^:]+)?:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (dtEndMatch) {
      const [, y, m, d, hh, mm] = dtEndMatch;
      endDate = `${y}-${m}-${d}`;
      if (hh !== undefined && mm !== undefined) {
        endTime = `${hh}:${mm}`;
      }
    }

    if (line.startsWith('SUMMARY:')) {
      summary = decodeHtmlEntities(line.substring(8));
    }

    const attachMatch = line.match(/^ATTACH(?:;[^:]+)?:(https?:\/\/[^\s]+)/i);
    if (attachMatch) {
      imageUrl = attachMatch[1].trim();
    }
  }

  // Sanitización de hora mediante plausibilidad de evento
  if (time && !isPlausibleEventTime(time, endTime)) {
    time = null;
  }

  return { date, time, endDate, endTime, summary, imageUrl };
}

export interface FetchAteneoOptions {
  maxItems?: number;
  fetchFn?: typeof fetch;
  mockRawItems?: any[];
  mockIcalProvider?: (id: number) => Promise<string>;
  futureOnly?: boolean;
  minDate?: string;
  maxPagesToScan?: number;
}

/**
 * Extrae hasta `maxItems` eventos de la programación del Ateneo de Palencia.
 * Por defecto filtra únicamente eventos futuros o en curso (>= minDate) ordenados cronológicamente.
 */
export async function fetchAteneoProgramacionEvents(
  options?: FetchAteneoOptions
): Promise<AteneoRawEvent[]> {
  const maxItems = Math.min(options?.maxItems || ATENEO_MAX_PILOT_ITEMS, 5);
  const customFetch = options?.fetchFn || fetch;
  const nowIso = new Date().toISOString();
  const futureOnly = options?.futureOnly ?? (options?.mockRawItems ? false : true);
  const minDate = options?.minDate || '2026-10-24';
  const maxPagesToScan = options?.maxPagesToScan || 3;

  const rawCandidateItems: any[] = [];

  if (options?.mockRawItems) {
    rawCandidateItems.push(...options.mockRawItems);
  } else {
    // Consulta paginada defensiva para localizar eventos futuros
    for (let page = 1; page <= maxPagesToScan; page++) {
      const url = `${ATENEO_MEC_API_URL}?per_page=10&page=${page}&status=publish`;
      try {
        const res = await customFetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; VayaPlanBot/1.0; +https://vayaplan.com)',
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          if (page === 1) {
            throw new Error(
              `Fallo al consultar la API de eventos del Ateneo de Palencia (HTTP ${res.status}): ${res.statusText}`
            );
          }
          break; // Fin de páginas disponibles
        }

        const pageItems = (await res.json()) as any[];
        if (!Array.isArray(pageItems) || pageItems.length === 0) {
          break;
        }

        rawCandidateItems.push(...pageItems);
      } catch (err: any) {
        if (page === 1) throw err;
        break;
      }
    }
  }

  const events: AteneoRawEvent[] = [];

  for (const item of rawCandidateItems) {
    const mecId = Number(item.id);
    const slug = String(item.slug || `ateneo-${mecId}`);
    const rawTitle = item.title?.rendered || item.title || 'Actividad en el Ateneo de Palencia';
    const title = decodeHtmlEntities(rawTitle);
    const eventUrl = String(item.link || `https://ateneodepalencia.com/events/${slug}/`);

    // Imagen destacada desde WordPress UAGB / Featured Image
    let primaryImageUrl: string | null = null;
    if (item.uagb_featured_image_src?.full?.[0]) {
      primaryImageUrl = item.uagb_featured_image_src.full[0];
    } else if (item.featured_image_url) {
      primaryImageUrl = item.featured_image_url;
    }

    // Descripción breve
    const description = cleanHtmlDescription(
      item.excerpt?.rendered || item.content?.rendered || title,
      250
    );

    // Consulta de fecha y hora detallada mediante iCal del evento
    let date: string | null = null;
    let time: string | null = null;
    let endDate: string | null = null;
    let endTime: string | null = null;

    try {
      let icalText = '';
      if (options?.mockIcalProvider) {
        icalText = await options.mockIcalProvider(mecId);
      } else {
        const icalUrl = `https://ateneodepalencia.com/?method=ical&id=${mecId}`;
        const icalRes = await customFetch(icalUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VayaPlanBot/1.0; +https://vayaplan.com)',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (icalRes.ok) {
          icalText = await icalRes.text();
        }
      }

      if (icalText) {
        const parsedIcal = parseMecIcal(icalText);
        if (parsedIcal.date) date = parsedIcal.date;
        if (parsedIcal.time) time = parsedIcal.time;
        if (parsedIcal.endDate) endDate = parsedIcal.endDate;
        if (parsedIcal.endTime) endTime = parsedIcal.endTime;
        if (!primaryImageUrl && parsedIcal.imageUrl) {
          primaryImageUrl = parsedIcal.imageUrl;
        }
      }
    } catch (icalErr) {
      // Fallback a fecha de publicación del post si iCal no responde
      console.warn(`[Ateneo Extractor] Fallo iCal para evento #${mecId}:`, icalErr);
    }

    // Si no hubo fecha en iCal, usar fecha del post
    if (!date && item.date) {
      date = item.date.split('T')[0];
    }

    // Sanitización final de hora
    if (time && !isPlausibleEventTime(time, endTime)) {
      time = null;
    }

    // Filtrado estricto de eventos futuros / en curso si futureOnly está activo
    const isFutureOrActive =
      (date && date >= minDate) || (endDate && endDate >= minDate);

    if (futureOnly && !isFutureOrActive) {
      continue;
    }

    // Detección canónica de precio a partir del título y contenido (sin asumir gratuidad por defecto)
    const textForPrice = `${title} ${description} ${item.content?.rendered ? cleanHtmlDescription(item.content.rendered, 500) : ''}`;
    const detectedPrice = detectPriceFromText(textForPrice);

    const price = detectedPrice.amount;
    const priceCents = detectedPrice.priceCents;
    const priceStatus = detectedPrice.priceStatus;
    const priceNote = detectedPrice.priceNote || null;
    const isFree = detectedPrice.isFree;

    // Detección de categoría sugerida por título
    let category = 'cultura';
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('libro') || lowerTitle.includes('autor') || lowerTitle.includes('poes') || lowerTitle.includes('lectura')) {
      category = 'cultura'; // literatura / conferencia
    } else if (lowerTitle.includes('exposici') || lowerTitle.includes('muestra') || lowerTitle.includes('pintura')) {
      category = 'cultura'; // exposicion
    } else if (lowerTitle.includes('conferencia') || lowerTitle.includes('coloquio') || lowerTitle.includes('charla') || lowerTitle.includes('presentaci')) {
      category = 'conferencias';
    } else if (lowerTitle.includes('jazz') || lowerTitle.includes('concierto') || lowerTitle.includes('música')) {
      category = 'musica_directo';
    }

    events.push({
      sourceId: `ateneo_${mecId}`,
      mecId,
      slug,
      title,
      date,
      time,
      endDate,
      endTime,
      description,
      price,
      priceCents,
      priceStatus,
      priceNote,
      isFree,
      category,
      eventUrl,
      imageUrl: primaryImageUrl,
      imageAltText: title,
      credit: 'Ateneo de Palencia',
      lastCheckedAt: nowIso,
    });

    if (events.length >= maxItems) {
      break;
    }
  }

  // Ordenación cronológica: los más próximos primero
  events.sort((a, b) => {
    const dateComp = (a.date || '').localeCompare(b.date || '');
    if (dateComp !== 0) return dateComp;
    return (a.time || '').localeCompare(b.time || '');
  });

  return events.slice(0, maxItems);
}
