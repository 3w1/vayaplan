import type {
  RawTheaterItem,
  OfficialPdfShow,
  ShowCorroborationResult,
  DiscrepancyDetail,
} from './theater-types';
import {
  OFFICIAL_OTONO_CULTURAL_PDF_SHOWS,
  TEATRO_PRINCIPAL_VENUE_NAME,
} from './theater-sources';

/**
 * Normaliza una cadena para comparación tolerante a acentos y mayúsculas
 */
export function normalizeStringForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Corrobora una obra extraída de la web del Teatro Principal con el catálogo oficial del PDF
 */
export function corroborateShowWithPdf(
  webItem: RawTheaterItem,
  pdfCatalog: OfficialPdfShow[] = OFFICIAL_OTONO_CULTURAL_PDF_SHOWS
): ShowCorroborationResult {
  const normWebTitle = normalizeStringForComparison(webItem.title);

  // 1. Buscar coincidencia en el PDF por fecha y título similar
  const matchedPdfShow = pdfCatalog.find((pdf) => {
    if (pdf.date === webItem.rawDate) {
      return true;
    }
    const normPdfTitle = normalizeStringForComparison(pdf.title);
    return (
      normWebTitle.includes(normPdfTitle) || normPdfTitle.includes(normWebTitle)
    );
  });

  if (!matchedPdfShow) {
    return {
      status: 'SOLO_WEB',
      matchedPdfShow: null,
      discrepancies: [],
      notes: 'Espectáculo no encontrado en el programa oficial en PDF de Otoño Cultural 2026',
    };
  }

  // 2. Comparar campos para detectar discrepancias
  const discrepancies: DiscrepancyDetail[] = [];

  // Comprobar título (diferencias de tilde u ortografía)
  if (webItem.title.trim() !== matchedPdfShow.title.trim()) {
    const isOnlyAccentDiff =
      normalizeStringForComparison(webItem.title) ===
      normalizeStringForComparison(matchedPdfShow.title);
    if (isOnlyAccentDiff) {
      discrepancies.push({
        field: 'title',
        webValue: webItem.title,
        pdfValue: matchedPdfShow.title,
        explanation: `Diferencia ortográfica menor de acentuación: web="${webItem.title}" vs PDF="${matchedPdfShow.title}"`,
      });
    } else {
      discrepancies.push({
        field: 'title',
        webValue: webItem.title,
        pdfValue: matchedPdfShow.title,
        explanation: `Título diferente entre fuentes`,
      });
    }
  }

  // Comprobar fecha
  if (webItem.rawDate !== matchedPdfShow.date) {
    discrepancies.push({
      field: 'date',
      webValue: webItem.rawDate,
      pdfValue: matchedPdfShow.date,
      explanation: `Discrepancia en fecha: web indica ${webItem.rawDate} y PDF indica ${matchedPdfShow.date}`,
    });
  }

  // Comprobar hora
  if (webItem.rawTime && webItem.rawTime !== matchedPdfShow.time) {
    discrepancies.push({
      field: 'time',
      webValue: webItem.rawTime,
      pdfValue: matchedPdfShow.time,
      explanation: `Discrepancia en hora: web indica ${webItem.rawTime} y PDF indica ${matchedPdfShow.time}`,
    });
  }

  // Comprobar recinto (el PDF indica Teatro Principal de Palencia)
  if (matchedPdfShow.venue !== TEATRO_PRINCIPAL_VENUE_NAME) {
    discrepancies.push({
      field: 'venue',
      webValue: TEATRO_PRINCIPAL_VENUE_NAME,
      pdfValue: matchedPdfShow.venue,
      explanation: `Recinto diferente en PDF`,
    });
  }

  // Si hay discrepancias graves (fecha, hora diferente, o recinto distinto), estado = DISCREPANCIA
  const hasSevereDiscrepancy = discrepancies.some(
    (d) => d.field === 'date' || d.field === 'time' || d.field === 'venue'
  );

  const status = hasSevereDiscrepancy ? 'DISCREPANCIA' : 'CORROBORADO';

  return {
    status,
    matchedPdfShow,
    discrepancies,
    notes:
      discrepancies.length > 0
        ? `Coincide en fecha y hora con observaciones: ${discrepancies.map((d) => d.explanation).join('; ')}`
        : 'Coincidencia total 100% entre web del Teatro Principal y programa oficial en PDF',
  };
}

/**
 * Obtiene las obras del PDF oficial que no figuran en la lista de candidatos de la web
 * (por ejemplo, espectáculos ya transcurridos).
 */
export function findSoloPdfShows(
  webItems: RawTheaterItem[],
  pdfCatalog: OfficialPdfShow[] = OFFICIAL_OTONO_CULTURAL_PDF_SHOWS
): OfficialPdfShow[] {
  return pdfCatalog.filter((pdf) => {
    return !webItems.some(
      (w) =>
        w.rawDate === pdf.date ||
        normalizeStringForComparison(w.title) ===
          normalizeStringForComparison(pdf.title)
    );
  });
}
