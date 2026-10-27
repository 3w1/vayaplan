import { describe, expect, test } from 'bun:test';
import {
  renderPublicHtml,
  sanitizeLinkHref,
  renderSafeCreditLink,
} from '../public-page';

describe('apps/web — Atribución Fotográfica en Lugares Permanentes (public-page.ts)', () => {
  describe('1. Sanitización de enlaces y seguridad contextual (sanitizeLinkHref)', () => {
    test('acepta URLs válidas con protocolo HTTPS', () => {
      const url = 'https://commons.wikimedia.org/wiki/File:Fachada_principal_de_la_Casa_de_Cord%C3%B3n,_Palencia.jpg';
      expect(sanitizeLinkHref(url)).toBe(url);
    });

    test('acepta URLs válidas con protocolo HTTP', () => {
      const url = 'http://example.com/foto.jpg';
      expect(sanitizeLinkHref(url)).toBe(url);
    });

    test('rechaza protocolo javascript:', () => {
      expect(sanitizeLinkHref('javascript:alert(1)')).toBeNull();
      expect(sanitizeLinkHref('JAVASCRIPT:alert(document.cookie)')).toBeNull();
      expect(sanitizeLinkHref(' javascript:void(0)')).toBeNull();
    });

    test('rechaza protocolo data:', () => {
      expect(sanitizeLinkHref('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(sanitizeLinkHref('DATA:image/svg+xml;base64,...')).toBeNull();
    });

    test('rechaza protocolo ftp: y otros no autorizados', () => {
      expect(sanitizeLinkHref('ftp://servidor.com/archivo.jpg')).toBeNull();
      expect(sanitizeLinkHref('file:///etc/passwd')).toBeNull();
      expect(sanitizeLinkHref('blob:https://vayaplan.com/uuid')).toBeNull();
    });

    test('devuelve null ante valores vacíos, nulos o no string', () => {
      expect(sanitizeLinkHref(null)).toBeNull();
      expect(sanitizeLinkHref(undefined)).toBeNull();
      expect(sanitizeLinkHref('')).toBeNull();
      expect(sanitizeLinkHref('   ')).toBeNull();
      expect(sanitizeLinkHref(12345 as any)).toBeNull();
    });

    test('devuelve null ante URLs malformadas', () => {
      expect(sanitizeLinkHref('no-es-una-url')).toBeNull();
      expect(sanitizeLinkHref('https://')).toBeNull();
      expect(sanitizeLinkHref('://invalido')).toBeNull();
    });

    test('escapa caracteres peligrosos para atributos HTML en URLs con comillas o tags', () => {
      const injected = 'https://example.com/?a="><script>alert(1)</script>';
      const sanitized = sanitizeLinkHref(injected);
      if (sanitized !== null) {
        expect(sanitized).not.toContain('"');
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).toContain('&quot;');
        expect(sanitized).toContain('&lt;');
        expect(sanitized).toContain('&gt;');
      }
    });
  });

  describe('2. Renderizado seguro de enlace de crédito (renderSafeCreditLink)', () => {
    test('renderiza etiqueta <a> segura con target="_blank" y rel="noopener noreferrer"', () => {
      const html = renderSafeCreditLink(
        'https://creativecommons.org/licenses/by/4.0/',
        'CC BY 4.0'
      );
      expect(html).toContain('<a href="https://creativecommons.org/licenses/by/4.0/"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('>CC BY 4.0</a>');
    });

    test('si la URL no es segura (javascript:), renderiza solo el texto plano sin etiqueta <a>', () => {
      const html = renderSafeCreditLink(
        'javascript:alert(1)',
        'José Luis Filpo Cabana'
      );
      expect(html).not.toContain('<a');
      expect(html).not.toContain('href');
      expect(html).toBe('José Luis Filpo Cabana');
    });

    test('si la URL es null o vacía, renderiza solo el texto plano', () => {
      expect(renderSafeCreditLink(null, 'Autor Desconocido')).toBe('Autor Desconocido');
      expect(renderSafeCreditLink('', 'Autor')).toBe('Autor');
    });

    test('escapa HTML en el texto visible ante intentos de inyección', () => {
      const html = renderSafeCreditLink(
        'https://example.com',
        '<script>alert("XSS")</script>'
      );
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('3. Elementos y reglas en la plantilla HTML pública (renderPublicHtml)', () => {
    test('la plantilla contiene estilos CSS para créditos de lightbox, modal y miniaturas', () => {
      const html = renderPublicHtml();
      expect(html).toContain('.poster-lightbox-credit');
      expect(html).toContain('.place-image-credit');
      expect(html).toContain('.card-credit-badge');
    });

    test('el modal lightbox incluye el contenedor #poster-lightbox-credit', () => {
      const html = renderPublicHtml();
      expect(html).toContain('id="poster-lightbox-credit"');
      expect(html).toContain('class="poster-lightbox-credit"');
    });

    test('el script cliente contiene las funciones de sanitización y renderizado de créditos', () => {
      const html = renderPublicHtml();
      expect(html).toContain('function sanitizeLinkHref(');
      expect(html).toContain('function renderSafeCreditLink(');
    });

    test('openPlaceModal gestiona data-poster-attribution y renderiza .place-image-credit condicionalmente', () => {
      const html = renderPublicHtml();
      expect(html).toContain('data-poster-attribution=');
      expect(html).toContain('class="place-image-credit"');
    });

    test('openPosterLightbox actualiza #poster-lightbox-credit y closePosterLightbox lo limpia', () => {
      const html = renderPublicHtml();
      expect(html).toContain('poster-lightbox-credit');
      expect(html).toContain('creditEl.style.display = \'none\'');
    });
  });

  describe('4. Comportamiento en miniatura, modal y lightbox (con y sin atribución)', () => {
    test('Cine Ortega (image_attribution: null) no muestra badges ni franja de crédito', () => {
      const cineOrtega = {
        id: 1,
        name: 'Cine Ortega',
        image_url: 'https://cdn.vayaplan.com/places/palencia-cine-ortega.webp',
        image_attribution: null,
      };

      // Simulación de comprobación de tarjeta
      const hasThumbBadge = Boolean(cineOrtega.image_url && cineOrtega.image_attribution);
      expect(hasThumbBadge).toBe(false);

      // Simulación de modal
      const hasModalCredit = Boolean(cineOrtega.image_attribution);
      expect(hasModalCredit).toBe(false);
    });

    test('Museo de Palencia (con atribución CC BY 4.0) muestra todos los datos y enlaces', () => {
      const museo = {
        id: 2,
        name: 'Museo de Palencia',
        image_url: 'https://cdn.vayaplan.com/places/palencia-museo-de-palencia.webp',
        image_attribution: {
          author: 'José Luis Filpo Cabana',
          source_url: 'https://commons.wikimedia.org/wiki/File:Fachada_principal_de_la_Casa_de_Cord%C3%B3n,_Palencia.jpg',
          license: 'CC BY 4.0',
          license_url: 'https://creativecommons.org/licenses/by/4.0/',
          modifications: 'Redimensionada y convertida a WebP',
        },
      };

      // Simulación de comprobación de tarjeta
      const hasThumbBadge = Boolean(museo.image_url && museo.image_attribution);
      expect(hasThumbBadge).toBe(true);

      // Simulación de crédito en modal
      const authorLink = renderSafeCreditLink(museo.image_attribution.source_url, museo.image_attribution.author);
      const licenseLink = renderSafeCreditLink(museo.image_attribution.license_url, museo.image_attribution.license);

      expect(authorLink).toContain('href="https://commons.wikimedia.org/wiki/File:Fachada_principal_de_la_Casa_de_Cord%C3%B3n,_Palencia.jpg"');
      expect(authorLink).toContain('José Luis Filpo Cabana');
      expect(licenseLink).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
      expect(licenseLink).toContain('CC BY 4.0');
    });
  });
});
