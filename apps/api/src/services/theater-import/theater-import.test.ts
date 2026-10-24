import { describe, expect, test } from 'bun:test';
import {
  parseSearchPageHtml,
  parseDetailPageHtml,
  parseSessionPageHtml,
  classifyTheaterItem,
  decodeHtmlEntities,
} from './theater-parser';
import {
  corroborateShowWithPdf,
  findSoloPdfShows,
  normalizeStringForComparison,
} from './theater-corroborator';
import {
  normalizeTheaterShow,
  validateOfficialImageUrl,
  cleanSynopsis,
} from './theater-normalizer';
import { TheaterImporter } from './theater-importer';
import {
  TEATRO_PRINCIPAL_VENUE_ID,
  TEATRO_PRINCIPAL_VENUE_NAME,
  OFFICIAL_OTONO_CULTURAL_PDF_SHOWS,
} from './theater-sources';
import type {
  RawTheaterItem,
  OfficialPdfShow,
} from './theater-types';

describe('Servicio de Ingestión Teatral del Teatro Principal de Palencia (theater-import)', () => {
  // =========================================================================
  // 1. Parseo del listado del Teatro Principal
  // =========================================================================
  describe('1. Parseo del listado del Teatro Principal', () => {
    test('Extrae correctamente tarjetas de espectáculos, títulos, slugs, fechas y precios base', () => {
      const mockSearchHtml = `
        <div class="para-sombra">
          <div class="producto row">
            <div class="imagen col s12">
              <img class="lazy" data-src="https://cdn.tenemosplan.com/tiendas/0_12345.jpg" />
            </div>
            <div class="info col s12">
              <h2 class="titulo font-bold">EL INVENCIBLE VERANO DE LILIANA</h2>
              <div class="descripcion">Adaptación teatral</div>
            </div>
            <div class="precio">
              <span class="texto-desde">Desde</span>
              <span class="font-bold">8&euro;</span>
            </div>
            <div class="enlaces col s12">
              <a href="https://teatroprincipaldepalencia.es/es/productos/descripcion/el-invencible-verano-de-liliana-2">INFO</a>
              <a href="https://teatroprincipaldepalencia.es/es/entradas/el-invencible-verano-de-liliana-2/2026-10-30">Comprar</a>
            </div>
          </div>
        </div>
      `;

      const items = parseSearchPageHtml(mockSearchHtml);
      expect(items.length).toBe(1);
      expect(items[0].title).toBe('EL INVENCIBLE VERANO DE LILIANA');
      expect(items[0].slug).toBe('el-invencible-verano-de-liliana-2');
      expect(items[0].rawDate).toBe('2026-10-30');
      expect(items[0].basePrice).toBe(8);
      expect(items[0].imageUrl).toBe('https://cdn.tenemosplan.com/tiendas/0_12345.jpg');
      expect(items[0].detailUrl).toBe(
        'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-invencible-verano-de-liliana-2'
      );
    });
  });

  // =========================================================================
  // 2. Parseo de una ficha de detalle
  // =========================================================================
  describe('2. Parseo de una ficha de detalle', () => {
    test('Extrae sinopsis, hora y precios desglosados desde JSON-LD y contenedor HTML', () => {
      const mockDetailHtml = `
        <html>
          <head>
            <script type="application/ld+json">
              [
                {
                  "@context": "http://schema.org",
                  "@type": "Event",
                  "name": "LARGO VIAJE HACIA LA NOCHE",
                  "startDate": "2026-11-05",
                  "image": "https://cdn.tenemosplan.com/tiendas/0_largo.jpg",
                  "offers": {
                    "@type": "Offer",
                    "price": "9",
                    "priceCurrency": "EUR"
                  }
                }
              ]
            </script>
          </head>
          <body>
            <div class="texto">
              Fecha: 05/11/2026 · Hora: 20:30<br>
              Texto: En un día de verano, la familia Tyrone se enfrenta a sus fantasmas.<br>
              Precios: Zona A: 22 €/18 € · B: 18 €/14 € · C: 14 €/11 € · D: 9 €/9 €.
            </div>
          </body>
        </html>
      `;

      const detail = parseDetailPageHtml(mockDetailHtml);
      expect(detail.title).toBe('LARGO VIAJE HACIA LA NOCHE');
      expect(detail.startDate).toBe('2026-11-05');
      expect(detail.basePrice).toBe(9);
      expect(detail.sessionTime).toBe('20:30');
      expect(detail.synopsis).toBe(
        'En un día de verano, la familia Tyrone se enfrenta a sus fantasmas.'
      );
      expect(detail.rawPriceText).toContain('Zona A: 22 €/18 €');
    });

    test('Parsea la hora exacta de la función desde la página de entradas/sesión', () => {
      const mockSessionHtml = `
        <div class="calendario_reserva row">
          <span>19:00</span>
          <span>&#45;&nbsp;</span>
        </div>
      `;
      const res = parseSessionPageHtml(mockSessionHtml);
      expect(res.time).toBe('19:00');
    });
  });

  // =========================================================================
  // 3. Normalización de fecha y hora a Europe/Madrid
  // =========================================================================
  describe('3. Normalización de fecha y hora a Europe/Madrid', () => {
    test('Calcula el UTC ISO exacto para función de invierno a las 20:30 (CET UTC+1)', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'la-barraca-3',
        title: 'LA BARRACA',
        rawDate: '2026-11-14',
        rawTime: '20:30',
        detailUrl: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/la-barraca-3',
        ticketsUrl: 'https://teatroprincipaldepalencia.es/es/entradas/la-barraca-3/2026-11-14',
        imageUrl: 'https://cdn.tenemosplan.com/tiendas/0_barraca.jpg',
        synopsis: 'Obra teatral clásica',
        basePrice: 9,
        rawPriceText: 'Zona A: 22€',
        category: 'teatro',
        isTheatrical: true,
      };

      const corroboration = {
        status: 'CORROBORADO' as const,
        matchedPdfShow: null,
        discrepancies: [],
      };

      const proposal = normalizeTheaterShow(raw, corroboration);

      expect(proposal.editorialDate).toBe('2026-11-14');
      // 20:30 en horario estándar CET (UTC+1) = 19:30Z
      expect(proposal.startTimeIso).toBe('2026-11-14T19:30:00.000Z');
      expect(proposal.timeStatus).toBe('confirmed');
    });

    test('Asigna timeStatus pending_time si la hora no está confirmada', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'obra-sin-hora',
        title: 'OBRA SIN HORA',
        rawDate: '2026-12-15',
        rawTime: null,
        detailUrl: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/obra-sin-hora',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: 'Sinopsis',
        basePrice: 10,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const proposal = normalizeTheaterShow(raw, {
        status: 'CORROBORADO',
        matchedPdfShow: null,
        discrepancies: [],
      });

      expect(proposal.timeStatus).toBe('pending_time');
      expect(proposal.startTimeIso).toBeNull();
      expect(proposal.editorialDate).toBe('2026-12-15');
    });
  });

  // =========================================================================
  // 4. Clasificación teatro vs monologo y exclusiones
  // =========================================================================
  describe('4. Clasificación teatro vs monologo', () => {
    test('Clasifica obra convencional como teatro', () => {
      const res = classifyTheaterItem('EL INVENCIBLE VERANO DE LILIANA');
      expect(res.isTheatrical).toBe(true);
      expect(res.category).toBe('teatro');
      expect(res.requiresManualReview).toBe(false);
    });

    test('Clasifica monólogo de Rafael Álvarez "El Brujo" como monologo', () => {
      const res = classifyTheaterItem('ICONOS O LA EXPLORACIÓN DEL DESTINO');
      expect(res.isTheatrical).toBe(true);
      expect(res.category).toBe('monologo');
      expect(res.requiresManualReview).toBe(false);
    });

    test('Excluye conciertos de la Banda Municipal y festivales de música', () => {
      const res1 = classifyTheaterItem('CONCIERTO BANDA MUNICIPAL 25 OCT 26');
      expect(res1.isTheatrical).toBe(false);
      expect(res1.exclusionReason).toContain('musical');

      const res2 = classifyTheaterItem('FESTIVAL INTERNACIONAL DE GUITARRA');
      expect(res2.isTheatrical).toBe(false);
    });

    test('Excluye danza por defecto (El Paraíso de los Negros, Flamenc Oh!!)', () => {
      const res = classifyTheaterItem('EL PARAÍSO DE LOS NEGROS');
      expect(res.isTheatrical).toBe(false);
      expect(res.exclusionReason).toContain('danza');
    });

    test('Marca espectáculo mixto JIRAFA (títeres + danza) para revisión manual', () => {
      const res = classifyTheaterItem('JIRAFA', 'Thomas Noone Dance títeres');
      expect(res.isTheatrical).toBe(true);
      expect(res.category).toBe('teatro');
      expect(res.requiresManualReview).toBe(true);
      expect(res.manualReviewReason).toContain('híbrido');
    });
  });

  // =========================================================================
  // 5. Extracción de precio gratuito y de pago
  // =========================================================================
  describe('5. Extracción de precio gratuito y de pago', () => {
    test('Convierte euros a céntimos y genera etiqueta formateada para entrada de pago', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'el-invencible-verano-de-liliana-2',
        title: 'EL INVENCIBLE VERANO DE LILIANA',
        rawDate: '2026-10-30',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 8, // 8€
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const proposal = normalizeTheaterShow(raw, {
        status: 'CORROBORADO',
        matchedPdfShow: null,
        discrepancies: [],
      });

      expect(proposal.priceCents).toBe(800);
      expect(proposal.isFree).toBe(false);
      expect(proposal.priceLabel).toBe('8,00 €');
    });

    test('Maneja precio 0 o ausente sin inventar precios', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'obra-gratuita',
        title: 'OBRA SIN PRECIO DEFINIDO',
        rawDate: '2026-11-20',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: null,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const proposal = normalizeTheaterShow(raw, {
        status: 'CORROBORADO',
        matchedPdfShow: null,
        discrepancies: [],
      });

      expect(proposal.priceCents).toBe(0);
      expect(proposal.isFree).toBe(false);
      expect(proposal.priceLabel).toBe('Entradas en taquilla / festival');
    });
  });

  // =========================================================================
  // 6. Deduplicación por título, fecha, hora y venue
  // =========================================================================
  describe('6. Deduplicación por título, fecha, hora y venue', () => {
    test('Genera un dedupe_key determinista y único incorporando recinto, slug, fecha y hora', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'teatro-delusio',
        title: 'TEATRO DELUSIO',
        rawDate: '2026-11-06',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 9,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const proposal = normalizeTheaterShow(raw, {
        status: 'CORROBORADO',
        matchedPdfShow: null,
        discrepancies: [],
      });

      expect(proposal.dedupeKey).toBe(
        'palencia-teatro-teatro-principal-teatro-delusio-2026-11-06-2030'
      );
      expect(proposal.venueId).toBe(TEATRO_PRINCIPAL_VENUE_ID);
    });

    test('Funciones distintas del mismo espectáculo generan claves de deduplicación diferentes', () => {
      const raw1: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'la-malquerida',
        title: 'LA MALQUERIDA',
        rawDate: '2026-12-11',
        rawTime: '17:00',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 8,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const raw2: RawTheaterItem = { ...raw1, rawTime: '20:30' };

      const prop1 = normalizeTheaterShow(raw1, { status: 'CORROBORADO', matchedPdfShow: null, discrepancies: [] });
      const prop2 = normalizeTheaterShow(raw2, { status: 'CORROBORADO', matchedPdfShow: null, discrepancies: [] });

      expect(prop1.dedupeKey).not.toBe(prop2.dedupeKey);
      expect(prop1.dedupeKey).toContain('1700');
      expect(prop2.dedupeKey).toContain('2030');
    });
  });

  // =========================================================================
  // 7. Corroboración con el PDF
  // =========================================================================
  describe('7. Corroboración con el PDF', () => {
    test('Corrobora exitosamente coincidencia de fecha, hora y título con el programa oficial', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'leonora-2',
        title: 'LEONORA',
        rawDate: '2026-11-21',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 8,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const res = corroborateShowWithPdf(raw);
      expect(res.status).toBe('CORROBORADO');
      expect(res.matchedPdfShow).not.toBeNull();
      expect(res.matchedPdfShow?.title).toBe('LEONORA');
      expect(res.matchedPdfShow?.page).toBe(15);
    });

    test('Identifica obras del PDF que ya pasaron y no están en la web (SOLO_PDF)', () => {
      const mockWebItems: RawTheaterItem[] = [
        {
          sourceId: 'teatro_principal_palencia',
          slug: 'leonora-2',
          title: 'LEONORA',
          rawDate: '2026-11-21',
          rawTime: '20:30',
          detailUrl: '',
          ticketsUrl: '',
          imageUrl: null,
          synopsis: null,
          basePrice: 8,
          rawPriceText: null,
          category: 'teatro',
          isTheatrical: true,
        },
      ];

      const soloPdf = findSoloPdfShows(mockWebItems);
      const pastTitles = soloPdf.map((s) => s.title);
      expect(pastTitles).toContain('LA DESCONQUISTA');
      expect(pastTitles).toContain('FELIZ DÍA');
      expect(pastTitles).toContain('DYSPHORIA');
    });

    test('Clasifica como SOLO_WEB un espectáculo no presente en el catálogo del PDF', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'obra-imprevista',
        title: 'OBRA FUERA DE PROGRAMA OFICIAL',
        rawDate: '2026-11-19',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 10,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const res = corroborateShowWithPdf(raw);
      expect(res.status).toBe('SOLO_WEB');
      expect(res.matchedPdfShow).toBeNull();
    });
  });

  // =========================================================================
  // 8. Detección de discrepancias
  // =========================================================================
  describe('8. Detección de discrepancias', () => {
    test('Detecta y documenta diferencia ortográfica menor en título (JASON vs JASÓN)', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'jason-y-las-furias-1',
        title: 'JASON Y LAS FURIAS',
        rawDate: '2026-12-18',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 9,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const res = corroborateShowWithPdf(raw);
      expect(res.discrepancies.length).toBe(1);
      expect(res.discrepancies[0].field).toBe('title');
      expect(res.discrepancies[0].webValue).toBe('JASON Y LAS FURIAS');
      expect(res.discrepancies[0].pdfValue).toBe('JASÓN Y LAS FURIAS');
    });

    test('Marca estado DISCREPANCIA si la hora o fecha entre web y PDF no coinciden', () => {
      const customPdfCatalog: OfficialPdfShow[] = [
        {
          title: 'OBRA CON HORARIO DISCREPANTE',
          date: '2026-11-10',
          time: '19:00', // PDF dice 19:00
          venue: TEATRO_PRINCIPAL_VENUE_NAME,
          category: 'teatro',
          prices: {},
          page: 1,
        },
      ];

      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'obra-discrepante',
        title: 'OBRA CON HORARIO DISCREPANTE',
        rawDate: '2026-11-10',
        rawTime: '20:30', // Web dice 20:30
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: null,
        basePrice: 10,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const res = corroborateShowWithPdf(raw, customPdfCatalog);
      expect(res.status).toBe('DISCREPANCIA');
      expect(res.discrepancies.some((d) => d.field === 'time')).toBe(true);
    });
  });

  // =========================================================================
  // 9. image_url null cuando no hay imagen oficial o no es de dominio autorizado
  // =========================================================================
  describe('9. image_url null cuando no hay imagen oficial', () => {
    test('Acepta URLs del CDN oficial cdn.tenemosplan.com o del teatro', () => {
      const valid1 = validateOfficialImageUrl(
        'https://cdn.tenemosplan.com/tiendas/0_cartel.jpg'
      );
      expect(valid1).toBe('https://cdn.tenemosplan.com/tiendas/0_cartel.jpg');

      const valid2 = validateOfficialImageUrl(
        'https://teatroprincipaldepalencia.es/img/cartel.png'
      );
      expect(valid2).toBe('https://teatroprincipaldepalencia.es/img/cartel.png');
    });

    test('Rechaza y convierte a null URLs de terceros no autorizados o cadenas vacías', () => {
      expect(validateOfficialImageUrl('https://blogs.com/terceros/foto.jpg')).toBeNull();
      expect(validateOfficialImageUrl('https://instagram.com/cartel.jpg')).toBeNull();
      expect(validateOfficialImageUrl('')).toBeNull();
      expect(validateOfficialImageUrl(null)).toBeNull();
      expect(validateOfficialImageUrl(undefined)).toBeNull();
    });
  });

  // =========================================================================
  // 10. Ningún evento se publica automáticamente
  // =========================================================================
  describe('10. Ningún evento se publica automáticamente', () => {
    test('Todas las propuestas generadas tienen obligatoriamente estado draft', () => {
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'nadia-1',
        title: 'NADIA',
        rawDate: '2026-11-12',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: 'Sinopsis',
        basePrice: 8,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const proposal = normalizeTheaterShow(raw, {
        status: 'CORROBORADO',
        matchedPdfShow: null,
        discrepancies: [],
      });

      expect(proposal.status).toBe('draft');
      expect(proposal.status).not.toBe('published');
    });
  });

  // =========================================================================
  // 11. Ningún evento existente se modifica
  // =========================================================================
  describe('11. Ningún evento existente se modifica', async () => {
    test('El importador en modo dryRun garantiza 0 mutaciones en la base de datos', async () => {
      const existingEvents = [
        { id: 52, dedupeKey: 'k52', title: 'Palencia Basket', editorialDate: '2026-10-24', venueId: 10157, status: 'published' },
        { id: 54, dedupeKey: 'k54', title: 'Palencia Rugby', editorialDate: '2026-11-08', venueId: 10158, status: 'published' },
        { id: 57, dedupeKey: 'k57', title: 'San Silvestre', editorialDate: '2026-12-31', venueId: 10151, status: 'published' },
      ];

      const importer = new TheaterImporter(existingEvents, []);
      const report = await importer.runImport({
        dryRun: true,
        rawItemsOverride: [
          {
            sourceId: 'teatro_principal_palencia',
            slug: 'leonora-2',
            title: 'LEONORA',
            rawDate: '2026-11-21',
            rawTime: '20:30',
            detailUrl: '',
            ticketsUrl: '',
            imageUrl: null,
            synopsis: null,
            basePrice: 8,
            rawPriceText: null,
            category: 'teatro',
            isTheatrical: true,
          },
        ],
      });

      expect(report.databaseMutations.eventsCreated).toBe(0);
      expect(report.databaseMutations.venuesCreated).toBe(0);
      expect(report.databaseMutations.eventsModified).toBe(0);
      expect(report.databaseMutations.venuesModified).toBe(0);
    });
  });

  // =========================================================================
  // 12. Prevención de SQL injection
  // =========================================================================
  describe('12. Prevención de SQL injection', () => {
    test('Maneja de forma segura cadenas con cargas de inyección SQL sin corromper dedupe_key ni títulos', () => {
      const maliciousTitle = "'; DROP TABLE events; --";
      const raw: RawTheaterItem = {
        sourceId: 'teatro_principal_palencia',
        slug: 'exploit-test',
        title: maliciousTitle,
        rawDate: '2026-12-01',
        rawTime: '20:30',
        detailUrl: '',
        ticketsUrl: '',
        imageUrl: null,
        synopsis: "1' OR '1'='1",
        basePrice: 10,
        rawPriceText: null,
        category: 'teatro',
        isTheatrical: true,
      };

      const proposal = normalizeTheaterShow(raw, {
        status: 'CORROBORADO',
        matchedPdfShow: null,
        discrepancies: [],
      });

      // El título se guarda como texto plano literal sin interpretación SQL
      expect(proposal.title).toBe("'; DROP TABLE events; --");
      expect(proposal.description).toBe("1' OR '1'='1");
      // La dedupeKey es una cadena alfanumérica controlada
      expect(proposal.dedupeKey).toBe(
        'palencia-teatro-teatro-principal-exploit-test-2026-12-01-2030'
      );
      expect(proposal.venueId).toBe(2);
    });
  });

  // =========================================================================
  // 13. Manejo de paginación
  // =========================================================================
  describe('13. Manejo de paginación', () => {
    test('Detiene la iteración cuando una página devuelve 0 resultados', async () => {
      let requestedPages: number[] = [];

      const mockFetch: typeof fetch = async (input) => {
        const url = input.toString();
        const pageMatch = url.match(/pagina=([0-9]+)/);
        const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;
        requestedPages.push(page);

        if (page === 1) {
          return new Response(
            `<div class="para-sombra">
              <h2 class="titulo font-bold">OBRA PAGINA 1</h2>
              <a href="https://teatroprincipaldepalencia.es/es/entradas/obra-1/2026-11-01">Comprar</a>
            </div>`,
            { status: 200 }
          );
        } else if (page === 2) {
          return new Response(
            `<div class="para-sombra">
              <h2 class="titulo font-bold">OBRA PAGINA 2</h2>
              <a href="https://teatroprincipaldepalencia.es/es/entradas/obra-2/2026-11-02">Comprar</a>
            </div>`,
            { status: 200 }
          );
        } else {
          // Página vacía
          return new Response(`<div>No hay resultados</div>`, { status: 200 });
        }
      };

      const importer = new TheaterImporter();
      await importer.runImport({
        dryRun: true,
        maxPages: 5,
        fetchFn: mockFetch,
      });

      // Debe haber pedido página 1, 2 y luego 3 que vino vacía, parando sin pedir 4 ni 5
      expect(requestedPages).toContain(1);
      expect(requestedPages).toContain(2);
      expect(requestedPages).toContain(3);
      expect(requestedPages).not.toContain(4);
      expect(requestedPages).not.toContain(5);
    });
  });

  // =========================================================================
  // 14. Fallo controlado si la fuente no responde
  // =========================================================================
  describe('14. Fallo controlado si la fuente no responde', () => {
    test('Registra el error sin lanzar excepciones no controladas cuando la red falla o timeout', async () => {
      const failingFetch: typeof fetch = async () => {
        throw new Error('Connection refused / ECONNREFUSED');
      };

      const importer = new TheaterImporter();
      const report = await importer.runImport({
        dryRun: true,
        fetchFn: failingFetch,
      });

      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors[0].message).toContain('Connection refused');
      expect(report.proposalsCount).toBe(0);
      expect(report.databaseMutations.eventsCreated).toBe(0);
    });

    test('Registra el error controlado cuando el servidor remoto devuelve código HTTP 500', async () => {
      const serverErrorFetch: typeof fetch = async () => {
        return new Response('Internal Server Error', { status: 500 });
      };

      const importer = new TheaterImporter();
      const report = await importer.runImport({
        dryRun: true,
        fetchFn: serverErrorFetch,
      });

      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors[0].message).toContain('HTTP 500');
    });
  });
});
