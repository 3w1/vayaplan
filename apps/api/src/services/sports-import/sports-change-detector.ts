import type { NormalizedSportsEvent, DetectedChange } from './sports-types';
import type { ExistingEventSummary } from './sports-deduplicator';

/**
 * Detecta discrepancias u oscilaciones entre el evento existente en base de datos
 * y los datos recién obtenidos de la fuente oficial deportiva.
 */
export class SportsChangeDetector {
  /**
   * Compara evento nuevo con evento existente y devuelve lista de cambios observables
   */
  public detectChanges(
    existing: ExistingEventSummary,
    incoming: NormalizedSportsEvent
  ): DetectedChange[] {
    const changes: DetectedChange[] = [];
    const nowIso = new Date().toISOString();

    // 1. Cambio de fecha editorial
    if (existing.editorialDate !== incoming.editorialDate) {
      changes.push({
        eventId: existing.id,
        dedupeKey: incoming.dedupeKey,
        field: 'editorial_date',
        oldValue: existing.editorialDate,
        newValue: incoming.editorialDate,
        changeType: 'RESCHEDULED_DATE',
        detectedAt: nowIso,
      });
    }

    // 2. Cambio de hora de inicio (start_time)
    if (existing.startTime && incoming.startTimeIso) {
      const existingDate = new Date(existing.startTime).toISOString();
      const incomingDate = new Date(incoming.startTimeIso).toISOString();
      if (existingDate !== incomingDate) {
        changes.push({
          eventId: existing.id,
          dedupeKey: incoming.dedupeKey,
          field: 'start_time',
          oldValue: existingDate,
          newValue: incomingDate,
          changeType: 'RESCHEDULED_TIME',
          detectedAt: nowIso,
        });
      }
    } else if (!existing.startTime && incoming.startTimeIso) {
      // Hora confirmada que antes estaba pendiente
      changes.push({
        eventId: existing.id,
        dedupeKey: incoming.dedupeKey,
        field: 'start_time',
        oldValue: null,
        newValue: incoming.startTimeIso,
        changeType: 'RESCHEDULED_TIME',
        detectedAt: nowIso,
      });
    }

    // 3. Cambio de venue si ambos tienen venueId conocido
    if (
      incoming.matchedVenueId !== null &&
      existing.venueId !== null &&
      incoming.matchedVenueId !== existing.venueId
    ) {
      changes.push({
        eventId: existing.id,
        dedupeKey: incoming.dedupeKey,
        field: 'venue_id',
        oldValue: existing.venueId,
        newValue: incoming.matchedVenueId,
        changeType: 'VENUE_CHANGED',
        detectedAt: nowIso,
      });
    }

    // 4. Cambio de estado (aplazado, cancelado)
    if (incoming.rawStatus === 'cancelled' && existing.status !== 'cancelled') {
      changes.push({
        eventId: existing.id,
        dedupeKey: incoming.dedupeKey,
        field: 'status',
        oldValue: existing.status,
        newValue: 'cancelled',
        changeType: 'STATUS_CHANGED',
        detectedAt: nowIso,
      });
    }

    // 5. Cambio de precio
    if (existing.priceCents !== incoming.priceCents || existing.isFree !== incoming.isFree) {
      changes.push({
        eventId: existing.id,
        dedupeKey: incoming.dedupeKey,
        field: 'price',
        oldValue: { cents: existing.priceCents, isFree: existing.isFree },
        newValue: { cents: incoming.priceCents, isFree: incoming.isFree },
        changeType: 'PRICE_CHANGED',
        detectedAt: nowIso,
      });
    }

    return changes;
  }
}
