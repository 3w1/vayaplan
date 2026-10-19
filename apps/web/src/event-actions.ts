import type { PublicEventItem } from '@vayaplan/types';

/**
 * Fuente común de datos acotada para acciones de evento.
 * No expone campos administrativos, claves de verificación ni datos privados.
 */
export interface EventActionSource {
  id: number;
  title: string;
  status: string;
  start_time: string | null; // ISO 8601 or null if pending
  end_time: string | null; // ISO 8601
  time_status?: 'confirmed' | 'pending_time' | 'tentative_date' | 'continuous';
  editorial_date?: string;
  end_date?: string | null;
  schedule_text?: string | null;
  approximate_schedule?: string | null;
  venue_name: string;
  venue_address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maps_url?: string | null;
  price_is_free?: boolean;
  price_amount_cents?: number | null;
  price_label?: string | null;
  canonical_url: string;
}

/**
 * Extrae la fuente común de datos a partir del item público de evento
 */
export function extractEventActionSource(ev: PublicEventItem, canonicalUrl?: string): EventActionSource {
  const venue = ev.venue as any;
  const publicOrigin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : (process.env.PUBLIC_URL || 'https://vayaplan.com').replace(/\/$/, '');
  const eventCanonical = (ev && ev.id) ? `${publicOrigin}/events/${ev.id}` : '';

  return {
    id: ev.id,
    title: ev.title,
    status: ev.status,
    start_time: ev.start_time,
    end_time: ev.end_time || null,
    time_status: ev.time_status,
    editorial_date: ev.editorial_date,
    end_date: ev.end_date || null,
    schedule_text: ev.schedule_text || null,
    approximate_schedule: ev.approximate_schedule || null,
    venue_name: ev.venue?.name || '',
    venue_address: venue?.address || null,
    city: venue?.city || null,
    latitude: ev.venue?.latitude !== null && ev.venue?.latitude !== undefined ? Number(ev.venue.latitude) : null,
    longitude: ev.venue?.longitude !== null && ev.venue?.longitude !== undefined ? Number(ev.venue.longitude) : null,
    maps_url: ev.actions?.maps_url || ev.venue?.google_maps_url || null,
    price_is_free: ev.price?.is_free,
    price_amount_cents: ev.price?.amount_cents !== undefined ? ev.price.amount_cents : null,
    price_label: ev.price?.label || null,
    canonical_url: canonicalUrl || eventCanonical,
  };
}

/**
 * Formatea fecha y hora reales de un evento en zona horaria Europe/Madrid.
 * Evalúa los instantes reales (start_time y end_time), soportando horario pendiente y periodos de exposiciones.
 */
export function formatEventDateTimeInMadrid(
  startTimeIso: string | null | undefined,
  endTimeIso?: string | null,
  options?: {
    time_status?: 'confirmed' | 'pending_time' | 'tentative_date' | 'continuous';
    editorial_date?: string;
    end_date?: string | null;
  }
): string {
  // 1. Si es una exposición continuada con periodo (time_status === 'continuous' o end_date > editorial_date)
  if (options?.time_status === 'continuous' || (options?.end_date && options?.editorial_date && options.end_date > options.editorial_date)) {
    const parseYmd = (ymd: string) => {
      const [y, m, d] = ymd.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    };
    const monthFormatter = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', month: 'long' });
    const dayFormatter = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric' });

    if (options.editorial_date && options.end_date && options.end_date >= options.editorial_date) {
      const sDate = parseYmd(options.editorial_date);
      const eDate = parseYmd(options.end_date);
      const sMonth = monthFormatter.format(sDate);
      const eMonth = monthFormatter.format(eDate);

      if (sDate.getUTCFullYear() === eDate.getUTCFullYear() && sMonth === eMonth) {
        return `Del ${dayFormatter.format(sDate)} al ${dayFormatter.format(eDate)} de ${sMonth}`;
      }
      return `Del ${dayFormatter.format(sDate)} de ${sMonth} al ${dayFormatter.format(eDate)} de ${eMonth}`;
    }

    if (options.editorial_date) {
      const sDate = parseYmd(options.editorial_date);
      const sMonth = monthFormatter.format(sDate);
      return `Desde el ${dayFormatter.format(sDate)} de ${sMonth}`;
    }
  }

  // 2. Si el horario está pendiente de confirmación o start_time es nulo
  if (options?.time_status === 'pending_time' || !startTimeIso) {
    let dateObj: Date | null = null;
    if (startTimeIso) {
      dateObj = new Date(startTimeIso);
    } else if (options?.editorial_date) {
      const [y, m, d] = options.editorial_date.split('-').map(Number);
      dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }
    if (dateObj && !Number.isNaN(dateObj.getTime())) {
      const dateFormatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      const rawStartDate = dateFormatter.format(dateObj);
      const startDateText = rawStartDate.charAt(0).toUpperCase() + rawStartDate.slice(1);
      return `${startDateText} · Horario por confirmar`;
    }
    return 'Horario por confirmar';
  }

  const startDate = new Date(startTimeIso);
  if (Number.isNaN(startDate.getTime())) return '';

  const dateFormatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const timeFormatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const rawStartDate = dateFormatter.format(startDate);
  const startDateText = rawStartDate.charAt(0).toUpperCase() + rawStartDate.slice(1);
  const startTimeText = timeFormatter.format(startDate);

  if (endTimeIso) {
    const endDate = new Date(endTimeIso);
    if (!Number.isNaN(endDate.getTime())) {
      const rawEndDate = dateFormatter.format(endDate);
      const endDateText = rawEndDate.charAt(0).toUpperCase() + rawEndDate.slice(1);
      const endTimeText = timeFormatter.format(endDate);

      if (rawStartDate === rawEndDate) {
        return `${startDateText} · ${startTimeText} - ${endTimeText} h`;
      }
      return `${startDateText} · ${startTimeText} h - ${endDateText} · ${endTimeText} h`;
    }
  }

  return `${startDateText} · ${startTimeText} h`;
}

/**
 * Formatea el precio confirmado para compartir (sólo si está confirmado).
 * Usa "Gratis", no "Entrada libre". Si no está confirmado o es desconocido, devuelve null.
 */
export function formatConfirmedPrice(source: EventActionSource): string | null {
  if (source.price_is_free === true || source.price_amount_cents === 0) {
    return 'Gratis';
  }
  if (typeof source.price_amount_cents === 'number' && source.price_amount_cents > 0) {
    const euros = (source.price_amount_cents / 100).toFixed(2).replace('.', ',');
    return `${euros} €`;
  }
  return null;
}

/**
 * Genera el mensaje de texto para compartir por WhatsApp conforme a especificaciones:
 * ¿Nos apuntamos a este plan?
 *
 * ${título}
 * 📅 ${fecha} · ${hora} h
 * 📍 ${local}
 * 🎟️ ${precio_confirmado}
 *
 * Más información en VayaPlan:
 * ${url_canónica}
 */
export function buildWhatsAppMessage(source: EventActionSource): string {
  const sections: string[] = [];

  // 1. Invitación
  sections.push('¿Nos apuntamos a este plan?');

  // 2. Ficha editorial
  const detailLines: string[] = [];

  const title = source.status === 'cancelled'
    ? `CANCELADO: ${source.title}`
    : source.title;
  detailLines.push(title.trim());

  const dateTime = formatEventDateTimeInMadrid(source.start_time, source.end_time, {
    time_status: source.time_status,
    editorial_date: source.editorial_date,
    end_date: source.end_date,
  });
  if (dateTime) {
    detailLines.push(`📅 ${dateTime}`);
  }

  if (source.venue_name && source.venue_name.trim().length > 0) {
    detailLines.push(`📍 ${source.venue_name.trim()}`);
  }

  const price = formatConfirmedPrice(source);
  if (price) {
    detailLines.push(`🎟️ ${price}`);
  }

  sections.push(detailLines.join('\n'));

  // 3. Llamada a la acción y enlace canónico
  if (source.canonical_url && source.canonical_url.trim().length > 0) {
    sections.push(`Más información en VayaPlan:\n${source.canonical_url.trim()}`);
  }

  return sections.join('\n\n');
}

/**
 * Genera el cuerpo de texto para el diálogo nativo de compartir (navigator.share)
 * Conserva el mismo criterio editorial sin duplicar innecesariamente la URL en text.
 */
export function buildShareText(source: EventActionSource): string {
  const sections: string[] = [];
  sections.push('¿Nos apuntamos a este plan?');

  const detailLines: string[] = [];
  const title = source.status === 'cancelled'
    ? `CANCELADO: ${source.title}`
    : source.title;
  detailLines.push(title.trim());

  const dateTime = formatEventDateTimeInMadrid(source.start_time, source.end_time, {
    time_status: source.time_status,
    editorial_date: source.editorial_date,
    end_date: source.end_date,
  });
  if (dateTime) {
    detailLines.push(`📅 ${dateTime}`);
  }

  if (source.venue_name && source.venue_name.trim().length > 0) {
    detailLines.push(`📍 ${source.venue_name.trim()}`);
  }

  const price = formatConfirmedPrice(source);
  if (price) {
    detailLines.push(`🎟️ ${price}`);
  }

  sections.push(detailLines.join('\n'));
  return sections.join('\n\n');
}

/**
 * Genera el enlace directo a https://wa.me/?text= con el mensaje codificado
 */
export function buildWhatsAppShareUrl(source: EventActionSource): string {
  const message = buildWhatsAppMessage(source);
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Valida si un par de coordenadas latitud/longitud es geométricamente válido y no nulo/vacío
 */
export function isValidCoordinate(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

/**
 * Valida que una URL externa de mapas utilice protocolos seguros http/https y dominios fiables
 */
export function isValidExternalMapUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();

    // Lista estricta de dominios permitidos para Google Maps y OpenStreetMap
    const strictGoogleHosts = ['maps.google.com', 'maps.app.goo.gl'];
    const pathGoogleHosts = ['www.google.com', 'google.com', 'goo.gl'];
    const osmHosts = ['www.openstreetmap.org', 'openstreetmap.org'];

    if (strictGoogleHosts.includes(host)) {
      return true;
    }
    if (pathGoogleHosts.includes(host)) {
      return parsed.pathname === '/maps' || parsed.pathname.startsWith('/maps/');
    }
    if (osmHosts.includes(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resuelve la URL de "Cómo llegar" conforme a reglas de prioridad:
 * 1. Prioriza coordenadas válidas del local.
 * 2. URL de mapas externa válida existente.
 * 3. Fallback por dirección: usa únicamente venue_address y ciudad si ambos existen.
 * 4. Si la información es insuficiente, devuelve null (no asume ciudad por defecto ni muestra acción engañosa).
 */
export function buildDirectionsUrl(source: {
  latitude?: number | null;
  longitude?: number | null;
  maps_url?: string | null;
  venue_address?: string | null;
  venue_name?: string | null;
  city?: string | null;
}): string | null {
  // 1. Prioriza coordenadas válidas
  if (isValidCoordinate(source.latitude, source.longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${source.latitude},${source.longitude}`;
  }

  // 2. Enlace verificado existente de mapas
  if (isValidExternalMapUrl(source.maps_url)) {
    return source.maps_url!.trim();
  }

  // 3. Fallback por dirección: usa únicamente venue_address y ciudad si ambos existen
  const address = source.venue_address?.trim();
  const city = source.city?.trim();
  if (address && address.length > 0 && city && city.length > 0) {
    const query = `${address}, ${city}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
  }

  return null;
}

/**
 * Estados temporales y de disponibilidad para el calendario (.ics)
 */
export type CalendarState =
  | { status: 'cancelled'; allowed: false; notice: string }
  | { status: 'pending_time'; allowed: false; notice: string }
  | { status: 'exhibition_period'; allowed: false; notice: string }
  | { status: 'invalid_dates'; allowed: false; notice: string }
  | { status: 'finished'; allowed: false; notice: string }
  | { status: 'in_progress'; allowed: true; notice: string }
  | { status: 'started_no_end'; allowed: true; notice: string }
  | { status: 'upcoming'; allowed: true; notice?: null };

/**
 * Determina el estado del evento para la acción de calendario.
 * Diferencia entre end_time ausente (exportable sin DTEND) y fechas inconsistentes o inválidas (error controlado).
 */
export function computeCalendarState(
  source: {
    status: string;
    start_time: string | null;
    end_time: string | null;
    time_status?: 'confirmed' | 'pending_time' | 'tentative_date';
    editorial_date?: string;
    end_date?: string | null;
  },
  now: Date = new Date()
): CalendarState {
  if (source.status === 'cancelled') {
    return {
      status: 'cancelled',
      allowed: false,
      notice: 'Evento cancelado por la organización.',
    };
  }

  // 1. Si el horario está pendiente de confirmación
  if (source.time_status === 'pending_time') {
    return {
      status: 'pending_time',
      allowed: false,
      notice: 'Horario pendiente de confirmación. Consulta esta ficha para comprobar si se ha publicado la hora definitiva.',
    };
  }

  // 2. Si es una exposición continuada (multi-día o time_status continuous)
  if (source.time_status === 'continuous' || (source.end_date && source.editorial_date && source.end_date > source.editorial_date)) {
    return {
      status: 'exhibition_period',
      allowed: false,
      notice: 'Período de exposición continuado. Consulta el horario de visita en el recinto.',
    };
  }

  // 3. Validación de start_time
  if (!source.start_time || typeof source.start_time !== 'string') {
    return {
      status: 'invalid_dates',
      allowed: false,
      notice: 'Horario del evento no disponible para calendario.',
    };
  }
  const start = new Date(source.start_time);
  const startMs = start.getTime();
  if (Number.isNaN(startMs)) {
    return {
      status: 'invalid_dates',
      allowed: false,
      notice: 'Horario del evento no válido para calendario.',
    };
  }

  const nowMs = now.getTime();
  const rawEnd = source.end_time;
  const hasEndTime = rawEnd !== null && rawEnd !== undefined && String(rawEnd).trim().length > 0;

  // 2. Si end_time está presente, validar consistencia (formato válido y estrictamente posterior a start_time)
  if (hasEndTime) {
    const end = new Date(rawEnd!);
    const endMs = end.getTime();
    if (Number.isNaN(endMs) || endMs <= startMs) {
      return {
        status: 'invalid_dates',
        allowed: false,
        notice: 'Horario de finalización no válido para calendario.',
      };
    }

    if (nowMs >= endMs) {
      return {
        status: 'finished',
        allowed: false,
        notice: 'Este evento ya ha finalizado.',
      };
    }
    if (nowMs >= startMs && nowMs < endMs) {
      const timeFormatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return {
        status: 'in_progress',
        allowed: true,
        notice: `Evento en curso (finaliza a las ${timeFormatter.format(end)} h).`,
      };
    }
  } else {
    // 3. end_time ausente: sin DTEND ni duración inventada
    if (nowMs >= startMs) {
      const timeFormatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const dateFormatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      return {
        status: 'started_no_end',
        allowed: true,
        notice: `Evento comenzado el ${dateFormatter.format(start)} a las ${timeFormatter.format(start)} h.`,
      };
    }
  }

  return {
    status: 'upcoming',
    allowed: true,
  };
}

/**
 * Escapa caracteres especiales en valores de texto de iCalendar (RFC 5545).
 * Escapa barras inversas, punto y coma, comas y convierte saltos de línea en \n literal.
 * Esto previene la inyección de propiedades iCalendar mediante saltos de línea.
 */
export function escapeIcsText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Aplica el plegado de líneas (line folding) según RFC 5545 (máximo 75 octetos por línea).
 * Las líneas de continuación comienzan con un espacio en blanco.
 */
export function foldIcsLine(line: string): string {
  const maxOctets = 75;
  const encoder = new TextEncoder();
  const lineBytes = encoder.encode(line);
  if (lineBytes.length <= maxOctets) {
    return line;
  }

  const parts: string[] = [];
  let currentLine = '';
  let currentLength = 0;
  let isFirst = true;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    const limit = isFirst ? maxOctets : maxOctets - 1; // continuación tiene un espacio inicial

    if (currentLength + charBytes > limit) {
      parts.push(currentLine);
      currentLine = ' ' + char;
      currentLength = 1 + charBytes;
      isFirst = false;
    } else {
      currentLine += char;
      currentLength += charBytes;
    }
  }

  if (currentLine.length > 0) {
    parts.push(currentLine);
  }

  return parts.join('\r\n');
}

/**
 * Formatea una fecha en timestamp UTC para iCalendar: YYYYMMDDTHHMMSSZ
 */
export function formatUtcIcs(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const sec = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hour}${min}${sec}Z`;
}

/**
 * Genera el contenido de archivo .ics (RFC 5545) para una sesión concreta de evento.
 */
export function generateIcsCalendar(
  source: EventActionSource,
  options?: { now?: Date }
): string {
  const now = options?.now || new Date();

  // Validación de horario pendiente y periodo de exposiciones
  if (source.time_status === 'pending_time' || !source.start_time) {
    throw new Error('Horario no confirmado: no se puede generar archivo de calendario sin hora definitiva');
  }
  if (source.end_date && source.editorial_date && source.end_date > source.editorial_date) {
    throw new Error('Exposición continuada: no se puede generar un evento de calendario de una sola sesión');
  }

  // Validación estricta de start_time
  if (typeof source.start_time !== 'string') {
    throw new Error('Fecha de inicio no disponible para iCalendar');
  }
  const startDate = new Date(source.start_time);
  const startMs = startDate.getTime();
  if (Number.isNaN(startMs)) {
    throw new Error(`Fecha de inicio inválida para iCalendar: ${source.start_time}`);
  }

  // Validación estricta de end_time si está presente (no enmascara inconsistencias)
  const rawEnd = source.end_time;
  const hasEndTime = rawEnd !== null && rawEnd !== undefined && String(rawEnd).trim().length > 0;
  let endDate: Date | null = null;
  if (hasEndTime) {
    endDate = new Date(rawEnd!);
    const endMs = endDate.getTime();
    if (Number.isNaN(endMs)) {
      throw new Error(`Fecha de finalización inválida para iCalendar: ${rawEnd}`);
    }
    if (endMs <= startMs) {
      throw new Error(`Fecha de finalización inconsistente (no posterior a inicio): ${rawEnd} <= ${source.start_time}`);
    }
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VayaPlan//Agenda Hiperlocal Palencia//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${source.id}@vayaplan.com`,
    `DTSTAMP:${formatUtcIcs(now)}`,
    `DTSTART:${formatUtcIcs(startDate)}`,
  ];

  // DTEND: Sólo si end_time existe y es estrictamente posterior a start_time (ya verificado arriba)
  if (endDate) {
    lines.push(`DTEND:${formatUtcIcs(endDate)}`);
  }

  const titlePrefix = source.status === 'cancelled' ? '[CANCELADO] ' : '';
  lines.push(`SUMMARY:${escapeIcsText(titlePrefix + source.title)}`);

  const locationParts: string[] = [];
  if (source.venue_name) locationParts.push(source.venue_name);
  if (source.venue_address) locationParts.push(source.venue_address);
  locationParts.push(source.city || 'Palencia');
  lines.push(`LOCATION:${escapeIcsText(locationParts.join(', '))}`);

  lines.push(`URL:${escapeIcsText(source.canonical_url)}`);

  const descParts: string[] = [];
  if (source.status === 'cancelled') {
    descParts.push('AVISO: Evento cancelado por la organización.');
  }
  const price = formatConfirmedPrice(source);
  if (price) {
    descParts.push(`Precio: ${price}`);
  }
  descParts.push(`Más información y estado actualizado en: ${source.canonical_url}`);
  lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\\n'))}`);

  if (source.status === 'cancelled') {
    lines.push('STATUS:CANCELLED');
  } else {
    lines.push('STATUS:CONFIRMED');
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  const folded = lines.map(foldIcsLine).join('\r\n') + '\r\n';
  return folded;
}

/**
 * Escapa HTML para inyección segura en strings
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renderiza el botón único "Cómo llegar ↗" asociado visualmente al bloque del local
 */
export function renderVenueDirectionsHtml(source: EventActionSource): string {
  const directionsUrl = buildDirectionsUrl(source);
  if (!directionsUrl) return '';

  return `
    <a href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener noreferrer" class="btn-directions-link" data-action="directions-click" data-metric="map_click" data-event-id="${source.id}" aria-label="Cómo llegar a ${escapeHtml(source.venue_name || 'destino')}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.71 11.29l-9-9a.996.996 0 0 0-1.41 0l-9 9a.996.996 0 0 0 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 0 0 0-1.41zm-8.71 6.29V14h-4v-4h4V6.41L17.59 11 13 15.58z"/></svg>
      <span>Cómo llegar ↗</span>
    </a>
  `.trim();
}

/**
 * Genera el marcado HTML accesible de la cuadrícula 2x2 para Compartir y Guardar
 */
export function renderEventActionsHtml(source: EventActionSource, now: Date = new Date()): string {
  const isCancelled = source.status === 'cancelled';
  const waUrl = buildWhatsAppShareUrl(source);
  const calState = computeCalendarState(source, now);
  const shareTitle = isCancelled ? `[CANCELADO] ${source.title}` : source.title;

  return `
    <div class="event-actions-section" aria-label="Compartir y guardar evento">
      <div class="event-actions-header">
        <span class="event-actions-title">Compartir y guardar</span>
      </div>

      <div class="event-actions-grid">
        <!-- 1. WhatsApp -->
        <a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer" class="event-action-btn btn-whatsapp" data-action="whatsapp-share" data-event-id="${source.id}" aria-label="Compartir evento por WhatsApp">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.06c-1.5 0-2.97-.4-4.26-1.16l-.31-.18-3.16.83.84-3.08-.2-.32a8.08 8.08 0 0 1-1.24-4.24c0-4.46 3.63-8.09 8.09-8.09 2.16 0 4.19.84 5.72 2.37 1.53 1.53 2.37 3.56 2.37 5.72 0 4.46-3.63 8.09-8.09 8.09zm4.44-6.07c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.17.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.28.37-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.41-.41-.56-.42-.14-.01-.31-.01-.48-.01-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.23.89 2.42 1.02 2.58.12.16 1.76 2.69 4.27 3.77.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z"/></svg>
          <span class="action-btn-text">WhatsApp</span>
        </a>

        <!-- 2. Compartir -->
        <button type="button" class="event-action-btn btn-share" data-action="share-event" data-url="${escapeHtml(source.canonical_url)}" data-title="${escapeHtml(shareTitle)}" data-text="${escapeHtml(buildShareText(source))}" data-event-id="${source.id}" aria-label="Compartir evento">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          <span class="action-btn-text">Compartir</span>
        </button>

        <!-- 3. Copiar enlace -->
        <button type="button" class="event-action-btn btn-copy" data-action="copy-event-link" data-url="${escapeHtml(source.canonical_url)}" data-event-id="${source.id}" aria-label="Copiar enlace del evento">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          <span class="action-btn-text">Copiar enlace</span>
        </button>

        <!-- 4. Añadir al calendario (.ics) -->
        ${calState.allowed ? `
          <a href="/events/${source.id}/calendar.ics" download="evento-${source.id}.ics" class="event-action-btn btn-calendar" data-action="calendar-download" data-event-id="${source.id}" aria-label="Añadir evento al calendario">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
            <span class="action-btn-text">Calendario</span>
          </a>
        ` : `
          <button type="button" class="event-action-btn btn-calendar is-disabled" disabled aria-disabled="true" title="${escapeHtml(calState.notice)}" aria-label="Calendario no disponible: ${escapeHtml(calState.notice)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
            <span class="action-btn-text">Calendario</span>
          </button>
        `}
      </div>

      <!-- Aviso explicativo si el calendario o estado temporal tiene observación -->
      ${calState.notice ? `
        <div class="action-temporal-note" role="status">
          <svg style="width:14px;height:14px;fill:currentColor;flex-shrink:0;" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/></svg>
          <span>${escapeHtml(calState.notice)}</span>
        </div>
      ` : ''}

      <!-- Región accesible para anuncios de copia -->
      <div id="actions-live-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>

      <!-- Contenedor para enlace seleccionable manual si el portapapeles falla -->
      <div id="actions-copy-fallback" class="actions-copy-fallback" style="display:none;" aria-hidden="true"></div>
    </div>
  `;
}

/**
 * CSS acotado para las acciones de evento
 */
export function getEventActionsStyles(): string {
  return `
    .event-actions-section {
      margin: 1.25rem 0;
      padding: 0.875rem 1rem;
      background: var(--color-bg-subtle, #F8FAFC);
      border: 1px solid var(--color-border, #E2E8F0);
      border-radius: var(--radius-md, 8px);
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .event-actions-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .event-actions-title {
      font-size: 0.75rem;
      font-weight: 800;
      color: var(--color-text-muted, #64748B);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .event-actions-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
    }

    .event-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      padding: 0.6rem 0.75rem;
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--color-night, #0B0F3B);
      background: #FFFFFF;
      border: 1px solid var(--color-border, #E2E8F0);
      border-radius: var(--radius-md, 8px);
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      min-height: 44px;
      box-sizing: border-box;
      text-align: center;
      user-select: none;
      touch-action: manipulation;
    }

    .event-action-btn:hover:not([disabled]):not(.is-disabled) {
      background: var(--color-primary-soft, #F0EBFF);
      border-color: var(--color-primary-light, #9D7BFF);
      color: var(--color-primary, #6C3BFF);
    }

    .event-action-btn:focus-visible {
      outline: 2px solid var(--color-primary, #6C3BFF);
      outline-offset: 2px;
    }

    .event-action-btn[disabled],
    .event-action-btn.is-disabled {
      opacity: 0.55;
      cursor: not-allowed;
      background: #F1F5F9;
      color: #94A3B8;
      border-color: #E2E8F0;
    }

    .event-action-btn svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      fill: currentColor;
    }

    .event-action-btn.btn-whatsapp {
      color: #047857;
      border-color: #A7F3D0;
      background: #F0FDF4;
    }
    .event-action-btn.btn-whatsapp:hover:not([disabled]) {
      background: #DCFCE7;
      border-color: #6EE7B7;
    }

    .event-action-btn.copy-success {
      background: #F0FDF4;
      color: #047857;
      border-color: #86EFAC;
    }

    .action-temporal-note {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748B);
      line-height: 1.4;
      margin-top: 0.2rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .actions-copy-fallback {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #FFFFFF;
      border: 1px solid var(--color-border, #E2E8F0);
      border-radius: 6px;
      font-size: 0.8125rem;
    }

    .actions-copy-fallback input {
      width: 100%;
      padding: 0.4rem 0.5rem;
      border: 1px solid var(--color-border, #E2E8F0);
      border-radius: 4px;
      font-size: 0.8125rem;
      box-sizing: border-box;
      margin-top: 0.25rem;
    }
  `;
}

/**
 * Script cliente para gestionar las interacciones de Compartir y Copiar enlace
 */
export function getEventActionsClientScript(): string {
  return `
    function extractEventActionSource(ev, canonicalUrl) {
      const origin = (window.location && window.location.origin) ? window.location.origin : 'https://vayaplan.com';
      const eventCanonical = (ev && ev.id) ? (origin + '/events/' + ev.id) : '';
      return {
        id: ev.id,
        title: ev.title,
        status: ev.status,
        start_time: ev.start_time,
        end_time: ev.end_time || null,
        time_status: ev.time_status,
        editorial_date: ev.editorial_date,
        end_date: ev.end_date || null,
        schedule_text: ev.schedule_text || null,
        approximate_schedule: ev.approximate_schedule || null,
        venue_name: ev.venue ? ev.venue.name : '',
        venue_address: ev.venue ? ev.venue.address : null,
        city: ev.venue ? ev.venue.city : null,
        latitude: ev.venue && ev.venue.latitude !== null && ev.venue.latitude !== undefined ? Number(ev.venue.latitude) : null,
        longitude: ev.venue && ev.venue.longitude !== null && ev.venue.longitude !== undefined ? Number(ev.venue.longitude) : null,
        maps_url: ev.actions ? ev.actions.maps_url : (ev.venue ? ev.venue.google_maps_url : null),
        price_is_free: ev.price ? ev.price.is_free : false,
        price_amount_cents: ev.price && ev.price.amount_cents !== undefined ? ev.price.amount_cents : null,
        price_label: ev.price ? ev.price.label : null,
        canonical_url: canonicalUrl || eventCanonical,
      };
    }

    function formatEventDateTimeInMadrid(startTimeIso, endTimeIso, options) {
      if (options && options.end_date && options.editorial_date && options.end_date > options.editorial_date) {
        var parseYmd = function(ymd) {
          var p = ymd.split('-').map(Number);
          return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0));
        };
        var sDate = parseYmd(options.editorial_date);
        var eDate = parseYmd(options.end_date);
        var monthFormatter = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', month: 'long' });
        var dayFormatter = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric' });
        var sMonth = monthFormatter.format(sDate);
        var eMonth = monthFormatter.format(eDate);

        if (sDate.getUTCFullYear() === eDate.getUTCFullYear() && sMonth === eMonth) {
          return 'Del ' + dayFormatter.format(sDate) + ' al ' + dayFormatter.format(eDate) + ' de ' + sMonth;
        }
        return 'Del ' + dayFormatter.format(sDate) + ' de ' + sMonth + ' al ' + dayFormatter.format(eDate) + ' de ' + eMonth;
      }

      if ((options && options.time_status === 'pending_time') || !startTimeIso) {
        var dateObj = null;
        if (startTimeIso) {
          dateObj = new Date(startTimeIso);
        } else if (options && options.editorial_date) {
          var p2 = options.editorial_date.split('-').map(Number);
          dateObj = new Date(Date.UTC(p2[0], p2[1] - 1, p2[2], 12, 0, 0));
        }
        if (dateObj && !Number.isNaN(dateObj.getTime())) {
          var dateFormatter = new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          var rawStartDate = dateFormatter.format(dateObj);
          var startDateText = rawStartDate.charAt(0).toUpperCase() + rawStartDate.slice(1);
          return startDateText + ' · Horario por confirmar';
        }
        return 'Horario por confirmar';
      }

      var startDate = new Date(startTimeIso);
      if (Number.isNaN(startDate.getTime())) return '';

      var dateFormatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });

      var timeFormatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      var rawStartDate = dateFormatter.format(startDate);
      var startDateText = rawStartDate.charAt(0).toUpperCase() + rawStartDate.slice(1);
      var startTimeText = timeFormatter.format(startDate);

      if (endTimeIso) {
        var endDate = new Date(endTimeIso);
        if (!Number.isNaN(endDate.getTime())) {
          var rawEndDate = dateFormatter.format(endDate);
          var endDateText = rawEndDate.charAt(0).toUpperCase() + rawEndDate.slice(1);
          var endTimeText = timeFormatter.format(endDate);

          if (rawStartDate === rawEndDate) {
            return startDateText + ' · ' + startTimeText + ' - ' + endTimeText + ' h';
          }
          return startDateText + ' · ' + startTimeText + ' h - ' + endDateText + ' · ' + endTimeText + ' h';
        }
      }

      return startDateText + ' · ' + startTimeText + ' h';
    }

    function formatConfirmedPrice(source) {
      if (source.price_is_free === true || source.price_amount_cents === 0) {
        return 'Gratis';
      }
      if (typeof source.price_amount_cents === 'number' && source.price_amount_cents > 0) {
        const euros = (source.price_amount_cents / 100).toFixed(2).replace('.', ',');
        return euros + ' €';
      }
      return null;
    }

    function buildWhatsAppMessage(source) {
      const sections = [];
      sections.push('¿Nos apuntamos a este plan?');

      const detailLines = [];
      const title = source.status === 'cancelled'
        ? ('CANCELADO: ' + source.title)
        : source.title;
      detailLines.push(title.trim());

      const dateTime = formatEventDateTimeInMadrid(source.start_time, source.end_time, {
        time_status: source.time_status,
        editorial_date: source.editorial_date,
        end_date: source.end_date,
      });
      if (dateTime) detailLines.push('📅 ' + dateTime);

      if (source.venue_name && source.venue_name.trim().length > 0) {
        detailLines.push('📍 ' + source.venue_name.trim());
      }

      const price = formatConfirmedPrice(source);
      if (price) detailLines.push('🎟️ ' + price);

      sections.push(detailLines.join('\\n'));

      if (source.canonical_url && source.canonical_url.trim().length > 0) {
        sections.push('Más información en VayaPlan:\\n' + source.canonical_url.trim());
      }

      return sections.join('\\n\\n');
    }

    function buildShareText(source) {
      const sections = [];
      sections.push('¿Nos apuntamos a este plan?');

      const detailLines = [];
      const title = source.status === 'cancelled'
        ? ('CANCELADO: ' + source.title)
        : source.title;
      detailLines.push(title.trim());

      const dateTime = formatEventDateTimeInMadrid(source.start_time, source.end_time, {
        time_status: source.time_status,
        editorial_date: source.editorial_date,
        end_date: source.end_date,
      });
      if (dateTime) detailLines.push('📅 ' + dateTime);

      if (source.venue_name && source.venue_name.trim().length > 0) {
        detailLines.push('📍 ' + source.venue_name.trim());
      }

      const price = formatConfirmedPrice(source);
      if (price) detailLines.push('🎟️ ' + price);

      sections.push(detailLines.join('\\n'));
      return sections.join('\\n\\n');
    }

    function buildWhatsAppShareUrl(source) {
      const message = buildWhatsAppMessage(source);
      return 'https://wa.me/?text=' + encodeURIComponent(message);
    }

    function isValidCoordinate(lat, lon) {
      if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
      if (typeof lat !== 'number' || typeof lon !== 'number') return false;
      if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
      if (lat === 0 && lon === 0) return false;
      return true;
    }

    function isValidExternalMapUrl(url) {
      if (!url || typeof url !== 'string') return false;
      const trimmed = url.trim();
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        const host = parsed.hostname.toLowerCase();
        const strictGoogleHosts = ['maps.google.com', 'maps.app.goo.gl'];
        const pathGoogleHosts = ['www.google.com', 'google.com', 'goo.gl'];
        const osmHosts = ['www.openstreetmap.org', 'openstreetmap.org'];

        if (strictGoogleHosts.indexOf(host) !== -1) {
          return true;
        }
        if (pathGoogleHosts.indexOf(host) !== -1) {
          return parsed.pathname === '/maps' || parsed.pathname.indexOf('/maps/') === 0;
        }
        if (osmHosts.indexOf(host) !== -1) {
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    }

    function buildDirectionsUrl(source) {
      if (isValidCoordinate(source.latitude, source.longitude)) {
        return 'https://www.google.com/maps/dir/?api=1&destination=' + source.latitude + ',' + source.longitude;
      }
      if (isValidExternalMapUrl(source.maps_url)) {
        return source.maps_url.trim();
      }
      const address = source.venue_address ? source.venue_address.trim() : '';
      const city = source.city ? source.city.trim() : '';
      if (address && address.length > 0 && city && city.length > 0) {
        return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address + ', ' + city);
      }
      return null;
    }

    function computeCalendarState(source, now) {
      const nowDate = now || new Date();
      if (source.status === 'cancelled') {
        return {
          status: 'cancelled',
          allowed: false,
          notice: 'Evento cancelado por la organización.',
        };
      }

      if (source.time_status === 'pending_time') {
        return {
          status: 'pending_time',
          allowed: false,
          notice: 'Horario pendiente de confirmación. Consulta esta ficha para comprobar si se ha publicado la hora definitiva.',
        };
      }

      if (source.time_status === 'continuous' || (source.end_date && source.editorial_date && source.end_date > source.editorial_date)) {
        return {
          status: 'exhibition_period',
          allowed: false,
          notice: 'Período de exposición continuado. Consulta el horario de visita en el recinto.',
        };
      }

      if (!source.start_time || typeof source.start_time !== 'string') {
        return {
          status: 'invalid_dates',
          allowed: false,
          notice: 'Horario del evento no disponible para calendario.',
        };
      }
      const start = new Date(source.start_time);
      const startMs = start.getTime();
      if (Number.isNaN(startMs)) {
        return {
          status: 'invalid_dates',
          allowed: false,
          notice: 'Horario del evento no válido para calendario.',
        };
      }

      const nowMs = nowDate.getTime();
      const rawEnd = source.end_time;
      const hasEndTime = rawEnd !== null && rawEnd !== undefined && String(rawEnd).trim().length > 0;

      if (hasEndTime) {
        const end = new Date(rawEnd);
        const endMs = end.getTime();
        if (Number.isNaN(endMs) || endMs <= startMs) {
          return {
            status: 'invalid_dates',
            allowed: false,
            notice: 'Horario de finalización no válido para calendario.',
          };
        }

        if (nowMs >= endMs) {
          return {
            status: 'finished',
            allowed: false,
            notice: 'Este evento ya ha finalizado.',
          };
        }
        if (nowMs >= startMs && nowMs < endMs) {
          const timeFormatter = new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          return {
            status: 'in_progress',
            allowed: true,
            notice: 'Evento en curso (finaliza a las ' + timeFormatter.format(end) + ' h).',
          };
        }
      } else {
        if (nowMs >= startMs) {
          const timeFormatter = new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const dateFormatter = new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          return {
            status: 'started_no_end',
            allowed: true,
            notice: 'Evento comenzado el ' + dateFormatter.format(start) + ' a las ' + timeFormatter.format(start) + ' h.',
          };
        }
      }

      return {
        status: 'upcoming',
        allowed: true,
      };
    }

    function renderVenueDirectionsHtml(source) {
      const directionsUrl = buildDirectionsUrl(source);
      if (!directionsUrl) return '';
      return '<a href="' + escapeHtml(directionsUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-directions-link" data-action="directions-click" data-metric="map_click" data-event-id="' + source.id + '" aria-label="Cómo llegar a ' + escapeHtml(source.venue_name || 'destino') + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.71 11.29l-9-9a.996.996 0 0 0-1.41 0l-9 9a.996.996 0 0 0 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 0 0 0-1.41zm-8.71 6.29V14h-4v-4h4V6.41L17.59 11 13 15.58z"/></svg>' +
        '<span>Cómo llegar ↗</span>' +
        '</a>';
    }

    function renderEventActionsHtml(source, now) {
      const isCancelled = source.status === 'cancelled';
      const waUrl = buildWhatsAppShareUrl(source);
      const calState = computeCalendarState(source, now);
      const shareTitle = isCancelled ? ('[CANCELADO] ' + source.title) : source.title;

      let calHtml = '';
      if (calState.allowed) {
        calHtml = '<a href="/events/' + source.id + '/calendar.ics" download="evento-' + source.id + '.ics" class="event-action-btn btn-calendar" data-action="calendar-download" data-event-id="' + source.id + '" aria-label="Añadir evento al calendario">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>' +
          '<span class="action-btn-text">Calendario</span>' +
          '</a>';
      } else {
        calHtml = '<button type="button" class="event-action-btn btn-calendar is-disabled" disabled aria-disabled="true" title="' + escapeHtml(calState.notice) + '" aria-label="Calendario no disponible: ' + escapeHtml(calState.notice) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>' +
          '<span class="action-btn-text">Calendario</span>' +
          '</button>';
      }

      let noticeHtml = '';
      if (calState.notice) {
        noticeHtml = '<div class="action-temporal-note" role="status">' +
          '<svg style="width:14px;height:14px;fill:currentColor;flex-shrink:0;" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/></svg>' +
          '<span>' + escapeHtml(calState.notice) + '</span>' +
          '</div>';
      }

      return '<div class="event-actions-section" aria-label="Compartir y guardar evento">' +
        '<div class="event-actions-header">' +
          '<span class="event-actions-title">Compartir y guardar</span>' +
        '</div>' +
        '<div class="event-actions-grid">' +
          '<a href="' + escapeHtml(waUrl) + '" target="_blank" rel="noopener noreferrer" class="event-action-btn btn-whatsapp" data-action="whatsapp-share" data-event-id="' + source.id + '" aria-label="Compartir evento por WhatsApp">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.06c-1.5 0-2.97-.4-4.26-1.16l-.31-.18-3.16.83.84-3.08-.2-.32a8.08 8.08 0 0 1-1.24-4.24c0-4.46 3.63-8.09 8.09-8.09 2.16 0 4.19.84 5.72 2.37 1.53 1.53 2.37 3.56 2.37 5.72 0 4.46-3.63 8.09-8.09 8.09zm4.44-6.07c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.17.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.28.37-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.41-.41-.56-.42-.14-.01-.31-.01-.48-.01-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.23.89 2.42 1.02 2.58.12.16 1.76 2.69 4.27 3.77.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z"/></svg>' +
            '<span class="action-btn-text">WhatsApp</span>' +
          '</a>' +
          '<button type="button" class="event-action-btn btn-share" data-action="share-event" data-metric="share_click" data-url="' + escapeHtml(source.canonical_url) + '" data-title="' + escapeHtml(shareTitle) + '" data-text="' + escapeHtml(buildShareText(source)) + '" data-event-id="' + source.id + '" aria-label="Compartir evento">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>' +
            '<span class="action-btn-text">Compartir</span>' +
          '</button>' +
          '<button type="button" class="event-action-btn btn-copy" data-action="copy-event-link" data-url="' + escapeHtml(source.canonical_url) + '" data-event-id="' + source.id + '" aria-label="Copiar enlace del evento">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>' +
            '<span class="action-btn-text">Copiar enlace</span>' +
          '</button>' +
          calHtml +
        '</div>' +
        noticeHtml +
        '<div id="actions-live-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>' +
        '<div id="actions-copy-fallback" class="actions-copy-fallback" style="display:none;" aria-hidden="true"></div>' +
      '</div>';
    }
    // Gestor de copia de enlace y fallback accesible
    async function executeEventLinkCopy(url, triggerBtn) {
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
      } catch (err) {
        copied = false;
      }

      if (!copied) {
        try {
          const textArea = document.createElement('textarea');
          textArea.value = url;
          textArea.setAttribute('readonly', '');
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          textArea.style.top = '-9999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textArea);
        } catch (e) {
          copied = false;
        }
      }

      const announcer = document.getElementById('actions-live-announcer');
      const fallbackContainer = document.getElementById('actions-copy-fallback');

      if (copied) {
        if (triggerBtn) {
          const textEl = triggerBtn.querySelector('.action-btn-text');
          const originalText = textEl ? textEl.textContent : triggerBtn.textContent;
          if (textEl) textEl.textContent = '¡Enlace copiado!';
          triggerBtn.classList.add('copy-success');
          setTimeout(() => {
            if (textEl) textEl.textContent = originalText;
            triggerBtn.classList.remove('copy-success');
          }, 2500);
        }
        if (announcer) {
          announcer.textContent = 'Enlace copiado al portapapeles con éxito.';
        }
        if (fallbackContainer) {
          fallbackContainer.style.display = 'none';
          fallbackContainer.innerHTML = '';
        }
      } else {
        if (fallbackContainer) {
          fallbackContainer.style.display = 'block';
          fallbackContainer.innerHTML = '<div style="margin-bottom:0.25rem;font-weight:600;">Copia el enlace manualmente:</div>' +
            '<input type="text" readonly value="' + url.replace(/"/g, '&quot;') + '" onclick="this.select()" aria-label="Enlace del evento">';
          const inp = fallbackContainer.querySelector('input');
          if (inp) inp.select();
        }
        if (announcer) {
          announcer.textContent = 'Selecciona y copia el enlace en pantalla.';
        }
      }
    }

    // Gestor de Compartir con fallback y captura de AbortError
    async function executeEventShare(url, title, text, triggerBtn) {
      if (typeof text === 'object' && !triggerBtn) {
        triggerBtn = text;
        text = undefined;
      }
      if (navigator.share) {
        try {
          await navigator.share({
            title: title || document.title,
            text: text || title || document.title,
            url: url,
          });
          // Éxito: no necesita más acciones
          return;
        } catch (err) {
          // Cancelación explícita del usuario: no mostrar error ni lanzar copia
          if (err && (err.name === 'AbortError' || err.code === 20)) {
            return;
          }
          // Si el share falló por otra causa, fallback a copiar enlace
          await executeEventLinkCopy(url, triggerBtn);
        }
      } else {
        // navigator.share no disponible: fallback a copiar enlace
        await executeEventLinkCopy(url, triggerBtn);
      }
    }

    window.extractEventActionSource = extractEventActionSource;
    window.renderEventActionsHtml = renderEventActionsHtml;
    window.renderVenueDirectionsHtml = renderVenueDirectionsHtml;
    window.executeEventLinkCopy = executeEventLinkCopy;
    window.executeEventShare = executeEventShare;
  `;
}
