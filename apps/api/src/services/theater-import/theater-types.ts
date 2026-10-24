/**
 * Tipos para la ingestión editorial y propuesta de obras de teatro
 * del Teatro Principal de Palencia en VayaPlan.
 */

export type TheaterCategory = 'teatro' | 'monologo';

export type CorroborationStatus =
  | 'CORROBORADO'
  | 'SOLO_WEB'
  | 'SOLO_PDF'
  | 'DISCREPANCIA';

export interface RawTheaterSearchItem {
  rawDate: string; // YYYY-MM-DD
  title: string;
  slug: string;
  detailUrl: string;
  ticketsUrl: string;
  imageUrl: string | null;
  basePrice: number | null;
}

export interface RawTheaterDetail {
  title?: string;
  startDate?: string;
  imageUrl?: string | null;
  basePrice?: number | null;
  rawPriceText?: string | null;
  synopsis?: string | null;
  sessionTime?: string | null;
}

export interface RawTheaterItem {
  sourceId: string;
  slug: string;
  title: string;
  rawDate: string; // YYYY-MM-DD
  rawTime: string | null; // HH:mm
  detailUrl: string;
  ticketsUrl: string;
  imageUrl: string | null;
  synopsis: string | null;
  basePrice: number | null; // en euros
  rawPriceText: string | null;
  category: TheaterCategory;
  isTheatrical: boolean;
  exclusionReason?: string;
  requiresManualReview?: boolean;
  manualReviewReason?: string;
}

export interface OfficialPdfShow {
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  venue: string;
  category: TheaterCategory;
  prices: {
    zoneA?: string;
    zoneB?: string;
    zoneC?: string;
    zoneD?: string;
    adult?: string;
    child?: string;
    reduced?: string;
    normal?: string;
  };
  company?: string;
  durationMinutes?: number;
  audience?: string;
  page: number;
}

export interface DiscrepancyDetail {
  field: string;
  webValue: string;
  pdfValue: string;
  explanation: string;
}

export interface ShowCorroborationResult {
  status: CorroborationStatus;
  matchedPdfShow: OfficialPdfShow | null;
  discrepancies: DiscrepancyDetail[];
  notes?: string;
}

export interface NormalizedTheaterProposal {
  dedupeKey: string;
  title: string;
  category: TheaterCategory;
  editorialDate: string; // YYYY-MM-DD
  startTimeIso: string | null;
  timeStatus: 'confirmed' | 'pending_time';
  venueId: number; // 2
  venueName: string; // 'Teatro Principal de Palencia'
  city: string; // 'Palencia'
  priceCents: number;
  isFree: boolean;
  priceLabel: string;
  sourceUrl: string;
  imageUrl: string | null;
  description: string | null;
  status: 'draft'; // Siempre draft en modo propuesta
  corroborationStatus: CorroborationStatus;
  extractionConfidence: 'ALTA' | 'MEDIA' | 'BAJA';
  requiresManualReview: boolean;
  manualReviewReason: string | null;
}

export interface TheaterImportReport {
  executionId: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  primarySourceUrl: string;
  corroborationSourceUrl: string;
  totalCatalogWebItems: number;
  excludedItems: Array<{ title: string; date: string; reason: string }>;
  excludedItemsCount: number;
  theatricalCandidatesCount: number;
  proposalsCount: number;
  proposals: NormalizedTheaterProposal[];
  corroborationSummary: {
    corroboratedCount: number;
    soloWebCount: number;
    soloPdfCount: number;
    discrepanciesCount: number;
  };
  discrepancies: Array<{
    title: string;
    field: string;
    webValue: string;
    pdfValue: string;
    explanation: string;
  }>;
  manualReviewItems: Array<{
    title: string;
    date: string;
    reason: string;
  }>;
  soloPdfShows: OfficialPdfShow[];
  databaseMutations: {
    eventsCreated: number;
    venuesCreated: number;
    eventsModified: number;
    venuesModified: number;
  };
  errors: Array<{ item: string; message: string }>;
}
