import {
  computeEditorialDate,
  formatPriceLabel,
  parseMadridWallClockToUtc,
} from '@vayaplan/shared';
import type { RawSportsEvent, NormalizedSportsEvent } from './sports-types';

/**
 * Catálogo canónico de correspondencias entre recintos deportivos y sus propuestas normalizadas.
 */
export const SPORTS_KNOWN_VENUES: Record<
  string,
  { name: string; slug: string; address: string | null; defaultCategory: string }
> = {
  'pabellon-municipal': {
    name: 'Pabellón Municipal de Deportes de Palencia',
    slug: 'pabellon-municipal-deportes-palencia',
    address: 'Avenida del Obispo Barberá, s/n, 34005 Palencia',
    defaultCategory: 'general',
  },
  'nueva-balastera': {
    name: 'Estadio Municipal Nueva Balastera',
    slug: 'estadio-municipal-nueva-balastera',
    address: 'Calle Lola de la Fuente, s/n, 34004 Palencia',
    defaultCategory: 'general',
  },
  'pabellon-mariano-haro': {
    name: 'Pabellón Mariano Haro',
    slug: 'pabellon-mariano-haro',
    address: 'Avenida de Asturias, s/n, 34005 Palencia',
    defaultCategory: 'general',
  },
  'campo-de-la-juventud': {
    name: 'Complejo Deportivo Campo de la Juventud',
    slug: 'complejo-deportivo-campo-de-la-juventud',
    address: 'Avenida Cardenal Cisneros, 12, 34004 Palencia',
    defaultCategory: 'general',
  },
  'circuito-urbano-san-silvestre': {
    name: 'Circuito Urbano San Silvestre Palentina',
    slug: 'circuito-urbano-san-silvestre-palentina',
    address: 'Calle San Antonio (Salida) / Pabellón Municipal (Meta), Palencia',
    defaultCategory: 'general',
  },
};

/**
 * Genera un slug seguro a partir de texto
 */
export function slugifyText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Resuelve y normaliza el recinto deportivo a partir del nombre en bruto y del catálogo existente
 */
export function matchSportsVenue(
  rawVenueName: string,
  existingVenues: Array<{ id: number; name: string; slug: string }>
): {
  matchedVenueId: number | null;
  venueName: string;
  venueAddress: string | null;
  venueClassification: 'VENUE_EXISTENTE' | 'VENUE_NUEVO_PROPUESTO' | 'VENUE_SIN_IDENTIFICAR';
  proposedVenueSlug: string;
} {
  const norm = rawVenueName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Intentar cruzar primero con los 102 venues existentes en DB
  for (const ev of existingVenues) {
    const evNorm = ev.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm.includes(evNorm) || evNorm.includes(norm)) {
      return {
        matchedVenueId: ev.id,
        venueName: ev.name,
        venueAddress: null,
        venueClassification: 'VENUE_EXISTENTE',
        proposedVenueSlug: ev.slug,
      };
    }
  }

  // 2. Comprobar catálogo de recintos deportivos oficiales conocidos
  // Estadio Municipal Nueva Balastera (recinto único que alberga fútbol y rugby)
  if (
    norm.includes('balastera') ||
    norm.includes('estadio') ||
    (norm.includes('rugby') && (norm.includes('balastera') || norm.includes('campo')))
  ) {
    // Si ya existe en DB (ej: ID 10158 Estadio Municipal Nueva Balastera), asociarlo directamente como VENUE_EXISTENTE
    const existingBalastera = existingVenues.find(
      (ev) =>
        ev.slug === 'estadio-municipal-nueva-balastera' ||
        ev.name.toLowerCase().includes('nueva balastera')
    );
    if (existingBalastera) {
      return {
        matchedVenueId: existingBalastera.id,
        venueName: existingBalastera.name,
        venueAddress: null,
        venueClassification: 'VENUE_EXISTENTE',
        proposedVenueSlug: existingBalastera.slug,
      };
    }

    const def = SPORTS_KNOWN_VENUES['nueva-balastera'];
    return {
      matchedVenueId: null,
      venueName: def.name,
      venueAddress: def.address,
      venueClassification: 'VENUE_NUEVO_PROPUESTO',
      proposedVenueSlug: def.slug,
    };
  }

  if (norm.includes('pabellon municipal') || norm.includes('obispo barbera') || norm.includes('pabellon de palencia')) {
    const def = SPORTS_KNOWN_VENUES['pabellon-municipal'];
    return {
      matchedVenueId: null,
      venueName: def.name,
      venueAddress: def.address,
      venueClassification: 'VENUE_NUEVO_PROPUESTO',
      proposedVenueSlug: def.slug,
    };
  }

  if (norm.includes('mariano haro')) {
    const def = SPORTS_KNOWN_VENUES['pabellon-mariano-haro'];
    return {
      matchedVenueId: null,
      venueName: def.name,
      venueAddress: def.address,
      venueClassification: 'VENUE_NUEVO_PROPUESTO',
      proposedVenueSlug: def.slug,
    };
  }

  if (norm.includes('juventud') || norm.includes('cardenal cisneros')) {
    const def = SPORTS_KNOWN_VENUES['campo-de-la-juventud'];
    return {
      matchedVenueId: null,
      venueName: def.name,
      venueAddress: def.address,
      venueClassification: 'VENUE_NUEVO_PROPUESTO',
      proposedVenueSlug: def.slug,
    };
  }

  if (norm.includes('san silvestre') || norm.includes('san antonio') || norm.includes('circuito urbano')) {
    const def = SPORTS_KNOWN_VENUES['circuito-urbano-san-silvestre'];
    return {
      matchedVenueId: null,
      venueName: def.name,
      venueAddress: def.address,
      venueClassification: 'VENUE_NUEVO_PROPUESTO',
      proposedVenueSlug: def.slug,
    };
  }

  // 3. Venue no identificado
  return {
    matchedVenueId: null,
    venueName: rawVenueName.trim(),
    venueAddress: null,
    venueClassification: 'VENUE_SIN_IDENTIFICAR',
    proposedVenueSlug: slugifyText(rawVenueName),
  };
}

/**
 * Normaliza un evento deportivo en bruto a un evento VayaPlan normalizado
 */
export function normalizeSportsEvent(
  raw: RawSportsEvent,
  existingVenues: Array<{ id: number; name: string; slug: string }>
): NormalizedSportsEvent {
  // 1. Cruce con venues
  const venueMatch = matchSportsVenue(raw.venueName, existingVenues);

  // 2. Horario y fechas
  let startTimeIso: string | null = null;
  let timeStatus: 'confirmed' | 'pending_time' = 'pending_time';

  if (raw.rawTime && raw.rawTime.trim()) {
    const cleanTime = raw.rawTime.trim().slice(0, 5);
    const converted = parseMadridWallClockToUtc(raw.rawDate, cleanTime);
    if (converted.valid && converted.utcIso) {
      startTimeIso = converted.utcIso;
      timeStatus = 'confirmed';
    }
  }

  const editorialDate = computeEditorialDate(startTimeIso || `${raw.rawDate}T12:00:00.000Z`);

  // 3. Etiqueta editorial según día
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dObj = new Date(`${editorialDate}T12:00:00Z`);
  const dayName = dayNames[dObj.getUTCDay()];
  let editorialLabel = dayName;
  if (timeStatus === 'confirmed' && startTimeIso) {
    const hour = new Date(startTimeIso).getUTCHours();
    if (hour >= 18 || hour < 5) {
      editorialLabel = `${dayName} noche`;
    }
  }

  // 4. Precios
  const priceCents = raw.priceCents ?? 0;
  const isFree = raw.isFree ?? (priceCents === 0 && Boolean(raw.rawPriceText?.toLowerCase().includes('gratuita') || raw.rawPriceText?.toLowerCase().includes('libre')));
  const priceLabel = formatPriceLabel(priceCents, isFree);

  // 5. Clave canónica de deduplicación
  const homeSlug = raw.homeTeam ? slugifyText(raw.homeTeam) : 'equipo-local';
  const awaySlug = raw.awayTeam ? slugifyText(raw.awayTeam) : 'rival';
  const compSlug = raw.competition ? slugifyText(raw.competition) : 'competicion';

  let dedupeKey = `palencia-deporte-${raw.sport}-${compSlug}-${editorialDate}-${homeSlug}-${awaySlug}`;
  if (raw.externalId) {
    dedupeKey = `palencia-deporte-${raw.sourceId}-${raw.externalId}`;
  }

  return {
    dedupeKey,
    externalId: raw.externalId ? String(raw.externalId) : null,
    title: raw.title.trim(),
    category: raw.sport,
    competition: raw.competition?.trim() || null,
    homeTeam: raw.homeTeam?.trim() || null,
    awayTeam: raw.awayTeam?.trim() || null,
    editorialDate,
    editorialLabel,
    startTimeIso,
    timeStatus,
    venueName: venueMatch.venueName,
    venueAddress: venueMatch.venueAddress,
    matchedVenueId: venueMatch.matchedVenueId,
    venueClassification: venueMatch.venueClassification,
    proposedVenueSlug: venueMatch.proposedVenueSlug,
    city: raw.city || 'Palencia',
    priceCents,
    isFree,
    priceLabel,
    sourceUrl: raw.officialSourceUrl,
    sourceType: raw.sourceId.includes('api') ? 'api' : 'scraper',
    imageUrl: raw.imageUrl || null,
    status: 'draft',
    rawStatus: raw.status,
  };
}
