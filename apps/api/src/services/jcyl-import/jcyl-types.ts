/**
 * Tipos para la API de Datos Abiertos de la Junta de Castilla y León
 * Conjunto: eventos-de-la-agenda-cultural-categorizados-y-geolocalizados
 */

export interface JcylRecordRaw {
  id_evento: number;
  titulo?: string | null;
  nombre_evento?: string | null;
  descripcion?: string | null;
  categoria?: string | null;
  tematica?: string | null;
  tipo_evento?: string | null;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin?: string | null; // YYYY-MM-DD
  hora_inicio?: string | null; // texto libre ej. "19:00h.", "20:30", null
  hora_fin?: string | null;
  precio?: string | null;
  lugar_celebracion?: string | null;
  calle?: string | null;
  cp?: string | null;
  nombre_localidad?: string | null;
  nombre_provincia?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  imagen_evento?: string | null;
  imagen_evento_ampliada?: string | null;
  enlace_contenido?: string | null;
  evento_biblioteca?: string | null;
  codigo_biblioteca?: string | null;
}

export interface JcylApiResponse {
  total_count: number;
  results: JcylRecordRaw[];
}

export interface NormalizedJcylEvent {
  externalId: number;
  dedupeKey: string;
  title: string;
  description: string | null;
  category: 'musica_directo' | 'cine' | 'teatro' | 'exposicion' | 'cultura' | 'conferencia';
  timeStatus: 'confirmed' | 'pending_time';
  startTimeIso: string | null;
  endTimeIso: string | null;
  editorialDate: string;
  endDate: string | null;
  scheduleText: string | null;
  priceCents: number;
  isFree: boolean;
  priceKnown: boolean;
  rawPrice: string | null;
  sourceUrl: string | null;
  venueName: string;
  venueAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  isLibrary: boolean;
  attribution: string;
  warnings: string[];
}
