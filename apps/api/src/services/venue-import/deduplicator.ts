import type {
  RawScraperItem,
  NormalizedCandidate,
  ConflictRecord,
  CandidateClassification,
} from './types';
import {
  normalizeSlug,
  parseUrls,
  validateCoordinates,
  mapGoogleCategory,
  heuristicZone,
} from './normalizer';

export interface DeduplicationResult {
  candidates: NormalizedCandidate[];
  defects: { row: number; item: any; reason: string }[];
  repeatedRowsAbsorbed: number;
}

export function deduplicateAndNormalize(
  rawItems: RawScraperItem[],
  targetCitySlug: string = 'palencia'
): DeduplicationResult {
  const defects: { row: number; item: any; reason: string }[] = [];
  const groupsByPlaceId = new Map<string, { rows: number[]; items: RawScraperItem[] }>();
  const itemsWithoutPlaceId: { row: number; item: RawScraperItem }[] = [];

  rawItems.forEach((item, index) => {
    const rowNum = index + 1;
    if (!item || typeof item !== 'object') {
      defects.push({ row: rowNum, item, reason: 'Elemento vacío o no es un objeto válido' });
      return;
    }

    const placeId = item.placeId?.trim();
    if (!placeId) {
      if (!item.title?.trim() && !item.address?.trim()) {
        defects.push({ row: rowNum, item, reason: 'Faltan placeId, título y dirección' });
        return;
      }
      itemsWithoutPlaceId.push({ row: rowNum, item });
      return;
    }

    const existing = groupsByPlaceId.get(placeId);
    if (existing) {
      existing.rows.push(rowNum);
      existing.items.push(item);
    } else {
      groupsByPlaceId.set(placeId, { rows: [rowNum], items: [item] });
    }
  });

  const candidates: NormalizedCandidate[] = [];
  let candidateIndex = 1;
  let repeatedRowsAbsorbed = 0;

  for (const [placeId, group] of Array.from(groupsByPlaceId.entries())) {
    if (group.rows.length > 1) {
      repeatedRowsAbsorbed += group.rows.length - 1;
    }

    const primaryItem = selectRichestItem(group.items);
    const conflicts = detectConflicts(group.rows, group.items);
    const queries: string[] = Array.from(
      new Set(
        group.items
          .map((it) => it.searchString || it.query)
          .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      )
    );

    const titleOriginal = (primaryItem.title || '').trim();
    const cityOriginal = (primaryItem.city || '').trim();
    const addressOriginal = (primaryItem.address || '').trim();
    const postalCode = primaryItem.postalCode?.trim() || null;
    const categoryOriginal = (primaryItem.categoryName || primaryItem.type || '').trim();
    const typesOriginal = Array.from(
      new Set([
        ...(primaryItem.types || []),
        ...(primaryItem.categories || []),
        primaryItem.type,
      ].filter((t): t is string => Boolean(t && typeof t === 'string')))
    );

    const { lat, lon } = validateCoordinates(primaryItem.latitude, primaryItem.longitude);
    const googleMapsUrl = primaryItem.googleMapsUrl || primaryItem.url || '';
    const phoneOriginal = primaryItem.phone?.trim() || primaryItem.phoneNumber?.trim() || null;
    const phoneUnformatted = primaryItem.phoneUnformatted?.trim() || phoneOriginal;

    const urls = parseUrls(primaryItem.website);

    const hoursObj = primaryItem.openingHours || {};
    const openingHoursCount = typeof hoursObj === 'object' && hoursObj !== null ? Object.keys(hoursObj).length : 0;
    const openingHoursSummary = openingHoursCount > 0 ? `${openingHoursCount} días con horario registrado` : 'Sin horario registrado';

    const proposedName = cleanTitle(titleOriginal);
    const proposedSlug = normalizeSlug(proposedName);
    const { proposedCategory, proposedCategoryReason } = mapGoogleCategory(
      categoryOriginal,
      typesOriginal
    );
    const { proposedZone, proposedZoneReason } = heuristicZone(addressOriginal);

    const candidateId = `CAND-${String(candidateIndex).padStart(2, '0')}`;
    candidateIndex++;

    const candidate: NormalizedCandidate = {
      candidateId,
      placeId,
      originRows: group.rows,
      queries,
      titleOriginal,
      cityOriginal,
      addressOriginal,
      postalCode,
      categoryOriginal,
      typesOriginal,
      latitude: lat,
      longitude: lon,
      googleMapsUrl,
      phoneOriginal,
      phoneUnformatted,
      websiteOriginal: primaryItem.website || null,
      websiteOwn: urls.websiteOwn,
      instagramUrl: urls.instagramUrl,
      instagramHandle: urls.instagramHandle,
      facebookUrl: urls.facebookUrl,
      openingHoursCount,
      openingHoursSummary,
      proposedName,
      proposedSlug,
      proposedCategory,
      proposedCategoryReason,
      proposedZone,
      proposedZoneReason,
      classification: 'PENDIENTE_COMPARACION',
      classificationReason: 'Pendiente de comparación con censo y reglas de ámbito.',
      matchingInternalId: null,
      matchingInternalTable: null,
      matchingEvidence: null,
      conflicts,
      pendingDecisions: [],
      approved: false,
      isActive: true,
    };

    candidates.push(candidate);
  }

  // Handle items without placeId (fallback as candidates with DATOS_INSUFICIENTES)
  for (const { row, item } of itemsWithoutPlaceId) {
    const candidateId = `CAND-${String(candidateIndex).padStart(2, '0')}`;
    candidateIndex++;
    const urls = parseUrls(item.website);
    const title = (item.title || 'Sin título').trim();
    const candidate: NormalizedCandidate = {
      candidateId,
      placeId: `NO_PLACE_ID_${row}`,
      originRows: [row],
      queries: item.query ? [item.query] : [],
      titleOriginal: title,
      cityOriginal: (item.city || '').trim(),
      addressOriginal: (item.address || '').trim(),
      postalCode: item.postalCode?.trim() || null,
      categoryOriginal: (item.categoryName || '').trim(),
      typesOriginal: item.types || [],
      latitude: null,
      longitude: null,
      googleMapsUrl: item.googleMapsUrl || item.url || '',
      phoneOriginal: item.phone?.trim() || null,
      phoneUnformatted: item.phoneUnformatted?.trim() || null,
      websiteOriginal: item.website || null,
      websiteOwn: urls.websiteOwn,
      instagramUrl: urls.instagramUrl,
      instagramHandle: urls.instagramHandle,
      facebookUrl: urls.facebookUrl,
      openingHoursCount: 0,
      openingHoursSummary: 'Sin horario',
      proposedName: title,
      proposedSlug: normalizeSlug(title),
      proposedCategory: 'general',
      proposedCategoryReason: 'Sin datos suficientes de categoría',
      proposedZone: null,
      proposedZoneReason: 'Sin ubicación confirmada',
      classification: 'DATOS_INSUFICIENTES',
      classificationReason: 'Registro sin identificador placeId de Google Maps.',
      matchingInternalId: null,
      matchingInternalTable: null,
      matchingEvidence: null,
      conflicts: [],
      pendingDecisions: ['Completar identificador placeId o descartar'],
      approved: false,
      isActive: false,
    };
    candidates.push(candidate);
  }

  return {
    candidates,
    defects,
    repeatedRowsAbsorbed,
  };
}

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let clean = rawTitle.trim();
  // Remove trailing dots, e.g. "Debla - Palencia." -> "Debla"
  clean = clean.replace(/\s*-\s*palencia\.?$/i, '').trim();
  clean = clean.replace(/\.$/, '').trim();
  return clean;
}

function selectRichestItem(items: RawScraperItem[]): RawScraperItem {
  if (items.length === 1) return items[0];

  return items.reduce((best, current) => {
    const bestHours = best.openingHours ? Object.keys(best.openingHours).length : 0;
    const currentHours = current.openingHours ? Object.keys(current.openingHours).length : 0;

    const bestScore =
      (bestHours * 10) +
      (best.reviewsCount ? 5 : 0) +
      (best.phone ? 3 : 0) +
      (best.website ? 3 : 0) +
      (best.address ? 2 : 0);

    const currentScore =
      (currentHours * 10) +
      (current.reviewsCount ? 5 : 0) +
      (current.phone ? 3 : 0) +
      (current.website ? 3 : 0) +
      (current.address ? 2 : 0);

    return currentScore > bestScore ? current : best;
  });
}

function detectConflicts(rows: number[], items: RawScraperItem[]): ConflictRecord[] {
  if (items.length <= 1) return [];

  const conflicts: ConflictRecord[] = [];
  const base = items[0];
  const baseRow = rows[0];

  for (let i = 1; i < items.length; i++) {
    const comp = items[i];
    const compRow = rows[i];

    // Check opening hours count
    const baseHours = base.openingHours ? Object.keys(base.openingHours).length : 0;
    const compHours = comp.openingHours ? Object.keys(comp.openingHours).length : 0;
    if (baseHours !== compHours) {
      conflicts.push({
        field: 'openingHours',
        rowA: baseRow,
        valA: `${baseHours} días`,
        rowB: compRow,
        valB: `${compHours} días`,
      });
    }

    // Check reviews count
    if (base.reviewsCount !== comp.reviewsCount && base.reviewsCount != null && comp.reviewsCount != null) {
      conflicts.push({
        field: 'reviewsCount',
        rowA: baseRow,
        valA: base.reviewsCount,
        rowB: compRow,
        valB: comp.reviewsCount,
      });
    }

    // Check phone if both present and different
    if (base.phone && comp.phone && base.phone !== comp.phone) {
      conflicts.push({
        field: 'phone',
        rowA: baseRow,
        valA: base.phone,
        rowB: compRow,
        valB: comp.phone,
      });
    }

    // Check website if both present and different
    if (base.website && comp.website && base.website !== comp.website) {
      conflicts.push({
        field: 'website',
        rowA: baseRow,
        valA: base.website,
        rowB: compRow,
        valB: comp.website,
      });
    }
  }

  return conflicts;
}
