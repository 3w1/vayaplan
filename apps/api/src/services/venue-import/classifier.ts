import type { Pool, PoolClient } from 'pg';
import type { NormalizedCandidate, CandidateClassification } from './types';

export interface ClassificationContext {
  targetCitySlug: string;
  targetCityId?: number;
  db?: Pool | PoolClient;
}

export async function classifyCandidates(
  candidates: NormalizedCandidate[],
  context: ClassificationContext
): Promise<NormalizedCandidate[]> {
  const { targetCitySlug, targetCityId, db } = context;

  // 1. First pass: Geographic & Scope filters (FUERA_DE_AMBITO)
  for (const cand of candidates) {
    if (cand.classification === 'DATOS_INSUFICIENTES') continue;

    // Check city / locality
    const city = (cand.cityOriginal || '').toLowerCase().trim();
    const target = targetCitySlug.toLowerCase().trim();

    if (city && city !== target && !city.includes(target) && !cand.addressOriginal.toLowerCase().includes(target)) {
      cand.classification = 'FUERA_DE_AMBITO';
      cand.classificationReason = `Localidad "${cand.cityOriginal}" no coincide con la ciudad de importación "${targetCitySlug}".`;
      cand.pendingDecisions.push(`Descartar por pertenecer a otra localidad (${cand.cityOriginal})`);
      continue;
    }

    // Check accommodation / non-venue categories
    const cat = (cand.categoryOriginal || '').toLowerCase();
    const types = cand.typesOriginal.map((t) => t.toLowerCase());
    const isAccommodation =
      cat === 'hotel' ||
      cat === 'hostal' ||
      cat === 'alojamiento' ||
      cat.includes('hotel') ||
      types.includes('hotel') ||
      types.includes('lodging');

    if (isAccommodation) {
      cand.classification = 'FUERA_DE_AMBITO';
      cand.classificationReason = `Alojamiento / Establecimiento fuera del alcance del censo de ocio y hostelería (categoría: ${cand.categoryOriginal}).`;
      cand.pendingDecisions.push('Descartar por ser alojamiento');
      continue;
    }
  }

  // 2. Second pass: Intra-batch conflicts & ambiguities (REVISAR_COINCIDENCIA)
  detectIntraBatchAmbiguities(candidates);

  // 3. Third pass: Database comparison if db is connected
  if (db && targetCityId) {
    await matchAgainstDatabase(candidates, targetCityId, db);
    // Candidates in target city without matches after DB check become POSIBLE_ALTA
    for (const cand of candidates) {
      if (cand.classification === 'PENDIENTE_COMPARACION') {
        cand.classification = 'POSIBLE_ALTA';
        cand.classificationReason =
          'Establecimiento contrastado con el censo sin coincidencias previas. Propuesta pendiente de aprobación humana.';
      }
    }
  } else {
    // If no db, candidates not excluded or flagged remain PENDIENTE_COMPARACION
    for (const cand of candidates) {
      if (cand.classification === 'PENDIENTE_COMPARACION') {
        cand.classificationReason =
          'Sin conexión a base de datos para contrastar con el censo. Clasificación pendiente de verificación.';
      }
    }
  }

  return candidates;
}

function detectIntraBatchAmbiguities(candidates: NormalizedCandidate[]): void {
  // Check shared portal / identical street address
  const addressGroups = new Map<string, NormalizedCandidate[]>();

  for (const cand of candidates) {
    if (cand.classification === 'FUERA_DE_AMBITO' || cand.classification === 'DATOS_INSUFICIENTES') {
      continue;
    }

    const normAddr = normalizeAddressKey(cand.addressOriginal);
    if (normAddr) {
      const list = addressGroups.get(normAddr) || [];
      list.push(cand);
      addressGroups.set(normAddr, list);
    }
  }

  for (const [normAddr, group] of Array.from(addressGroups.entries())) {
    if (group.length > 1) {
      for (const cand of group) {
        const others = group.filter((c) => c.candidateId !== cand.candidateId);
        const otherNames = others.map((o) => `${o.candidateId} ("${o.proposedName}")`).join(', ');
        cand.classification = 'REVISAR_COINCIDENCIA';
        cand.classificationReason = `Comparte número/portal físico con ${otherNames} en ${cand.addressOriginal}. Posible sucesión de negocio o local compartido.`;
        cand.pendingDecisions.push(`Aclarar relación física con ${otherNames}`);
      }
    }
  }

  // Check same brand / commercial group in same zone or street
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      if (a.classification === 'FUERA_DE_AMBITO' || b.classification === 'FUERA_DE_AMBITO') continue;
      if (a.classification === 'DATOS_INSUFICIENTES' || b.classification === 'DATOS_INSUFICIENTES') continue;

      const brandKeywordsA = extractBrandKeywords(a.proposedName);
      const brandKeywordsB = extractBrandKeywords(b.proposedName);

      const commonBrand = brandKeywordsA.find((k) => brandKeywordsB.includes(k));
      if (commonBrand) {
        if (a.classification !== 'REVISAR_COINCIDENCIA') {
          a.classification = 'REVISAR_COINCIDENCIA';
          a.classificationReason = `Misma marca comercial ("${commonBrand}") y proximidad con ${b.candidateId} ("${b.proposedName}"). Distintos placeId.`;
          a.pendingDecisions.push(`Verificar si es local independiente o duplicado de ${b.candidateId}`);
        }
        if (b.classification !== 'REVISAR_COINCIDENCIA') {
          b.classification = 'REVISAR_COINCIDENCIA';
          b.classificationReason = `Misma marca comercial ("${commonBrand}") y proximidad con ${a.candidateId} ("${a.proposedName}"). Distintos placeId.`;
          b.pendingDecisions.push(`Verificar si es local independiente o duplicado de ${a.candidateId}`);
        }
      }
    }
  }

}

function normalizeAddressKey(address: string | undefined): string | null {
  if (!address) return null;
  const clean = address.toLowerCase();

  // Look for street pattern with number, e.g. "pl. mayor, 15" or "calle mayor 12"
  const match = clean.match(/(pl\.|plaza|calle|c\/|avda|avenida|paseo)?\s*([a-z0-9\s]+?)[,\s]+(\d+)/i);
  if (match) {
    const street = match[2].trim().replace(/\s+/g, ' ');
    const num = match[3].trim();
    if (street.length > 2) {
      return `${street}#${num}`;
    }
  }
  return null;
}

function extractBrandKeywords(name: string): string[] {
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const stopWords = new Set([
    'bar', 'restaurante', 'cafeteria', 'cerveceria', 'taberna', 'pub', 'la', 'el', 'los', 'las', 'de', 'del', 'en', 'y', 'd'
  ]);

  const words = clean.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const keywords: string[] = [];

  // Bigrams for compound brand names like "don jamon"
  for (let i = 0; i < words.length - 1; i++) {
    keywords.push(`${words[i]} ${words[i + 1]}`);
  }
  keywords.push(...words);

  return keywords;
}

async function matchAgainstDatabase(
  candidates: NormalizedCandidate[],
  cityId: number,
  db: Pool | PoolClient
): Promise<void> {
  // Check qr_sources
  const qrSourcesRes = await db.query(
    'SELECT id, accommodation_name FROM qr_sources WHERE city_id = $1',
    [cityId]
  );
  const qrSources = qrSourcesRes.rows;

  // Check venue_external_ids
  const extIdsRes = await db.query(
    'SELECT external_id, venue_id FROM venue_external_ids WHERE provider = $1',
    ['google_maps']
  );
  const extMap = new Map<string, number>();
  for (const r of extIdsRes.rows) {
    extMap.set(r.external_id, r.venue_id);
  }

  // Check venues in this city
  const venuesRes = await db.query(
    'SELECT id, name, slug, address, phone FROM venues WHERE city_id = $1',
    [cityId]
  );
  const existingVenues = venuesRes.rows;

  for (const cand of candidates) {
    // 1. Check placeId in venue_external_ids
    if (extMap.has(cand.placeId)) {
      const venueId = extMap.get(cand.placeId)!;
      cand.classification = 'YA_EXISTENTE';
      cand.matchingInternalId = venueId;
      cand.matchingInternalTable = 'venue_external_ids';
      cand.matchingEvidence = `Ya importado previamente en venue_external_ids vinculado a venue_id: ${venueId}.`;
      cand.classificationReason = `Local ya importado en el censo con el mismo placeId (${cand.placeId}).`;
      cand.approved = false;
      continue;
    }

    // 2. Check qr_sources (e.g. Hotel Castilla Vieja)
    const normCandName = cand.proposedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const qrMatch = qrSources.find((qr: any) => {
      const normQr = qr.accommodation_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normCandName.includes(normQr) || normQr.includes(normCandName);
    });

    if (qrMatch) {
      cand.matchingInternalId = qrMatch.id;
      cand.matchingInternalTable = 'qr_sources';
      cand.matchingEvidence = `Coincidencia con alojamiento registrado en qr_sources (id: ${qrMatch.id}, "${qrMatch.accommodation_name}").`;
      if (cand.classification !== 'FUERA_DE_AMBITO') {
        cand.classification = 'FUERA_DE_AMBITO';
        cand.classificationReason = `Alojamiento presente en qr_sources; fuera del alcance de este lote de hostelería/ocio.`;
      }
      continue;
    }

    // 3. Check existing venues by slug, name or phone
    const slugMatch = existingVenues.find((v: any) => v.slug === cand.proposedSlug);
    const nameMatch = existingVenues.find(
      (v: any) => v.name.toLowerCase().trim() === cand.proposedName.toLowerCase().trim()
    );
    const phoneMatch = cand.phoneUnformatted
      ? existingVenues.find(
          (v: any) =>
            v.phone &&
            v.phone.replace(/[^0-9]/g, '').length >= 9 &&
            cand.phoneUnformatted?.replace(/[^0-9]/g, '').endsWith(v.phone.replace(/[^0-9]/g, '').slice(-9))
        )
      : null;

    if (slugMatch || nameMatch || phoneMatch) {
      const matchVenue = slugMatch || nameMatch || phoneMatch;
      const reasons: string[] = [];
      if (slugMatch) reasons.push(`slug idéntico "${cand.proposedSlug}"`);
      if (nameMatch) reasons.push(`nombre idéntico "${cand.proposedName}"`);
      if (phoneMatch) reasons.push(`teléfono coincidente`);

      cand.matchingInternalId = matchVenue.id;
      cand.matchingInternalTable = 'venues';
      cand.matchingEvidence = `Coincidencia con venue existente id: ${matchVenue.id} ("${matchVenue.name}", slug: "${matchVenue.slug}") por ${reasons.join(', ')}.`;

      if (cand.classification !== 'FUERA_DE_AMBITO') {
        cand.classification = 'REVISAR_COINCIDENCIA';
        cand.classificationReason = `Coincide parcialmente con local existente id: ${matchVenue.id} ("${matchVenue.name}"). Requiere revisión humana para vincular o rechazar.`;
        cand.pendingDecisions.push(`Revisar si es el mismo local que venue ${matchVenue.id} para asociar placeId`);
      }
    }
  }
}
