import { SportsImporter } from './sports-importer';
import type { RawSportsEvent, SportsImportReport } from './sports-types';

/**
 * Lote inicial de eventos deportivos reales y observables recopilados de fuentes oficiales
 * para la ciudad de Palencia en otoño/invierno de 2026.
 */
export const INITIAL_OBSERVABLE_SPORTS_EVENTS: RawSportsEvent[] = [
  // 1. BALONCESTO — Primera FEB (Jornada 5) — Pabellón Municipal de Palencia
  {
    sourceId: 'feb_primera_feb',
    externalId: '2026-10-24-super-agropal-palencia-club-ourense-baloncesto',
    title: 'Súper Agropal Palencia vs. Club Ourense Baloncesto',
    sport: 'baloncesto',
    competition: 'Primera FEB',
    round: 'Jornada 5',
    homeTeam: 'Súper Agropal Palencia',
    awayTeam: 'Club Ourense Baloncesto',
    rawDate: '2026-10-24',
    rawTime: '19:00',
    venueName: 'Pabellón Municipal de Deportes de Palencia',
    venueAddress: 'Avenida del Obispo Barberá, s/n, 34005 Palencia',
    city: 'Palencia',
    isFree: false,
    priceCents: 0, // Entradas en taquilla / festival
    rawPriceText: 'Venta de entradas en taquilla y abonados club',
    officialSourceUrl: 'https://palenciabaloncesto.com/calendario/',
    imageUrl: null,
    status: 'confirmed',
  },
  // 2. FÚTBOL — Tercera Federación Grupo VIII (Jornada 9 - El Gran Derbi) — Nueva Balastera
  {
    sourceId: 'fcylf_futbol',
    externalId: '2026-11-01-palencia-cristo-atletico-palencia-cf',
    title: 'Palencia Cristo Atlético vs. Palencia CF',
    sport: 'futbol',
    competition: 'Tercera Federación — Grupo VIII',
    round: 'Jornada 9 (El Derbi)',
    homeTeam: 'Palencia Cristo Atlético',
    awayTeam: 'Palencia CF',
    rawDate: '2026-11-01',
    rawTime: '17:00',
    venueName: 'Estadio Municipal Nueva Balastera',
    venueAddress: 'Calle Lola de la Fuente, s/n, 34004 Palencia',
    city: 'Palencia',
    isFree: false,
    priceCents: 0,
    rawPriceText: 'Taquilla oficial y socios del club',
    officialSourceUrl: 'https://www.fcylf.es/competiciones',
    imageUrl: null,
    status: 'confirmed',
  },
  // 3. FÚTBOL — Tercera Federación Grupo VIII (Jornada 11) — Nueva Balastera
  {
    sourceId: 'fcylf_futbol',
    externalId: '2026-11-15-palencia-cristo-atletico-burgos-cf-promesas',
    title: 'Palencia Cristo Atlético vs. Burgos CF Promesas',
    sport: 'futbol',
    competition: 'Tercera Federación — Grupo VIII',
    round: 'Jornada 11',
    homeTeam: 'Palencia Cristo Atlético',
    awayTeam: 'Burgos CF Promesas',
    rawDate: '2026-11-15',
    rawTime: '17:00',
    venueName: 'Estadio Municipal Nueva Balastera',
    venueAddress: 'Calle Lola de la Fuente, s/n, 34004 Palencia',
    city: 'Palencia',
    isFree: false,
    priceCents: 0,
    officialSourceUrl: 'https://palenciacristoatletico.com/',
    imageUrl: null,
    status: 'confirmed',
  },
  // 4. FÚTBOL — Tercera Federación Grupo VIII (Jornada 13) — Nueva Balastera
  {
    sourceId: 'fcylf_futbol',
    externalId: '2026-11-29-palencia-cristo-atletico-sd-almazan',
    title: 'Palencia Cristo Atlético vs. SD Almazán',
    sport: 'futbol',
    competition: 'Tercera Federación — Grupo VIII',
    round: 'Jornada 13',
    homeTeam: 'Palencia Cristo Atlético',
    awayTeam: 'SD Almazán',
    rawDate: '2026-11-29',
    rawTime: '17:00',
    venueName: 'Estadio Municipal Nueva Balastera',
    venueAddress: 'Calle Lola de la Fuente, s/n, 34004 Palencia',
    city: 'Palencia',
    isFree: false,
    priceCents: 0,
    officialSourceUrl: 'https://palenciacristoatletico.com/',
    imageUrl: null,
    status: 'confirmed',
  },
  // 5. RUGBY — Liga Senior Masculina CyL — Campos de Rugby Nueva Balastera
  {
    sourceId: 'palencia_rugby_club',
    externalId: '2026-11-08-silicius-palencia-rugby-club-salamanca-rugby-club',
    title: 'Silicius Palencia Rugby Club vs. Salamanca Rugby Club',
    sport: 'rugby',
    competition: 'Liga Senior Masculina Castilla y León',
    round: 'Competición Regular',
    homeTeam: 'Silicius Palencia Rugby Club',
    awayTeam: 'Salamanca Rugby Club',
    rawDate: '2026-11-08',
    rawTime: '12:00',
    venueName: 'Campos de Rugby de la Nueva Balastera',
    venueAddress: 'Paseo de la Julia / C/ San Antonio, 34004 Palencia',
    city: 'Palencia',
    isFree: true,
    priceCents: 0,
    rawPriceText: 'Acceso libre para aficionados',
    officialSourceUrl: 'https://rugbyclubpalencia.com/',
    imageUrl: null,
    status: 'confirmed',
  },
  // 6. ATLETISMO POPULAR — XLV San Silvestre Palentina — Patronato Municipal de Deportes
  {
    sourceId: 'sansilvestre_palentina',
    externalId: '2026-12-31-xlv-san-silvestre-palentina-2026',
    title: 'XLV San Silvestre Palentina 2026',
    sport: 'cultura',
    competition: 'Circuito de Carreras Populares PMD',
    round: 'Carrera Popular 6 km',
    rawDate: '2026-12-31',
    rawTime: '18:00',
    venueName: 'Calle Mayor de Palencia — Espacio Público',
    venueAddress: 'Desde el Salón a la Plaza Mayor, Palencia',
    city: 'Palencia',
    isFree: true,
    priceCents: 0,
    rawPriceText: 'Inscripción gratuita con fines solidarios',
    officialSourceUrl: 'http://sansilvestrepalentina.com/',
    imageUrl: null,
    status: 'confirmed',
  },
];

export async function runSportsImportManual(dryRun = true): Promise<SportsImportReport> {
  const { execSync } = await import('node:child_process');

  // 1. Obtener recintos actuales desde PostgreSQL
  const venuesRaw = execSync(
    `docker exec -i vayaplan_postgres psql -U vayaplan_user -d vayaplan -t -A -F "|||" -c "SELECT id, name, slug FROM venues;"`,
    { encoding: 'utf-8' }
  );
  const existingVenues = venuesRaw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, name, slug] = line.split('|||');
      return { id: Number(id), name, slug };
    });

  // 2. Obtener eventos actuales desde PostgreSQL
  const eventsRaw = execSync(
    `docker exec -i vayaplan_postgres psql -U vayaplan_user -d vayaplan -t -A -F "|||" -c "SELECT id, dedupe_key, title, editorial_date, start_time, venue_id, status, price_cents, is_free FROM events;"`,
    { encoding: 'utf-8' }
  );
  const existingEvents = eventsRaw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, dedupeKey, title, editorialDate, startTime, venueId, status, priceCents, isFree] = line.split('|||');
      return {
        id: Number(id),
        dedupeKey: dedupeKey || null,
        title,
        editorialDate,
        startTime: startTime || null,
        venueId: venueId ? Number(venueId) : null,
        status,
        priceCents: Number(priceCents || 0),
        isFree: isFree === 't',
      };
    });

  // 3. Instanciar importador y ejecutar en modo dry-run
  const importer = new SportsImporter(existingEvents, existingVenues);
  const report = await importer.runImport({
    dryRun,
    rawEventsOverride: INITIAL_OBSERVABLE_SPORTS_EVENTS,
  });

  return report;
}

if (import.meta.main) {
  runSportsImportManual(true)
    .then((report) => {
      console.log('=== INFORME DE EJECUCIÓN MANUAL — IMPORTADOR DEPORTIVO (MODO DRY-RUN) ===');
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Error al ejecutar importador:', err);
      process.exit(1);
    });
}
