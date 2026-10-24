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
 * Parsea fechas y horas desde el contenido iCal (VEVENT) de un evento MEC
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

  const lines = icalText.split(/\r?\n/);
  for (const line of lines) {
    // DTSTART;TZID=Europe/Madrid:20261022T200000
    // DTSTART:20261022T200000Z
    const dtStartMatch = line.match(/^DTSTART(?:;[^:]+)?:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (dtStartMatch && !line.includes('DAYLIGHT') && !line.includes('STANDARD')) {
      const [, y, m, d, hh, mm] = dtStartMatch;
      date = `${y}-${m}-${d}`;
      if (hh !== undefined && mm !== undefined) {
        // Ignorar 00:00:00 si representa evento de día completo sin hora
        time = `${hh}:${mm}`;
      }
    }

    const dtEndMatch = line.match(/^DTEND(?:;[^:]+)?:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (dtEndMatch && !line.includes('DAYLIGHT') && !line.includes('STANDARD')) {
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

  return { date, time, endDate, endTime, summary, imageUrl };
}

/**
 * Extrae hasta `maxItems` eventos de la programación del Ateneo de Palencia
 */
export async function fetchAteneoProgramacionEvents(options?: {
  maxItems?: number;
  fetchFn?: typeof fetch;
  mockRawItems?: any[];
  mockIcalProvider?: (id: number) => Promise<string>;
}): Promise<AteneoRawEvent[]> {
  const maxItems = Math.min(options?.maxItems || ATENEO_MAX_PILOT_ITEMS, 5);
  const customFetch = options?.fetchFn || fetch;
  const nowIso = new Date().toISOString();

  let rawItems: any[] = [];
  if (options?.mockRawItems) {
    rawItems = options.mockRawItems.slice(0, maxItems);
  } else {
    const url = `${ATENEO_MEC_API_URL}?per_page=${maxItems}&status=publish`;
    const res = await customFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; VayaPlanBot/1.0; +https://vayaplan.com)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(
        `Fallo al consultar la API de eventos del Ateneo de Palencia (HTTP ${res.status}): ${res.statusText}`
      );
    }

    rawItems = (await res.json()) as any[];
  }

  const events: AteneoRawEvent[] = [];

  for (const item of rawItems.slice(0, maxItems)) {
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
        if (parsedIcal.time && parsedIcal.time !== '00:00') {
          time = parsedIcal.time;
        }
        if (parsedIcal.endDate) endDate = parsedIcal.endDate;
        if (parsedIcal.endTime && parsedIcal.endTime !== '00:00') {
          endTime = parsedIcal.endTime;
        }
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

    // Ateneo de Palencia: Entrada libre por defecto para actos culturales
    const price = null;
    const isFree = true;

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
      isFree,
      category,
      eventUrl,
      imageUrl: primaryImageUrl,
      imageAltText: title,
      credit: 'Ateneo de Palencia',
      lastCheckedAt: nowIso,
    });
  }

  return events;
}
