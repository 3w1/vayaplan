/**
 * Tipos para la ingestión y piloto de actividad de bares en Instagram
 * usando Apify Instagram Post Scraper, Cloudflare R2 y Curación Humana en VayaPlan.
 */

import type { PriceStatus } from '@vayaplan/shared';

export type BarPostClassification =
  | 'EVENTO_POSIBLE'
  | 'EVENTO_POSIBLE_SIN_HORA'
  | 'CONTENIDO_VENUE'
  | 'DUPLICADO_POSIBLE'
  | 'SIN_MATCH'
  | 'PAST_EVENT'
  | 'PROMOCION'
  | 'CONTENIDO_GENERAL'
  | 'NO_RELEVANTE'
  | 'REQUIERE_REVISION';

export type EventMatchLevel =
  | 'MATCH_EXACTO'
  | 'MATCH_ALTO'
  | 'MATCH_POSIBLE'
  | 'SIN_MATCH';

export type BarProvisionalCategory =
  | 'musica_directo'
  | 'dj_tardeo'
  | 'gastronomia'
  | 'ocio'
  | null;

export type PilotProfileStatus =
  | 'VERIFICADO'
  | 'EXCLUIDO_PERFIL_NO_ENCONTRADO'
  | 'EXCLUIDO_PERFIL_PRIVADO';

export interface PilotVenueConfig {
  name: string;
  username: string;
  profileUrl: string;
  status: PilotProfileStatus;
  statusReason: string;
  venueId: number | null;
  venueSlug: string | null;
  venueAddress: string | null;
}

export interface ApifyInstagramRawPost {
  id?: string;
  shortCode?: string;
  url?: string;
  caption?: string;
  timestamp?: string;
  displayUrl?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string;
  dimensionsWidth?: number;
  dimensionsHeight?: number;
  alt?: string;
  hashtags?: string[];
  mentions?: string[];
  likesCount?: number;
  commentsCount?: number;
  type?: string;
  images?: string[];
  childPosts?: Array<{
    id?: string;
    shortCode?: string;
    displayUrl?: string;
    dimensionsWidth?: number;
    dimensionsHeight?: number;
    type?: string;
  }>;
}

export interface PostClassificationResult {
  classification: BarPostClassification;
  reason: string;
  signals: string[];
  detectedDate?: string | null; // YYYY-MM-DD
  detectedTime?: string | null; // HH:mm
  detectedActivity?: string | null;
  provisionalCategory?: BarProvisionalCategory;
  provisionalTitle?: string | null;
  confidence: 'ALTA' | 'MEDIA' | 'BAJA';
  // Aliases y compatibilidad con pipelines
  inferredDate?: string | null;
  inferredTime?: string | null;
  candidateCategory?: string | null;
  candidateTitle?: string | null;
  estimatedPriceCents?: number | null;
  priceStatus?: PriceStatus;
  priceNote?: string | null;
  matchedEventId?: number | null;
  matchLevel?: EventMatchLevel | null;
  matchReasons?: string[] | null;
}

export interface UploadedR2Image {
  postUrl: string;
  shortCode: string;
  r2Key: string;
  finalUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  contentType: string;
  uploadedAt: string;
}

export interface BarEventProposal {
  provisionalTitle: string;
  proposedDate: string | null; // YYYY-MM-DD
  proposedTime: string | null; // HH:mm
  proposedVenueId: number | null;
  proposedVenueName: string | null;
  proposedVenueSlug: string | null;
  provisionalCategory: BarProvisionalCategory;
  price: number | null;
  sourceUrl: string;
  sourceType: 'instagram';
  imageUrl: string; // R2 URL
  r2Key: string;
  instagramImageSourceUrl: string; // Solo trazabilidad interna
  dedupeKey: string;
  confidence: 'ALTA' | 'MEDIA' | 'BAJA';
  classification: BarPostClassification;
  requiresManualReview: boolean;
  reviewStatus: 'pending' | 'archived' | 'approved' | 'rejected';
  matchedEventId?: number | null;
  matchLevel?: EventMatchLevel | null;
  matchReasons?: string[] | null;
  statusReason?: string;
  caption: string;
  postPublishedAt: string;
  signals: string[];
  classificationReason: string;
}

export interface BarPilotReport {
  executionId: string;
  timestamp: string;
  pilotVenues: PilotVenueConfig[];
  apifyConfig: {
    actorId: string;
    resultsType: string;
    resultsLimit: number;
    addParentData: boolean;
    includeComments: boolean;
    includeMusicData: boolean;
    dataDetailLevel?: string;
  };
  totalPostsAnalyzed: number;
  classificationSummary: Record<BarPostClassification, number>;
  classifiedPosts: Array<{
    username: string;
    postUrl: string;
    shortCode: string;
    publishedAt: string;
    classification: BarPostClassification;
    reason: string;
    signals: string[];
    captionSnippet: string;
  }>;
  uploadedImages: UploadedR2Image[];
  proposals: BarEventProposal[];
  falsePositivesDetected: Array<{
    postUrl: string;
    caption: string;
    whyNotEvent: string;
  }>;
  estimatedCostUsd: number;
  recommendedFrequency: string;
  risksDetected: string[];
  databaseVerification: {
    eventsCreated: number;
    venuesCreated: number;
    eventsModified: number;
    venuesModified: number;
    totalEvents: number;
    totalVenues: number;
    publishedEventsOk: boolean;
    draftEventsOk: boolean;
    jazzEventsOk: boolean;
    pucheritoOk: boolean;
  };
}
