/**
 * Renderizador de la interfaz pública PWA de VayaPlan
 * Zero-Form UI, responsive, mobile-first con agenda hiperlocal
 */
export function renderPublicHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>VayaPlan — ¿Qué hacer hoy en Palencia? Agenda Hiperlocal</title>
  <meta name="description" content="Agenda hiperlocal sin filtros ni registro. Conciertos, teatro, cine y tardeo en Palencia en menos de 30 segundos.">
  
  <!-- Open Graph / WhatsApp Preview -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="VayaPlan — ¿Qué hacer hoy en Palencia?">
  <meta property="og:description" content="Agenda hiperlocal sin filtros ni registro. Conciertos, teatro, cine y tardeo en Palencia en 30 segundos.">
  <meta property="og:image" content="https://vayaplan.com/icons/icon-512x512.png">
  <meta property="og:url" content="https://vayaplan.com/">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="VayaPlan — Agenda Palencia">
  <meta name="twitter:description" content="Conciertos, teatro, cine y tardeo en Palencia en 30 segundos.">
  <meta name="twitter:image" content="https://vayaplan.com/icons/icon-512x512.png">

  <!-- PWA & Mobile Meta -->
  <meta name="theme-color" content="#6C3BFF">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="VayaPlan">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">
  <link rel="apple-touch-icon" href="/icons/icon-192x192.png">

  <style>
    :root {
      --color-night: #0B0F3B;
      --color-primary: #6C3BFF;
      --color-primary-light: #9D7BFF;
      --color-primary-soft: #F0EBFF;
      --color-amber: #FFC107;
      --color-bg-page: #EEF2F6;
      --color-bg-app: #FFFFFF;
      --color-bg-subtle: #F8FAFC;
      --color-border: #E2E8F0;
      --color-border-subtle: #F1F5F9;
      --color-text-main: #0B0F3B;
      --color-text-muted: #64748B;
      --color-text-subtle: #94A3B8;
      --color-free-green: #059669;
      --color-free-green-bg: #ECFDF5;
      --color-red: #EF4444;
      --color-red-bg: #FEE2E2;
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-pill: 9999px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    *:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--color-bg-page);
      color: var(--color-text-main);
      line-height: 1.5;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    body.modal-open {
      overflow: hidden;
      touch-action: none;
    }

    .app-container {
      width: 100%;
      max-width: 480px;
      min-height: 100dvh;
      background-color: var(--color-bg-app);
      display: flex;
      flex-direction: column;
      position: relative;
      box-shadow: 0 0 32px rgba(11, 15, 59, 0.06);
      padding-bottom: 4rem;
    }

    /* Header y Ciudad */
    header {
      position: sticky;
      top: 0;
      z-index: 30;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--color-border);
      padding: 0.75rem 1rem;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-logo-container {
      height: 36px;
      display: flex;
      align-items: center;
      text-decoration: none;
    }

    .brand-logo-svg {
      height: 30px;
      width: auto;
      display: block;
    }

    .city-pill {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background-color: var(--color-bg-subtle);
      border: 1px solid var(--color-border);
      padding: 0.4rem 0.8rem;
      border-radius: var(--radius-pill);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-night);
    }

    .city-pill svg {
      width: 14px;
      height: 14px;
      fill: var(--color-primary);
      flex-shrink: 0;
    }

    /* Selector temporal (Hoy / Mañana / Este finde / Calendario) */
    .time-selector-bar {
      padding: 0.875rem 1rem 0 1rem;
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .time-selector-bar::-webkit-scrollbar { display: none; }

    .time-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 0.95rem;
      background: #FFFFFF;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .time-tab.active {
      background-color: var(--color-primary);
      border-color: var(--color-primary);
      color: #FFFFFF;
      box-shadow: 0 2px 8px rgba(108, 59, 255, 0.3);
    }

    .calendar-picker-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    .calendar-input {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    /* Fila de Categorías Circulares */
    .categories-row {
      padding: 1rem 1rem 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .cat-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      background: none;
      border: none;
      cursor: pointer;
      min-width: 52px;
      padding: 0.25rem;
    }

    .cat-circle {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--color-bg-subtle);
      border: 1px solid var(--color-border);
      transition: all 0.15s ease;
    }

    .cat-circle svg {
      width: 22px;
      height: 22px;
      fill: var(--color-text-muted);
    }

    .cat-btn.active .cat-circle {
      background-color: var(--color-primary);
      border-color: var(--color-primary);
      box-shadow: 0 4px 12px rgba(108, 59, 255, 0.35);
    }
    .cat-btn.active .cat-circle svg {
      fill: #FFFFFF;
    }

    .cat-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }
    .cat-btn.active .cat-label {
      color: var(--color-night);
      font-weight: 800;
    }

    /* Barra de Filtros Activos */
    .active-filters-bar {
      display: none;
      padding: 0.6rem 1rem;
      background: #F8FAFC;
      border-top: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .active-filters-bar.visible { display: flex; }

    .active-chips-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      font-size: 0.7813rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }

    .filter-chip-removable {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--color-primary-soft);
      color: var(--color-primary);
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      font-weight: 700;
      font-size: 0.75rem;
      cursor: pointer;
      border: none;
    }

    .btn-clear-filters {
      background: none;
      border: none;
      color: var(--color-primary);
      font-size: 0.7813rem;
      font-weight: 700;
      cursor: pointer;
      padding: 0.25rem;
    }

    /* Escaparate de Campañas Destacadas */
    #promoted-container:empty {
      display: none;
    }

    .promoted-showcase {
      margin: 0.75rem 0 1.25rem 0;
      position: relative;
    }

    .promoted-showcase-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem 0.5rem 1rem;
    }

    .promoted-showcase-badge {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-primary);
    }

    .promoted-carousel-nav {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .carousel-arrow {
      background: #FFFFFF;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(11, 15, 59, 0.1);
      transition: opacity 0.15s ease, transform 0.15s ease;
      padding: 0;
    }

    .carousel-arrow:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      pointer-events: none;
    }

    .carousel-arrow:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    .carousel-arrow svg {
      width: 16px;
      height: 16px;
      fill: var(--color-night);
      display: block;
    }

    .carousel-counter {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--color-text-muted);
      min-width: 44px;
      text-align: center;
    }

    .promoted-carousel-track {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      gap: 0.875rem;
      padding: 0.25rem 1rem 0.5rem 1rem;
      scrollbar-width: none;
    }

    .promoted-carousel-track::-webkit-scrollbar {
      display: none;
    }

    .promoted-hero-card {
      flex: 0 0 calc(100% - 2.5rem);
      min-width: calc(100% - 2.5rem);
      max-width: 440px;
      scroll-snap-align: center;
      border-radius: var(--radius-lg);
      overflow: hidden;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(11, 15, 59, 0.14);
      background-color: var(--color-night);
      border: 1px solid rgba(157, 123, 255, 0.22);
      display: flex;
      flex-direction: column;
      text-align: left;
      padding: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .promoted-hero-card:focus-visible {
      outline: 3px solid var(--color-primary);
      outline-offset: 3px;
    }

    /* Zona gráfica superior: contención total del cartel sin recorte */
    .hero-media-box {
      position: relative;
      width: 100%;
      height: 160px;
      background-color: #070924;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hero-img-backdrop {
      position: absolute;
      inset: -10px;
      width: calc(100% + 20px);
      height: calc(100% + 20px);
      object-fit: cover;
      filter: blur(14px);
      opacity: 0.35;
      transform: scale(1.1);
      pointer-events: none;
    }

    .hero-img-contain {
      position: relative;
      z-index: 1;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      pointer-events: none;
    }

    .hero-top-badges {
      position: absolute;
      top: 0.75rem;
      left: 0.75rem;
      right: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      z-index: 2;
    }

    .hero-badge-tag {
      background-color: #FFFFFF;
      color: var(--color-night);
      font-size: 0.6875rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      box-shadow: 0 2px 6px rgba(11, 15, 59, 0.25);
    }

    .hero-category-tag {
      background-color: rgba(11, 15, 59, 0.75);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      color: rgba(255, 255, 255, 0.95);
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    /* Zona inferior independiente de datos y acciones: jamás tapa el cartel */
    .hero-body {
      padding: 0.875rem 1rem 1rem 1rem;
      background: linear-gradient(180deg, #0B0F3B 0%, #11174D 100%);
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      flex: 1;
      justify-content: space-between;
    }

    .hero-eyebrow-datetime {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #D3C4FF;
    }

    .hero-title {
      font-size: 1.1875rem;
      font-weight: 800;
      line-height: 1.25;
      color: #FFFFFF;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
      margin: 0.15rem 0 0.35rem 0;
    }

    .hero-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .hero-meta-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      flex: 1;
    }

    .hero-venue-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.92);
      max-width: 155px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hero-price-pill {
      background-color: var(--color-primary-soft);
      color: var(--color-primary);
      font-weight: 800;
      font-size: 0.8125rem;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      white-space: nowrap;
    }

    .hero-cta {
      display: inline-flex;
      align-items: center;
      background-color: #FFFFFF;
      color: var(--color-night);
      font-size: 0.8125rem;
      font-weight: 800;
      padding: 0.3rem 0.75rem;
      border-radius: var(--radius-pill);
      box-shadow: 0 2px 8px rgba(11, 15, 59, 0.2);
      white-space: nowrap;
    }

    /* Variante sin imagen o imagen fallida: alternativa geométrica de marca */
    .promoted-hero-card.no-image .hero-media-box {
      height: 75px;
      background:
        radial-gradient(circle at 100% 0%, rgba(157, 123, 255, 0.25) 0%, transparent 60%),
        radial-gradient(circle at 0% 100%, rgba(108, 59, 255, 0.2) 0%, transparent 60%),
        linear-gradient(135deg, #0B0F3B 0%, #171E63 55%, #251B5A 100%);
      border-bottom: 1px solid rgba(157, 123, 255, 0.2);
    }

    .promoted-hero-card.no-image .hero-img-backdrop,
    .promoted-hero-card.no-image .hero-img-contain {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .promoted-carousel-track {
        scroll-behavior: auto !important;
      }
      .promoted-hero-card,
      .hero-cta,
      .carousel-arrow {
        transition: none !important;
        transform: none !important;
      }
    }

    /* Lista y Tarjetas Compactas */
    .section-header-compact {
      padding: 0.5rem 1rem 0.75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .section-title-compact {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--color-night);
    }

    .events-list-compact {
      padding: 0 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .card-compact {
      display: flex;
      gap: 0.875rem;
      padding: 0.625rem;
      background: #FFFFFF;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
      text-align: left;
      width: 100%;
      border: 1px solid var(--color-border);
    }
    .card-compact:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(11, 15, 59, 0.05);
    }

    .card-compact.is-cancelled {
      border-color: rgba(239, 68, 68, 0.4);
      background-color: rgba(239, 68, 68, 0.03);
      opacity: 0.85;
    }
    .card-compact.is-promoted {
      border-color: rgba(108, 59, 255, 0.35);
      background: linear-gradient(180deg, #FFFFFF 0%, #FAF8FF 100%);
      box-shadow: 0 2px 8px rgba(108, 59, 255, 0.05);
    }
    .card-compact.is-promoted:hover {
      border-color: var(--color-primary);
      box-shadow: 0 4px 14px rgba(108, 59, 255, 0.12);
    }

    .card-thumb {
      width: 76px;
      height: 76px;
      border-radius: var(--radius-sm);
      object-fit: contain;
      flex-shrink: 0;
      background-color: var(--color-night);
    }

    .card-thumb-fallback {
      width: 76px;
      height: 76px;
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--color-primary-soft), #FFFFFF);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .card-thumb-fallback svg {
      width: 30px;
      height: 30px;
      fill: var(--color-primary-light);
    }

    .card-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
    }

    .card-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--color-night);
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-title.title-cancelled {
      text-decoration: line-through;
      color: var(--color-text-muted);
    }

    .card-venue {
      font-size: 0.7813rem;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.15rem;
    }

    .card-bottom-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.35rem;
    }

    .card-time {
      font-size: 0.7813rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }

    .card-price-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
    }
    .card-price-pill.free {
      background: var(--color-free-green-bg);
      color: var(--color-free-green);
    }
    .card-price-pill.paid {
      background: var(--color-primary-soft);
      color: var(--color-primary);
    }

    /* Badges de Estado, Recurrencias y Lugares */
    .badge-destacado {
      display: inline-block;
      background: var(--color-primary-soft);
      color: var(--color-primary);
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-pill);
      margin-bottom: 0.25rem;
    }

    .cancelled-tag {
      display: inline-block;
      background: var(--color-red-bg);
      color: var(--color-red);
      font-size: 0.6875rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: var(--radius-pill);
      margin-bottom: 0.2rem;
    }

    .recurrence-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background-color: var(--color-primary-soft);
      color: var(--color-primary);
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      font-size: 0.7188rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .place-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background-color: var(--color-free-green-bg);
      color: var(--color-free-green);
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      font-size: 0.7188rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    /* Agrupador de Fin de Semana */
    .weekend-day-group {
      margin-bottom: 1.5rem;
      padding: 0 1rem;
    }

    .weekend-day-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.85rem;
      background-color: var(--color-bg-subtle);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: 0.75rem;
    }

    .weekend-day-title {
      font-size: 0.875rem;
      font-weight: 800;
      color: var(--color-primary);
    }

    .weekend-day-date {
      font-size: 0.7813rem;
      color: var(--color-text-muted);
    }

    /* Modal Ficha Completa */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(11, 15, 59, 0.7);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 100;
      align-items: flex-end;
      justify-content: center;
      overflow: hidden;
    }
    .modal-overlay.active { display: flex; }
    @media (min-width: 480px) {
      .modal-overlay { align-items: center; }
    }

    .modal-sheet {
      background: #FFFFFF;
      width: 100%;
      max-width: 480px;
      max-height: 90dvh;
      border-radius: 24px 24px 0 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      position: relative;
      box-shadow: 0 -10px 40px rgba(11, 15, 59, 0.2);
      display: flex;
      flex-direction: column;
    }
    @media (min-width: 480px) {
      .modal-sheet {
        border-radius: 24px;
        max-height: 85dvh;
      }
    }

    .modal-hero-cover {
      position: relative;
      width: 100%;
      height: clamp(170px, 28vh, 250px);
      background-color: var(--color-night);
      overflow: hidden;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .modal-hero-cover:focus-visible {
      outline: 2px solid var(--color-primary-light);
      outline-offset: -2px;
    }
    .modal-hero-backdrop {
      position: absolute;
      top: -20px;
      left: -20px;
      right: -20px;
      bottom: -20px;
      width: calc(100% + 40px);
      height: calc(100% + 40px);
      object-fit: cover;
      filter: blur(12px) brightness(0.4);
      opacity: 0.75;
      pointer-events: none;
    }
    .modal-hero-img {
      position: relative;
      z-index: 2;
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: 100%;
      object-fit: contain;
    }
    .modal-hero-zoom-badge {
      position: absolute;
      bottom: 10px;
      right: 10px;
      z-index: 3;
      background: rgba(11, 15, 59, 0.82);
      color: #FFFFFF;
      padding: 0.35rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      pointer-events: none;
      transition: background 0.15s ease;
    }
    .modal-hero-cover:hover .modal-hero-zoom-badge,
    .modal-hero-cover:focus-visible .modal-hero-zoom-badge {
      background: rgba(108, 59, 255, 0.95);
    }

    .btn-poster-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.65rem 1rem;
      margin-top: 0.4rem;
      margin-bottom: 0.85rem;
      background: #F5F3FF;
      border: 1px solid rgba(108, 59, 255, 0.25);
      color: var(--color-primary);
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-poster-action:hover {
      background: #EDE9FE;
      border-color: var(--color-primary);
    }
    .btn-poster-action:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    /* Lightbox / Visor de Cartel Completo Accesible */
    .poster-lightbox {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(11, 15, 59, 0.95);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .poster-lightbox-backdrop {
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .poster-lightbox-container {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      max-width: 100vw;
      max-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .poster-lightbox-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: rgba(11, 15, 59, 0.9);
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      color: #FFFFFF;
      z-index: 10;
      flex-shrink: 0;
    }
    .poster-lightbox-title {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #FFFFFF;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 60vw;
    }
    .poster-lightbox-controls {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
    }
    .lightbox-btn {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      touch-action: manipulation;
    }
    .lightbox-btn:hover {
      background: rgba(255, 255, 255, 0.22);
      border-color: rgba(255, 255, 255, 0.4);
    }
    .lightbox-btn:focus-visible {
      outline: 2px solid #9D7BFF;
      outline-offset: 2px;
    }
    .lightbox-close-btn {
      background: rgba(239, 68, 68, 0.28);
      border-color: rgba(239, 68, 68, 0.45);
      margin-left: 0.35rem;
    }
    .lightbox-close-btn:hover {
      background: rgba(239, 68, 68, 0.55);
    }
    .poster-lightbox-viewport {
      flex: 1;
      width: 100%;
      height: 100%;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.75rem;
      cursor: zoom-in;
      user-select: none;
      -webkit-user-select: none;
      touch-action: pan-x pan-y pinch-zoom;
    }
    .poster-lightbox-viewport.is-zoomed {
      cursor: grab;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .poster-lightbox-viewport.is-dragging {
      cursor: grabbing;
    }
    .poster-lightbox-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
      transform-origin: center center;
      border-radius: 4px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .poster-lightbox-footer {
      padding: 0.5rem 1rem;
      text-align: center;
      background: rgba(11, 15, 59, 0.9);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.75);
      font-size: 0.75rem;
      z-index: 10;
      flex-shrink: 0;
    }

    .modal-sticky-header {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 48px;
      background: #FFFFFF;
      border-bottom: 1px solid rgba(11, 15, 59, 0.08);
      border-radius: 24px 24px 0 0;
      display: flex;
      align-items: center;
      padding: 0 0.875rem;
      z-index: 50;
      flex-shrink: 0;
    }

    .modal-close-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #F1F5F9;
      border: 1px solid rgba(11, 15, 59, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--color-night);
      transition: background-color 0.15s ease;
      padding: 0;
      margin: 0;
    }
    .modal-close-btn:hover,
    .modal-close-btn:focus-visible {
      background: #E2E8F0;
      outline: 2px solid var(--color-primary);
      outline-offset: 1px;
    }

    .modal-body {
      padding: 1.25rem;
    }
    .modal-title-main {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--color-night);
      line-height: 1.25;
      margin-bottom: 1rem;
    }

    .modal-meta-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.6rem;
      font-size: 0.875rem;
      color: var(--color-night);
    }
    .modal-meta-row svg {
      width: 16px;
      height: 16px;
      fill: var(--color-primary);
      flex-shrink: 0;
    }

    .modal-action-box {
      margin: 1.25rem 0;
      padding: 1rem;
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .modal-action-main-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .modal-price-display {
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--color-night);
    }

    .btn-primary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      background-color: var(--color-primary);
      color: #FFFFFF;
      font-weight: 700;
      font-size: 0.9375rem;
      padding: 0.75rem 1.25rem;
      border-radius: var(--radius-md);
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: background 0.15s ease;
    }
    .btn-primary-action:hover {
      background-color: #582bd4;
    }

    .btn-secondary-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: var(--color-primary);
      border: 1px solid var(--color-border);
      font-weight: 700;
      font-size: 0.875rem;
      padding: 0.65rem 1.15rem;
      border-radius: var(--radius-md);
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn-secondary-link:hover {
      background: rgba(108, 59, 255, 0.06);
      border-color: var(--color-primary);
    }

    .madrugada-tag {
      display: inline-block;
      background: rgba(108, 59, 255, 0.12);
      color: var(--color-primary);
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-pill);
      margin-left: 0.35rem;
      vertical-align: middle;
    }

    .card-madrugada-badge {
      display: inline-block;
      background: rgba(108, 59, 255, 0.08);
      color: var(--color-primary);
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 0.1rem 0.35rem;
      border-radius: var(--radius-pill);
      margin-left: 0.25rem;
    }

    .action-disclaimer {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      text-align: right;
    }

    /* Estados vacíos y carga */
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      background-color: var(--color-bg-subtle);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      margin: 1rem;
    }

    .empty-state h3 {
      font-size: 1.15rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      color: var(--color-night);
    }

    .empty-state p {
      font-size: 0.875rem;
      color: var(--color-text-muted);
      max-width: 380px;
      margin: 0 auto 1.25rem auto;
    }

    .loader-spinner {
      border: 3px solid var(--color-primary-soft);
      border-top: 3px solid var(--color-primary);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      animation: spin 0.7s linear infinite;
      margin: 2rem auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- Header Superior -->
    <header>
      <a href="/" class="brand-logo-container" aria-label="VayaPlan">
        <!-- Logo Horizontal Oficial VayaPlan (Light) -->
        <svg class="brand-logo-svg" viewBox="0.00 0.00 570.00 148.00" aria-hidden="true" role="img">
          <path fill="#6c3bff" d="M 390.33 116.94 C 387.16 122.30 381.70 123.91 376.50 120.24 C 368.98 114.93 370.13 102.14 370.56 93.83 Q 372.26 60.43 371.96 31.51 Q 371.88 23.05 373.22 16.26 C 374.62 9.20 377.70 2.17 386.32 2.89 C 390.35 3.22 395.83 5.54 397.27 9.74 C 398.37 12.97 398.34 15.96 397.88 20.10 Q 392.81 65.31 392.13 75.77 Q 391.34 87.90 393.08 102.02 Q 394.12 110.54 390.33 116.94 Z"/>
          <path fill="#ffc107" d="M 552.77 80.50 C 549.14 87.61 539.85 88.30 536.84 80.09 C 534.77 74.45 535.19 68.31 536.13 62.38 Q 538.39 47.98 538.32 46.00 C 537.93 35.98 536.38 2.73 555.42 7.00 Q 560.68 8.18 564.54 12.80 C 569.79 19.09 567.66 26.83 564.87 33.75 Q 562.06 40.70 560.59 45.96 C 557.52 56.87 558.40 69.44 552.77 80.50 Z"/>
          <path fill="#6c3bff" d="M 311.83 128.74 C 296.52 130.56 299.46 113.26 300.07 103.94 C 300.58 95.97 300.09 87.21 300.10 78.20 C 300.10 68.94 301.07 61.47 302.02 53.50 C 302.49 49.55 302.39 44.58 298.96 42.05 C 295.35 39.38 291.29 37.81 291.16 32.25 C 290.73 13.40 315.50 8.02 329.75 8.00 C 349.79 7.99 366.82 16.68 367.88 38.81 Q 368.95 60.89 351.25 73.25 C 344.47 77.99 335.76 82.31 327.93 87.70 C 316.59 95.51 320.74 105.81 321.18 117.11 C 321.44 123.63 318.53 127.94 311.83 128.74 Z M 322.92 54.10 C 321.29 75.29 339.76 57.34 343.40 52.04 C 348.15 45.13 349.46 37.42 341.46 32.58 C 335.01 28.68 324.39 26.92 324.01 38.00 Q 323.90 41.43 322.92 54.10 Z"/>
          <path fill="#0b0f3b" d="M 72.88 100.78 Q 72.93 100.76 73.49 100.24 Q 75.10 98.75 77.20 94.21 C 83.95 79.59 87.08 71.19 93.24 61.59 Q 101.45 48.80 109.04 34.87 Q 110.47 32.23 114.40 28.46 Q 118.73 24.30 125.29 25.12 C 129.15 25.60 135.24 28.63 134.03 33.43 Q 133.31 36.30 131.69 38.94 Q 130.49 40.89 119.27 58.77 C 107.72 77.18 97.42 96.65 89.01 116.88 C 85.51 125.29 81.34 134.07 73.84 139.52 Q 66.48 144.87 59.81 138.69 C 52.83 132.22 49.04 122.31 47.58 112.94 C 46.47 105.86 45.62 93.62 43.15 83.38 C 40.19 71.08 29.71 58.01 39.39 45.62 C 42.90 41.12 49.80 36.64 54.64 41.49 Q 57.38 44.23 58.78 47.80 C 63.58 59.99 64.77 72.78 66.40 84.85 Q 67.45 92.65 70.11 99.63 A 2.06 2.05 67.4 0 0 72.88 100.78 Z"/>
          <path fill="#6c3bff" d="M 485.10 54.15 C 486.79 52.51 488.46 49.97 491.80 45.60 Q 495.39 40.91 501.85 37.39 C 509.43 33.25 516.32 35.84 520.59 42.92 C 527.05 53.64 521.31 65.91 522.43 76.25 C 523.43 85.37 525.54 96.62 523.20 106.92 Q 522.90 108.24 520.81 110.57 A 3.48 3.42 16.5 0 1 518.74 111.67 C 515.04 112.19 511.99 110.17 508.92 107.59 C 500.42 100.45 502.63 91.61 503.71 80.75 C 504.07 77.11 504.24 70.66 501.76 68.00 A 3.20 2.65 -36.0 0 0 498.04 67.76 Q 496.09 68.94 494.44 71.47 C 489.64 78.82 487.66 86.51 485.57 95.81 C 483.76 103.84 472.71 115.69 466.26 103.01 C 461.14 92.92 463.54 81.72 465.09 68.76 Q 465.57 64.71 464.90 53.26 Q 464.30 42.92 473.57 39.96 C 480.68 37.69 484.73 46.59 485.10 54.15 Z"/>
          <path fill="#6c3bff" d="M 443.14 99.64 C 441.76 97.73 439.32 96.40 437.75 98.73 C 433.66 104.78 430.09 109.45 422.64 111.41 C 415.87 113.18 406.51 112.46 401.96 106.48 Q 397.59 100.74 397.24 93.00 Q 396.21 70.91 410.44 54.17 C 417.94 45.34 429.51 40.07 440.95 42.31 C 450.95 44.27 456.95 52.76 456.85 62.71 Q 456.74 73.43 456.71 77.25 Q 456.67 83.18 458.29 87.46 C 461.02 94.67 463.16 101.26 456.51 107.20 C 450.96 112.15 445.83 103.37 443.14 99.64 Z M 435.18 62.80 Q 434.42 61.79 433.28 62.26 Q 424.12 66.02 420.09 74.81 Q 417.29 80.91 415.94 85.98 C 414.90 89.86 418.34 90.93 421.30 89.72 C 428.75 86.68 434.71 71.38 435.61 65.15 Q 435.83 63.65 435.18 62.80 Z"/>
          <path fill="#0b0f3b" d="M 270.54 94.51 A 2.29 2.28 -59.2 0 0 267.66 95.24 Q 262.88 102.01 256.86 106.34 C 251.74 110.02 243.87 113.83 237.97 112.19 C 225.94 108.87 224.93 89.80 227.24 80.39 Q 229.13 72.63 235.60 63.96 C 243.70 53.11 257.76 37.53 272.97 46.37 Q 283.17 52.30 286.01 63.61 C 287.45 69.33 286.85 76.82 287.12 83.33 Q 287.38 89.85 290.72 97.82 C 292.93 103.10 292.75 108.50 285.49 108.67 C 278.11 108.85 275.49 102.29 271.00 95.10 Q 270.67 94.58 270.54 94.51 Z M 249.98 73.49 Q 245.03 81.05 244.24 89.30 A 1.97 1.78 -84.3 0 0 245.81 91.42 C 250.04 91.87 255.42 82.57 257.95 78.70 C 260.48 74.84 266.85 66.18 264.75 62.48 A 1.97 1.78 -29.3 0 0 262.17 61.89 Q 254.93 65.92 249.98 73.49 Z"/>
          <path fill="#ffc107" d="M 15.29 47.45 C 21.43 47.30 27.24 56.04 25.34 61.71 C 23.93 65.90 20.09 68.71 15.81 68.81 C 11.54 68.91 7.57 66.29 5.96 62.17 C 3.79 56.61 9.18 47.60 15.29 47.45 Z"/>
          <path fill="#0b0f3b" d="M 199.00 102.55 Q 197.13 101.10 194.70 102.47 Q 188.50 105.97 183.90 108.09 C 171.50 113.80 167.14 98.95 166.12 89.93 Q 164.36 74.30 172.16 60.24 C 174.41 56.17 178.82 54.11 182.86 57.01 C 185.81 59.11 187.31 60.71 186.99 64.82 Q 186.66 68.98 186.32 70.03 C 185.39 72.96 183.21 79.28 184.07 84.35 A 2.20 2.19 -17.3 0 0 187.16 85.97 C 190.99 84.19 192.96 82.05 194.54 79.77 Q 200.21 71.58 202.09 64.66 C 203.88 58.05 206.14 53.91 211.38 50.91 C 225.87 42.61 224.37 70.72 223.46 76.53 Q 220.81 93.54 218.14 108.17 C 215.96 120.13 210.00 138.43 198.39 143.95 C 193.77 146.14 187.43 144.86 183.41 141.94 C 176.16 136.69 183.16 132.16 187.80 128.54 C 190.55 126.39 192.68 123.44 194.18 120.23 C 196.64 114.99 199.46 108.54 199.00 102.55 Z"/>
          <path fill="#0b0f3b" d="M 146.24 109.22 C 144.12 107.76 141.90 109.38 140.59 111.11 C 137.22 115.55 133.73 120.56 128.72 123.46 C 122.11 127.29 112.08 129.36 106.19 123.69 C 100.78 118.48 101.16 107.67 102.70 100.47 C 105.63 86.67 116.72 74.80 127.45 66.45 C 134.92 60.63 143.67 57.96 151.79 64.73 Q 161.56 72.89 161.28 86.77 C 161.11 95.81 160.04 102.63 164.30 109.30 Q 165.90 111.81 165.86 113.21 C 165.74 117.37 161.59 119.78 157.86 119.34 C 152.10 118.65 150.38 112.06 146.24 109.22 Z M 140.83 78.72 C 133.54 80.75 128.38 86.84 125.20 92.72 C 123.77 95.36 120.39 100.72 120.58 105.17 A 1.54 1.53 78.3 0 0 122.66 106.54 C 126.29 105.15 128.06 103.63 129.97 101.26 C 132.58 98.04 143.30 83.00 140.83 78.72 Z"/>
          <path fill="#ffc107" d="M 8.92 81.23 C 11.35 76.87 15.33 76.09 19.30 79.00 Q 26.90 84.58 26.59 94.52 C 26.46 98.81 25.53 105.58 26.13 110.21 C 27.07 117.49 29.35 125.32 25.36 132.06 C 21.57 138.45 14.80 141.58 8.06 137.17 C 1.69 133.02 0.83 126.82 1.87 119.57 C 2.48 115.35 3.43 110.84 3.78 105.79 C 4.39 97.14 4.97 88.33 8.92 81.23 Z"/>
          <path fill="#ffc107" d="M 547.37 116.72 C 543.08 118.06 538.32 116.56 535.51 112.87 C 531.70 107.88 534.54 97.23 540.69 95.31 C 546.82 93.40 555.21 100.54 554.92 106.80 C 554.71 111.44 551.65 115.38 547.37 116.72 Z"/>
        </svg>
      </a>

      <div class="city-pill" title="Ciudad seleccionada">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span>Palencia</span>
      </div>
    </header>

    <!-- Selector Temporal: Hoy / Mañana / Este finde / Calendario -->
    <nav class="time-selector-bar" aria-label="Filtro de fecha">
      <button class="time-tab active" id="tab-today" data-action="switch-view" data-view="today">Hoy</button>
      <button class="time-tab" id="tab-tomorrow" data-action="switch-view" data-view="tomorrow">Mañana</button>
      <button class="time-tab" id="tab-weekend" data-action="switch-view" data-view="weekend">Este finde</button>
      <div class="calendar-picker-wrapper">
        <button class="time-tab" id="tab-calendar" type="button">
          <span id="calendar-label">Calendario</span>
        </button>
        <input type="date" class="calendar-input" id="date-input" aria-label="Seleccionar fecha">
      </div>
    </nav>

    <!-- Fila de Categorías Circulares -->
    <section class="categories-row" aria-label="Filtro de categorías">
      <button class="cat-btn active" data-action="set-cat" data-cat="all" aria-label="Todas las categorías">
        <div class="cat-circle">
          <svg viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>
        </div>
        <span class="cat-label">Todas</span>
      </button>

      <button class="cat-btn" data-action="set-cat" data-cat="musica" aria-label="Categoría Música">
        <div class="cat-circle">
          <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <span class="cat-label">Música</span>
      </button>

      <button class="cat-btn" data-action="set-cat" data-cat="tardeo" aria-label="Categoría Tardeo">
        <div class="cat-circle">
          <svg viewBox="0 0 24 24"><path d="M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z"/></svg>
        </div>
        <span class="cat-label">Tardeo</span>
      </button>

      <button class="cat-btn" data-action="set-cat" data-cat="cine" aria-label="Categoría Cine">
        <div class="cat-circle">
          <svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
        </div>
        <span class="cat-label">Cine</span>
      </button>

      <button class="cat-btn" data-action="set-cat" data-cat="cultura" aria-label="Categoría Cultura">
        <div class="cat-circle">
          <svg viewBox="0 0 24 24"><path d="M12 2L1 7v2h22V7L12 2zm-8 7v10h3V9H4zm6 0v10h3V9h-3zm6 0v10h3V9h-3zM2 20v2h20v-2H2z"/></svg>
        </div>
        <span class="cat-label">Cultura</span>
      </button>
    </section>

    <!-- Barra de Filtros Activos (Visible solo con filtros aplicados) -->
    <div class="active-filters-bar" id="active-filters-bar">
      <div class="active-chips-wrap" id="active-chips-wrap">
        <span>Filtros activos:</span>
        <div id="chips-list" style="display:flex;gap:0.4rem;align-items:center;"></div>
      </div>
      <button class="btn-clear-filters" data-action="clear-filters">Limpiar</button>
    </div>

    <!-- Contenedor Destacado Promocionado (Condicional) -->
    <div id="promoted-container"></div>

    <!-- Encabezado de la Agenda Compacta -->
    <div class="section-header-compact">
      <h2 class="section-title-compact" id="view-title">Agenda de hoy</h2>
      <span id="events-count" style="font-size:0.8125rem;color:var(--color-text-muted);font-weight:600;">Cargando...</span>
    </div>

    <!-- Listado Compacto de Eventos, Recurrencias y Lugares -->
    <main id="content-container">
      <div class="loader-spinner"></div>
    </main>
  </div>

  <!-- Modal Ficha Unificada (Evento, Recurrencia o Lugar) -->
  <div class="modal-overlay" id="detail-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title-main">
    <div class="modal-sheet" id="modal-content">
      <!-- Se inyecta dinámicamente -->
    </div>
  </div>

  <!-- Visor de Cartel Completo / Lightbox Accesible -->
  <div id="poster-lightbox" class="poster-lightbox" role="dialog" aria-modal="true" aria-label="Visor de cartel completo" style="display:none;">
    <div class="poster-lightbox-backdrop" data-action="close-lightbox" tabindex="-1"></div>
    <div class="poster-lightbox-container">
      <div class="poster-lightbox-header">
        <span id="poster-lightbox-title" class="poster-lightbox-title">Cartel completo</span>
        <div class="poster-lightbox-controls">
          <button type="button" class="lightbox-btn" data-action="lightbox-zoom-out" aria-label="Alejar cartel">
            <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
          </button>
          <button type="button" class="lightbox-btn" data-action="lightbox-zoom-reset" aria-label="Restablecer tamaño">
            <span id="poster-lightbox-zoom-label" style="font-size:0.75rem;font-weight:700;">100%</span>
          </button>
          <button type="button" class="lightbox-btn" data-action="lightbox-zoom-in" aria-label="Acercar cartel">
            <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
          <button type="button" class="lightbox-btn lightbox-close-btn" data-action="close-lightbox" aria-label="Cerrar visor de cartel">
            <svg style="width:20px;height:20px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div class="poster-lightbox-viewport" id="poster-lightbox-viewport" tabindex="0" role="region" aria-label="Lienzo de imagen ampliable">
        <img id="poster-lightbox-img" class="poster-lightbox-img" src="" alt="Cartel completo del evento">
      </div>
      <div class="poster-lightbox-footer">
        <small>💡 Pulsa sobre la imagen para alternar zoom (100% / 200%). Puedes arrastrar para desplazarte. Pulsa Esc para cerrar.</small>
      </div>
    </div>
  </div>

  <script type="module">
    // ==============================================================================
    // Estado y variables globales
    // ==============================================================================
    const CITY_TIMEZONE = 'Europe/Madrid';
    const EDITORIAL_CUTOFF_HOUR = 6; // Eventos antes de las 06:00 pertenecen a la noche anterior

    let currentCity = 'palencia';
    let currentView = 'today';
    let currentFilter = 'all';
    let selectedDate = getTodayDateString();
    let currentData = null; // Almacena respuesta de API
    let activeModalEventId = null; // Previene impresiones duplicadas accidentales
    let lastFocusedElement = null; // Guarda el elemento que abrió el modal
    let savedScrollY = 0; // Guarda la posición de scroll del fondo para restaurarla al cerrar modal
    let currentRequestId = 0; // Previene condiciones de carrera en respuestas asíncronas
    let activePromotions = []; // Campañas vigentes cargadas del servidor
    let activePromotionsCity = ''; // Ciudad de las campañas en memoria
    let promotionsSeq = 0; // Previene respuestas desordenadas al cambiar de ciudad
    let carouselCleanupFn = null; // Limpieza de listeners del carrusel
    let promotionExpirationTimer = null; // Temporizador para retirar campañas expiradas

    // ==============================================================================
    // Métricas y Session Hash efímero (sessionStorage)
    // ==============================================================================
    function getSessionHash() {
      try {
        let hash = sessionStorage.getItem('vp_session_hash');
        if (!hash) {
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);
          hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
          sessionStorage.setItem('vp_session_hash', hash);
        }
        return hash;
      } catch (e) {
        return 'ephemeral-session-' + Date.now();
      }
    }

    function trackMetric(eventId, metricType, promotionId = null) {
      if (!eventId) return;
      try {
        fetch('/api/v1/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: Number(eventId),
            promotion_id: promotionId ? Number(promotionId) : null,
            metric_type: metricType,
            channel: 'web',
            session_hash: getSessionHash(),
          }),
          keepalive: true,
        }).catch(() => {});
      } catch (err) {}
    }
    window.trackMetric = trackMetric;

    // ==============================================================================
    // Fechas y Lógica Editorial (Zona horaria Europe/Madrid y corte de 06:00)
    // ==============================================================================
    function getEditorialDateInTimezone(now = new Date(), timeZone = CITY_TIMEZONE) {
      // Hora en Palencia (Europe/Madrid)
      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        hour12: false,
      });
      const hour = parseInt(hourFormatter.format(now), 10);

      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      // Si es madrugada (antes de las 06:00), pertenece a la noche editorial anterior
      if (hour < EDITORIAL_CUTOFF_HOUR) {
        const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return dateFormatter.format(prev);
      }
      return dateFormatter.format(now);
    }

    function getTodayDateString() {
      return getEditorialDateInTimezone(new Date(), CITY_TIMEZONE);
    }

    function getTomorrowDateString() {
      const todayStr = getTodayDateString();
      const [y, m, d] = todayStr.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: CITY_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(next);
    }

    function formatDateSpanish(dateStr) {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return date.toLocaleDateString('es-ES', {
        timeZone: CITY_TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }

    function formatTime(isoString) {
      if (!isoString) return '';
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-ES', {
        timeZone: CITY_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    function formatEventRealDateTime(isoString) {
      if (!isoString) return { dateText: '', isMadrugada: false };
      const date = new Date(isoString);
      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: CITY_TIMEZONE,
        hour: 'numeric',
        hourCycle: 'h23',
      });
      const hour = parseInt(hourFormatter.format(date), 10) % 24;
      const isMadrugada = hour < EDITORIAL_CUTOFF_HOUR;
      const dateText = date.toLocaleDateString('es-ES', {
        timeZone: CITY_TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      return { dateText, isMadrugada };
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getCategoryLabel(category) {
      const labels = {
        musica_directo: 'Música en directo',
        dj_tardeo: 'DJ & Tardeo',
        monologo: 'Monólogo',
        cine: 'Cine',
        teatro: 'Teatro',
        exposicion: 'Exposición',
        cultura: 'Cultura',
      };
      return labels[category] || category || 'Plan';
    }

    function formatPromotedHeroDateTime(isoString) {
      if (!isoString) return '';
      const date = new Date(isoString);
      const weekday = date.toLocaleDateString('es-ES', { timeZone: CITY_TIMEZONE, weekday: 'long' }).toUpperCase();
      const day = date.toLocaleDateString('es-ES', { timeZone: CITY_TIMEZONE, day: 'numeric' });
      const month = date.toLocaleDateString('es-ES', { timeZone: CITY_TIMEZONE, month: 'short' }).replace('.', '').toUpperCase();
      const time = formatTime(isoString);
      return \`\${weekday} \${day} \${month} · \${time}\`;
    }

    function cleanupCarousel() {
      if (carouselCleanupFn) {
        try { carouselCleanupFn(); } catch (e) {}
        carouselCleanupFn = null;
      }
      window.__heroCarouselStep = null;
    }

    function setupPromotedCarousel(container, itemsCount) {
      cleanupCarousel();
      if (!container || itemsCount <= 1) return;

      const track = container.querySelector('#promoted-track');
      const prevBtn = container.querySelector('[data-action="prev-hero"]');
      const nextBtn = container.querySelector('[data-action="next-hero"]');
      const counterEl = container.querySelector('#hero-counter');

      if (!track) return;

      let currentIdx = 0;
      const cards = Array.from(track.children);
      const total = cards.length;

      function updateUI(idx) {
        currentIdx = Math.max(0, Math.min(idx, total - 1));
        if (counterEl) {
          counterEl.textContent = \`\${currentIdx + 1} de \${total}\`;
        }
        if (prevBtn) {
          prevBtn.disabled = currentIdx === 0;
        }
        if (nextBtn) {
          nextBtn.disabled = currentIdx === total - 1;
        }
      }

      function scrollToIndex(idx, smooth = true) {
        const targetIdx = Math.max(0, Math.min(idx, total - 1));
        const targetCard = cards[targetIdx];
        if (!targetCard) return;

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const behavior = (smooth && !prefersReducedMotion) ? 'smooth' : 'auto';

        const cardOffset = targetCard.offsetLeft - track.offsetLeft;
        track.scrollTo({ left: cardOffset, behavior });
        updateUI(targetIdx);
      }

      let rafId = null;
      function onScroll() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const trackScroll = track.scrollLeft;
          let closestIdx = 0;
          let minDiff = Infinity;
          cards.forEach((c, i) => {
            const diff = Math.abs((c.offsetLeft - track.offsetLeft) - trackScroll);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = i;
            }
          });
          updateUI(closestIdx);
        });
      }

      function onFocusIn(e) {
        const card = e.target.closest('.promoted-hero-card');
        if (!card) return;
        const idx = cards.indexOf(card);
        if (idx !== -1) {
          updateUI(idx);
        }
      }

      function onResize() {
        scrollToIndex(currentIdx, false);
      }

      track.addEventListener('scroll', onScroll, { passive: true });
      track.addEventListener('focusin', onFocusIn);
      window.addEventListener('resize', onResize);

      updateUI(0);

      carouselCleanupFn = () => {
        if (rafId) cancelAnimationFrame(rafId);
        track.removeEventListener('scroll', onScroll);
        track.removeEventListener('focusin', onFocusIn);
        window.removeEventListener('resize', onResize);
      };

      window.__heroCarouselStep = (direction) => {
        scrollToIndex(currentIdx + direction, true);
      };
    }

    function renderPromotedShowcaseHtml(promotedEvents) {
      if (!promotedEvents || promotedEvents.length === 0) return '';
      const isMulti = promotedEvents.length > 1;
      return \`
        <div class="promoted-showcase" id="promoted-showcase" role="region" aria-label="Planes destacados">
          <div class="promoted-showcase-header">
            <span class="promoted-showcase-badge">Destacados</span>
            \${isMulti ? \`
              <div class="promoted-carousel-nav">
                <button type="button" class="carousel-arrow prev" data-action="prev-hero" aria-label="Campaña anterior" disabled>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <span class="carousel-counter" id="hero-counter" aria-live="polite">1 de \${promotedEvents.length}</span>
                <button type="button" class="carousel-arrow next" data-action="next-hero" aria-label="Siguiente campaña">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            \` : ''}
          </div>
          <div class="promoted-carousel-track" id="promoted-track" role="group" aria-label="Carril de eventos destacados">
            \${promotedEvents.map((ev) => {
              const hasImage = Boolean(ev.image_url);
              const dt = formatPromotedHeroDateTime(ev.start_time);
              return \`
                <button type="button" class="promoted-hero-card \${!hasImage ? 'no-image' : ''}" data-action="open-event" data-id="\${ev.id}" aria-label="Evento destacado: \${escapeHtml(ev.title)} en \${escapeHtml(ev.venue.name)}, \${escapeHtml(dt)}">
                  <div class="hero-media-box">
                    \${hasImage ? \`
                      <img class="hero-img-backdrop" src="\${escapeHtml(ev.image_thumb_url || ev.image_url)}" alt="" loading="eager" aria-hidden="true">
                      <img class="hero-img-contain" src="\${escapeHtml(ev.image_url)}" alt="\${escapeHtml(ev.title)}" loading="eager" onerror="this.onerror=null;const card=this.closest('.promoted-hero-card');if(card){card.classList.add('no-image');}this.remove();">
                    \` : ''}
                    <div class="hero-top-badges">
                      <span class="hero-badge-tag">Destacado</span>
                      <span class="hero-category-tag">\${escapeHtml(getCategoryLabel(ev.category))}</span>
                    </div>
                  </div>
                  <div class="hero-body">
                    <div>
                      <div class="hero-eyebrow-datetime">\${escapeHtml(dt)}</div>
                      <h3 class="hero-title">\${escapeHtml(ev.title)}</h3>
                    </div>
                    <div class="hero-meta">
                      <div class="hero-meta-left">
                        <span class="hero-venue-name">📍 \${escapeHtml(ev.venue.name)}</span>
                        <span class="hero-price-pill">\${escapeHtml(ev.price.label)}</span>
                      </div>
                      <span class="hero-cta" aria-hidden="true">Ver plan →</span>
                    </div>
                  </div>
                </button>
              \`;
            }).join('')}
          </div>
        </div>
      \`;
    }

    async function loadActivePromotions(citySlug) {
      const seq = ++promotionsSeq;
      if (activePromotionsCity !== citySlug) {
        activePromotions = [];
        activePromotionsCity = citySlug;
      }
      try {
        const res = await fetch(\`/api/v1/cities/\${encodeURIComponent(citySlug)}/promotions/active?limit=50\`);
        if (!res.ok) {
          if (seq === promotionsSeq) {
            activePromotions = [];
          }
          return;
        }
        const data = await res.json();
        if (seq === promotionsSeq && data && Array.isArray(data.promotions)) {
          activePromotions = data.promotions.map((p) => ({
            ...p.event,
            promotion_starts_at: p.starts_at,
            promotion_ends_at: p.ends_at,
          }));
          scheduleNextPromotionExpiration();
        }
      } catch (err) {
        if (seq === promotionsSeq) {
          activePromotions = [];
        }
      }
    }

    function scheduleNextPromotionExpiration() {
      if (promotionExpirationTimer) {
        clearTimeout(promotionExpirationTimer);
        promotionExpirationTimer = null;
      }
      const nowTime = Date.now();
      const futureExpirations = activePromotions
        .map((ev) => new Date(ev.promotion_ends_at).getTime())
        .filter((t) => !Number.isNaN(t) && t > nowTime);

      if (futureExpirations.length === 0) return;

      const nextExpiration = Math.min(...futureExpirations);
      const delay = Math.max(1000, nextExpiration - nowTime + 500);

      promotionExpirationTimer = setTimeout(() => {
        const curTime = Date.now();
        activePromotions = activePromotions.filter((ev) => {
          const endMs = new Date(ev.promotion_ends_at).getTime();
          return Number.isNaN(endMs) || endMs > curTime;
        });

        if (currentView === 'weekend') {
          renderWeekendAgenda();
        } else {
          renderDayAgenda();
        }

        loadActivePromotions(currentCity).then(() => {
          if (currentView === 'weekend') {
            renderWeekendAgenda();
          } else {
            renderDayAgenda();
          }
        });
      }, delay);
    }

    function changeCity(newSlug) {
      if (!newSlug || newSlug === currentCity) return;
      currentCity = newSlug;
      activePromotions = [];
      activePromotionsCity = newSlug;
      loadData();
    }
    window.changeCity = changeCity;

    // ==============================================================================
    // Carga de datos mediante rutas relativas /api/v1/... (con control de concurrencia)
    // ==============================================================================
    async function loadData() {
      const container = document.getElementById('content-container');
      const promotedContainer = document.getElementById('promoted-container');

      cleanupCarousel();
      promotedContainer.innerHTML = '';
      container.innerHTML = '<div class="loader-spinner"></div>';

      const requestId = ++currentRequestId;

      try {
        let url = '';
        if (currentView === 'today' || currentView === 'tomorrow' || currentView === 'calendar') {
          url = \`/api/v1/cities/\${encodeURIComponent(currentCity)}/events?date=\${selectedDate}\`;
        } else if (currentView === 'weekend') {
          url = \`/api/v1/cities/\${encodeURIComponent(currentCity)}/weekend\`;
        }

        const [res] = await Promise.all([
          fetch(url),
          loadActivePromotions(currentCity).catch(() => {})
        ]);

        if (!res.ok) throw new Error('Error al cargar agenda');
        const data = await res.json();

        // Descartar si el usuario ya cambió a otra vista antes de que terminara la petición
        if (requestId !== currentRequestId) return;

        currentData = data;
        if (currentView === 'weekend') {
          renderWeekendAgenda();
        } else {
          renderDayAgenda();
        }
      } catch (err) {
        if (requestId !== currentRequestId) return;
        cleanupCarousel();
        promotedContainer.innerHTML = '';
        container.innerHTML = \`
          <div class="empty-state">
            <h3>No se pudo cargar la agenda</h3>
            <p>Comprueba tu conexión o vuelve a intentarlo en unos instantes.</p>
            <button class="btn-primary-action" data-action="reload-data">Reintentar</button>
          </div>
        \`;
      }
    }
    window.loadData = loadData;

    // ==============================================================================
    // Filtrado estricto por contratos de categoría
    // ==============================================================================
    function filterEvents(events) {
      if (!events || events.length === 0) return [];
      if (currentFilter === 'all') return events;
      if (currentFilter === 'musica') {
        return events.filter((ev) => ev.category === 'musica_directo');
      }
      if (currentFilter === 'tardeo') {
        return events.filter((ev) => ev.category === 'dj_tardeo');
      }
      if (currentFilter === 'cine') {
        return events.filter((ev) => ev.category === 'cine');
      }
      if (currentFilter === 'cultura') {
        return events.filter((ev) => ['cultura', 'teatro', 'exposicion', 'monologo'].includes(ev.category));
      }
      return events;
    }

    function filterRecurrences(recurrences) {
      if (!recurrences || recurrences.length === 0) return [];
      if (currentFilter === 'all') return recurrences;
      if (currentFilter === 'musica') {
        return recurrences.filter((r) => r.category === 'musica_directo');
      }
      if (currentFilter === 'tardeo') {
        return recurrences.filter((r) => r.category === 'dj_tardeo');
      }
      if (currentFilter === 'cine') {
        return recurrences.filter((r) => r.category === 'cine');
      }
      if (currentFilter === 'cultura') {
        return recurrences.filter((r) => ['cultura', 'teatro', 'exposicion', 'monologo'].includes(r.category));
      }
      return recurrences;
    }

    // ==============================================================================
    // Barra de Filtros Activos
    // ==============================================================================
    function updateActiveFiltersBar() {
      const bar = document.getElementById('active-filters-bar');
      const list = document.getElementById('chips-list');
      let chipsHtml = '';

      const catNames = {
        musica: 'Música',
        tardeo: 'Tardeo',
        cine: 'Cine',
        cultura: 'Cultura',
      };

      if (currentFilter !== 'all') {
        chipsHtml += \`
          <button class="filter-chip-removable" data-action="remove-cat-filter" aria-label="Eliminar filtro \${catNames[currentFilter]}">
            \${catNames[currentFilter] || currentFilter} ✕
          </button>
        \`;
      }

      if (currentView === 'tomorrow') {
        chipsHtml += \`
          <button class="filter-chip-removable" data-action="switch-view" data-view="today" aria-label="Volver a Hoy">
            Mañana ✕
          </button>
        \`;
      } else if (currentView === 'weekend') {
        chipsHtml += \`
          <button class="filter-chip-removable" data-action="switch-view" data-view="today" aria-label="Volver a Hoy">
            Fin de semana ✕
          </button>
        \`;
      } else if (currentView === 'calendar') {
        chipsHtml += \`
          <button class="filter-chip-removable" data-action="switch-view" data-view="today" aria-label="Volver a Hoy">
            \${selectedDate} ✕
          </button>
        \`;
      }

      if (chipsHtml) {
        list.innerHTML = chipsHtml;
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }

    function clearAllFilters() {
      currentFilter = 'all';
      document.querySelectorAll('.cat-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.cat === 'all');
      });
      switchView('today');
    }
    window.clearAllFilters = clearAllFilters;

    // ==============================================================================
    // Helper de Portada / Fallback
    // ==============================================================================
    function renderEventThumbnail(imageUrl, title) {
      if (imageUrl) {
        return \`<img class="card-thumb" src="\${escapeHtml(imageUrl)}" alt="\${escapeHtml(title)}" loading="lazy" onerror="this.onerror=null;this.replaceWith(createSvgFallbackNode(false));">\`;
      }
      return \`
        <div class="card-thumb-fallback" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        </div>
      \`;
    }

    function createSvgFallbackNode(isHero = false) {
      const wrap = document.createElement('div');
      wrap.className = isHero ? 'modal-hero-cover' : 'card-thumb-fallback';
      wrap.style.cssText = isHero ? 'width:100%;height:100%;border-radius:0;display:flex;align-items:center;justify-content:center;background:#0B0F3B;' : '';
      wrap.innerHTML = \`<svg style="\${isHero ? 'width:64px;height:64px;fill:#9D7BFF;' : 'width:30px;height:30px;fill:#9D7BFF;'}" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>\`;
      return wrap;
    }
    window.createSvgFallbackNode = createSvgFallbackNode;

    // ==============================================================================
    // Renderizado: Agenda de Hoy / Día Seleccionado
    // ==============================================================================
    function renderDayAgenda() {
      const container = document.getElementById('content-container');
      const promotedContainer = document.getElementById('promoted-container');
      const countEl = document.getElementById('events-count');
      const viewTitleEl = document.getElementById('view-title');

      if (!currentData) return;

      updateActiveFiltersBar();

      const filteredEvents = filterEvents(currentData.events || []);
      const recurrences = filterRecurrences(currentData.recurrences || []);
      const places = currentFilter === 'all' ? (currentData.places || []) : [];

      const totalItems = filteredEvents.length + recurrences.length + places.length;
      countEl.innerText = \`\${totalItems} \${totalItems === 1 ? 'plan' : 'planes'}\`;

      if (currentView === 'today') {
        viewTitleEl.innerText = currentFilter === 'all' ? 'Agenda de hoy' : \`\${getCategoryTitle(currentFilter)} en Palencia\`;
      } else if (currentView === 'tomorrow') {
        viewTitleEl.innerText = currentFilter === 'all' ? 'Planes para mañana' : \`\${getCategoryTitle(currentFilter)} mañana\`;
      } else {
        viewTitleEl.innerText = formatDateSpanish(selectedDate);
      }

      // 1. Escaparate de Campañas Destacadas
      cleanupCarousel();
      promotedContainer.innerHTML = '';
      const nowTime = Date.now();
      const eligiblePromoted = filterEvents(
        activePromotions.filter((ev) => {
          if (ev.status === 'cancelled') return false;
          if (ev.promotion_ends_at && new Date(ev.promotion_ends_at).getTime() <= nowTime) return false;
          if (ev.promotion_starts_at && new Date(ev.promotion_starts_at).getTime() > nowTime) return false;
          return true;
        })
      );
      if (eligiblePromoted.length > 0) {
        promotedContainer.innerHTML = renderPromotedShowcaseHtml(eligiblePromoted);
        setupPromotedCarousel(promotedContainer, eligiblePromoted.length);
      }
      // Conservar la lista íntegra sin exclusiones: doble presencia intencionada
      const listEvents = filteredEvents;

      if (totalItems === 0) {
        let emptyTitle = '';
        let emptyDesc = '';
        let emptyActions = '';

        if (currentFilter !== 'all') {
          emptyTitle = \`Sin planes en \${getCategoryTitle(currentFilter)}\`;
          emptyDesc = 'No encontramos eventos en esta categoría para la fecha seleccionada.';
          emptyActions = \`
            <button type="button" class="btn-primary-action" data-action="remove-cat-filter">Quitar filtros</button>
            <button type="button" class="btn-secondary-link" data-action="switch-view" data-view="weekend">Ver este finde</button>
          \`;
        } else if (currentView === 'today') {
          emptyTitle = 'No hay planes programados para hoy';
          emptyDesc = 'Palencia descansa hoy. Descubre los planes preparados para este fin de semana.';
          emptyActions = \`
            <button type="button" class="btn-primary-action" data-action="switch-view" data-view="weekend">Ver este finde</button>
          \`;
        } else if (currentView === 'tomorrow') {
          emptyTitle = 'No hay planes programados para mañana';
          emptyDesc = 'Aún no hay actividades registradas para mañana. Consulta la agenda del fin de semana.';
          emptyActions = \`
            <button type="button" class="btn-primary-action" data-action="switch-view" data-view="weekend">Ver este finde</button>
          \`;
        } else {
          emptyTitle = 'No hay planes para esta fecha';
          emptyDesc = 'Prueba a seleccionar otro día en el calendario o consulta el fin de semana.';
          emptyActions = \`
            <button type="button" class="btn-primary-action" data-action="switch-view" data-view="weekend">Ver este finde</button>
          \`;
        }

        container.innerHTML = \`
          <div class="empty-state">
            <h3>\${escapeHtml(emptyTitle)}</h3>
            <p>\${escapeHtml(emptyDesc)}</p>
            <div class="empty-state-actions" style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
              \${emptyActions}
            </div>
          </div>
        \`;
        return;
      }

      let html = '<div class="events-list-compact">';

      // 2. Tarjetas compactas de eventos (botones semánticos accesibles)
      for (const ev of listEvents) {
        const isCancelled = ev.status === 'cancelled';
        const isPromoted = Boolean(ev.promotion) && !isCancelled;
        html += \`
          <button type="button" class="card-compact \${isCancelled ? 'is-cancelled' : ''} \${isPromoted ? 'is-promoted' : ''}" data-action="open-event" data-id="\${ev.id}" aria-label="\${escapeHtml(ev.title)} en \${escapeHtml(ev.venue.name)}">
            \${renderEventThumbnail(ev.image_thumb_url || ev.image_url, ev.title)}
            <div class="card-info">
              <div>
                \${isCancelled ? '<span class="cancelled-tag">Cancelado</span>' : (isPromoted ? '<span class="badge-destacado">Destacado</span>' : '')}
                <h3 class="card-title \${isCancelled ? 'title-cancelled' : ''}">\${escapeHtml(ev.title)}</h3>
                <div class="card-venue">📍 \${escapeHtml(ev.venue.name)}</div>
              </div>
              <div class="card-bottom-row">
                <span class="card-time">⏰ \${formatTime(ev.start_time)}\${formatEventRealDateTime(ev.start_time).isMadrugada ? ' <span class="card-madrugada-badge">Madrugada</span>' : ''}</span>
                <span class="card-price-pill \${ev.price.is_free ? 'free' : 'paid'}">\${escapeHtml(ev.price.label)}</span>
              </div>
            </div>
          </button>
        \`;
      }

      // 3. Actividades periódicas (Recurrencias)
      for (const rec of recurrences) {
        const dayLabel = getDayNameFromNumber(rec.day_of_week);
        html += \`
          <button type="button" class="card-compact" data-action="open-recurrence" data-id="\${rec.id}" aria-label="Actividad periódica: \${escapeHtml(rec.title)} en \${escapeHtml(rec.venue_name)}">
            \${renderEventThumbnail(null, rec.title)}
            <div class="card-info">
              <div>
                <span class="recurrence-badge">↻ Cada \${dayLabel}</span>
                <h3 class="card-title">\${escapeHtml(rec.title)}</h3>
                <div class="card-venue">📍 \${escapeHtml(rec.venue_name)}</div>
              </div>
              <div class="card-bottom-row">
                <span class="card-time">⏰ \${escapeHtml(rec.start_time.slice(0, 5))}</span>
                <span class="card-price-pill \${rec.is_free ? 'free' : 'paid'}">
                  \${rec.is_free ? 'Entrada libre' : ((rec.price_cents / 100).toFixed(2).replace('.', ',') + ' €')}
                </span>
              </div>
            </div>
          </button>
        \`;
      }

      // 4. Lugares permanentes (Places)
      for (const place of places) {
        html += \`
          <button type="button" class="card-compact" data-action="open-place" data-id="\${place.id}" aria-label="Lugar permanente: \${escapeHtml(place.name)}">
            \${renderEventThumbnail(place.image_thumb_url || place.image_url, place.name)}
            <div class="card-info">
              <div>
                <span class="place-badge">★ Siempre disponible</span>
                <h3 class="card-title">\${escapeHtml(place.name)}</h3>
                <div class="card-venue">\${escapeHtml(place.highlight_text)}</div>
              </div>
              <div class="card-bottom-row">
                <span class="card-time">⏰ \${escapeHtml(place.opening_hours_text || 'Consultar')}</span>
                <span class="card-price-pill paid">\${escapeHtml(place.price_text || 'Consultar')}</span>
              </div>
            </div>
          </button>
        \`;
      }

      html += '</div>';
      container.innerHTML = html;
    }

    // ==============================================================================
    // Renderizado: Agenda de Fin de Semana (Agrupada por editorial_date)
    // ==============================================================================
    function renderWeekendAgenda() {
      const container = document.getElementById('content-container');
      const promotedContainer = document.getElementById('promoted-container');
      const countEl = document.getElementById('events-count');
      const viewTitleEl = document.getElementById('view-title');

      if (!currentData || !currentData.days) return;

      updateActiveFiltersBar();
      cleanupCarousel();
      promotedContainer.innerHTML = '';

      // 1. Escaparate de Campañas Destacadas (solo eventos del fin de semana cargado)
      const weekendDates = currentData.days.map((d) => d.editorial_date);
      const nowTime = Date.now();
      const eligibleWeekendPromoted = filterEvents(
        activePromotions.filter((ev) => {
          if (ev.status === 'cancelled') return false;
          if (!weekendDates.includes(ev.editorial_date)) return false;
          if (ev.promotion_ends_at && new Date(ev.promotion_ends_at).getTime() <= nowTime) return false;
          if (ev.promotion_starts_at && new Date(ev.promotion_starts_at).getTime() > nowTime) return false;
          return true;
        })
      );
      if (eligibleWeekendPromoted.length > 0) {
        promotedContainer.innerHTML = renderPromotedShowcaseHtml(eligibleWeekendPromoted);
        setupPromotedCarousel(promotedContainer, eligibleWeekendPromoted.length);
      }

      viewTitleEl.innerText = currentFilter === 'all' ? 'Fin de semana en Palencia' : \`\${getCategoryTitle(currentFilter)} en el finde\`;

      let totalWeekendEvents = 0;
      let html = '';

      for (const day of currentData.days) {
        const filteredEvents = filterEvents(day.events || []);
        const recurrences = filterRecurrences(day.recurrences || []);
        totalWeekendEvents += filteredEvents.length + recurrences.length;

        html += \`
          <div class="weekend-day-group">
            <div class="weekend-day-header">
              <span class="weekend-day-title">\${escapeHtml(day.editorial_label)}</span>
              <span class="weekend-day-date">\${formatDateSpanish(day.editorial_date)}</span>
            </div>
            <div class="events-list-compact">
        \`;

        if (filteredEvents.length === 0 && recurrences.length === 0) {
          html += \`
            <div style="padding: 0.875rem; text-align: center; color: var(--color-text-muted); font-size: 0.8125rem;">
              Sin planes registrados en esta categoría para este día.
            </div>
          \`;
        }

        // Eventos del día
        for (const ev of filteredEvents) {
          const isCancelled = ev.status === 'cancelled';
          const isPromoted = Boolean(ev.promotion) && !isCancelled;
          html += \`
            <button type="button" class="card-compact \${isCancelled ? 'is-cancelled' : ''} \${isPromoted ? 'is-promoted' : ''}" data-action="open-event" data-id="\${ev.id}" aria-label="\${escapeHtml(ev.title)} en \${escapeHtml(ev.venue.name)}">
              \${renderEventThumbnail(ev.image_thumb_url || ev.image_url, ev.title)}
              <div class="card-info">
                <div>
                  \${isCancelled ? '<span class="cancelled-tag">Cancelado</span>' : (isPromoted ? '<span class="badge-destacado">Destacado</span>' : '')}
                  <h3 class="card-title \${isCancelled ? 'title-cancelled' : ''}">\${escapeHtml(ev.title)}</h3>
                  <div class="card-venue">📍 \${escapeHtml(ev.venue.name)}</div>
                </div>
                <div class="card-bottom-row">
                  <span class="card-time">⏰ \${formatTime(ev.start_time)}\${formatEventRealDateTime(ev.start_time).isMadrugada ? ' <span class="card-madrugada-badge">Madrugada</span>' : ''}</span>
                  <span class="card-price-pill \${ev.price.is_free ? 'free' : 'paid'}">\${escapeHtml(ev.price.label)}</span>
                </div>
              </div>
            </button>
          \`;
        }

        // Recurrencias del día
        for (const rec of recurrences) {
          html += \`
            <button type="button" class="card-compact" data-action="open-recurrence" data-id="\${rec.id}" aria-label="Actividad periódica: \${escapeHtml(rec.title)} en \${escapeHtml(rec.venue_name)}">
              \${renderEventThumbnail(null, rec.title)}
              <div class="card-info">
                <div>
                  <span class="recurrence-badge">↻ Cada \${escapeHtml(day.editorial_label)}</span>
                  <h3 class="card-title">\${escapeHtml(rec.title)}</h3>
                  <div class="card-venue">📍 \${escapeHtml(rec.venue_name)}</div>
                </div>
                <div class="card-bottom-row">
                  <span class="card-time">⏰ \${escapeHtml(rec.start_time.slice(0, 5))}</span>
                  <span class="card-price-pill \${rec.is_free ? 'free' : 'paid'}">
                    \${rec.is_free ? 'Entrada libre' : ((rec.price_cents / 100).toFixed(2).replace('.', ',') + ' €')}
                  </span>
                </div>
              </div>
            </button>
          \`;
        }

        html += '</div></div>';
      }

      // Planes permanentes al final del fin de semana
      if (currentFilter === 'all' && currentData.places && currentData.places.length > 0) {
        html += \`
          <div class="weekend-day-group">
            <div class="weekend-day-header">
              <span class="weekend-day-title">Planes permanentes</span>
              <span class="weekend-day-date">Siempre disponibles</span>
            </div>
            <div class="events-list-compact">
        \`;
        for (const p of currentData.places) {
          html += \`
            <button type="button" class="card-compact" data-action="open-place" data-id="\${p.id}" aria-label="Lugar permanente: \${escapeHtml(p.name)}">
              \${renderEventThumbnail(p.image_thumb_url || p.image_url, p.name)}
              <div class="card-info">
                <div>
                  <span class="place-badge">★ Siempre disponible</span>
                  <h3 class="card-title">\${escapeHtml(p.name)}</h3>
                  <div class="card-venue">\${escapeHtml(p.highlight_text)}</div>
                </div>
                <div class="card-bottom-row">
                  <span class="card-time">⏰ \${escapeHtml(p.opening_hours_text || 'Consultar')}</span>
                  <span class="card-price-pill paid">\${escapeHtml(p.price_text || 'Consultar')}</span>
                </div>
              </div>
            </button>
          \`;
        }
        html += '</div></div>';
      }

      const displayedPlacesCount = (currentFilter === 'all' && currentData.places) ? currentData.places.length : 0;
      const totalWeekendItems = totalWeekendEvents + displayedPlacesCount;
      countEl.innerText = \`\${totalWeekendItems} \${totalWeekendItems === 1 ? 'plan' : 'planes'}\`;

      if (totalWeekendItems === 0) {
        let emptyTitle = currentFilter === 'all' ? 'Sin planes para este fin de semana' : \`Sin planes en \${getCategoryTitle(currentFilter)}\`;
        let emptyDesc = currentFilter === 'all'
          ? 'No hay actividades registradas para este fin de semana en Palencia.'
          : 'No encontramos eventos en esta categoría para el fin de semana.';
        let emptyActions = currentFilter !== 'all'
          ? '<button type="button" class="btn-primary-action" data-action="remove-cat-filter">Quitar filtros</button> <button type="button" class="btn-secondary-link" data-action="switch-view" data-view="today">Volver a hoy</button>'
          : '<button type="button" class="btn-primary-action" data-action="switch-view" data-view="today">Volver a hoy</button>';

        container.innerHTML = \`
          <div class="empty-state">
            <h3>\${escapeHtml(emptyTitle)}</h3>
            <p>\${escapeHtml(emptyDesc)}</p>
            <div class="empty-state-actions" style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
              \${emptyActions}
            </div>
          </div>
        \`;
        return;
      }

      container.innerHTML = html;
    }

    function getCategoryTitle(cat) {
      const t = {
        musica: 'Música',
        tardeo: 'Tardeo',
        cine: 'Cine',
        cultura: 'Cultura',
      };
      return t[cat] || 'Planes';
    }

    // ==============================================================================
    // Ficha Modal de Evento Individual
    // ==============================================================================
    async function openEventModal(eventId) {
      savedScrollY = window.scrollY;
      const modal = document.getElementById('detail-modal');
      const sheet = document.getElementById('modal-content');

      document.body.classList.add('modal-open');
      sheet.innerHTML = '<div class="loader-spinner" style="margin:4rem auto;"></div>';
      modal.classList.add('active');

      try {
        const res = await fetch(\`/api/v1/events/\${eventId}\`);
        if (!res.ok) throw new Error('Evento no encontrado');
        const data = await res.json();
        const ev = data.event;
        const promoId = ev.promotion ? ev.promotion.id : null;
        const isCancelled = ev.status === 'cancelled';
        const realDateTime = formatEventRealDateTime(ev.start_time);

        // Registrar métrica de impresión de ficha (evita duplicados si es el mismo evento activo)
        if (activeModalEventId !== ev.id) {
          trackMetric(ev.id, 'impression', promoId);
          activeModalEventId = ev.id;
        }

        sheet.innerHTML = \`
          <div class="modal-sticky-header">
            <button type="button" class="modal-close-btn" data-action="close-modal" aria-label="Cerrar ficha">
              <svg style="width:18px;height:18px;fill:var(--color-night)" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
          </div>

          <div class="modal-hero-cover" \${ev.image_url ? \`role="button" tabindex="0" data-action="open-full-poster" data-poster-url="\${escapeHtml(ev.image_url)}" data-poster-title="\${escapeHtml(ev.title)}" aria-label="Ver cartel completo de \${escapeHtml(ev.title)}" style="cursor:zoom-in;"\` : ''}>
            \${ev.image_url ? \`
              <img class="modal-hero-backdrop" src="\${escapeHtml(ev.image_thumb_url || ev.image_url)}" alt="" aria-hidden="true">
              <img class="modal-hero-img" src="\${escapeHtml(ev.image_url)}" alt="\${escapeHtml(ev.title)}" onerror="this.onerror=null;this.closest('.modal-hero-cover').replaceWith(createSvgFallbackNode(true));">
              <span class="modal-hero-zoom-badge" aria-hidden="true">
                <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
                Ver cartel completo
              </span>
            \` : \`
              <div class="modal-hero-cover" style="display:flex;align-items:center;justify-content:center;background:#0B0F3B;">
                <svg style="width:64px;height:64px;fill:#9D7BFF" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              </div>
            \`}
          </div>

          <div class="modal-body">
            <div style="margin-bottom:0.75rem;">
              \${isCancelled ? '<span class="cancelled-tag">Cancelado</span>' : (ev.promotion ? '<span class="badge-destacado">Destacado</span>' : '')}
            </div>

            <h1 class="modal-title-main" id="modal-title-main">\${escapeHtml(ev.title)}</h1>

            <div class="modal-meta-row">
              <svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
              <span>\${escapeHtml(realDateTime.dateText)}\${realDateTime.isMadrugada ? ' <span class="madrugada-tag">Madrugada</span>' : ''}</span>
            </div>
            <div class="modal-meta-row">
              <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              <span>\${formatTime(ev.start_time)} h</span>
            </div>
            <div class="modal-meta-row">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <span><strong>\${escapeHtml(ev.venue.name)}</strong> \${ev.actions.maps_url ? \`<a href="\${escapeHtml(ev.actions.maps_url)}" target="_blank" rel="noopener" style="color:var(--color-primary);margin-left:0.5rem;font-weight:700;" data-metric="map_click" data-event-id="\${ev.id}" data-promo-id="\${promoId || ''}">Ver mapa ↗</a>\` : ''}</span>
            </div>

            \${ev.image_url ? \`
              <button type="button" class="btn-poster-action" data-action="open-full-poster" data-poster-url="\${escapeHtml(ev.image_url)}" data-poster-title="\${escapeHtml(ev.title)}" aria-label="Ver cartel completo de \${escapeHtml(ev.title)}">
                <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
                <span>Ver cartel completo</span>
              </button>
            \` : ''}

            <!-- Bloque de Acción Principal y Precio -->
            <div class="modal-action-box">
              <div class="modal-action-main-row">
                <span class="modal-price-display">\${escapeHtml(ev.price.label)}</span>
                \${isCancelled ? \`
                  <button type="button" class="btn-primary-action" disabled style="background:#94A3B8;cursor:not-allowed;">Evento cancelado</button>
                \` : (ev.actions.tickets_url ? \`
                  <a href="\${escapeHtml(ev.actions.tickets_url)}" target="_blank" rel="noopener" class="btn-primary-action" data-metric="ticket_click" data-event-id="\${ev.id}" data-promo-id="\${promoId || ''}">
                    Comprar entradas ↗
                  </a>
                \` : (ev.actions.maps_url ? \`
                  <a href="\${escapeHtml(ev.actions.maps_url)}" target="_blank" rel="noopener" class="btn-primary-action" data-metric="map_click" data-event-id="\${ev.id}" data-promo-id="\${promoId || ''}">
                    Cómo llegar ↗
                  </a>
                \` : ''))}
              </div>
              \${(!isCancelled && ev.actions.tickets_url) ? '<div class="action-disclaimer">Compra en una web externa</div>' : ''}
            </div>

            \${ev.description ? \`
              <div style="margin-top:1.5rem;">
                <h3 style="font-size:1rem;font-weight:800;margin-bottom:0.4rem;color:var(--color-night);">Sobre el evento</h3>
                <p style="font-size:0.9375rem;color:var(--color-text-muted);line-height:1.6;white-space:pre-line;">\${escapeHtml(ev.description)}</p>
                \${ev.verification && ev.verification.source === 'web' && ev.actions.tickets_url ? \`
                  <div style="margin-top:0.75rem;">
                    <a href="\${escapeHtml(ev.actions.tickets_url)}" target="_blank" rel="noopener" style="font-size:0.8125rem;color:var(--color-primary);font-weight:700;">Ver fuente original ↗</a>
                  </div>
                \` : ''}
              </div>
            \` : ''}

            <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--color-border);">
              <h3 style="font-size:0.875rem;font-weight:800;color:var(--color-text-muted);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em;">Organizador</h3>
              <div style="font-size:0.9375rem;font-weight:700;color:var(--color-night);">\${escapeHtml(ev.venue.name)}</div>
            </div>
          </div>
        \`;

        // Poner foco inicial en el botón de cierre para accesibilidad
        sheet.querySelector('.modal-close-btn')?.focus();
      } catch (err) {
        sheet.innerHTML = \`
          <div class="modal-body" style="text-align:center;padding:3rem 1rem;">
            <h3 style="font-size:1.15rem;margin-bottom:0.5rem;color:var(--color-night);">No se pudo cargar la información</h3>
            <p style="font-size:0.875rem;color:var(--color-text-muted);margin-bottom:1.25rem;">Comprueba tu conexión e inténtalo de nuevo.</p>
            <button class="btn-primary-action" data-action="close-modal">Cerrar</button>
          </div>
        \`;
        sheet.querySelector('.btn-primary-action')?.focus();
      }
    }
    window.openEventModal = openEventModal;

    // ==============================================================================
    // Ficha Modal de Lugar Permanente
    // ==============================================================================
    function openPlaceModal(placeId) {
      if (!currentData) return;
      const placesList = currentData.places || (currentData.days ? currentData.places : []);
      const place = (placesList || []).find((p) => p.id === placeId);
      if (!place) return;

      savedScrollY = window.scrollY;
      document.body.classList.add('modal-open');

      const modal = document.getElementById('detail-modal');
      const sheet = document.getElementById('modal-content');

      sheet.innerHTML = \`
        <div class="modal-sticky-header">
          <button type="button" class="modal-close-btn" data-action="close-modal" aria-label="Cerrar ficha">
            <svg style="width:18px;height:18px;fill:var(--color-night)" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
        </div>

        <div class="modal-hero-cover" style="aspect-ratio:16/9;" \${place.image_url ? \`role="button" tabindex="0" data-action="open-full-poster" data-poster-url="\${escapeHtml(place.image_url)}" data-poster-title="\${escapeHtml(place.name)}" aria-label="Ver imagen completa de \${escapeHtml(place.name)}" style="aspect-ratio:16/9;cursor:zoom-in;"\` : ''}>
          \${place.image_url ? \`
            <img class="modal-hero-backdrop" src="\${escapeHtml(place.image_url)}" alt="" aria-hidden="true">
            <img class="modal-hero-img" src="\${escapeHtml(place.image_url)}" alt="\${escapeHtml(place.name)}" onerror="this.onerror=null;this.closest('.modal-hero-cover').replaceWith(createSvgFallbackNode(true));">
            <span class="modal-hero-zoom-badge" aria-hidden="true">
              <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
              Ver imagen completa
            </span>
          \` : \`
            <div class="modal-hero-cover" style="display:flex;align-items:center;justify-content:center;background:#0B0F3B;">
              <svg style="width:48px;height:48px;fill:#9D7BFF" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </div>
          \`}
        </div>

        <div class="modal-body">
          <span class="place-badge" style="margin-bottom:0.75rem;">★ Siempre disponible</span>
          <h1 class="modal-title-main" id="modal-title-main">\${escapeHtml(place.name)}</h1>
          \${place.image_url ? \`
            <button type="button" class="btn-poster-action" data-action="open-full-poster" data-poster-url="\${escapeHtml(place.image_url)}" data-poster-title="\${escapeHtml(place.name)}" aria-label="Ver imagen completa de \${escapeHtml(place.name)}">
              <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
              <span>Ver imagen completa</span>
            </button>
          \` : ''}
          <p style="font-size:0.9375rem;color:var(--color-text-muted);margin-bottom:1rem;line-height:1.6;">\${escapeHtml(place.highlight_text)}</p>
          \${place.description ? \`<p style="font-size:0.875rem;color:var(--color-text-muted);margin-bottom:1.25rem;line-height:1.5;white-space:pre-line;">\${escapeHtml(place.description)}</p>\` : ''}

          \${place.opening_hours_text ? \`
            <div class="modal-meta-row">
              <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              <span>Horario: \${escapeHtml(place.opening_hours_text)}</span>
            </div>
          \` : ''}

          \${place.google_maps_url ? \`
            <div style="margin-top:1.5rem;">
              <a href="\${escapeHtml(place.google_maps_url)}" target="_blank" rel="noopener" class="btn-primary-action" style="width:100%;text-decoration:none;">
                Cómo llegar en Google Maps ↗
              </a>
            </div>
          \` : ''}
        </div>
      \`;

      modal.classList.add('active');
      sheet.querySelector('.modal-close-btn')?.focus();
    }
    window.openPlaceModal = openPlaceModal;

    // ==============================================================================
    // Ficha Modal de Recurrencia
    // ==============================================================================
    function openRecurrenceModal(recId) {
      if (!currentData) return;
      let rec = null;
      if (currentData.recurrences) {
        rec = currentData.recurrences.find((r) => r.id === recId);
      } else if (currentData.days) {
        for (const day of currentData.days) {
          rec = (day.recurrences || []).find((r) => r.id === recId);
          if (rec) break;
        }
      }
      if (!rec) return;

      savedScrollY = window.scrollY;
      document.body.classList.add('modal-open');

      const modal = document.getElementById('detail-modal');
      const sheet = document.getElementById('modal-content');

      sheet.innerHTML = \`
        <div class="modal-sticky-header">
          <button type="button" class="modal-close-btn" data-action="close-modal" aria-label="Cerrar ficha">
            <svg style="width:18px;height:18px;fill:var(--color-night)" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
        </div>

        <div class="modal-body" style="padding-top:1.25rem;">
          <span class="recurrence-badge" style="margin-bottom:0.75rem;">↻ Actividad periódica</span>
          <h1 class="modal-title-main" id="modal-title-main">\${escapeHtml(rec.title)}</h1>
          <p style="font-size:0.9375rem;color:var(--color-text-muted);line-height:1.6;margin-bottom:1.5rem;">
            Plan recurrente habitual en <strong>\${escapeHtml(rec.venue_name)}</strong>. Consulta directamente con el local los posibles cambios puntuales de programación o festivos.
          </p>
          <button class="btn-primary-action" style="width:100%;" data-action="close-modal">Entendido</button>
        </div>
      \`;
      modal.classList.add('active');
      sheet.querySelector('.modal-close-btn')?.focus();
    }
    window.openRecurrenceModal = openRecurrenceModal;

    // ==============================================================================
    // Cierre de Modal y Gestión de Foco
    // ==============================================================================
    function closeModal() {
      const modal = document.getElementById('detail-modal');
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
      window.scrollTo(0, savedScrollY);
      activeModalEventId = null;
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
        lastFocusedElement = null;
      }
    }
    window.closeModal = closeModal;

    // ==============================================================================
    // Visor de Cartel Completo Accesible (Lightbox)
    // ==============================================================================
    let lightboxTriggerEl = null;
    let lightboxCurrentZoom = 1;
    const ZOOM_LEVELS = [1, 1.5, 2, 3];
    let isDraggingLightbox = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;

    function openPosterLightbox(url, title, triggerEl) {
      if (!url) return;
      lightboxTriggerEl = triggerEl || document.activeElement;
      const lb = document.getElementById('poster-lightbox');
      const img = document.getElementById('poster-lightbox-img');
      const titleEl = document.getElementById('poster-lightbox-title');

      if (titleEl) {
        titleEl.textContent = title ? ('Cartel: ' + title) : 'Cartel completo';
      }
      if (img) {
        img.src = url;
        img.alt = title ? ('Cartel completo de ' + title) : 'Cartel completo';
      }
      setLightboxZoom(1);

      if (lb) {
        lb.style.display = 'flex';
        const closeBtn = lb.querySelector('.lightbox-close-btn');
        if (closeBtn && typeof closeBtn.focus === 'function') {
          closeBtn.focus();
        }
      }
    }
    window.openPosterLightbox = openPosterLightbox;

    function closePosterLightbox() {
      const lb = document.getElementById('poster-lightbox');
      if (!lb || lb.style.display === 'none') return;
      lb.style.display = 'none';
      const img = document.getElementById('poster-lightbox-img');
      if (img) img.src = '';
      setLightboxZoom(1);
      if (lightboxTriggerEl && typeof lightboxTriggerEl.focus === 'function') {
        lightboxTriggerEl.focus();
        lightboxTriggerEl = null;
      }
    }
    window.closePosterLightbox = closePosterLightbox;

    function setLightboxZoom(scale) {
      lightboxCurrentZoom = Math.max(1, Math.min(3, scale));
      const img = document.getElementById('poster-lightbox-img');
      const viewport = document.getElementById('poster-lightbox-viewport');
      const label = document.getElementById('poster-lightbox-zoom-label');

      if (label) {
        label.textContent = Math.round(lightboxCurrentZoom * 100) + '%';
      }

      if (img) {
        if (lightboxCurrentZoom > 1) {
          img.style.transform = 'scale(' + lightboxCurrentZoom + ')';
          viewport?.classList.add('is-zoomed');
        } else {
          img.style.transform = 'scale(1)';
          viewport?.classList.remove('is-zoomed');
          if (viewport) {
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
          }
        }
      }
    }
    window.setLightboxZoom = setLightboxZoom;

    function stepLightboxZoom(delta) {
      const curIdx = ZOOM_LEVELS.reduce((bestIdx, lvl, idx) => {
        return Math.abs(lvl - lightboxCurrentZoom) < Math.abs(ZOOM_LEVELS[bestIdx] - lightboxCurrentZoom) ? idx : bestIdx;
      }, 0);
      let nextIdx = curIdx + delta;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= ZOOM_LEVELS.length) nextIdx = ZOOM_LEVELS.length - 1;
      setLightboxZoom(ZOOM_LEVELS[nextIdx]);
    }
    window.stepLightboxZoom = stepLightboxZoom;

    // ==============================================================================
    // Controladores de interfaz y navegación
    // ==============================================================================
    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.time-tab').forEach((el) => el.classList.remove('active'));

      if (view === 'today') {
        document.getElementById('tab-today').classList.add('active');
        selectedDate = getTodayDateString();
        document.getElementById('calendar-label').innerText = 'Calendario';
      } else if (view === 'tomorrow') {
        document.getElementById('tab-tomorrow').classList.add('active');
        selectedDate = getTomorrowDateString();
        document.getElementById('calendar-label').innerText = 'Calendario';
      } else if (view === 'weekend') {
        document.getElementById('tab-weekend').classList.add('active');
        document.getElementById('calendar-label').innerText = 'Calendario';
      } else if (view === 'calendar') {
        document.getElementById('tab-calendar').classList.add('active');
      }

      loadData();
    }
    window.switchView = switchView;

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.cat-btn').forEach((el) => {
        el.classList.toggle('active', el.dataset.cat === filter);
      });

      if (currentView === 'weekend') {
        renderWeekendAgenda();
      } else {
        renderDayAgenda();
      }
    }
    window.setFilter = setFilter;

    function getDayNameFromNumber(dow) {
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return days[dow] || 'día';
    }

    // ==============================================================================
    // Delegación Segura de Clics (Sin interpolar JavaScript inline)
    // ==============================================================================
    document.addEventListener('click', (e) => {
      // 1. Métricas en enlaces dentro del modal
      const metricEl = e.target.closest('[data-metric]');
      if (metricEl) {
        const type = metricEl.dataset.metric;
        const evId = metricEl.dataset.eventId;
        const promoId = metricEl.dataset.promoId ? Number(metricEl.dataset.promoId) : null;
        if (evId && type) {
          trackMetric(Number(evId), type, promoId);
        }
      }

      // 2. Acciones del modal o lista
      const trigger = e.target.closest('[data-action]');
      if (!trigger) return;

      const action = trigger.dataset.action;

      if (action === 'open-event') {
        lastFocusedElement = trigger;
        openEventModal(Number(trigger.dataset.id));
      } else if (action === 'open-place') {
        lastFocusedElement = trigger;
        openPlaceModal(Number(trigger.dataset.id));
      } else if (action === 'open-recurrence') {
        lastFocusedElement = trigger;
        openRecurrenceModal(Number(trigger.dataset.id));
      } else if (action === 'close-modal') {
        closeModal();
      } else if (action === 'open-full-poster') {
        openPosterLightbox(trigger.dataset.posterUrl, trigger.dataset.posterTitle, trigger);
      } else if (action === 'close-lightbox') {
        closePosterLightbox();
      } else if (action === 'lightbox-zoom-in') {
        stepLightboxZoom(1);
      } else if (action === 'lightbox-zoom-out') {
        stepLightboxZoom(-1);
      } else if (action === 'lightbox-zoom-reset') {
        setLightboxZoom(1);
      } else if (action === 'switch-view') {
        switchView(trigger.dataset.view);
      } else if (action === 'set-cat') {
        setFilter(trigger.dataset.cat);
      } else if (action === 'clear-filters') {
        clearAllFilters();
      } else if (action === 'remove-cat-filter') {
        setFilter('all');
      } else if (action === 'prev-hero') {
        if (window.__heroCarouselStep) window.__heroCarouselStep(-1);
      } else if (action === 'next-hero') {
        if (window.__heroCarouselStep) window.__heroCarouselStep(1);
      } else if (action === 'reload-data') {
        loadData();
      }
    });

    // Configuración de interacción directa sobre el visor de cartel (zoom y arrastre)
    const lightboxImg = document.getElementById('poster-lightbox-img');
    if (lightboxImg) {
      lightboxImg.addEventListener('click', (e) => {
        e.stopPropagation();
        if (lightboxCurrentZoom > 1) {
          setLightboxZoom(1);
        } else {
          setLightboxZoom(2);
        }
      });
    }

    const lightboxViewport = document.getElementById('poster-lightbox-viewport');
    if (lightboxViewport) {
      lightboxViewport.addEventListener('mousedown', (e) => {
        if (lightboxCurrentZoom <= 1) return;
        isDraggingLightbox = true;
        lightboxViewport.classList.add('is-dragging');
        dragStartX = e.pageX;
        dragStartY = e.pageY;
        scrollStartX = lightboxViewport.scrollLeft;
        scrollStartY = lightboxViewport.scrollTop;
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDraggingLightbox || !lightboxViewport) return;
        e.preventDefault();
        const dx = e.pageX - dragStartX;
        const dy = e.pageY - dragStartY;
        lightboxViewport.scrollLeft = scrollStartX - dx;
        lightboxViewport.scrollTop = scrollStartY - dy;
      });
      window.addEventListener('mouseup', () => {
        if (isDraggingLightbox && lightboxViewport) {
          isDraggingLightbox = false;
          lightboxViewport.classList.remove('is-dragging');
        }
      });
    }

    // Cierre al pulsar sobre el fondo oscurecido del modal
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') {
        closeModal();
      }
    });

    // Selector de fecha nativo en calendario
    document.getElementById('date-input').addEventListener('change', (e) => {
      const pickedDate = e.target.value;
      if (!pickedDate) return;
      selectedDate = pickedDate;
      currentView = 'calendar';
      document.querySelectorAll('.time-tab').forEach((el) => el.classList.remove('active'));
      document.getElementById('tab-calendar').classList.add('active');

      const [y, m, d] = pickedDate.split('-');
      document.getElementById('calendar-label').innerText = d + '/' + m;
      loadData();
    });

    // ==============================================================================
    // Accesibilidad: Tecla Escape y Atrapado de Foco (Focus Trap)
    // ==============================================================================
    document.addEventListener('keydown', (e) => {
      // Prioridad 1: Visor de cartel completo (Lightbox) si está visible
      const lightbox = document.getElementById('poster-lightbox');
      if (lightbox && lightbox.style.display !== 'none') {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closePosterLightbox();
          return;
        }

        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          stepLightboxZoom(1);
          return;
        }

        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          stepLightboxZoom(-1);
          return;
        }

        if (e.key === 'Tab') {
          const focusable = lightbox.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
          return;
        }
        return;
      }

      // Soporte teclado (Enter o Espacio) en cabeceras de imagen clicables
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest) {
        const trigger = e.target.closest('[data-action="open-full-poster"]');
        if (trigger && trigger.tagName !== 'BUTTON') {
          e.preventDefault();
          openPosterLightbox(trigger.dataset.posterUrl, trigger.dataset.posterTitle, trigger);
          return;
        }
      }

      // Prioridad 2: Ficha modal de evento/lugar
      const modal = document.getElementById('detail-modal');
      if (!modal.classList.contains('active')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // ==============================================================================
    // Registro de Service Worker PWA
    // ==============================================================================
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }

    // Inicialización al cargar la página
    document.addEventListener('DOMContentLoaded', () => {
      getSessionHash();
      loadData();
    });
  </script>
</body>
</html>`;
}
