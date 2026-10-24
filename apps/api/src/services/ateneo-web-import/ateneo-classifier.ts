/**
 * VayaPlan — Clasificador Editorial para el Ateneo de Palencia
 *
 * Aplica reglas estrictas de curación:
 * 1. EVENTO_POSIBLE: Tiene fecha y hora. Aprobable como draft tras revisión.
 * 2. EVENTO_POSIBLE_SIN_HORA: Tiene fecha pero carece de hora. Aprobación bloqueada hasta asignar HH:mm.
 * 3. CONTENIDO_VENUE: No dispone de fecha ni hora. Material promocional/institucional; bloqueada su conversión a evento.
 * 4. DUPLICADO_POSIBLE: Coincide con un evento existente del Ateneo de Palencia.
 * 5. SIN_MATCH: Sin coincidencias en catálogo.
 */

import type { AteneoRawEvent, AteneoClassificationResult } from './ateneo-types';

export function classifyAteneoEvent(
  rawEvent: AteneoRawEvent,
  hasDuplicateMatch = false
): AteneoClassificationResult {
  const reasons: string[] = [];
  const title = (rawEvent.title || '').trim();
  const date = rawEvent.date ? rawEvent.date.trim() : null;
  const time = rawEvent.time ? rawEvent.time.trim() : null;

  // 1. Caso Duplicado detectado por matching
  if (hasDuplicateMatch) {
    reasons.push('Detectada coincidencia con evento existente en el catálogo del Ateneo de Palencia');
    return {
      classification: 'DUPLICADO_POSIBLE',
      confidence: 'ALTA',
      suggestedTitle: title,
      suggestedDate: date,
      suggestedTime: time,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: rawEvent.price,
      reasons,
    };
  }

  // 2. Caso Sin fecha ni hora -> CONTENIDO_VENUE
  if (!date && !time) {
    reasons.push('El evento no dispone de fecha ni hora programada (contenido institucional o de recinto)');
    return {
      classification: 'CONTENIDO_VENUE',
      confidence: 'BAJA',
      suggestedTitle: title || 'Actividad en Ateneo de Palencia',
      suggestedDate: null,
      suggestedTime: null,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: null,
      reasons,
    };
  }

  // 3. Caso Fecha confirmada pero sin hora -> EVENTO_POSIBLE_SIN_HORA
  if (date && !time) {
    reasons.push(`Fecha confirmada (${date}) pero sin hora de inicio específica en programación web`);
    return {
      classification: 'EVENTO_POSIBLE_SIN_HORA',
      confidence: 'MEDIA',
      suggestedTitle: title,
      suggestedDate: date,
      suggestedTime: null,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: rawEvent.price,
      reasons,
    };
  }

  // 4. Caso Fecha y hora confirmadas -> EVENTO_POSIBLE
  reasons.push(`Fecha (${date}) y hora (${time}) oficiales confirmadas en programación del Ateneo`);
  return {
    classification: 'EVENTO_POSIBLE',
    confidence: 'ALTA',
    suggestedTitle: title,
    suggestedDate: date,
    suggestedTime: time,
    suggestedCategory: rawEvent.category || 'cultura',
    suggestedPrice: rawEvent.price,
    reasons,
  };
}
