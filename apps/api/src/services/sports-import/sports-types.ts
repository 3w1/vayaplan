/**
 * Tipos para la importación y actualización programada de eventos deportivos en Palencia
 */

export type SportsCategory = 'baloncesto' | 'futbol' | 'rugby' | 'cultura';

export type SportsSourceType = 'ayuntamiento_pmd' | 'club_oficial' | 'federacion' | 'diputacion';

export type SourceFormat = 'HTML' | 'JSON' | 'RSS' | 'CALENDAR' | 'API';

export type SourceReliability = 'alta' | 'media' | 'baja';

export type SourceRecommendation = 'usar' | 'monitorizar' | 'descartar';

export type SportsEventStatus = 'confirmed' | 'pending_time' | 'postponed' | 'cancelled';

export interface SportsOfficialSource {
  id: string;
  name: string;
  officialUrl: string;
  sourceType: SportsSourceType;
  sportsCovered: SportsCategory[];
  updateFrequency: string;
  format: SourceFormat;
  reliability: SourceReliability;
  recommendation: SourceRecommendation;
  enabled: boolean;
}

export interface RawSportsEvent {
  sourceId: string;
  externalId?: string | number | null;
  title: string;
  sport: SportsCategory;
  competition?: string | null;
  round?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  rawDate: string; // YYYY-MM-DD
  rawTime?: string | null; // HH:mm o descripción
  venueName: string;
  venueAddress?: string | null;
  city: string;
  isFree?: boolean | null;
  priceCents?: number | null;
  rawPriceText?: string | null;
  officialSourceUrl: string;
  imageUrl?: string | null;
  status: SportsEventStatus;
}

export interface NormalizedSportsEvent {
  dedupeKey: string;
  externalId: string | null;
  title: string;
  category: SportsCategory;
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  editorialDate: string; // YYYY-MM-DD
  editorialLabel: string;
  startTimeIso: string | null;
  timeStatus: 'confirmed' | 'pending_time';
  venueName: string;
  venueAddress: string | null;
  matchedVenueId: number | null;
  venueClassification: 'VENUE_EXISTENTE' | 'VENUE_NUEVO_PROPUESTO' | 'VENUE_SIN_IDENTIFICAR';
  proposedVenueSlug: string;
  city: string;
  priceCents: number;
  isFree: boolean;
  priceLabel: string;
  sourceUrl: string;
  sourceType: 'api' | 'scraper' | 'web';
  imageUrl: string | null;
  status: 'draft'; // En DB status = tentative / draft, nunca publicado directo
  rawStatus: SportsEventStatus;
}

export type ChangeType =
  | 'NO_CHANGE'
  | 'RESCHEDULED_DATE'
  | 'RESCHEDULED_TIME'
  | 'VENUE_CHANGED'
  | 'STATUS_CHANGED'
  | 'PRICE_CHANGED';

export interface DetectedChange {
  eventId: number;
  dedupeKey: string;
  field: string;
  oldValue: any;
  newValue: any;
  changeType: ChangeType;
  detectedAt: string;
}

export interface SportsImportReport {
  executionId: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  sourcesReviewed: string[];
  totalRawEventsExtracted: number;
  normalizedEventsCount: number;
  newProposedEventsCount: number;
  duplicatesIgnoredCount: number;
  changesDetectedCount: number;
  proposedNewVenues: {
    slug: string;
    name: string;
    address: string | null;
    associatedEventsCount: number;
  }[];
  changes: DetectedChange[];
  proposedEvents: NormalizedSportsEvent[];
  errors: { sourceId: string; message: string }[];
}
