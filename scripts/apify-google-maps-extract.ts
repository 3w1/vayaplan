import { ApifyClient } from 'apify-client';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// TIPOS Y CONTRATOS
// ==============================================================================
export type MatchStatus = 'MATCHED' | 'NEEDS_MANUAL_REVIEW' | 'NOT_FOUND' | 'ERROR';

export interface VenueInput {
  source: string;
  official_name: string;
  official_address: string;
  city: string;
}

export interface RawExtractionData {
  extraction_date: string;
  apify_run_id: string | null;
  queries: string[];
  actor_name: string;
  total_results_returned: number;
  results: any[];
  metadata?: {
    status?: string;
    usage_total_usd?: number;
  };
}

export interface NormalizedVenue {
  place_id: string;
  google_maps_name: string;
  google_maps_address: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string;
  phone: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  reviews_count: number | null;
  found_in_queries: string[];
  extraction_run_id: string | null;
  extraction_date: string;
  raw_result: any;
}

export interface MatchResult {
  official_name: string;
  official_address: string;
  match_status: 'MATCHED' | 'NEEDS_MANUAL_REVIEW' | 'NOT_FOUND';
  match_score: number;
  matched_place_id: string | null;
  google_maps_name: string | null;
  google_maps_address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  reviews_count: number | null;
  found_in_queries: string[];
  extraction_run_id: string | null;
  extraction_date: string | null;
  raw_result: any | null;
}

// ==============================================================================
// REGLAS DE SEGURIDAD DEL TOKEN
// ==============================================================================
export function getAndValidateApifyToken(): string {
  const cliArgs = process.argv.slice(2);
  for (const arg of cliArgs) {
    if (/^--?token(=.*)?$/i.test(arg) || /^--?api-?key(=.*)?$/i.test(arg)) {
      console.error('Error de seguridad: APIFY_TOKEN solo debe pasarse mediante variable de entorno, nunca como argumento de línea de comandos.');
      process.exit(1);
    }
  }

  const token = process.env.APIFY_TOKEN;
  if (!token || !token.trim()) {
    console.error('APIFY_TOKEN no está configurado. Configúralo como variable de entorno antes de ejecutar la extracción.');
    process.exit(1);
  }

  return token.trim();
}

// ==============================================================================
// REGLA DE COORDENADAS
// ==============================================================================
export function validateCoordinates(lat: any, lng: any): { latitude: number | null; longitude: number | null } {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return { latitude: null, longitude: null };
  }
  const numLat = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const numLng = typeof lng === 'number' ? lng : parseFloat(String(lng));

  if (isNaN(numLat) || isNaN(numLng)) {
    return { latitude: null, longitude: null };
  }

  // Palencia y área circundante (margen geográfico razonable):
  // Latitud: 41.5 a 42.5 | Longitud: -5.2 a -4.0
  if (numLat >= 41.5 && numLat <= 42.5 && numLng >= -5.2 && numLng <= -4.0) {
    return {
      latitude: Math.round(numLat * 1e7) / 1e7,
      longitude: Math.round(numLng * 1e7) / 1e7
    };
  }

  return { latitude: null, longitude: null };
}

// ==============================================================================
// NORMALIZACIÓN Y PUNTUACIÓN HEURÍSTICA DE COINCIDENCIA
// ==============================================================================
const COMMON_NAME_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'en', 'by',
  'bar', 'restaurante', 'rte', 'asador', 'cafeteria', 'cerveceria',
  'hotel', 'meson', 'taberna', 'parrilla'
]);

export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\s]/g, ' ')   // Quitar puntuación
    .split(/\s+/)
    .filter(word => word.length > 0 && !COMMON_NAME_STOPWORDS.has(word))
    .join(' ');
}

export function normalizeAddress(addr: string): string {
  if (!addr) return '';
  let cleaned = addr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bc\s*\/\s*/g, 'calle ')
    .replace(/\bp[ºo]\.?\s*/g, 'paseo ')
    .replace(/[\/,\.]/g, ' ');

  // Estandarizar vías frecuentes
  cleaned = cleaned
    .replace(/\b(calle|c)\b/g, 'calle')
    .replace(/\b(avda|av|avenida)\b/g, 'avda')
    .replace(/\b(pl|plz|plaza)\b/g, 'plaza')
    .replace(/\b(paseo|pso)\b/g, 'paseo')
    .replace(/\b(ctra|carretera)\b/g, 'carretera');

  return cleaned
    .split(/\s+/)
    .filter(word => word.length > 0 && !COMMON_NAME_STOPWORDS.has(word))
    .join(' ');
}

function extractStreetNumber(str: string): string | null {
  const match = str.match(/\b\d{1,4}\b/);
  return match ? match[0] : null;
}

export function calculateTokenSimilarity(s1: string, s2: string): number {
  const tokens1 = new Set(s1.split(/\s+/).filter(Boolean));
  const tokens2 = new Set(s2.split(/\s+/).filter(Boolean));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) {
      intersection++;
    } else {
      for (const t2 of tokens2) {
        if ((t.length > 3 && t2.length > 3) && (t.includes(t2) || t2.includes(t))) {
          intersection += 0.8;
          break;
        }
      }
    }
  }

  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? Math.min(1, intersection / union) : 0;
}

export function evaluateCandidate(
  venue: VenueInput,
  candidate: any
): { score: number; status: MatchStatus } {
  const candName = candidate.title || candidate.google_maps_name || candidate.name || '';
  const candAddress = candidate.address || candidate.google_maps_address || candidate.fullAddress || candidate.street || '';

  const normOffName = normalizeName(venue.official_name);
  const normCandName = normalizeName(candName);

  const normOffAddr = normalizeAddress(venue.official_address);
  const normCandAddr = normalizeAddress(candAddress);

  // 1. Similitud de nombre
  const nameScore = calculateTokenSimilarity(normOffName, normCandName);

  // 2. Similitud de dirección
  const addrTokensScore = calculateTokenSimilarity(normOffAddr, normCandAddr);

  // 3. Coincidencia de número de calle
  const offNum = extractStreetNumber(venue.official_address);
  const candNum = extractStreetNumber(candAddress);
  const numberMatch = (offNum !== null && candNum !== null && offNum === candNum);
  const numberMismatch = (offNum !== null && candNum !== null && offNum !== candNum);

  let addressScore = addrTokensScore;
  if (numberMatch) {
    addressScore = Math.min(1, addressScore + 0.25);
  } else if (numberMismatch) {
    addressScore = Math.max(0, addressScore - 0.30);
  }

  // Ponderación: 60% nombre, 40% dirección
  let combinedScore = Math.round((nameScore * 0.6 + addressScore * 0.4) * 100) / 100;

  let status: MatchStatus = 'NOT_FOUND';
  if (combinedScore >= 0.80 && (addressScore >= 0.35 || numberMatch)) {
    status = 'MATCHED';
  } else if (combinedScore >= 0.50 || (nameScore >= 0.70 && addressScore > 0) || (nameScore >= 0.85 && candAddress.toLowerCase().includes('palencia'))) {
    status = 'NEEDS_MANUAL_REVIEW';
  } else {
    status = 'NOT_FOUND';
  }

  return { score: combinedScore, status };
}

// ==============================================================================
// REGLA DE DEDUPLICACIÓN Y NORMALIZACIÓN
// ==============================================================================
export function deduplicateCatalog(
  rawItems: any[],
  defaultQuery: string,
  extractionRunId: string | null,
  extractionDate: string,
  existingCatalog: NormalizedVenue[] = []
): NormalizedVenue[] {
  const map = new Map<string, NormalizedVenue>();

  // 1. Cargar existentes si los hay
  for (const v of existingCatalog) {
    map.set(v.place_id, { ...v, found_in_queries: [...v.found_in_queries] });
  }

  // 2. Procesar y fusionar nuevos items
  for (const item of rawItems) {
    const rawPlaceId = item.placeId || item.place_id || item.dataId || item.cid;
    if (!rawPlaceId) continue;
    const placeId = String(rawPlaceId).trim();

    const query = item.query || item.searchString || defaultQuery;
    const { latitude, longitude } = validateCoordinates(
      item.location?.lat ?? item.latitude,
      item.location?.lng ?? item.longitude
    );

    const reviewsCount = typeof item.reviewsCount === 'number'
      ? item.reviewsCount
      : (typeof item.ratingCount === 'number' ? item.ratingCount : null);
    const rating = typeof item.totalScore === 'number'
      ? item.totalScore
      : (typeof item.rating === 'number' ? item.rating : null);
    const gmapsUrl = item.googleMapsUrl || item.url || (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : '');

    const candidate: NormalizedVenue = {
      place_id: placeId,
      google_maps_name: item.title || item.name || '',
      google_maps_address: item.address || item.fullAddress || item.street || '',
      latitude,
      longitude,
      google_maps_url: gmapsUrl,
      phone: item.phone || item.phoneNumber || null,
      website: item.website || null,
      category: item.categoryName || item.type || (Array.isArray(item.categories) ? item.categories[0] : null) || null,
      rating,
      reviews_count: reviewsCount,
      found_in_queries: query ? [query] : [],
      extraction_run_id: extractionRunId,
      extraction_date: extractionDate,
      raw_result: item
    };

    if (map.has(placeId)) {
      const existing = map.get(placeId)!;
      if (query && !existing.found_in_queries.includes(query)) {
        existing.found_in_queries.push(query);
      }

      // Combinar campos no nulos para enriquecer el registro canónico
      if (!existing.phone && candidate.phone) existing.phone = candidate.phone;
      if (!existing.website && candidate.website) existing.website = candidate.website;
      if (existing.latitude === null && candidate.latitude !== null) {
        existing.latitude = candidate.latitude;
        existing.longitude = candidate.longitude;
      }
      if (existing.rating === null && candidate.rating !== null) existing.rating = candidate.rating;
      if (existing.reviews_count === null && candidate.reviews_count !== null) existing.reviews_count = candidate.reviews_count;
      if (!existing.category && candidate.category) existing.category = candidate.category;
      if (!existing.google_maps_address && candidate.google_maps_address) existing.google_maps_address = candidate.google_maps_address;
    } else {
      map.set(placeId, candidate);
    }
  }

  return Array.from(map.values());
}

// ==============================================================================
// LÓGICA DE CRUCE CON LOCALES OFICIALES
// ==============================================================================
export function matchCatalogWithOfficialVenues(
  catalog: NormalizedVenue[],
  officialVenues: VenueInput[]
): MatchResult[] {
  const matches: MatchResult[] = [];

  for (const official of officialVenues) {
    let bestCandidate: NormalizedVenue | null = null;
    let bestScore = 0;
    let secondBestScore = 0;
    let evaluatedCandidates: Array<{ candidate: NormalizedVenue; score: number; status: MatchStatus }> = [];

    for (const item of catalog) {
      const { score, status } = evaluateCandidate(official, item);
      if (score >= 0.40) {
        evaluatedCandidates.push({ candidate: item, score, status });
      }
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestCandidate = item;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    let finalStatus: 'MATCHED' | 'NEEDS_MANUAL_REVIEW' | 'NOT_FOUND' = 'NOT_FOUND';

    if (bestCandidate && bestScore >= 0.80) {
      // Si hay varios candidatos muy cercanos con alta puntuación, forzar revisión manual
      if (evaluatedCandidates.filter(c => c.score >= 0.75).length > 1 && (bestScore - secondBestScore) < 0.10) {
        finalStatus = 'NEEDS_MANUAL_REVIEW';
      } else {
        finalStatus = 'MATCHED';
      }
    } else if (bestCandidate && bestScore >= 0.50) {
      finalStatus = 'NEEDS_MANUAL_REVIEW';
    } else {
      finalStatus = 'NOT_FOUND';
    }

    if (finalStatus === 'NOT_FOUND' || !bestCandidate) {
      matches.push({
        official_name: official.official_name,
        official_address: official.official_address,
        match_status: 'NOT_FOUND',
        match_score: 0,
        matched_place_id: null,
        google_maps_name: null,
        google_maps_address: null,
        latitude: null,
        longitude: null,
        google_maps_url: null,
        phone: null,
        website: null,
        category: null,
        rating: null,
        reviews_count: null,
        found_in_queries: [],
        extraction_run_id: null,
        extraction_date: null,
        raw_result: null
      });
    } else {
      matches.push({
        official_name: official.official_name,
        official_address: official.official_address,
        match_status: finalStatus,
        match_score: bestScore,
        matched_place_id: bestCandidate.place_id,
        google_maps_name: bestCandidate.google_maps_name,
        google_maps_address: bestCandidate.google_maps_address,
        latitude: bestCandidate.latitude,
        longitude: bestCandidate.longitude,
        google_maps_url: bestCandidate.google_maps_url,
        phone: bestCandidate.phone,
        website: bestCandidate.website,
        category: bestCandidate.category,
        rating: bestCandidate.rating,
        reviews_count: bestCandidate.reviews_count,
        found_in_queries: bestCandidate.found_in_queries,
        extraction_run_id: bestCandidate.extraction_run_id,
        extraction_date: bestCandidate.extraction_date,
        raw_result: bestCandidate.raw_result
      });
    }
  }

  return matches;
}

// ==============================================================================
// EXPORTACIÓN A CSV
// ==============================================================================
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const str = Array.isArray(val) ? val.join('; ') : (typeof val === 'object' ? JSON.stringify(val) : String(val));
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCatalogToCsv(catalog: NormalizedVenue[]): string {
  const headers = [
    'place_id',
    'google_maps_name',
    'google_maps_address',
    'latitude',
    'longitude',
    'google_maps_url',
    'phone',
    'website',
    'category',
    'rating',
    'reviews_count',
    'found_in_queries',
    'extraction_run_id',
    'extraction_date'
  ];

  const lines = [headers.join(',')];
  for (const v of catalog) {
    const row = [
      escapeCsvValue(v.place_id),
      escapeCsvValue(v.google_maps_name),
      escapeCsvValue(v.google_maps_address),
      escapeCsvValue(v.latitude),
      escapeCsvValue(v.longitude),
      escapeCsvValue(v.google_maps_url),
      escapeCsvValue(v.phone),
      escapeCsvValue(v.website),
      escapeCsvValue(v.category),
      escapeCsvValue(v.rating),
      escapeCsvValue(v.reviews_count),
      escapeCsvValue(v.found_in_queries),
      escapeCsvValue(v.extraction_run_id),
      escapeCsvValue(v.extraction_date)
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function exportMatchesToCsv(matches: MatchResult[]): string {
  const headers = [
    'official_name',
    'official_address',
    'match_status',
    'match_score',
    'matched_place_id',
    'google_maps_name',
    'google_maps_address',
    'latitude',
    'longitude',
    'google_maps_url',
    'phone',
    'website',
    'category',
    'rating',
    'reviews_count',
    'found_in_queries',
    'extraction_run_id',
    'extraction_date'
  ];

  const lines = [headers.join(',')];
  for (const m of matches) {
    const row = [
      escapeCsvValue(m.official_name),
      escapeCsvValue(m.official_address),
      escapeCsvValue(m.match_status),
      escapeCsvValue(m.match_score),
      escapeCsvValue(m.matched_place_id),
      escapeCsvValue(m.google_maps_name),
      escapeCsvValue(m.google_maps_address),
      escapeCsvValue(m.latitude),
      escapeCsvValue(m.longitude),
      escapeCsvValue(m.google_maps_url),
      escapeCsvValue(m.phone),
      escapeCsvValue(m.website),
      escapeCsvValue(m.category),
      escapeCsvValue(m.rating),
      escapeCsvValue(m.reviews_count),
      escapeCsvValue(m.found_in_queries),
      escapeCsvValue(m.extraction_run_id),
      escapeCsvValue(m.extraction_date)
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// ==============================================================================
// EJECUCIÓN DEL ACTOR APIFY
// ==============================================================================
async function callApifyActorForQueries(
  client: ApifyClient,
  queries: string[],
  num: number = 200
): Promise<{ runId: string | null; items: any[]; usageTotalUsd?: number }> {
  const actorInput = {
    query: queries,
    num,
    gl: 'es',
    hl: 'es',
    popularTimes: false,
    reviews: false,
    maxReviews: 0
  };

  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`Invocando scraperlink/google-maps-scraper con ${queries.length} búsqueda(s) (num=${num})...`);
      const run = await client.actor('scraperlink/google-maps-scraper').call(actorInput);
      const datasetId = run.defaultDatasetId;
      const { items } = await client.dataset(datasetId).listItems();
      return { runId: run.id, items: items || [], usageTotalUsd: run.usageTotalUsd };
    } catch (err: any) {
      lastError = err;
      if (attempt <= maxRetries) {
        console.warn(`[Intento ${attempt}] Error al llamar actor Apify: ${err.message}. Reintentando en 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  throw new Error(`Fallo tras reintentos al invocar Apify: ${lastError?.message || String(lastError)}`);
}

// ==============================================================================
// PIPELINE COMPLETO DE CATÁLOGO Y CRUCE
// ==============================================================================
export interface PipelineOptions {
  queries: string[];
  num?: number;
  forceRefresh?: boolean;
  baseDataDir?: string;
  officialVenuesInputPath?: string;
}

export async function runHospitalityPipeline(options: PipelineOptions) {
  const token = getAndValidateApifyToken();
  const client = new ApifyClient({ token });

  const num = options.num ?? 200;
  const baseDataDir = options.baseDataDir || 'data/google-maps/palencia-hospitality';
  const officialVenuesPath = options.officialVenuesInputPath || 'scripts/data/pucherito-2025-input.json';

  const rawDir = path.join(baseDataDir, 'raw');
  const normalizedDir = path.join(baseDataDir, 'normalized');
  const matchesDir = path.join(baseDataDir, 'matches');

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.mkdirSync(matchesDir, { recursive: true });

  const normalizedJsonPath = path.join(normalizedDir, 'palencia-hospitality-catalog.json');
  const normalizedCsvPath = path.join(normalizedDir, 'palencia-hospitality-catalog.csv');
  const matchesJsonPath = path.join(matchesDir, 'pucherito-2025-match-results.json');
  const matchesCsvPath = path.join(matchesDir, 'pucherito-2025-match-results.csv');

  let normalizedCatalog: NormalizedVenue[] = [];
  let rawDataRecord: RawExtractionData | null = null;
  const extractionDate = new Date().toISOString();

  // 1. Comprobar si ya existe catálogo previo si no se fuerza la recarga
  if (!options.forceRefresh && fs.existsSync(normalizedJsonPath)) {
    console.log(`Catálogo canónico existente encontrado en "${normalizedJsonPath}". Reutilizando dataset sin llamadas a Apify...`);
    normalizedCatalog = JSON.parse(fs.readFileSync(normalizedJsonPath, 'utf8'));
  } else {
    // 2. Ejecutar extracción con Apify
    const { runId, items, usageTotalUsd } = await callApifyActorForQueries(client, options.queries, num);

    const timestampStr = extractionDate.replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const rawFilePath = path.join(rawDir, `apify-raw-results-${timestampStr}.json`);

    rawDataRecord = {
      extraction_date: extractionDate,
      apify_run_id: runId,
      queries: options.queries,
      actor_name: 'scraperlink/google-maps-scraper',
      total_results_returned: items.length,
      results: items,
      metadata: {
        status: 'SUCCEEDED',
        usage_total_usd: usageTotalUsd
      }
    };

    fs.writeFileSync(rawFilePath, JSON.stringify(rawDataRecord, null, 2), 'utf8');
    console.log(`Datos raw guardados en: ${rawFilePath} (${items.length} items recibidos)`);

    // 3. Normalizar y deduplicar
    normalizedCatalog = deduplicateCatalog(items, options.queries[0], runId, extractionDate);

    fs.writeFileSync(normalizedJsonPath, JSON.stringify(normalizedCatalog, null, 2), 'utf8');
    fs.writeFileSync(normalizedCsvPath, exportCatalogToCsv(normalizedCatalog), 'utf8');
    console.log(`Catálogo normalizado guardado en: ${normalizedJsonPath} (${normalizedCatalog.length} locales únicos)`);
  }

  // 4. Cargar locales oficiales para el cruce
  if (!fs.existsSync(officialVenuesPath)) {
    throw new Error(`Archivo de locales oficiales no encontrado en: "${officialVenuesPath}"`);
  }
  const officialVenues: VenueInput[] = JSON.parse(fs.readFileSync(officialVenuesPath, 'utf8'));

  // 5. Ejecutar cruce
  const matches = matchCatalogWithOfficialVenues(normalizedCatalog, officialVenues);

  fs.writeFileSync(matchesJsonPath, JSON.stringify(matches, null, 2), 'utf8');
  fs.writeFileSync(matchesCsvPath, exportMatchesToCsv(matches), 'utf8');
  console.log(`Resultados de cruce guardados en: ${matchesJsonPath}`);

  const counts = {
    MATCHED: matches.filter(m => m.match_status === 'MATCHED').length,
    NEEDS_MANUAL_REVIEW: matches.filter(m => m.match_status === 'NEEDS_MANUAL_REVIEW').length,
    NOT_FOUND: matches.filter(m => m.match_status === 'NOT_FOUND').length
  };

  const coordsValid = normalizedCatalog.filter(v => v.latitude !== null && v.longitude !== null).length;

  console.log('\n========================================');
  console.log('RESUMEN DEL PIPELINE DE HOSTELERÍA');
  console.log('========================================');
  console.log(`Locales únicos en catálogo:    ${normalizedCatalog.length}`);
  console.log(`Con coordenadas válidas:       ${coordsValid}`);
  console.log(`Locales oficiales cruzados:    ${officialVenues.length}`);
  console.log(`  - MATCHED:                   ${counts.MATCHED}`);
  console.log(`  - NEEDS_MANUAL_REVIEW:       ${counts.NEEDS_MANUAL_REVIEW}`);
  console.log(`  - NOT_FOUND:                 ${counts.NOT_FOUND}`);
  console.log('========================================\n');

  return {
    rawExtraction: rawDataRecord,
    catalog: normalizedCatalog,
    matches,
    counts,
    coordsValid
  };
}

// Ejecución vía CLI si se invoca directamente
if (import.meta.main) {
  const args = process.argv.slice(2);
  let mode = 'pretest'; // pretest | full | match-only
  let force = false;

  for (const arg of args) {
    if (arg === '--full') mode = 'full';
    if (arg === '--pretest') mode = 'pretest';
    if (arg === '--force') force = true;
  }

  const pretestQueries = ['restaurantes en Palencia'];
  const fullQueries = [
    'restaurantes en Palencia',
    'bares en Palencia',
    'mesones en Palencia',
    'asadores en Palencia',
    'cervecerías en Palencia',
    'hoteles en Palencia'
  ];

  const queries = mode === 'full' ? fullQueries : pretestQueries;

  runHospitalityPipeline({
    queries,
    num: 200,
    forceRefresh: force || true
  }).catch(err => {
    console.error('Error fatal en pipeline:', err.message);
    process.exit(1);
  });
}
