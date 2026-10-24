import {
  parseSearchPageHtml,
  parseDetailPageHtml,
  parseSessionPageHtml,
  classifyTheaterItem,
} from './theater-parser';
import {
  corroborateShowWithPdf,
  findSoloPdfShows,
} from './theater-corroborator';
import { normalizeTheaterShow } from './theater-normalizer';
import {
  TEATRO_PRINCIPAL_SEARCH_BASE,
  AYTO_OTONO_CULTURAL_PDF_URL,
  OFFICIAL_OTONO_CULTURAL_PDF_SHOWS,
  TEATRO_PRINCIPAL_VENUE_ID,
} from './theater-sources';
import type {
  RawTheaterItem,
  NormalizedTheaterProposal,
  TheaterImportReport,
  OfficialPdfShow,
} from './theater-types';

export interface TheaterImporterOptions {
  dryRun?: boolean;
  maxPages?: number;
  fetchFn?: typeof fetch;
  rawItemsOverride?: RawTheaterItem[];
  pdfCatalogOverride?: OfficialPdfShow[];
}

export class TheaterImporter {
  constructor(
    private existingEvents: Array<{
      id: number;
      dedupeKey: string | null;
      title: string;
      editorialDate: string;
      venueId: number | null;
      status: string;
    }> = [],
    private existingVenues: Array<{ id: number; name: string; slug: string }> = []
  ) {}

  /**
   * Ejecuta el pipeline completo de ingestión y corroboración teatral
   */
  public async runImport(
    options: TheaterImporterOptions = {}
  ): Promise<TheaterImportReport> {
    const executionId = `theater-import-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const dryRun = options.dryRun !== false; // Seguridad defensiva: siempre dryRun por defecto
    const customFetch = options.fetchFn || fetch;
    const maxPages = options.maxPages || 5;
    const pdfCatalog = options.pdfCatalogOverride || OFFICIAL_OTONO_CULTURAL_PDF_SHOWS;

    const excludedItems: Array<{ title: string; date: string; reason: string }> = [];
    const errors: Array<{ item: string; message: string }> = [];
    let rawItems: RawTheaterItem[] = [];

    // Si se proporcionan items directamente (ej: en tests unitarios o fixture local)
    if (options.rawItemsOverride) {
      rawItems = options.rawItemsOverride;
    } else {
      // 1. Scraping / Extracción paginada de la web
      try {
        const discoveredSearchItems: Array<{
          title: string;
          slug: string;
          rawDate: string;
          detailUrl: string;
          ticketsUrl: string;
          imageUrl: string | null;
        }> = [];

        for (let page = 1; page <= maxPages; page++) {
          const pageUrl = `${TEATRO_PRINCIPAL_SEARCH_BASE}${page}`;
          try {
            const resp = await customFetch(pageUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
              },
            });

            if (!resp.ok) {
              errors.push({
                item: `Página ${page}`,
                message: `Error HTTP ${resp.status} al descargar ${pageUrl}`,
              });
              break;
            }

            const html = await resp.text();
            const pageItems = parseSearchPageHtml(html);

            if (pageItems.length === 0) {
              // Fin de la paginación
              break;
            }

            discoveredSearchItems.push(...pageItems);
          } catch (err: any) {
            errors.push({
              item: `Página ${page}`,
              message: `Fallo de conexión en ${pageUrl}: ${err.message}`,
            });
            break;
          }
        }

        // 2. Clasificar cada elemento del catálogo
        for (const sItem of discoveredSearchItems) {
          const classification = classifyTheaterItem(
            sItem.title,
            '',
            sItem.slug
          );

          if (!classification.isTheatrical) {
            excludedItems.push({
              title: sItem.title,
              date: sItem.rawDate,
              reason:
                classification.exclusionReason || 'No cumple criterios teatrales',
            });
            continue;
          }

          // Para los candidatos teatrales, enriquecer con la ficha de detalle y sesión
          let synopsis: string | null = null;
          let rawPriceText: string | null = null;
          let sessionTime: string | null = null;
          let basePrice: number | null = sItem.basePrice ?? null;
          let finalImageUrl = sItem.imageUrl;

          try {
            const detailResp = await customFetch(sItem.detailUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              },
            });
            if (detailResp.ok) {
              const detailHtml = await detailResp.text();
              const detail = parseDetailPageHtml(detailHtml);
              if (detail.synopsis) synopsis = detail.synopsis;
              if (detail.rawPriceText) rawPriceText = detail.rawPriceText;
              if (detail.sessionTime) sessionTime = detail.sessionTime;
              if (detail.basePrice !== undefined && detail.basePrice !== null) {
                basePrice = detail.basePrice;
              }
              if (detail.imageUrl) finalImageUrl = detail.imageUrl;
            }
          } catch (e: any) {
            // Ignorar fallo de detalle puntual y usar datos del listado
          }

          // Si falta la hora, intentar consultar la página de entradas
          if (!sessionTime && sItem.ticketsUrl) {
            try {
              const ticketResp = await customFetch(sItem.ticketsUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                },
              });
              if (ticketResp.ok) {
                const ticketHtml = await ticketResp.text();
                const ses = parseSessionPageHtml(ticketHtml);
                if (ses.time) sessionTime = ses.time;
              }
            } catch (e) {
              // Fallback a hora pendiente
            }
          }

          // Hora por defecto en teatro de adultos vs infantil si no se ha podido extraer
          if (!sessionTime) {
            sessionTime = sItem.rawDate >= '2026-12-25' ? '19:00' : '20:30';
          }

          rawItems.push({
            sourceId: 'teatro_principal_palencia',
            slug: sItem.slug,
            title: sItem.title,
            rawDate: sItem.rawDate,
            rawTime: sessionTime,
            detailUrl: sItem.detailUrl,
            ticketsUrl: sItem.ticketsUrl,
            imageUrl: finalImageUrl,
            synopsis,
            basePrice,
            rawPriceText,
            category: classification.category,
            isTheatrical: true,
            requiresManualReview: classification.requiresManualReview,
            manualReviewReason: classification.manualReviewReason,
          });
        }
      } catch (err: any) {
        errors.push({
          item: 'crawler',
          message: `Error general en el crawler: ${err.message}`,
        });
      }
    }

    // 3. Normalizar y corroborar candidatos
    const proposals: NormalizedTheaterProposal[] = [];
    const allDiscrepancies: Array<{
      title: string;
      field: string;
      webValue: string;
      pdfValue: string;
      explanation: string;
    }> = [];
    const manualReviewItems: Array<{
      title: string;
      date: string;
      reason: string;
    }> = [];

    let corroboratedCount = 0;
    let soloWebCount = 0;
    let discrepanciesCount = 0;

    for (const raw of rawItems) {
      const corroboration = corroborateShowWithPdf(raw, pdfCatalog);

      if (corroboration.status === 'CORROBORADO') {
        corroboratedCount++;
      } else if (corroboration.status === 'SOLO_WEB') {
        soloWebCount++;
      } else if (corroboration.status === 'DISCREPANCIA') {
        discrepanciesCount++;
      }

      for (const disc of corroboration.discrepancies) {
        allDiscrepancies.push({
          title: raw.title,
          field: disc.field,
          webValue: disc.webValue,
          pdfValue: disc.pdfValue,
          explanation: disc.explanation,
        });
      }

      const proposal = normalizeTheaterShow(raw, corroboration);

      if (proposal.requiresManualReview) {
        manualReviewItems.push({
          title: proposal.title,
          date: proposal.editorialDate,
          reason: proposal.manualReviewReason || 'Revisión manual requerida',
        });
      }

      proposals.push(proposal);
    }

    // 4. Buscar espectáculos del PDF que no están en la web (obras pasadas)
    const soloPdfShows = findSoloPdfShows(rawItems, pdfCatalog);

    // 5. Garantía de mutación 0 en base de datos (dryRun estricto)
    const databaseMutations = {
      eventsCreated: 0,
      venuesCreated: 0,
      eventsModified: 0,
      venuesModified: 0,
    };

    const completedAt = new Date().toISOString();

    return {
      executionId,
      startedAt,
      completedAt,
      dryRun,
      primarySourceUrl: `${TEATRO_PRINCIPAL_SEARCH_BASE}1`,
      corroborationSourceUrl: AYTO_OTONO_CULTURAL_PDF_URL,
      totalCatalogWebItems: excludedItems.length + rawItems.length,
      excludedItems,
      excludedItemsCount: excludedItems.length,
      theatricalCandidatesCount: rawItems.length,
      proposalsCount: proposals.length,
      proposals,
      corroborationSummary: {
        corroboratedCount,
        soloWebCount,
        soloPdfCount: soloPdfShows.length,
        discrepanciesCount,
      },
      discrepancies: allDiscrepancies,
      manualReviewItems,
      soloPdfShows,
      databaseMutations,
      errors,
    };
  }
}
