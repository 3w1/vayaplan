// ==============================================================================
// VayaPlan — Tipos del Sistema y Contratos de Datos (v1.1)
// ==============================================================================

// Enumeraciones del dominio
export type EventCategory =
  | 'musica_directo'
  | 'dj_tardeo'
  | 'monologo'
  | 'cine'
  | 'teatro'
  | 'exposicion'
  | 'cultura'
  | 'baloncesto'
  | 'futbol'
  | 'rugby'
  | 'conferencia';

export type EventTimeStatus =
  | 'confirmed'
  | 'pending_time'
  | 'tentative_date'
  | 'continuous';

export type PriceStatus =
  | 'UNKNOWN'
  | 'FREE'
  | 'NOT_INFORMED'
  | 'CHECK_BOX_OFFICE'
  | 'CONFIRMED';

export type EventStatus =
  | 'tentative'
  | 'draft'
  | 'published'
  | 'outdated'
  | 'cancelled'
  | 'archived'
  | 'duplicate';

export type EventSourceType =
  | 'whatsapp'
  | 'manual'
  | 'web'
  | 'scraper'
  | 'api'
  | 'user_report';

export type MetricType =
  | 'impression'
  | 'map_click'
  | 'booking_click'
  | 'ticket_click'
  | 'profile_click'
  | 'whatsapp_click'
  | 'qr_scan'
  | 'channel_view';

export interface ImageVariantInfo {
  key: string;
  url: string;
  width: number;
  height: number;
  size_bytes: number;
  mime_type: string;
}

export interface ImageVariantsMap {
  original: ImageVariantInfo;
  detail: ImageVariantInfo;
  thumb: ImageVariantInfo;
}

export type MetricChannel =
  | 'web'
  | 'whatsapp_channel'
  | 'qr_hotel'
  | 'instagram'
  | 'tiktok'
  | 'telegram';

export type PromotionStatus =
  | 'active'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'refunded';

// Modelos de Base de Datos
export interface City {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
}

export type VenueZone = 'seminario' | 'centro_puebla' | 'salon' | 'otros';

export type VenueCategory =
  | 'general'
  | 'bar_musical'
  | 'disco_bar'
  | 'bar'
  | 'sala_conciertos'
  | 'pub'
  | 'discoteca'
  | 'teatro'
  | 'cine'
  | 'restaurante'
  | 'cultura';

export interface Venue {
  id: number;
  city_id: number;
  name: string;
  slug: string;
  address: string | null;
  zone?: VenueZone | string | null;
  category?: VenueCategory | string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  instagram_handle: string | null;
  whatsapp_contact: string | null;
  phone?: string | null;
  website_url: string | null;
  facebook_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Festival {
  id: number;
  city_id: number;
  name: string;
  edition: string | null;
  slug: string;
  description: string | null;
  start_date: string;
  end_date: string;
  official_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FestivalSummary {
  id: number;
  name: string;
  edition: string | null;
  slug: string;
  official_url: string | null;
}

export interface FestivalProgramResponseContract {
  festival: {
    id: number;
    name: string;
    edition: string | null;
    slug: string;
    description: string | null;
    start_date: string;
    end_date: string;
    official_url: string | null;
  };
  city: {
    id: number;
    name: string;
    slug: string;
  };
  events: PublicEventItem[];
}

export interface Event {
  id: number;
  city_id: number;
  venue_id: number | null;
  title: string;
  description: string | null;
  category: EventCategory;
  time_status: EventTimeStatus;
  start_time: string | null;
  end_time: string | null;
  editorial_date: string;
  end_date?: string | null;
  schedule_text?: string | null;
  approximate_schedule?: string | null;
  price_cents: number | null;
  price_status?: PriceStatus;
  price_note?: string | null;
  price_source?: string | null;
  price_checked_at?: string | null;
  is_free: boolean;
  image_url: string | null;
  image_thumb_url?: string | null;
  image_original_url?: string | null;
  source_type: EventSourceType;
  source_url: string | null;
  source_hash: string | null;
  dedupe_key: string | null;
  status: EventStatus;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recurrence {
  id: number;
  city_id: number;
  venue_id: number;
  day_of_week: number; // 0=Domingo, 1=Lunes, ..., 5=Viernes, 6=Sábado
  title: string;
  description: string | null;
  category: EventCategory;
  start_time: string;
  end_time: string | null;
  price_cents: number;
  is_free: boolean;
  requires_booking: boolean;
  booking_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurrenceException {
  id: number;
  recurrence_id: number;
  exception_date: string;
  status: 'cancelled' | 'modified';
  modified_start_time: string | null;
  modified_end_time: string | null;
  note: string | null;
  created_at: string;
}

export interface Place {
  id: number;
  city_id: number;
  venue_id: number | null;
  name: string;
  slug: string;
  category: string;
  highlight_text: string;
  description: string | null;
  opening_hours_text: string | null;
  price_text: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Promotion {
  id: number;
  city_id: number;
  event_id: number;
  venue_id: number;
  editorial_date: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: PromotionStatus;
  created_at: string;
}

export interface EventMetric {
  id: number;
  event_id: number;
  promotion_id: number | null;
  metric_type: MetricType;
  channel: MetricChannel;
  session_hash: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

export interface QRSource {
  id: number;
  city_id: number;
  accommodation_name: string;
  accommodation_type: string | null;
  qr_code: string;
  is_active: boolean;
  created_at: string;
}

// ==============================================================================
// Contratos de Respuesta API Pública
// ==============================================================================

export interface VenueSummary {
  id: number;
  name: string;
  slug: string;
  address?: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
}

export interface EventPriceInfo {
  amount_cents: number | null;
  is_free: boolean;
  label: string;
  status?: PriceStatus;
  note?: string | null;
}

export interface EventActionInfo {
  maps_url: string | null;
  booking_url: string | null;
  tickets_url: string | null;
  whatsapp_url: string | null;
}

export interface EventVerificationInfo {
  source: string;
  verified_at: string | null;
}

export interface PromotionInfo {
  id: number;
  price_cents: number;
  status: PromotionStatus;
}

export interface PublicEventItem {
  id: number;
  title: string;
  description?: string | null;
  category: EventCategory;
  time_status: EventTimeStatus;
  start_time: string | null;
  end_time: string | null;
  editorial_date: string;
  editorial_label: string;
  end_date?: string | null;
  schedule_text?: string | null;
  approximate_schedule?: string | null;
  price: EventPriceInfo;
  status: EventStatus;
  venue: VenueSummary;
  image_url: string | null;
  image_thumb_url?: string | null;
  image_attribution?: EventImageAttribution | null;
  actions: EventActionInfo;
  verification: EventVerificationInfo;
  promotion: PromotionInfo | null;
  festival?: FestivalSummary | null;
  festivals: FestivalSummary[];
}

export interface PublicActivePromotionItem {
  promotion_id: number;
  starts_at: string;
  ends_at: string;
  event: PublicEventItem;
}

export interface ActivePromotionsResponseContract {
  city: {
    slug: string;
    name: string;
    timezone: string;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  promotions: PublicActivePromotionItem[];
}

export interface RecurrenceItem {
  id: number;
  title: string;
  category: EventCategory;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  venue_id: number;
  venue_name: string;
  is_free: boolean;
  price_cents: number;
}

export interface EventImageAttribution {
  source_url: string;
  source_title?: string | null;
  author?: string | null;
  license?: string | null;
  license_url?: string | null;
}

export interface PlaceImageAttribution {
  author: string;
  source_url: string;
  license: string;
  license_url: string;
  modifications?: string | null;
}

export interface PlaceItem {
  id: number;
  name: string;
  slug: string;
  category: string;
  highlight_text: string;
  description: string | null;
  opening_hours_text: string | null;
  price_text: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  image_url: string | null;
  image_attribution: PlaceImageAttribution | null;
}

export interface CitySummary {
  slug: string;
  name: string;
}

export interface EventsResponseContract {
  city: CitySummary;
  date: string;
  events: PublicEventItem[];
  recurrences: RecurrenceItem[];
  places: PlaceItem[];
}

export interface HealthCheckResponse {
  status: 'ok';
}

export interface DatabaseHealthCheckResponse {
  status: 'ok' | 'error';
  db: 'connected' | 'disconnected';
  timestamp?: string;
  database?: string;
  message?: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown> | null;
}

// ==============================================================================
// Contratos de Respuesta Sprint 2
// ==============================================================================

export interface WeekendDayAgenda {
  editorial_date: string;
  editorial_label: string;
  events: PublicEventItem[];
  recurrences: RecurrenceItem[];
}

export interface WeekendResponseContract {
  city: CitySummary;
  start: string;
  days: WeekendDayAgenda[];
  places: PlaceItem[];
}

export interface PlacesResponseContract {
  city: CitySummary;
  category: string | null;
  places: PlaceItem[];
}

export interface SingleEventResponseContract {
  event: PublicEventItem;
}

export interface MetricCreateResponse {
  status: 'ok';
  metric_id: number;
}

// ==============================================================================
// Contratos y Tipos Sprint 3 (Administración, Curación, Webhooks y QR)
// ==============================================================================

export interface AdminUser {
  email: string;
  role: 'admin';
}

export interface AdminLoginPayload {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  status: 'ok';
  token: string;
  user: AdminUser;
}

export interface AdminMeResponse {
  user: AdminUser;
}

export interface CollisionAlertInfo {
  colliding_event_id: number;
  colliding_title: string;
  colliding_start_time: string;
  diff_minutes: number;
}

export interface AdminEventItem extends Event {
  venue_name: string | null;
  venue_slug: string | null;
  venue_zone?: string | null;
  venue_category?: string | null;
  venue_address?: string | null;
  promotion_id?: number | null;
  collision_alert?: CollisionAlertInfo | null;
  festivals?: FestivalSummary[];
  festival_ids?: number[];
}

export interface EventMetricsSummary {
  event_id: number;
  title: string;
  total_impressions: number;
  total_map_clicks: number;
  total_ticket_clicks: number;
  total_booking_clicks: number;
  total_whatsapp_clicks: number;
  total_profile_clicks: number;
  unique_sessions: number;
}

export interface QrSourceItem {
  id: number;
  city_id: number;
  accommodation_name: string;
  accommodation_type: string | null;
  qr_code: string;
  is_active: boolean;
  created_at: string;
  total_scans?: number;
}

export interface CreateDraftFromWhatsAppInput {
  text: string;
  senderNumber: string;
  imageUrl?: string | null;
}

// ==============================================================================
// Contratos y Tipos Sprint 4 (Promociones e Informes Comerciales)
// ==============================================================================

export interface AdminPromotionItem {
  id: number;
  city_id: number;
  city_name: string;
  city_slug: string;
  event_id: number;
  event_title: string;
  event_status: EventStatus;
  event_start_time: string;
  venue_id: number;
  venue_name: string;
  venue_slug: string;
  editorial_date: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: PromotionStatus;
  created_at: string;
}

export interface PromotionReportMetricsBlock {
  impressions: number;
  unique_impressions_sessions: number;
  map_clicks: number;
  unique_map_clicks_sessions: number;
  booking_clicks: number;
  ticket_clicks: number;
  whatsapp_clicks: number;
  profile_clicks: number;
  channel_views: number;
  qr_scans: number;
  total_actions: number;
  unique_action_sessions: number;
}

export interface PromotionReportResponse {
  promotion_id: number;
  event_id: number;
  event_title: string;
  venue_name: string;
  editorial_date: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: PromotionStatus;
  generated_at: string;
  promotion_metrics: PromotionReportMetricsBlock;
  event_overall_metrics: PromotionReportMetricsBlock;
  impressions: number;
  unique_impressions: number;
  map_clicks: number;
  unique_map_clicks: number;
  booking_clicks: number;
  ticket_clicks: number;
  whatsapp_clicks: number;
  profile_clicks: number;
  channel_views: number;
  qr_scans: number;
  total_actions: number;
  whatsapp_text: string;
}

export interface CreatePromotionInput {
  event_id: number;
  editorial_date?: string;
  starts_at?: string;
  ends_at?: string;
  price_cents?: number;
  status?: PromotionStatus;
}

export interface UploadImageResponse {
  status: 'ok';
  key?: string;
  filename: string;
  url: string;
  size_bytes: number;
  mime_type: string;
  provider?: string;
}

export interface CleanupUploadsResponse {
  status: 'ok';
  total_files: number;
  deleted_count: number;
  preserved_count: number;
  grace_hours: number;
}

// ==============================================================================
// RUTAS GASTRONÓMICAS — ENTIDADES Y CONTRATOS
// ==============================================================================

export type GastronomicRouteStatus = 'draft' | 'published' | 'archived';

export type GastronomicRouteCategory =
  | 'tapas'
  | 'bravas'
  | 'puchero'
  | 'reposteria'
  | 'vino'
  | 'general';

/**
 * Entidad de base de datos para una Ruta Gastronómica
 */
export interface GastronomicRoute {
  id: number;
  city_id: number;
  title: string;
  slug: string;
  summary: string;
  description: string | null;
  category: GastronomicRouteCategory;
  status: GastronomicRouteStatus;
  start_date: string | null;
  end_date: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  badge_label: string | null;
  approximate_price_cents: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Entidad de base de datos para un Local Participante en una Ruta
 */
export interface GastronomicRouteParticipant {
  id: number;
  route_id: number;
  venue_id: number;
  display_order: number;
  dish_name: string;
  dish_description: string | null;
  dish_price_cents: number | null;
  dish_image_url: string | null;
  is_optional: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------------------
// CONTRATOS PÚBLICOS (Sin display_order, sin numeración ni orden de visita)
// ------------------------------------------------------------------------------

export interface PublicDishInfo {
  name: string;
  description: string | null;
  price_cents: number | null;
  price_label: string | null;
  image_url: string | null;
}

export interface PublicRouteParticipantItem {
  id: number;
  dish: PublicDishInfo;
  venue: VenueSummary;
  is_optional: boolean;
}

export interface PublicRouteSummary {
  id: number;
  title: string;
  slug: string;
  summary: string;
  category: GastronomicRouteCategory;
  badge_label: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  approximate_price_cents: number | null;
  participants_count: number;
  image_url: string | null;
  image_thumb_url: string | null;
}

export interface GastronomicRoutesResponseContract {
  city: {
    slug: string;
    name: string;
  };
  routes: PublicRouteSummary[];
}

export interface SingleGastronomicRouteResponseContract {
  route: {
    id: number;
    title: string;
    slug: string;
    summary: string;
    description: string | null;
    category: GastronomicRouteCategory;
    status: GastronomicRouteStatus;
    badge_label: string | null;
    start_date: string | null;
    end_date: string | null;
    is_permanent: boolean;
    approximate_price_cents: number | null;
    image_url: string | null;
    image_thumb_url: string | null;
    city: {
      slug: string;
      name: string;
    };
    participants: PublicRouteParticipantItem[];
  };
}

// ------------------------------------------------------------------------------
// CONTRATOS ADMINISTRATIVOS (display_order exclusivo para estabilidad de gestión)
// ------------------------------------------------------------------------------

export interface AdminRouteParticipantItem {
  id?: number;
  venue_id: number;
  display_order: number;
  dish_name: string;
  dish_description?: string | null;
  dish_price_cents?: number | null;
  dish_image_url?: string | null;
  is_optional?: boolean;
  is_active: boolean;
  venue?: VenueSummary;
}

export interface AdminRouteDetail extends GastronomicRoute {
  participants: AdminRouteParticipantItem[];
}

export interface AdminRouteListResponseContract {
  routes: (GastronomicRoute & { participants_count: number })[];
}

export interface AdminCreateRouteRequest {
  city_id: number;
  title: string;
  slug: string;
  summary: string;
  description?: string | null;
  category: GastronomicRouteCategory;
  badge_label?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  approximate_price_cents?: number | null;
  image_url?: string | null;
}

export interface AdminUpdateRouteParticipantsRequest {
  participants: {
    venue_id: number;
    display_order: number;
    dish_name: string;
    dish_description?: string | null;
    dish_price_cents?: number | null;
    dish_image_url?: string | null;
    is_optional?: boolean;
    is_active?: boolean;
  }[];
}





