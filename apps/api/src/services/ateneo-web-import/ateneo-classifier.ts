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
import { isPlausibleEventTime } from './ateneo-extractor';

export function classifyAteneoEvent(
  rawEvent: AteneoRawEvent,
  hasDuplicateMatch = false
): AteneoClassificationResult {
  const reasons: string[] = [];
  const title = (rawEvent.title || '').trim();
  const date = rawEvent.date ? rawEvent.date.trim() : null;
  let time = rawEvent.time ? rawEvent.time.trim() : null;

  // Neutralización defensiva de horas no verosímiles / placeholders de jornada completa
  if (time && !isPlausibleEventTime(time, rawEvent.endTime)) {
    reasons.push(
      `Hora detectada (${time}) neutralizada a NULL: corresponde a un placeholder de apertura o rango amplio sin sesión concreta`
    );
    time = null;
  }

  const effectivePrice = rawEvent.price !== undefined
    ? rawEvent.price
    : (rawEvent.priceCents !== null && rawEvent.priceCents !== undefined ? rawEvent.priceCents / 100 : null);

  // 1. Caso Duplicado detectado por matching
  if (hasDuplicateMatch) {
    reasons.push('Detectada coincidencia con evento existente en el catálogo del Ateneo de Palencia');
    return {
      classification: 'DUPLICADO_POSIBLE',
      confidence: 'ALTA',
      suggestedTitle: title,
      suggestedDate: date,
      suggestedTime: time,
      suggestedEndDate: rawEvent.endDate || null,
      suggestedEndTime: rawEvent.endTime || null,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: effectivePrice,
      suggestedPriceStatus: rawEvent.priceStatus,
      suggestedPriceNote: rawEvent.priceNote,
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
      suggestedEndDate: null,
      suggestedEndTime: null,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: null,
      suggestedPriceStatus: rawEvent.priceStatus || 'NOT_INFORMED',
      suggestedPriceNote: rawEvent.priceNote,
      reasons,
    };
  }

  // 3. Caso Rango de fechas distintas -> EVENTO_CONTINUO (Exposición o actividad continua)
  if (date && rawEvent.endDate && rawEvent.endDate !== date) {
    reasons.push(`Actividad continua con rango de fechas (${date} al ${rawEvent.endDate})`);
    return {
      classification: 'EVENTO_CONTINUO',
      confidence: 'ALTA',
      suggestedTitle: title,
      suggestedDate: date,
      suggestedTime: null, // Horario de sala o franja continua, no sesión puntual obligatoria
      suggestedEndDate: rawEvent.endDate,
      suggestedEndTime: rawEvent.endTime || null,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: effectivePrice,
      suggestedPriceStatus: rawEvent.priceStatus,
      suggestedPriceNote: rawEvent.priceNote,
      reasons,
    };
  }

  // 4. Caso Fecha confirmada pero sin hora -> EVENTO_POSIBLE_SIN_HORA
  if (date && !time) {
    reasons.push(`Fecha confirmada (${date}) pero sin hora de inicio específica en programación web`);
    return {
      classification: 'EVENTO_POSIBLE_SIN_HORA',
      confidence: 'MEDIA',
      suggestedTitle: title,
      suggestedDate: date,
      suggestedTime: null,
      suggestedEndDate: rawEvent.endDate || null,
      suggestedEndTime: rawEvent.endTime || null,
      suggestedCategory: rawEvent.category || 'cultura',
      suggestedPrice: effectivePrice,
      suggestedPriceStatus: rawEvent.priceStatus,
      suggestedPriceNote: rawEvent.priceNote,
      reasons,
    };
  }

  // 5. Caso Fecha y hora confirmadas -> EVENTO_POSIBLE
  reasons.push(`Fecha (${date}) y hora (${time}) oficiales confirmadas en programación del Ateneo`);
  return {
    classification: 'EVENTO_POSIBLE',
    confidence: 'ALTA',
    suggestedTitle: title,
    suggestedDate: date,
    suggestedTime: time,
    suggestedEndDate: rawEvent.endDate || null,
    suggestedEndTime: rawEvent.endTime || null,
    suggestedCategory: rawEvent.category || 'cultura',
    suggestedPrice: effectivePrice,
    suggestedPriceStatus: rawEvent.priceStatus,
    suggestedPriceNote: rawEvent.priceNote,
    reasons,
  };
}
