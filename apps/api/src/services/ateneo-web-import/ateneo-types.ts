/**
 * VayaPlan — Tipos para el Piloto de Ingesta Web: Ateneo de Palencia
 *
 * Fuente: https://ateneodepalencia.com/programacion/
 * Venue ID: 10149 (Ateneo de Palencia)
 */

export const ATENEO_VENUE_ID = 10149;
export const ATENEO_VENUE_NAME = 'Ateneo de Palencia';
export const ATENEO_VENUE_SLUG = 'ateneo-de-palencia';
export const ATENEO_SOURCE_URL = 'https://ateneodepalencia.com/programacion/';
export const ATENEO_MEC_API_URL = 'https://ateneodepalencia.com/wp-json/wp/v2/mec-events';
export const ATENEO_SOURCE_TYPE = 'WEB_PROGRAMACION';
export const ATENEO_MAX_PILOT_ITEMS = 5;
export const ATENEO_LOCK_KEY = 'ateneo_web_ingestion';

export type AteneoClassification =
  | 'EVENTO_POSIBLE'
  | 'EVENTO_POSIBLE_SIN_HORA'
  | 'CONTENIDO_VENUE'
  | 'DUPLICADO_POSIBLE'
  | 'SIN_MATCH';

export interface AteneoRawEvent {
  sourceId: string; // Ej: "ateneo_9984"
  mecId: number;
  slug: string;
  title: string;
  date: string | null; // YYYY-MM-DD en Europe/Madrid
  time: string | null; // HH:mm en Europe/Madrid
  endDate?: string | null;
  endTime?: string | null;
  description: string;
  price: number | null; // null si no se especifica o gratuito
  isFree: boolean;
  category: string; // 'cultura', 'conferencia', 'literatura', 'exposicion'
  eventUrl: string;
  imageUrl: string | null;
  imageAltText?: string | null;
  credit?: string | null;
  lastCheckedAt: string;
}

export interface AteneoClassificationResult {
  classification: AteneoClassification;
  confidence: 'ALTA' | 'MEDIA' | 'BAJA';
  suggestedTitle: string;
  suggestedDate: string | null;
  suggestedTime: string | null;
  suggestedCategory: string;
  suggestedPrice: number | null;
  reasons: string[];
}

export interface AteneoR2UploadResult {
  r2Key: string;
  finalUrl: string;
  width: number;
  height: number;
  contentType: string;
  sizeBytes: number;
  imageHash: string;
  credit?: string | null;
  sourceImageUrl: string;
  lastCheckedAt: string;
}

export interface AteneoIngestionReport {
  executionId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  itemsExtracted: number;
  proposalsCreated: number;
  duplicatesSkipped: number;
  errors: Array<{ eventId?: string; error: string }>;
  proposals: Array<{
    id: number;
    title: string;
    date: string | null;
    time: string | null;
    classification: AteneoClassification;
    sourceUrl: string;
    imageUrl: string;
  }>;
}
