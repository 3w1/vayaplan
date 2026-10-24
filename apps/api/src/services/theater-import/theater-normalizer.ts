import {
  computeEditorialDate,
  formatPriceLabel,
  parseMadridWallClockToUtc,
} from '@vayaplan/shared';
import type {
  RawTheaterItem,
  ShowCorroborationResult,
  NormalizedTheaterProposal,
} from './theater-types';
import {
  TEATRO_PRINCIPAL_VENUE_ID,
  TEATRO_PRINCIPAL_VENUE_NAME,
  TEATRO_PRINCIPAL_VENUE_SLUG,
} from './theater-sources';

/**
 * Normaliza un slug seguro a partir de texto
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
 * Valida si la URL de la imagen proviene de los dominios oficiales autorizados
 */
export function validateOfficialImageUrl(
  url: string | null | undefined
): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return null;
  }
  const clean = url.trim();
  if (
    clean.startsWith('https://cdn.tenemosplan.com/') ||
    clean.startsWith('https://teatroprincipaldepalencia.es/') ||
    clean.startsWith('https://www.aytopalencia.es/')
  ) {
    return clean;
  }
  return null;
}

/**
 * Limpia y normaliza una sinopsis corta
 */
export function cleanSynopsis(synopsis: string | null | undefined): string | null {
  if (!synopsis) return null;
  const cleaned = synopsis
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) return null;
  return cleaned.length > 400 ? `${cleaned.slice(0, 397)}...` : cleaned;
}

/**
 * Normaliza un espectáculo del Teatro Principal a una propuesta de evento VayaPlan
 */
export function normalizeTheaterShow(
  raw: RawTheaterItem,
  corroboration: ShowCorroborationResult
): NormalizedTheaterProposal {
  // 1. Horario y fechas en Europe/Madrid
  let startTimeIso: string | null = null;
  let timeStatus: 'confirmed' | 'pending_time' = 'pending_time';
  let cleanTime = raw.rawTime ? raw.rawTime.trim().slice(0, 5) : null;

  if (cleanTime && /^[0-9]{1,2}:[0-9]{2}$/.test(cleanTime)) {
    const converted = parseMadridWallClockToUtc(raw.rawDate, cleanTime);
    if (converted.valid && converted.utcIso) {
      startTimeIso = converted.utcIso;
      timeStatus = 'confirmed';
    }
  }

  const editorialDate = computeEditorialDate(
    startTimeIso || `${raw.rawDate}T12:00:00.000Z`
  );

  // 2. Precios
  const basePriceEuros = raw.basePrice ?? 0;
  const priceCents = Math.round(basePriceEuros * 100);
  const isFree = false; // Todas las obras programadas del teatro tienen tarifa
  const priceLabel = formatPriceLabel(priceCents, isFree);

  // 3. Dedupe Key estable: recinto + slug + fecha + hora
  const timePart = cleanTime ? cleanTime.replace(':', '') : 'pending';
  const dedupeKey = `palencia-teatro-${TEATRO_PRINCIPAL_VENUE_SLUG}-${raw.slug}-${editorialDate}-${timePart}`;

  // 4. Imagen oficial verificada
  const validImage = validateOfficialImageUrl(raw.imageUrl);

  // 5. Sinopsis corta oficial
  const description = cleanSynopsis(raw.synopsis);

  // 6. Revisión manual
  const requiresManualReview =
    raw.requiresManualReview || corroboration.status === 'DISCREPANCIA';
  const manualReviewReason =
    raw.manualReviewReason ||
    (corroboration.status === 'DISCREPANCIA'
      ? `Discrepancia detectada con el programa oficial en PDF: ${corroboration.notes}`
      : null);

  return {
    dedupeKey,
    title: raw.title.trim(),
    category: raw.category,
    editorialDate,
    startTimeIso,
    timeStatus,
    venueId: TEATRO_PRINCIPAL_VENUE_ID,
    venueName: TEATRO_PRINCIPAL_VENUE_NAME,
    city: 'Palencia',
    priceCents,
    isFree,
    priceLabel,
    sourceUrl: raw.detailUrl,
    imageUrl: validImage,
    description,
    status: 'draft', // Siempre draft en modo propuesta
    corroborationStatus: corroboration.status,
    extractionConfidence: 'ALTA',
    requiresManualReview: Boolean(requiresManualReview),
    manualReviewReason: manualReviewReason || null,
  };
}
