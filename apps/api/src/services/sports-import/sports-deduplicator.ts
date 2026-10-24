import type { NormalizedSportsEvent } from './sports-types';

export interface ExistingEventSummary {
  id: number;
  dedupeKey: string | null;
  title: string;
  editorialDate: string;
  startTime: string | null;
  venueId: number | null;
  status: string;
  priceCents: number;
  isFree: boolean;
}

/**
 * Deduplica eventos comparando claves externas y criterios compuestos
 */
export class SportsDeduplicator {
  private existingByDedupeKey = new Map<string, ExistingEventSummary>();
  private existingByComposite = new Map<string, ExistingEventSummary>();

  constructor(existingEvents: ExistingEventSummary[]) {
    for (const ev of existingEvents) {
      if (ev.dedupeKey) {
        this.existingByDedupeKey.set(ev.dedupeKey, ev);
      }
      const compositeKey = this.makeCompositeKey(ev.title, ev.editorialDate, ev.venueId);
      this.existingByComposite.set(compositeKey, ev);
    }
  }

  private makeCompositeKey(title: string, date: string, venueId: number | null): string {
    const cleanTitle = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    return `${cleanTitle}___${date}___${venueId || 'null'}`;
  }

  /**
   * Determina si un evento ya existe en base de datos
   */
  public findDuplicate(event: NormalizedSportsEvent): ExistingEventSummary | null {
    // 1. Por clave única de deduplicación
    const byKey = this.existingByDedupeKey.get(event.dedupeKey);
    if (byKey) return byKey;

    // 2. Por clave compuesta (título normalizado + fecha + venue si está emparejado)
    const compositeKey = this.makeCompositeKey(event.title, event.editorialDate, event.matchedVenueId);
    const byComposite = this.existingByComposite.get(compositeKey);
    if (byComposite) return byComposite;

    return null;
  }
}
