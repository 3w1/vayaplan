import type {
  RawTheaterSearchItem,
  RawTheaterDetail,
  TheaterCategory,
} from './theater-types';

/**
 * Descodifica entidades HTML comunes
 */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&euro;/g, '€')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#45;/g, '-')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Ntilde;/g, 'Ñ');
}

/**
 * Parsea el HTML del listado de búsqueda del Teatro Principal
 */
export function parseSearchPageHtml(html: string): RawTheaterSearchItem[] {
  const items: RawTheaterSearchItem[] = [];

  // Dividir por tarjetas de producto
  const cards = html.split('<div class="para-sombra">');

  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];

    // 1. Título
    const titleMatch = card.match(/<h2 class="titulo font-bold">(.*?)<\/h2>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1].trim());

    // 2. Enlace de compra y fecha (de la URL /entradas/<slug>/<fecha>)
    const ticketMatch = card.match(
      /href="\s*(https:\/\/teatroprincipaldepalencia\.es\/es\/entradas\/([^\/\s"]+)\/([0-9]{4}-[0-9]{2}-[0-9]{2}))\s*"/
    );

    let rawDate: string | null = null;
    let slug: string | null = null;
    let ticketsUrl: string | null = null;

    if (ticketMatch) {
      ticketsUrl = ticketMatch[1].trim();
      slug = ticketMatch[2].trim();
      rawDate = ticketMatch[3].trim();
    } else {
      // Intentar extraer slug del enlace de más info
      const infoMatch = card.match(
        /href="\s*(https:\/\/teatroprincipaldepalencia\.es\/es\/productos\/descripcion\/([^\/\s"]+))\s*"/
      );
      if (infoMatch) {
        slug = infoMatch[2].trim();
      }
    }

    if (!slug) {
      // Slug derivado del título si no se encuentra enlace
      slug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }

    // 3. Enlace de detalle
    const detailUrl = `https://teatroprincipaldepalencia.es/es/productos/descripcion/${encodeURIComponent(slug)}`;
    if (!ticketsUrl && rawDate) {
      ticketsUrl = `https://teatroprincipaldepalencia.es/es/entradas/${encodeURIComponent(slug)}/${rawDate}`;
    }

    // 4. Imagen oficial (del CDN de TenemosPlan)
    const imgMatch = card.match(/data-src="\s*([^"\s]+)\s*"/);
    const imageUrl = imgMatch ? imgMatch[1].trim() : null;

    // 5. Precio base "Desde X€"
    let basePrice: number | null = null;
    const desdeMatch = card.match(
      /<span class="texto-desde">Desde<\/span>\s*<span class="font-bold">([0-9]+)&euro;<\/span>/
    );
    if (desdeMatch) {
      basePrice = parseFloat(desdeMatch[1]);
    }

    items.push({
      title,
      slug,
      rawDate: rawDate || '2026-12-31', // Fallback si no tiene fecha de función fija
      detailUrl,
      ticketsUrl: ticketsUrl || detailUrl,
      imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
      basePrice,
    });
  }

  return items;
}

/**
 * Parsea el HTML de la página de detalle del espectáculo (/productos/descripcion/<slug>)
 */
export function parseDetailPageHtml(html: string): RawTheaterDetail {
  const result: RawTheaterDetail = {};

  // 1. Extraer JSON-LD si existe
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  if (jsonLdMatch) {
    try {
      const rawData = JSON.parse(jsonLdMatch[1]);
      const data = Array.isArray(rawData)
        ? rawData.find((d) => d && (d['@type'] === 'Event' || d.offers)) || rawData[0]
        : rawData;

      if (data) {
        result.title = data.name;
        result.startDate = data.startDate;
        result.imageUrl = data.image;
        if (data.offers?.price) {
          result.basePrice = parseFloat(data.offers.price);
        }
      }
    } catch {
      // Ignorar error de JSON y continuar con regex
    }
  }

  // 2. Extraer bloque <div class="texto">
  const textoMatch = html.match(/<div class="texto">([\s\S]*?)<\/div>/);
  if (textoMatch) {
    const rawTexto = decodeHtmlEntities(textoMatch[1]);

    // Extraer sinopsis tras "Texto:"
    const sinopsisMatch = rawTexto.match(/Texto:\s*([^<]+)/);
    if (sinopsisMatch) {
      result.synopsis = sinopsisMatch[1].trim();
    }

    // Extraer precios
    const preciosMatch = rawTexto.match(/Precios:\s*([^<]+)/);
    if (preciosMatch) {
      result.rawPriceText = preciosMatch[1].trim();
    }

    // Extraer hora si viene en el texto: "Hora: 20:30"
    const horaMatch = rawTexto.match(/Hora:\s*([0-9]{1,2}:[0-9]{2})/);
    if (horaMatch) {
      result.sessionTime = horaMatch[1].trim();
    }
  }

  // 3. Fallback de imagen desde <img ...>
  if (!result.imageUrl) {
    const imgMatch = html.match(
      /<img[^>]+class="lazy"[^>]+data-src="([^"]+)"/
    );
    if (imgMatch) {
      result.imageUrl = imgMatch[1].trim();
    }
  }

  return result;
}

/**
 * Parsea el HTML de la página de compra / sesiones (/entradas/<slug>/<fecha>)
 * para obtener la hora exacta local Europe/Madrid de la función.
 */
export function parseSessionPageHtml(html: string): { time?: string } {
  const timeMatch = html.match(
    /<div class="calendario_reserva[^>]*>\s*<span>([0-9]{1,2}:[0-9]{2})<\/span>/
  );
  if (timeMatch) {
    return { time: timeMatch[1].trim() };
  }

  // Fallback buscando cualquier mención clara de HH:mm en bloques de sesión
  const fallbackMatch = html.match(
    /<span>([0-9]{1,2}:[0-9]{2})<\/span>\s*<span>&#45;&nbsp;<\/span>/
  );
  if (fallbackMatch) {
    return { time: fallbackMatch[1].trim() };
  }

  return {};
}

/**
 * Clasificación y filtrado editorial de espectáculos del Teatro Principal
 * conforme a las reglas estrictas de la PARTE 2:
 * - Solo teatro y monólogos.
 * - Excluye conciertos, danza (salvo autorización), cine, exposiciones, administrativos.
 * - Detecta espectáculos híbridos para revisión manual (ej: Jirafa).
 */
export function classifyTheaterItem(
  title: string,
  description: string = '',
  slug: string = ''
): {
  isTheatrical: boolean;
  category: TheaterCategory;
  exclusionReason?: string;
  requiresManualReview: boolean;
  manualReviewReason?: string;
} {
  const fullText = `${title} ${description} ${slug}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 1. Excluir productos administrativos o tarjetas
  if (
    fullText.includes('solicitud inscripcion') ||
    fullText.includes('amigos del teatro') ||
    fullText.includes('tarjeta regalo')
  ) {
    return {
      isTheatrical: false,
      category: 'teatro',
      exclusionReason: 'Producto administrativo o tarjeta regalo (no es espectáculo)',
      requiresManualReview: false,
    };
  }

  // 2. Excluir conciertos musicales
  if (
    fullText.includes('concierto') ||
    fullText.includes('banda municipal') ||
    fullText.includes('festival internacional de guitarra') ||
    fullText.includes('gala de la guitarra') ||
    fullText.includes('antonio serrano') ||
    fullText.includes('swing for kids')
  ) {
    return {
      isTheatrical: false,
      category: 'teatro',
      exclusionReason: 'Concierto o espectáculo estrictamente musical',
      requiresManualReview: false,
    };
  }

  // 3. Excluir danza pura (salvo autorización expresa)
  if (
    fullText.includes('el paraiso de los negros') ||
    fullText.includes('el paraíso de los negros') ||
    fullText.includes('urban simphony') ||
    fullText.includes('flamenc oh')
  ) {
    return {
      isTheatrical: false,
      category: 'teatro',
      exclusionReason: 'Espectáculo de danza / flamenco (excluido según PARTE 2)',
      requiresManualReview: false,
    };
  }

  // 4. Caso especial híbrido: JIRAFA (Thomas Noone Dance - títeres + danza)
  if (fullText.includes('jirafa')) {
    return {
      isTheatrical: true,
      category: 'teatro',
      requiresManualReview: true,
      manualReviewReason:
        'Espectáculo híbrido de títeres y danza contemporánea (Thomas Noone Dance). Requiere validación editorial sobre inclusión de danza.',
    };
  }

  // 5. Monólogos: Rafael Álvarez "El Brujo"
  if (
    fullText.includes('iconos o la exploracion') ||
    fullText.includes('el brujo') ||
    fullText.includes('monólogo') ||
    fullText.includes('monologo')
  ) {
    return {
      isTheatrical: true,
      category: 'monologo',
      requiresManualReview: false,
    };
  }

  // 6. Obras de teatro escénicas (adulto e infantil)
  return {
    isTheatrical: true,
    category: 'teatro',
    requiresManualReview: false,
  };
}
