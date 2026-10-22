import { OFFICIAL_SPORTS_SOURCES } from './sports-sources';
import { normalizeSportsEvent } from './sports-normalizer';
import { SportsDeduplicator, type ExistingEventSummary } from './sports-deduplicator';
import { SportsChangeDetector } from './sports-change-detector';
import type {
  RawSportsEvent,
  NormalizedSportsEvent,
  SportsImportReport,
  DetectedChange,
} from './sports-types';

export interface SportsImporterOptions {
  dryRun?: boolean;
  selectedSourceIds?: string[];
  rawEventsOverride?: RawSportsEvent[];
}

export class SportsImporter {
  private deduplicator: SportsDeduplicator;
  private changeDetector: SportsChangeDetector;

  constructor(
    private existingEvents: ExistingEventSummary[],
    private existingVenues: Array<{ id: number; name: string; slug: string }>
  ) {
    this.deduplicator = new SportsDeduplicator(existingEvents);
    this.changeDetector = new SportsChangeDetector();
  }

  /**
   * Ejecuta el pipeline de importación en modo controlado
   */
  public async runImport(options: SportsImporterOptions = {}): Promise<SportsImportReport> {
    const executionId = `sports-import-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const dryRun = options.dryRun !== false; // Por defecto siempre dryRun = true para seguridad

    const activeSources = OFFICIAL_SPORTS_SOURCES.filter(
      (s) => s.enabled && (!options.selectedSourceIds || options.selectedSourceIds.includes(s.id))
    );

    const sourcesReviewed = activeSources.map((s) => s.id);
    const rawEvents: RawSportsEvent[] = options.rawEventsOverride || [];

    const proposedEvents: NormalizedSportsEvent[] = [];
    const changes: DetectedChange[] = [];
    let duplicatesIgnoredCount = 0;
    const errors: { sourceId: string; message: string }[] = [];

    // 1. Normalizar eventos
    const normalizedList: NormalizedSportsEvent[] = [];
    for (const raw of rawEvents) {
      try {
        const norm = normalizeSportsEvent(raw, this.existingVenues);
        normalizedList.push(norm);
      } catch (err: any) {
        errors.push({
          sourceId: raw.sourceId,
          message: `Error al normalizar evento "${raw.title}": ${err.message}`,
        });
      }
    }

    // 2. Deduplicación y Detección de Cambios
    for (const norm of normalizedList) {
      const duplicate = this.deduplicator.findDuplicate(norm);
      if (duplicate) {
        duplicatesIgnoredCount++;
        // Si ya existe, comprobar si hay cambios oficiales
        const detected = this.changeDetector.detectChanges(duplicate, norm);
        if (detected.length > 0) {
          changes.push(...detected);
        }
      } else {
        // Evento nuevo propuesto
        proposedEvents.push(norm);
      }
    }

    // 3. Recopilar venues nuevos propuestos
    const venuesMap = new Map<string, { slug: string; name: string; address: string | null; count: number }>();
    for (const ev of proposedEvents) {
      if (ev.venueClassification === 'VENUE_NUEVO_PROPUESTO') {
        const key = ev.proposedVenueSlug;
        if (!venuesMap.has(key)) {
          venuesMap.set(key, {
            slug: ev.proposedVenueSlug,
            name: ev.venueName,
            address: ev.venueAddress,
            count: 1,
          });
        } else {
          venuesMap.get(key)!.count++;
        }
      }
    }

    const proposedNewVenues = Array.from(venuesMap.values()).map((v) => ({
      slug: v.slug,
      name: v.name,
      address: v.address,
      associatedEventsCount: v.count,
    }));

    const completedAt = new Date().toISOString();

    return {
      executionId,
      startedAt,
      completedAt,
      dryRun,
      sourcesReviewed,
      totalRawEventsExtracted: rawEvents.length,
      normalizedEventsCount: normalizedList.length,
      newProposedEventsCount: proposedEvents.length,
      duplicatesIgnoredCount,
      changesDetectedCount: changes.length,
      proposedNewVenues,
      changes,
      proposedEvents,
      errors,
    };
  }
}
