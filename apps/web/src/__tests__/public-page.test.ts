import { describe, expect, test } from 'bun:test';
import { renderPublicHtml } from '../public-page';
import webApp from '../index';

describe('apps/web — Renderizado de Plantilla Pública (public-page.ts)', () => {
  test('renderPublicHtml genera un documento HTML válido y completo', () => {
    const html = renderPublicHtml();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(50000);

    // Estructura HTML básica
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain('name="viewport"');

    // Metadatos por defecto de VayaPlan
    expect(html).toContain('<title>VayaPlan — ¿Qué hacer hoy en Palencia? Agenda Hiperlocal</title>');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:title" content="VayaPlan — ¿Qué hacer hoy en Palencia?">');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:image" content="https://vayaplan.com/icons/icon-512x512.png">');
    expect(html).toContain('<meta property="og:url" content="https://vayaplan.com/">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');

    // Contenedores esenciales de la interfaz pública
    expect(html).toContain('id="content-container"');
    expect(html).toContain('id="promoted-container"');
    expect(html).toContain('id="detail-modal"');
    expect(html).toContain('id="modal-content"');
    expect(html).toContain('id="poster-lightbox"');

    // Módulo cliente en script embebido
    expect(html).toContain('<script type="module">');
    expect(html).toContain('function loadData()');
    expect(html).toContain('function openEventModal(');
    expect(html).toContain('function openPosterLightbox(');
    expect(html).toContain('function closeModal()');
  });

  test('GET / en apps/web responde 200 con el HTML de renderPublicHtml', async () => {
    const fetchFn = (webApp as any).fetch;
    const res = await fetchFn(new Request('http://localhost/'));
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('text/html');

    const bodyText = await res.text();
    expect(bodyText).toBe(renderPublicHtml());
  });
});
