import type { BarEventProposal } from './bar-types';

/**
 * Normaliza las propuestas del piloto de bares según su fecha respecto al día actual (2026-10-24).
 *
 * Reglas:
 * 1. Fecha anterior a hoy -> classification: PAST_EVENT, review_status: archived, requiresManualReview: false, Motivo: fecha pasada.
 * 2. Fecha hoy o futura -> classification: EVENTO_POSIBLE, review_status: pending, requiresManualReview: true.
 * 3. Sin fecha fiable -> classification: REQUIERE_REVISION, review_status: pending, requiresManualReview: true.
 * 4. Hora desconocida -> null (no inventar horas).
 * 5. Venue identificado -> mantener venue ID.
 * 6. Imagen -> conservar URL pública de R2.
 */
export function normalizeBarProposals(
  proposals: BarEventProposal[],
  currentDateIso = '2026-10-24'
): BarEventProposal[] {
  return proposals.map((p) => {
    const copy: BarEventProposal = { ...p };

    // Validar hora desconocida
    if (!copy.proposedTime || copy.proposedTime.trim() === '') {
      copy.proposedTime = null;
    }

    // Regla 3: Si no hay fecha fiable
    if (!copy.proposedDate || !/^\d{4}-\d{2}-\d{2}$/.test(copy.proposedDate)) {
      copy.classification = 'REQUIERE_REVISION';
      copy.reviewStatus = 'pending';
      copy.requiresManualReview = true;
      copy.statusReason = 'Sin fecha fiable inferida del contenido.';
      return copy;
    }

    // Comparar fecha respecto a hoy
    if (copy.proposedDate < currentDateIso) {
      // Regla 1: Fecha pasada
      copy.classification = 'PAST_EVENT';
      copy.reviewStatus = 'archived';
      copy.requiresManualReview = false;
      copy.statusReason = `Fecha pasada (${copy.proposedDate} < ${currentDateIso}).`;
    } else {
      // Regla 2: Fecha hoy o futura
      copy.classification = 'EVENTO_POSIBLE';
      copy.reviewStatus = 'pending';
      copy.requiresManualReview = true;
      copy.statusReason =
        copy.proposedDate === currentDateIso
          ? `Evento programado para hoy (${currentDateIso}).`
          : `Evento programado para fecha futura (${copy.proposedDate}).`;
    }

    return copy;
  });
}
