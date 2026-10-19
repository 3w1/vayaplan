import type { JcylRecordRaw, NormalizedJcylEvent } from './jcyl-types';

/**
 * Sanitiza texto HTML eliminando etiquetas y decodificando entidades comunes
 */
export function sanitizeHtml(htmlStr?: string | null): string | null {
  if (!htmlStr || typeof htmlStr !== 'string') return null;

  let text = htmlStr;

  // Reemplazar saltos de línea y párrafos antes de eliminar etiquetas
  text = text.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n');
  text = text.replace(/<br\s*[\/]?>/gi, '\n');

  // Eliminar todas las etiquetas HTML restantes
  text = text.replace(/<[^>]+>/g, ' ');

  // Decodificar entidades HTML comunes en español
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&iquest;': '¿',
    '&iexcl;': '¡',
    '&aacute;': 'á',
    '&eacute;': 'é',
    '&iacute;': 'í',
    '&oacute;': 'ó',
    '&uacute;': 'ú',
    '&ntilde;': 'ñ',
    '&Aacute;': 'Á',
    '&Eacute;': 'É',
    '&Iacute;': 'Í',
    '&Oacute;': 'Ó',
    '&Uacute;': 'Ú',
    '&Ntilde;': 'Ñ',
    '&euro;': '€',
  };

  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.split(entity).join(replacement);
  }

  // Decodificar entidades numéricas &#NNN;
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Normalizar espacios y saltos de línea consecutivos
  text = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n\n');

  return text.trim().length > 0 ? text.trim() : null;
}

/**
 * Parsea y normaliza cadenas de hora heterogéneas procedentes de JCyL
 * Ejemplos de entrada: "19:00h.", "19:00 h.", "20:30", "12.00", null
 */
export function normalizeJcylTime(
  rawTime?: string | null,
  dateStr?: string
): { timeStatus: 'confirmed' | 'pending_time'; startTimeIso: string | null } {
  if (!rawTime || typeof rawTime !== 'string' || !dateStr) {
    return { timeStatus: 'pending_time', startTimeIso: null };
  }

  const match = rawTime.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) {
    return { timeStatus: 'pending_time', startTimeIso: null };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return { timeStatus: 'pending_time', startTimeIso: null };
  }

  const padH = String(hours).padStart(2, '0');
  const padM = String(minutes).padStart(2, '0');

  // En la península española (Europe/Madrid) el desfase es +01:00 (CET) o +02:00 (CEST)
  // Determinamos el offset dinámicamente según la fecha
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  const month = testDate.getUTCMonth(); // 0=Ene ... 9=Oct, 10=Nov
  // Verano (CEST, UTC+2): de último domingo de marzo a último domingo de octubre
  // Invierno (CET, UTC+1): de noviembre a febrero
  const isSummer = month >= 3 && month <= 9;
  const offsetStr = isSummer ? '+02:00' : '+01:00';

  const iso = new Date(`${dateStr}T${padH}:${padM}:00${offsetStr}`).toISOString();
  return { timeStatus: 'confirmed', startTimeIso: iso };
}

/**
 * Normaliza precios de texto libre sin asumir gratuidad si no consta
 */
export function normalizeJcylPrice(rawPrice?: string | null): {
  isFree: boolean;
  priceCents: number;
  priceKnown: boolean;
  rawPrice: string | null;
} {
  if (!rawPrice || typeof rawPrice !== 'string' || rawPrice.trim().length === 0) {
    return {
      isFree: false,
      priceCents: 0,
      priceKnown: false,
      rawPrice: null,
    };
  }

  const text = rawPrice.trim().toLowerCase();

  if (text.includes('gratuito') || text.includes('gratis') || text.includes('entrada libre')) {
    return {
      isFree: true,
      priceCents: 0,
      priceKnown: true,
      rawPrice: 'Gratuito',
    };
  }

  // Buscar número con euros (ej. "20 euros", "15,50 €", "12 €")
  const match = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)/i);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    if (!Number.isNaN(num) && num >= 0) {
      return {
        isFree: num === 0,
        priceCents: Math.round(num * 100),
        priceKnown: true,
        rawPrice: rawPrice.trim(),
      };
    }
  }

  return {
    isFree: false,
    priceCents: 0,
    priceKnown: false,
    rawPrice: rawPrice.trim(),
  };
}

/**
 * Determina la categoría del evento en VayaPlan según los datos de JCyL
 */
export function mapJcylCategory(record: JcylRecordRaw): 'musica_directo' | 'cine' | 'teatro' | 'exposicion' | 'cultura' | 'conferencia' {
  const combined = [
    record.categoria || '',
    record.tematica || '',
    record.tipo_evento || '',
    record.titulo || record.nombre_evento || '',
  ].join(' ').toLowerCase();

  if (combined.includes('teatro') || combined.includes('dramaturgia') || combined.includes('escénic')) {
    return 'teatro';
  }
  if (combined.includes('exposici') || combined.includes('muestra de arte')) {
    return 'exposicion';
  }
  if (combined.includes('cine') || combined.includes('cortometraje') || combined.includes('audiovisual')) {
    return 'cine';
  }
  if (
    combined.includes('conferencia') ||
    combined.includes('charla') ||
    combined.includes('coloquio') ||
    combined.includes('mesa redonda') ||
    combined.includes('debate') ||
    combined.includes('presentación')
  ) {
    return 'conferencia';
  }
  if (combined.includes('música') || combined.includes('concierto') || combined.includes('recital')) {
    return 'musica_directo';
  }

  return 'cultura';
}

/**
 * Normaliza un registro en bruto de la API de JCyL al modelo de VayaPlan
 */
export function normalizeJcylRecord(record: JcylRecordRaw): NormalizedJcylEvent {
  const warnings: string[] = [];

  const rawTitle = record.titulo || record.nombre_evento || '';
  const title = sanitizeHtml(rawTitle) || 'Actividad sin título';

  if (!rawTitle.trim()) {
    warnings.push('Título ausente en el registro de origen');
  }

  const description = sanitizeHtml(record.descripcion);
  const category = mapJcylCategory(record);

  const editorialDate = record.fecha_inicio;
  const isRange = Boolean(record.fecha_fin && record.fecha_fin !== record.fecha_inicio);
  const endDate = isRange ? record.fecha_fin! : null;

  const normalizedTime = normalizeJcylTime(record.hora_inicio, editorialDate);
  let timeStatus: 'confirmed' | 'pending_time' | 'continuous' = normalizedTime.timeStatus;
  let startTimeIso = normalizedTime.startTimeIso;

  if (category === 'exposicion' && isRange) {
    timeStatus = 'continuous';
    startTimeIso = null;
  } else if (timeStatus === 'pending_time') {
    warnings.push('Hora de inicio no confirmada o no parseable');
  }

  const { isFree, priceCents, priceKnown, rawPrice } = normalizeJcylPrice(record.precio);
  if (!priceKnown) {
    warnings.push('Precio no especificado en la fuente');
  }

  // Filtrado geográfico y de recinto estricto: Palencia capital y Biblioteca Pública de Palencia
  const isPalenciaLocalidad = (record.nombre_localidad || '').trim().toLowerCase() === 'palencia';
  const isLibraryVenue = Boolean(
    record.codigo_biblioteca === 'BPPAL' ||
    record.evento_biblioteca === 'SI' ||
    ((record.lugar_celebracion || '').toLowerCase().includes('biblioteca p') &&
     !(record.lugar_celebracion || '').toLowerCase().includes('teatro'))
  );

  const isLibrary = isPalenciaLocalidad && isLibraryVenue;

  if (!isPalenciaLocalidad) {
    warnings.push(`Localidad no admitida (${record.nombre_localidad || 'desconocida'}); conector acotado a Palencia capital`);
  }
  if (!isLibraryVenue) {
    warnings.push(`Recinto no admitido (${record.lugar_celebracion || 'desconocido'}); conector acotado a Biblioteca Pública`);
  }

  return {
    externalId: record.id_evento,
    dedupeKey: `jcyl:${record.id_evento}`,
    title,
    description,
    category,
    timeStatus,
    startTimeIso,
    endTimeIso: null,
    editorialDate,
    endDate,
    scheduleText: isRange && record.hora_inicio ? `Horario: ${record.hora_inicio}` : null,
    priceCents,
    isFree,
    priceKnown,
    rawPrice,
    sourceUrl: record.enlace_contenido || null,
    venueName: record.lugar_celebracion?.trim() || 'Biblioteca Pública de Palencia',
    venueAddress: record.calle?.trim() || 'C/ Eduardo Dato, 4',
    latitude: typeof record.latitud === 'number' ? record.latitud : null,
    longitude: typeof record.longitud === 'number' ? record.longitud : null,
    isLibrary,
    attribution: 'Fuente de los datos: Junta de Castilla y León',
    warnings,
  };
}
