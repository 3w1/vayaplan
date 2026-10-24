import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';
import { extractExecutableInlineScripts } from './admin-script-syntax.test';

describe('apps/web — Panel de Administración: Imágenes de Biblioteca Pública (admin.ts)', () => {
  const html = renderAdminHtml();

  test('renderAdminHtml incluye el botón de pestaña y el modal de decisión', () => {
    expect(html).toContain('id="prop-tab-biblioteca"');
    expect(html).toContain('Imágenes Biblioteca Pública');
    expect(html).toContain('id="modal-biblioteca-decision"');
    expect(html).toContain('id="bib-decision-event-id"');
    expect(html).toContain('id="bib-decision-action"');
    expect(html).toContain('submitBibliotecaDecision()');
  });

  test('renderBibliotecaImagesList ejecuta y renderiza los eventos de la biblioteca con sus imágenes', async () => {
    const scripts = extractExecutableInlineScripts(html);
    const mainScript = scripts.find(s => s.content.includes('renderBibliotecaImagesList'));
    expect(mainScript).toBeDefined();

    const domElements: Record<string, any> = {
      'proposals-tbody': { innerHTML: '' },
      'proposals-cards-container': { innerHTML: '' },
      'proposals-count-badge': { innerText: '', style: {} },
      'bib-decision-event-id': { value: '' },
      'bib-decision-action': { value: '' },
      'bib-decision-image-url': { value: '' },
      'bib-decision-r2-key': { value: '' },
      'bib-decision-credit': { value: '' },
      'bib-decision-notes': { value: '' },
      'bib-decision-alert': { style: {}, innerText: '' },
      'modal-bib-decision-title': { innerText: '' },
      'bib-decision-description-text': { innerText: '' },
      'bib-decision-preview-box': { innerHTML: '' },
      'btn-submit-bib-decision': { disabled: false, innerText: '' },
      'prop-tab-biblioteca': { classList: { add: () => {}, remove: () => {} }, style: {} },
    };

    const mockProposals = [
      {
        eventId: 9,
        eventTitle: "Exposición de fotografía 'Una mirada sincera' de Agustín Hernández",
        editorialDate: '2026-10-01',
        endDate: '2026-10-30',
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'SIN_IMAGEN',
        currentImageUrl: null,
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
        r2Key: 'biblioteca-publica/exposicion-agustin-hernandez/8a71e5e5a4d7.webp',
        sourceImageUrl: 'https://bibliotecas.jcyl.es/web/jcyl/binarios/35/937/cartel.jpg',
        sourcePageUrl: 'https://bibliotecas.jcyl.es/web/evento/9',
        sourceName: 'Biblioteca Pública de Palencia (Junta de Castilla y León)',
        credit: 'Biblioteca Pública de Palencia / Agustín Hernández',
        imageWidth: 530,
        imageHeight: 750,
        contentType: 'image/webp',
        sizeBytes: 42892,
        lastCheckedAt: '2026-10-24T21:48:12Z',
        recommendedAction: 'ADOPTAR_IMAGEN_OFICIAL',
      },
      {
        eventId: 19,
        eventTitle: 'Exposición: «El jazz está en los libros»',
        editorialDate: '2026-10-30',
        endDate: '2026-11-21',
        venueName: 'Biblioteca Pública de Palencia',
        currentImageStatus: 'IMAGEN_GENERICA',
        currentImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2026/09/Cartel-Jazz-2026.webp',
        proposedImageUrl: 'https://media.vayaplan.com/biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
        r2Key: 'biblioteca-publica/el-jazz-esta-en-los-libros/514f8e88b8df.webp',
        sourceImageUrl: 'https://jazzpalencia.es/wp-content/uploads/2025/09/biblioteca-palencia.webp',
        sourcePageUrl: 'https://jazzpalencia.es/actividades/19',
        sourceName: 'Festival Jazz Palencia / Biblioteca Pública de Palencia',
        credit: 'Jazz Palencia / Biblioteca Pública de Palencia',
        imageWidth: 1360,
        imageHeight: 1020,
        contentType: 'image/webp',
        sizeBytes: 141078,
        lastCheckedAt: '2026-10-24T21:48:12Z',
        recommendedAction: 'PROPONER_ALTERNATIVA',
      },
    ];

    const sandbox: any = {
      window: {},
      URLSearchParams,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ proposals: mockProposals }),
      }),
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              value: '',
              innerText: '',
              innerHTML: '',
              style: {},
              classList: { add: () => {}, remove: () => {} },
              querySelector: () => null,
              querySelectorAll: () => [],
            };
          }
          return domElements[id];
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
        addEventListener: () => {},
      },
      localStorage: {
        getItem: () => 'valid-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      alert: () => {},
      openModal: () => {},
      closeModal: () => {},
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
    };
    sandbox.window = sandbox;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(mainScript!.content, ctx);

    expect(typeof ctx.window.loadBibliotecaImageProposals).toBe('function');
    expect(typeof ctx.window.renderBibliotecaImagesList).toBe('function');
    expect(typeof ctx.window.openBibliotecaDecisionModal).toBe('function');

    await ctx.window.loadBibliotecaImageProposals();

    const tbodyHtml = domElements['proposals-tbody'].innerHTML;
    const cardsHtml = domElements['proposals-cards-container'].innerHTML;

    expect(tbodyHtml).toContain("Exposición de fotografía 'Una mirada sincera'");
    expect(tbodyHtml).toContain('Sin Imagen');
    expect(tbodyHtml).toContain('Adoptar imagen oficial');
    expect(tbodyHtml).toContain('Proponer alternativa');

    expect(cardsHtml).toContain('Exposición: «El jazz está en los libros»');
    expect(cardsHtml).toContain('Oficial R2');

    // Probar apertura del modal de decisión para adopción
    expect(() => ctx.openBibliotecaDecisionModal(9, 'adopt')).not.toThrow();
    expect(domElements['bib-decision-event-id'].value).toBe('9');
    expect(domElements['bib-decision-action'].value).toBe('adopt');
    expect(domElements['bib-decision-image-url'].value).toContain('8a71e5e5a4d7.webp');
  });
});
