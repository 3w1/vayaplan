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

export interface ExtractionResult {
  source: string;
  official_name: string;
  official_address: string;
  search_query: string;
  match_status: MatchStatus;
  apify_run_id: string | null;
  apify_place_id: string | null;
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
  match_score: number | null;
  error_message: string | null;
  raw_result: any | null;
}

// ==============================================================================
// REGLAS DE SEGURIDAD DEL TOKEN
// ==============================================================================
function getAndValidateApifyToken(): string {
  // 1. Prohibir argumentos CLI con token
  const cliArgs = process.argv.slice(2);
  for (const arg of cliArgs) {
    if (/^--?token(=.*)?$/i.test(arg) || /^--?api-?key(=.*)?$/i.test(arg)) {
      console.error('Error de seguridad: APIFY_TOKEN solo debe pasarse mediante variable de entorno, nunca como argumento de línea de comandos.');
      process.exit(1);
    }
  }

  // 2. Comprobar variable de entorno
  const token = process.env.APIFY_TOKEN;
  if (!token || !token.trim()) {
    console.error('APIFY_TOKEN no está configurado. Configúralo como variable de entorno antes de ejecutar la extracción.');
    process.exit(1);
  }

  return token.trim();
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
      // Coincidencia parcial si una contiene a otra (ej. 'braseria' vs 'braseria-')
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
  const candName = candidate.title || candidate.name || '';
  const candAddress = candidate.address || candidate.fullAddress || candidate.street || '';

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
  const numberMatch = (offNum && candNum && offNum === candNum);
  const numberMismatch = (offNum && candNum && offNum !== candNum);

  let addressScore = addrTokensScore;
  if (numberMatch) {
    addressScore = Math.min(1, addressScore + 0.2);
  } else if (numberMismatch) {
    addressScore = Math.max(0, addressScore - 0.25);
  }

  // 4. Puntuación ponderada: 60% nombre, 40% dirección
  let combinedScore = Math.round((nameScore * 0.6 + addressScore * 0.4) * 100) / 100;

  // Regla fundamental: NO dar por encontrado solo por nombre si la dirección no acompaña
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
// EJECUCIÓN DEL ACTOR APIFY
// ==============================================================================
async function fetchApifyVenue(
  client: ApifyClient,
  venue: VenueInput
): Promise<{ runId: string | null; items: any[]; error?: string }> {
  const query = `${venue.official_name} ${venue.official_address} ${venue.city}`.trim();
  const actorInput = {
    query: [query],
    num: 10,
    gl: 'es',
    hl: 'es',
    popularTimes: false,
    reviews: false,
    maxReviews: 0,
    maxImages: 0
  };

  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const run = await client.actor('scraperlink/google-maps-scraper').call(actorInput);
      const datasetId = run.defaultDatasetId;
      const { items } = await client.dataset(datasetId).listItems();
      return { runId: run.id, items: items || [] };
    } catch (err: any) {
      lastError = err;
      if (attempt <= maxRetries) {
        console.warn(`[Intento ${attempt}] Error de conexión con Apify para "${venue.official_name}": ${err.message}. Reintentando en 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  return {
    runId: null,
    items: [],
    error: lastError ? (lastError.message || String(lastError)) : 'Error desconocido al invocar actor Apify'
  };
}

// ==============================================================================
// EXPORTACIÓN A CSV
// ==============================================================================
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function exportToCsv(results: ExtractionResult[]): string {
  const headers = [
    'source',
    'official_name',
    'official_address',
    'search_query',
    'match_status',
    'apify_run_id',
    'apify_place_id',
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
    'match_score',
    'error_message'
  ];

  const lines = [headers.join(',')];

  for (const r of results) {
    const row = [
      escapeCsvValue(r.source),
      escapeCsvValue(r.official_name),
      escapeCsvValue(r.official_address),
      escapeCsvValue(r.search_query),
      escapeCsvValue(r.match_status),
      escapeCsvValue(r.apify_run_id),
      escapeCsvValue(r.apify_place_id),
      escapeCsvValue(r.google_maps_name),
      escapeCsvValue(r.google_maps_address),
      escapeCsvValue(r.latitude),
      escapeCsvValue(r.longitude),
      escapeCsvValue(r.google_maps_url),
      escapeCsvValue(r.phone),
      escapeCsvValue(r.website),
      escapeCsvValue(r.category),
      escapeCsvValue(r.rating),
      escapeCsvValue(r.reviews_count),
      escapeCsvValue(r.match_score),
      escapeCsvValue(r.error_message)
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// ==============================================================================
// CONTROLADOR PRINCIPAL
// ==============================================================================
export async function runExtraction(inputFilePath: string, outputJsonPath: string) {
  const token = getAndValidateApifyToken();
  const client = new ApifyClient({ token });

  if (!fs.existsSync(inputFilePath)) {
    console.error(`Error: Archivo de entrada no encontrado en "${inputFilePath}".`);
    process.exit(1);
  }

  const rawInput = fs.readFileSync(inputFilePath, 'utf8');
  let venues: VenueInput[] = [];
  try {
    venues = JSON.parse(rawInput);
  } catch (err: any) {
    console.error(`Error al parsear JSON de entrada: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(venues) || venues.length === 0) {
    console.error('Error: El archivo de entrada debe contener un array no vacío de locales.');
    process.exit(1);
  }

  console.log(`Iniciando extracción con Apify (scraperlink/google-maps-scraper) para ${venues.length} local(es)...`);

  const results: ExtractionResult[] = [];

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    const searchQuery = `${venue.official_name} ${venue.official_address} ${venue.city}`.trim();
    console.log(`[${i + 1}/${venues.length}] Procesando: "${venue.official_name}" (${venue.official_address})...`);

    const { runId, items, error } = await fetchApifyVenue(client, venue);

    if (error) {
      console.error(`  -> ERROR técnico en Apify: ${error}`);
      results.push({
        source: venue.source,
        official_name: venue.official_name,
        official_address: venue.official_address,
        search_query: searchQuery,
        match_status: 'ERROR',
        apify_run_id: runId,
        apify_place_id: null,
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
        match_score: null,
        error_message: error,
        raw_result: null
      });
      continue;
    }

    if (!items || items.length === 0) {
      console.log('  -> NOT_FOUND (0 resultados devueltos por Google Maps)');
      results.push({
        source: venue.source,
        official_name: venue.official_name,
        official_address: venue.official_address,
        search_query: searchQuery,
        match_status: 'NOT_FOUND',
        apify_run_id: runId,
        apify_place_id: null,
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
        match_score: 0,
        error_message: null,
        raw_result: null
      });
      continue;
    }

    // Evaluar cada candidato devuelto
    let bestCandidate: any = null;
    let bestScore = -1;
    let bestStatus: MatchStatus = 'NOT_FOUND';

    for (const cand of items) {
      const evaluation = evaluateCandidate(venue, cand);
      if (evaluation.score > bestScore) {
        bestScore = evaluation.score;
        bestCandidate = cand;
        bestStatus = evaluation.status;
      }
    }

    const placeId = bestCandidate?.placeId || bestCandidate?.id || bestCandidate?.cid || null;
    const gName = bestCandidate?.title || bestCandidate?.name || null;
    const gAddress = bestCandidate?.address || bestCandidate?.fullAddress || bestCandidate?.street || null;
    const lat = bestCandidate?.location?.lat ?? bestCandidate?.latitude ?? null;
    const lng = bestCandidate?.location?.lng ?? bestCandidate?.longitude ?? null;
    const gUrl = bestCandidate?.url || bestCandidate?.googleMapsUrl || null;
    const phone = bestCandidate?.phone || bestCandidate?.phoneNumber || null;
    const website = bestCandidate?.website || null;
    const category = bestCandidate?.categoryName || (Array.isArray(bestCandidate?.categories) ? bestCandidate.categories[0] : null) || null;
    const rating = typeof bestCandidate?.totalScore === 'number' ? bestCandidate.totalScore : (typeof bestCandidate?.rating === 'number' ? bestCandidate.rating : null);
    const reviewsCount = typeof bestCandidate?.reviewsCount === 'number' ? bestCandidate.reviewsCount : (typeof bestCandidate?.reviews_count === 'number' ? bestCandidate.reviews_count : null);

    console.log(`  -> Estado: ${bestStatus} (Score: ${bestScore}) | Encontrado: "${gName || '—'}" (${gAddress || '—'})`);

    results.push({
      source: venue.source,
      official_name: venue.official_name,
      official_address: venue.official_address,
      search_query: searchQuery,
      match_status: bestStatus,
      apify_run_id: runId,
      apify_place_id: placeId,
      google_maps_name: gName,
      google_maps_address: gAddress,
      latitude: typeof lat === 'number' ? lat : (lat ? parseFloat(lat) : null),
      longitude: typeof lng === 'number' ? lng : (lng ? parseFloat(lng) : null),
      google_maps_url: gUrl,
      phone,
      website,
      category,
      rating,
      reviews_count: reviewsCount,
      match_score: bestScore,
      error_message: null,
      raw_result: bestCandidate
    });
  }

  // Guardar JSON y CSV
  const outputDir = path.dirname(outputJsonPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputJsonPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nResultados JSON guardados en: ${outputJsonPath}`);

  const outputCsvPath = outputJsonPath.replace(/\.json$/i, '.csv');
  const csvContent = exportToCsv(results);
  fs.writeFileSync(outputCsvPath, csvContent, 'utf8');
  console.log(`Resultados CSV guardados en: ${outputCsvPath}`);

  // Resumen
  const counts = {
    MATCHED: results.filter(r => r.match_status === 'MATCHED').length,
    NEEDS_MANUAL_REVIEW: results.filter(r => r.match_status === 'NEEDS_MANUAL_REVIEW').length,
    NOT_FOUND: results.filter(r => r.match_status === 'NOT_FOUND').length,
    ERROR: results.filter(r => r.match_status === 'ERROR').length
  };

  console.log('\n--- RESUMEN DE EXTRACCIÓN ---');
  console.log(`Total procesados:       ${results.length}`);
  console.log(`MATCHED:                ${counts.MATCHED}`);
  console.log(`NEEDS_MANUAL_REVIEW:    ${counts.NEEDS_MANUAL_REVIEW}`);
  console.log(`NOT_FOUND:              ${counts.NOT_FOUND}`);
  console.log(`ERROR:                  ${counts.ERROR}`);
  console.log('------------------------------');

  return results;
}

// Ejecución vía CLI si se invoca directamente
if (import.meta.main) {
  const args = process.argv.slice(2);
  let inputPath = 'scripts/data/pucherito-2025-input.json';
  let outputPath = 'output/apify-google-maps-results.json';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  runExtraction(inputPath, outputPath).catch(err => {
    console.error('Error fatal durante la extracción:', err.message);
    process.exit(1);
  });
}
