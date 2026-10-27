import { describe, expect, test } from 'bun:test';
import {
  renderPublicHtml,
  sanitizeLinkHref,
  renderSafeCreditLink,
  renderEventCreditHtml,
} from '../public-page';

describe('apps/web — Atribución Fotográfica en Eventos (public-page.ts)', () => {
  describe('1. Renderizado de texto y enlace de crédito (renderEventCreditHtml)', () => {
    test('procedencia estándar sin autor: "Imagen: web del Teatro Principal de Palencia" con enlace a la ficha oficial', () => {
      const attribution = {
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
        source_title: 'web del Teatro Principal de Palencia',
        author: null,
      };

      const html = renderEventCreditHtml(attribution);
      expect(html).toContain('Imagen: ');
      expect(html).toContain('href="https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10"');
      expect(html).toContain('web del Teatro Principal de Palencia');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    test('procedencia con autor identificado: "Foto: [autor]. Fuente: Teatro Principal de Palencia."', () => {
      const attribution = {
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/urban-simphony',
        source_title: 'Teatro Principal de Palencia',
        author: 'Carlos Sanz',
      };

      const html = renderEventCreditHtml(attribution);
      expect(html).toContain('Foto: Carlos Sanz. Fuente: ');
      expect(html).toContain('href="https://teatroprincipaldepalencia.es/es/productos/descripcion/urban-simphony"');
      expect(html).toContain('Teatro Principal de Palencia');
    });

    test('procedencia con autor y licencia formal (CC BY-SA 4.0)', () => {
      const attribution = {
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/flamenc-oh-',
        source_title: 'Teatro Principal',
        author: 'Laura Gómez',
        license: 'CC BY-SA 4.0',
        license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      };

      const html = renderEventCreditHtml(attribution);
      expect(html).toContain('Foto: ');
      expect(html).toContain('Laura Gómez');
      expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"');
      expect(html).toContain('CC BY-SA 4.0');
    });

    test('procedencia de cartel oficial de festival: "Imagen: Festival Jazz Palencia" con enlace a la fuente', () => {
      const attribution = {
        source_url: 'https://jazzpalencia.es/actividades/antonio-serrano-kaele-jimenez-cuarteto/',
        source_title: 'Festival Jazz Palencia',
        author: null,
      };

      const html = renderEventCreditHtml(attribution);
      expect(html).toContain('Imagen: ');
      expect(html).toContain('href="https://jazzpalencia.es/actividades/antonio-serrano-kaele-jimenez-cuarteto/"');
      expect(html).toContain('Festival Jazz Palencia');
    });

    test('fallback seguro sin URL válida: renderiza solo el texto plano sin enlace', () => {
      const attribution = {
        source_url: 'javascript:alert(1)',
        source_title: 'web del Teatro Principal de Palencia',
        author: null,
      };

      const html = renderEventCreditHtml(attribution);
      expect(html).not.toContain('<a');
      expect(html).not.toContain('javascript');
      expect(html).toContain('Imagen: web del Teatro Principal de Palencia');
    });

    test('protege contra inyecciones XSS en author o source_title', () => {
      const attribution = {
        source_url: 'https://teatroprincipaldepalencia.es/',
        source_title: '<script>alert("XSS")</script>',
        author: '<img src=x onerror=alert(1)>',
      };

      const html = renderEventCreditHtml(attribution);
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
    });

    test('devuelve cadena vacía ante atribución nula o vacía', () => {
      expect(renderEventCreditHtml(null)).toBe('');
      expect(renderEventCreditHtml(undefined)).toBe('');
    });
  });

  describe('2. Plantilla pública y soporte en visor (renderPublicHtml)', () => {
    test('contiene reglas CSS para .event-image-credit compartiendo estilo accesible', () => {
      const html = renderPublicHtml();
      expect(html).toContain('.event-image-credit');
    });

    test('el script cliente implementa renderEventCreditHtml', () => {
      const html = renderPublicHtml();
      expect(html).toContain('function renderEventCreditHtml(');
    });

    test('renderEventDetail inyecta data-poster-attribution y la sección .event-image-credit', () => {
      const html = renderPublicHtml();
      expect(html).toContain('class="event-image-credit"');
      expect(html).toContain('data-poster-attribution=');
    });

    test('openPosterLightbox actualiza correctamente créditos de eventos y de locales sin colisiones', () => {
      const html = renderPublicHtml();
      expect(html).toContain('attribution.source_title');
      expect(html).toContain('creditEl.style.display = \'block\'');
    });
  });

  describe('3. Verificación de no-regresión en créditos de lugares permanentes (places)', () => {
    test('Museo de Palencia sigue formateándose como Foto: [autor] · [licencia]', () => {
      const placeAttribution = {
        author: 'José Luis Filpo Cabana',
        source_url: 'https://commons.wikimedia.org/wiki/File:Fachada_principal_de_la_Casa_de_Cord%C3%B3n,_Palencia.jpg',
        license: 'CC BY 4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
      };

      const html = renderEventCreditHtml(placeAttribution);
      expect(html).toContain('Foto: ');
      expect(html).toContain('José Luis Filpo Cabana');
      expect(html).toContain('CC BY 4.0');
      expect(html).toContain('&middot;');
    });
  });

  describe('4. Alternancia y ausencia de bloques vacíos', () => {
    test('evento sin atribución no genera HTML de crédito', () => {
      expect(renderEventCreditHtml(null)).toBe('');
      expect(renderEventCreditHtml(undefined)).toBe('');
    });

    test('simulación de alternancia en lightbox: evento con crédito -> evento sin crédito -> lugar con crédito', () => {
      // 1. Evento con crédito
      const eventCredit = {
        source_url: 'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
        source_title: 'web del Teatro Principal de Palencia',
        author: null,
      };
      const renderedEvent = renderEventCreditHtml(eventCredit);
      expect(renderedEvent).toContain('web del Teatro Principal de Palencia');

      // 2. Evento sin crédito (debe limpiar completamente)
      const renderedNoCredit = renderEventCreditHtml(null);
      expect(renderedNoCredit).toBe('');

      // 3. Lugar con crédito Creative Commons
      const placeCredit = {
        author: 'José Luis Filpo Cabana',
        source_url: 'https://commons.wikimedia.org/wiki/File:Fachada.jpg',
        license: 'CC BY 4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
      };
      const renderedPlace = renderEventCreditHtml(placeCredit);
      expect(renderedPlace).toContain('Foto: ');
      expect(renderedPlace).toContain('José Luis Filpo Cabana');
      expect(renderedPlace).toContain('CC BY 4.0');
    });
  });
});
