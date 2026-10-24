import type {
  BarPostClassification,
  BarProvisionalCategory,
  PostClassificationResult,
  ApifyInstagramRawPost,
} from './bar-types';

/**
 * Expresiones regulares para detección de señales
 */
const PATTERNS = {
  // 1. Señal de fecha explícita o relativa
  dateExplicit: /\b(\d{1,2})\s*(?:de|\/|-)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2})\b/i,
  dateRelative: /\b(este\s+(?:viernes|s[aá]bado|domingo|jueves)|el\s+(?:viernes|s[aá]bado|domingo)|el\s+pr[oó]ximo\s+(?:viernes|s[aá]bado|domingo|\d{1,2}\s+de\s+[a-z]+)|hoy|ma[ñn]ana)\b/i,
  dateDayNumber: /\b(?:s[aá]bado|viernes|domingo|jueves)\s+(\d{1,2})\b/i,

  // 2. Señal de hora explícita
  timeExplicit: /\b(?:a\s+las\s+|a\s+partir\s+de\s+las\s+)?([012]?\d)(?::|\.)([0-5]\d)\s*(?:h|hrs|horas)?\b/i,
  timeShort: /\b(?:a\s+las\s+|a\s+partir\s+de\s+las\s+)([012]?\d)\s*(?:h|hrs|horas)\b/i,
  timeToClose: /\b([012]?\d(?::\d{2})?)\s*a\s+cierre\b/i,

  // 3. Actividad concreta
  liveMusicActivity: /\b(concierto|conciertos|m[uú]sica\s+en\s+directo|en\s+directo|ac[uú]stico|tributo|banda|en\s+vivo|showcase)\b/i,
  djActivity: /(?:@\w*dj\w*|\b\w*dj\b|\bdjs\b|drum\s*(?:&|and)?\s*bass|dnb|techno|house|techhouse|sesi[oó]n|sesiones|pinchada|pinchar|sesi[oó]n\s+dj|dj\s+set|a\s+los\s+platos|b2b)/i,
  gastronomyActivity: /\b(cata|maridaje|degustaci[oó]n|vermut\s+musical|vermut\s+torero)\b/i,
  entertainmentActivity: /\b(fiesta|fiestas|party|tard[oó]n|tardeo|halloween|aniversario|inauguraci[oó]n|quiz|trivial|mon[oó]logo|mon[oó]logos|bingo)\b/i,

  // Señales de exclusión o reclasificación:
  // Post retrospectivo (evento pasado que ya ocurrió)
  pastRecap: /\b(as[ií]\s+fue|nos\s+visitaron|qu[eé]\s+noche|gracias\s+por\s+venir|gracias\s+a\s+todo\s+el\s+mundo\s+que\s+vino|despu[eé]s\s+de\s+su\s+concierto|un\s+tardeo\s+para\s+el\s+recuerdo|recordamos\s+la\s+noche|fotos\s+del\s+evento)\b/i,

  // Promoción de alquiler de sala / servicios generales
  privateHire: /\b(alquiler\s+del\s+local|celebrar\s+tu\s+pr[oó]ximo\s+evento|cumplea[ñn]os|prebodas|bautismos|reuniones\s+privadas|catering)\b/i,

  // Horario habitual / servicios cotidianos
  routineService: /\b(de\s+martes\s+a\s+s[aá]bados|abrimos\s+de|dardos|futbol[ií]n|chupitos\s+y\s+copas|plan\s+de\s+hermanas|la\s+malhablada\s+abre\s+sus\s+puertas\s+nuevamente)\b/i,

  // Copywriting genérico de fin de semana (falsos positivos clásicos de ocio nocturno)
  genericVibe: /\b(la\s+letra\s+peque[ñn]a\s+de\s+este\s+fin\s+de\s+semana|los\s+djs\s+ya\s+est[aá]n\s+avisados|hay\s+planes\s+que\s+se\s+hablan|deja\s+que\s+los\s+djs\s+pongan\s+el\s+ritmo|esta\s+semana\s+nos\s+regalan\s+una\s+hora|una\s+hora\s+extra\s+para\s+alargar|no\s+tenemos\s+una\s+frase\s+ingeniosa|tenemos\s+m[uú]sica\.\s+tenemos\s+barra)\b/i,

  // Teasers / Anuncios futuros sin fecha/hora completa
  teaserAnnouncement: /\b(headliner|pr[oó]ximamente\s*(?:\+)?\s*info|muy\s+pronto|save\s+the\s+date|atentos|se\s+viene)\b/i,

  // Entrada / Reserva / Condición
  ticketOrBooking: /\b(entrada\s+(?:libre|gratuita|gratis)|entradas?\s+ya\s+a\s+la\s+venta|entradas?\s+anticipadas?|sorteamos\s+\d+\s+entradas?|aforo\s+limitado|gratuita|\d+\s*€|\d+\s*euros)\b/i,

  // Lugar
  venueMention: /\b(salvaje|la\s+malhablada|malhablada|sala\s+infinity|infinity|universonoro|portal|el\s+portal|alfonso\s+viii|mujer\s+palentina|extremadura|san\s+juan\s+de\s+dios|col[oó]n)\b/i,
};

const MONTH_MAP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Clasifica un post de Instagram de los bares del piloto de acuerdo a las directrices de VayaPlan.
 */
export function classifyBarPost(
  post: ApifyInstagramRawPost,
  venueName?: string
): PostClassificationResult {
  const caption = (post.caption || '').trim();
  const alt = (post.alt || '').trim();
  const hashtags = (post.hashtags || []).join(' ');
  const fullText = `${caption} ${alt} ${hashtags}`.toLowerCase();

  // 1. Descartar posts retrospectivos de eventos pasados
  if (PATTERNS.pastRecap.test(caption)) {
    return {
      classification: 'CONTENIDO_GENERAL',
      reason: 'Publicación retrospectiva sobre un evento o concierto que ya tuvo lugar (recap/agradecimiento).',
      signals: ['Contenido retrospectivo detectado'],
      confidence: 'BAJA',
    };
  }

  // 2. Descartar promociones de alquiler o celebraciones privadas
  if (PATTERNS.privateHire.test(caption)) {
    return {
      classification: 'PROMOCION',
      reason: 'Promoción comercial de servicios de alquiler de sala y eventos privados.',
      signals: ['Servicio de alquiler/celebración privada'],
      confidence: 'BAJA',
    };
  }

  // 3. Descartar reaperturas u horarios de rutina
  if (PATTERNS.routineService.test(caption) && !PATTERNS.liveMusicActivity.test(caption)) {
    return {
      classification: 'PROMOCION',
      reason: 'Promoción de horario habitual de apertura o servicios recreativos permanentes (dardos, futbolín, copas).',
      signals: ['Horario o servicio habitual del establecimiento'],
      confidence: 'BAJA',
    };
  }

  // 4. Descartar copys genéricos de fin de semana (Falsos Positivos de discoteca/bar)
  if (PATTERNS.genericVibe.test(caption)) {
    return {
      classification: 'CONTENIDO_GENERAL',
      reason: 'Copywriting genérico de ambiente de fin de semana sin programación específica de cartel o evento.',
      signals: ['Copywriting genérico de fin de semana'],
      confidence: 'BAJA',
    };
  }

  // Detección de señales objetivas:
  const signals: string[] = [];
  let detectedDate: string | null = null;
  let detectedTime: string | null = null;
  let detectedActivity: string | null = null;
  let provisionalCategory: BarProvisionalCategory = null;

  // A. Detectar FECHA
  const explicitMatch = caption.match(PATTERNS.dateExplicit);
  if (explicitMatch) {
    signals.push(`Fecha explícita detectada: "${explicitMatch[0]}"`);
    detectedDate = normalizeExplicitDate(explicitMatch[1], explicitMatch[2], post.timestamp);
  } else {
    const dayNumMatch = caption.match(PATTERNS.dateDayNumber);
    if (dayNumMatch) {
      signals.push(`Fecha con día concreto: "${dayNumMatch[0]}"`);
      detectedDate = normalizeDayNumber(dayNumMatch[1], post.timestamp);
    } else {
      const relMatch = caption.match(PATTERNS.dateRelative);
      if (relMatch) {
        signals.push(`Fecha relativa detectada: "${relMatch[0]}"`);
        detectedDate = normalizeRelativeDate(relMatch[0], post.timestamp);
      }
    }
  }

  // B. Detectar HORA
  const toCloseMatch = caption.match(PATTERNS.timeToClose);
  if (toCloseMatch) {
    let t = toCloseMatch[1];
    if (!t.includes(':')) t = `${t.padStart(2, '0')}:00`;
    detectedTime = t;
    signals.push(`Hora de inicio detectada: ${detectedTime}`);
  } else {
    const timeMatch = caption.match(PATTERNS.timeExplicit);
    if (timeMatch) {
      const h = timeMatch[1].padStart(2, '0');
      const m = timeMatch[2].padStart(2, '0');
      detectedTime = `${h}:${m}`;
      signals.push(`Hora explícita detectada: ${detectedTime}`);
    } else {
      const timeShort = caption.match(PATTERNS.timeShort);
      if (timeShort) {
        const h = timeShort[1].padStart(2, '0');
        detectedTime = `${h}:00`;
        signals.push(`Hora detectada: ${detectedTime}`);
      }
    }
  }

  // C. Detectar ACTIVIDAD
  if (PATTERNS.liveMusicActivity.test(fullText)) {
    detectedActivity = 'Música en directo';
    provisionalCategory = 'musica_directo';
    signals.push(`Actividad de música en directo / concierto detectada`);
  } else if (PATTERNS.djActivity.test(fullText)) {
    detectedActivity = 'Sesión DJ / Club';
    provisionalCategory = 'dj_tardeo';
    signals.push(`Actividad de sesión DJ / electrónica detectada`);
  } else if (PATTERNS.gastronomyActivity.test(fullText)) {
    detectedActivity = 'Gastronomía / Cata';
    provisionalCategory = 'gastronomia';
    signals.push(`Actividad gastronómica / cata detectada`);
  } else if (PATTERNS.entertainmentActivity.test(fullText)) {
    detectedActivity = 'Ocio / Fiesta temática';
    provisionalCategory = 'ocio';
    signals.push(`Actividad de fiesta temática / tardeo detectada`);
  }

  // D. Detectar LUGAR
  if (venueName || PATTERNS.venueMention.test(fullText)) {
    const matched = fullText.match(PATTERNS.venueMention);
    signals.push(`Lugar identificable: ${matched ? matched[0] : venueName}`);
  }

  // E. Detectar ENTRADA / CONDICIÓN
  if (PATTERNS.ticketOrBooking.test(caption)) {
    const matched = caption.match(PATTERNS.ticketOrBooking);
    signals.push(`Condición o acceso detectado: "${matched ? matched[0] : ''}"`);
  }

  // Evaluación de clasificación:
  // Si es un teaser sin fecha/hora completa:
  if (PATTERNS.teaserAnnouncement.test(caption) && (!detectedDate || !detectedTime)) {
    return {
      classification: 'REQUIERE_REVISION',
      reason: `Anuncio de cabeza de cartel o teaser de fecha sin horario u horario sin corroborar ("${caption.match(PATTERNS.teaserAnnouncement)?.[0]}").`,
      signals,
      confidence: 'BAJA',
      detectedActivity,
      provisionalCategory,
    };
  }

  // EVENTO_POSIBLE si detecta >= 2 señales con actividad concreta o (fecha + hora):
  const signalCount = signals.length;
  if (signalCount >= 2 && (detectedActivity || (detectedDate && detectedTime))) {
    let confidence: 'ALTA' | 'MEDIA' | 'BAJA' = 'MEDIA';
    if (detectedDate && detectedTime && detectedActivity) {
      confidence = 'ALTA';
    } else if (!detectedDate || !detectedTime) {
      confidence = 'MEDIA';
    }

    const provisionalTitle = generateTitle(detectedActivity, venueName, caption, detectedDate);

    return {
      classification: 'EVENTO_POSIBLE',
      reason: `Detectadas ${signalCount} señales de evento (${signals.join('; ')}).`,
      signals,
      detectedDate,
      detectedTime,
      detectedActivity,
      provisionalCategory,
      provisionalTitle,
      confidence,
    };
  }

  // Si sólo hay felicitación o publicación sin agenda:
  if (fullText.includes('feliz año') || fullText.includes('feliz lunes') || fullText.includes('feliz semana')) {
    return {
      classification: 'NO_RELEVANTE',
      reason: 'Felicitación festiva o saludo genérico sin contenido de agenda.',
      signals,
      confidence: 'BAJA',
    };
  }

  if (signalCount === 1) {
    return {
      classification: 'CONTENIDO_GENERAL',
      reason: 'Publicación general o social sin convocatoria de evento específico.',
      signals,
      confidence: 'BAJA',
    };
  }

  return {
    classification: 'NO_RELEVANTE',
    reason: 'Sin señales suficientes para catalogar como evento ni promoción estructurada.',
    signals,
    confidence: 'BAJA',
  };
}

function normalizeExplicitDate(
  dayStr: string,
  monthStr: string,
  postTimestamp?: string
): string | null {
  const day = parseInt(dayStr, 10);
  let month = parseInt(monthStr, 10);
  if (isNaN(month)) {
    month = MONTH_MAP[monthStr.toLowerCase()] || 0;
  }
  if (!day || !month || month < 1 || month > 12) return null;

  let year = 2026;
  if (postTimestamp) {
    const postYear = new Date(postTimestamp).getFullYear();
    if (!isNaN(postYear)) year = postYear;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function normalizeDayNumber(dayStr: string, postTimestamp?: string): string | null {
  const day = parseInt(dayStr, 10);
  if (isNaN(day) || day < 1 || day > 31) return null;

  let year = 2026;
  let month = 10;
  if (postTimestamp) {
    const d = new Date(postTimestamp);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth() + 1;
    }
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function normalizeRelativeDate(phrase: string, postTimestamp?: string): string | null {
  const refDate = postTimestamp ? new Date(postTimestamp) : new Date('2026-10-24T00:00:00Z');
  const lower = phrase.toLowerCase();
  const targetDay = new Date(refDate);

  if (lower.includes('hoy')) {
    // mismo día
  } else if (lower.includes('mañana')) {
    targetDay.setDate(targetDay.getDate() + 1);
  } else {
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    let targetWeekday = -1;
    for (let i = 0; i < dayNames.length; i++) {
      if (lower.includes(dayNames[i])) {
        targetWeekday = i;
        break;
      }
    }

    if (targetWeekday !== -1) {
      const currentWeekday = refDate.getDay();
      let diff = targetWeekday - currentWeekday;
      if (diff < 0) diff += 7;
      targetDay.setDate(targetDay.getDate() + diff);
    } else {
      return null;
    }
  }

  const y = targetDay.getFullYear();
  const m = String(targetDay.getMonth() + 1).padStart(2, '0');
  const d = String(targetDay.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateTitle(
  activity: string | null,
  venueName?: string,
  caption?: string,
  date?: string | null
): string {
  const v = venueName || 'Palencia';
  if (!caption) return `${activity || 'Actividad'} en ${v}`;

  // Buscar nombres de artistas o titulares comunes
  if (caption.includes('HÉROES EL CULTO') || caption.includes('Héroes El Culto')) {
    return `Héroes El Culto (Tributo a Héroes del Silencio) — ${v}`;
  }
  if (caption.includes('Drum and Bass Sessions') || caption.includes('Drum & Bass')) {
    return `Drum and Bass Sessions (1ª Edición) — ${v}`;
  }
  if (caption.includes('Mäbu') || caption.includes('mabumusica')) {
    return `Concierto de Mäbu en directo — ${v}`;
  }
  if (caption.includes('Héctor Calderón') || caption.includes('hectorcalderondj')) {
    if (caption.includes('San Valentín') || caption.includes('El Tardón')) {
      return `Tardón de San Valentín con DJ Héctor Calderón — ${v}`;
    }
    return `Fiesta de noche con Héctor Calderón DJ — ${v}`;
  }
  if (caption.includes('djgomezpalentino') || caption.includes('Gómez Palentino')) {
    return `Tardeo Basket con DJ Gómez Palentino — ${v}`;
  }
  if (caption.includes('tormenta electrónica') || caption.includes('enrreadj')) {
    return `Tormenta Electrónica con Unequal & Enrreadj — ${v}`;
  }
  if (caption.includes('deeperdj') || caption.includes('Deeper')) {
    return `Sesión Deeper DJ — ${v}`;
  }
  if (caption.includes('Genetic Electronic Music') || caption.includes('Aniversario Genetic')) {
    return `1er Aniversario Genetic Electronic Music (Halloween) — ${v}`;
  }
  if (caption.includes('HORARIOS 29 AGOSTO')) {
    return `Sesión Especial de Verano (29 de Agosto) — ${v}`;
  }

  const firstClean = caption.split('\n')[0].replace(/[🔥💣⚡🎧🎉🍻📍❌❤️].*/g, '').trim();
  if (firstClean.length > 5 && firstClean.length < 50) {
    return `${firstClean} — ${v}`;
  }

  return `${activity || 'Sesión / Concierto'} en ${v}`;
}
