/**
 * Tipos para la gestión editorial de imágenes oficiales de la Biblioteca Pública de Palencia
 */

export type BibliotecaImageStatus =
  | 'SIN_IMAGEN'
  | 'IMAGEN_GENERICA'
  | 'IMAGEN_OFICIAL_EXISTENTE'
  | 'REQUIERE_REVISION';

export type BibliotecaRecommendedAction =
  | 'ADOPTAR_IMAGEN_OFICIAL'
  | 'PROPONER_ALTERNATIVA'
  | 'MANTENER_IMAGEN_ACTUAL'
  | 'REQUIERE_REVISION';

export interface BibliotecaEventInventoryItem {
  id: number;
  title: string;
  editorial_date: string;
  end_date: string | null;
  start_time: string | null;
  schedule_text: string | null;
  time_status: string;
  venue_id: number;
  venue_name: string;
  current_image_status: BibliotecaImageStatus;
  current_image_url: string | null;
  source_type: string;
  source_url: string;
}

export interface BibliotecaProposedImage {
  eventId: number;
  eventTitle: string;
  editorialDate: string;
  endDate: string | null;
  venueName: string;
  currentImageStatus: BibliotecaImageStatus;
  currentImageUrl: string | null;
  proposedImageUrl: string;
  r2Key: string;
  sourceImageUrl: string;
  sourcePageUrl: string;
  sourceName: string;
  credit: string;
  imageWidth: number;
  imageHeight: number;
  contentType: string;
  sizeBytes: number;
  lastCheckedAt: string;
  recommendedAction: BibliotecaRecommendedAction;
}

export interface BibliotecaDecisionRecord {
  eventId: number;
  action: 'adopt' | 'keep_current' | 'discard' | 'request_search';
  operatorEmail: string;
  decisionTimestamp: string;
  previousImageUrl: string | null;
  adoptedImageUrl?: string | null;
  adoptedR2Key?: string | null;
  adoptedCredit?: string | null;
  notes?: string;
}
