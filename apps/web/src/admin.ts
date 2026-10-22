import { VALID_VENUE_CATEGORIES, VENUE_CATEGORY_LABELS } from '@vayaplan/shared';

/**
 * Genera las opciones HTML para un desplegable de categorías de locales
 * utilizando como única fuente de verdad el catálogo de @vayaplan/shared.
 */
export function renderVenueCategorySelectOptions(placeholder?: string): string {
  const options: string[] = [];
  if (placeholder !== undefined) {
    options.push(`<option value="">${placeholder}</option>`);
  }
  for (const cat of VALID_VENUE_CATEGORIES) {
    const label = VENUE_CATEGORY_LABELS[cat] || cat;
    options.push(`<option value="${cat}">${label}</option>`);
  }
  return options.join('\n                ');
}

/**
 * Renderizador de la interfaz del Panel de Curación Administrativo (/admin)
 * Mobile-first, responsive, protegida por token JWT con soporte para gestión integral de eventos,
 * locales, recurrencias, lugares permanentes, códigos QR y visualización de métricas.
 */
export function renderAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>VayaPlan — Panel de Curación y Administración</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
    <style>
    :root {
      /* Modo Claro Forzado: Bloquea inversión no deseada de dark mode */
      color-scheme: light;
      --bg-page: #f8fafc;
      --bg-surface: #ffffff;
      --bg-subtle: #f1f5f9;
      --bg-hover: #f8fafc;
      --bg-selected: #f5f3ff;
      --border: #e2e8f0;
      --border-strong: #cbd5e1;
      --border-focus: #6c3bff;
      --text-main: #0b0f3b;
      --text-muted: #475569;
      --text-dim: #64748b;
      --primary: #6c3bff;
      --primary-hover: #592ee0;
      --primary-soft: #f0ebff;
      --accent-blue: #0284c7;
      --emerald: #059669;
      --emerald-bg: #ecfdf5;
      --emerald-border: #a7f3d0;
      --amber: #d97706;
      --amber-bg: #fffbeb;
      --amber-border: #fde68a;
      --amber-text: #92400e;
      --red: #dc2626;
      --red-bg: #fef2f2;
      --red-border: #fecaca;
      --red-text: #991b1b;
      --radius: 14px;
      --radius-sm: 8px;
      --shadow-sm: 0 1px 3px rgba(11, 15, 59, 0.05);
      --shadow-md: 0 4px 12px rgba(11, 15, 59, 0.07);
      --shadow-lg: 0 12px 28px rgba(11, 15, 59, 0.12);
      --sidebar-width: 260px;
    }

    /* Regla estricta para ignorar prefers-color-scheme: dark */
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: light;
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    *:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    /* Reducción de movimiento */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* SVG Logo y Badge */
    .admin-brand-svg {
      height: 28px;
      width: auto;
      display: block;
    }
    .admin-badge {
      font-size: 0.625rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: var(--primary-soft);
      color: var(--primary);
      border: 1px solid rgba(108, 59, 255, 0.25);
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
    }

    /* Layout Shell */
    #dashboard-view {
      display: flex;
      min-height: 100vh;
      background: var(--bg-page);
    }

    /* Sidebar Escritorio Claro */
    .admin-sidebar {
      width: var(--sidebar-width);
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 40;
      overflow-y: auto;
      box-shadow: 1px 0 8px rgba(11, 15, 59, 0.03);
    }
    .sidebar-header {
      padding: 1.25rem 1.25rem 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      text-decoration: none;
    }
    .sidebar-nav {
      flex: 1;
      padding: 1.25rem 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .nav-group-title {
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      padding: 0.5rem 0.65rem 0.25rem;
      text-transform: uppercase;
    }
    .sidebar-nav-item, .drawer-nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 0.85rem;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      width: 100%;
      text-align: left;
      transition: all 0.15s ease;
    }
    .sidebar-nav-item:hover, .drawer-nav-item:hover {
      color: var(--text-main);
      background: var(--bg-subtle);
    }
    .sidebar-nav-item.active, .drawer-nav-item.active {
      color: var(--primary);
      background: var(--bg-selected);
      border-color: rgba(108, 59, 255, 0.25);
      font-weight: 700;
    }
    .nav-item-icon {
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
    }
    .nav-item-label {
      flex: 1;
    }
    .sidebar-footer, .drawer-footer {
      padding: 1rem;
      border-top: 1px solid var(--border);
      background: #fafbfd;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .sidebar-user-info, .drawer-user-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .user-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow: hidden;
    }
    .user-avatar {
      font-size: 0.875rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
    }
    .sidebar-user-email, .drawer-user-email {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 130px;
    }
    .sidebar-link-web, .drawer-link-web {
      font-size: 0.75rem;
      color: var(--primary);
      font-weight: 700;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .sidebar-link-web:hover, .drawer-link-web:hover {
      text-decoration: underline;
    }

    /* Main Area Escritorio Claro */
    .admin-main {
      margin-left: var(--sidebar-width);
      flex: 1;
      min-width: 0;
      padding: 1.75rem 2.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Header Superior en Main Area */
    .admin-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .topbar-title {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      color: var(--text-main);
    }
    .topbar-subtitle {
      font-size: 0.875rem;
      color: var(--text-dim);
      margin-top: 0.2rem;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    /* Botones Globales Tema Claro */
    .btn-primary {
      background: var(--primary);
      color: #ffffff;
      padding: 0.55rem 1.1rem;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 700;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      box-shadow: 0 2px 8px rgba(108, 59, 255, 0.25);
      transition: all 0.15s ease;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      box-shadow: 0 4px 12px rgba(108, 59, 255, 0.35);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--bg-surface);
      color: var(--text-muted);
      padding: 0.55rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 600;
      border: 1px solid var(--border-strong);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
    }
    .btn-secondary:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
      border-color: #94a3b8;
    }
    .btn-refresh, .btn-refresh-top {
      background: var(--bg-surface);
      color: var(--primary);
      border: 1px solid rgba(108, 59, 255, 0.25);
      border-radius: var(--radius-sm);
      padding: 0.45rem 0.8rem;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
    }
    .btn-refresh:hover, .btn-refresh-top:hover {
      background: var(--primary-soft);
      border-color: var(--primary);
    }
    .btn-sm {
      padding: 0.35rem 0.65rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .btn-logout {
      background: #fee2e2;
      color: var(--red);
      border-color: var(--red-border);
    }
    .btn-logout:hover {
      background: #fecaca;
      color: #991b1b;
    }

    /* Badges y Contadores */
    .badge-count {
      background: var(--primary);
      color: #ffffff;
      font-size: 0.6875rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      margin-left: auto;
      line-height: 1;
    }
    .badge-warning {
      background: var(--amber) !important;
      color: #ffffff !important;
    }
    .badge-danger {
      background: var(--red) !important;
      color: #ffffff !important;
    }

    /* Mobile Header y Drawer Claro */
    .mobile-header {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 0 1rem;
      align-items: center;
      justify-content: space-between;
      z-index: 50;
      box-shadow: 0 2px 8px rgba(11, 15, 59, 0.04);
    }
    .btn-hamburger {
      background: transparent;
      border: none;
      color: var(--text-main);
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
    }
    .btn-hamburger:hover {
      background: var(--bg-subtle);
    }
    .mobile-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .mobile-top-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .mobile-inbox-counter {
      background: var(--primary-soft);
      border: 1px solid rgba(108, 59, 255, 0.25);
      color: var(--primary);
      font-size: 0.8125rem;
      font-weight: 700;
      padding: 0.35rem 0.65rem;
      border-radius: 9999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 44px;
    }
    .mobile-drawer-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(4px);
      z-index: 90;
    }
    .mobile-drawer-backdrop.active {
      display: block;
    }
    .mobile-drawer {
      position: fixed;
      top: 0;
      bottom: 0;
      left: -280px;
      width: 280px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      z-index: 100;
      display: flex;
      flex-direction: column;
      transition: left 0.25s ease, visibility 0s linear 0.25s;
      overflow-y: auto;
      box-shadow: 4px 0 24px rgba(11, 15, 59, 0.1);
      visibility: hidden;
    }
    .mobile-drawer.active {
      left: 0;
      visibility: visible;
      transition: left 0.25s ease, visibility 0s linear 0s;
    }
    .drawer-header {
      padding: 1.25rem 1rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .drawer-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .drawer-close {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.4rem;
      border-radius: 6px;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .drawer-close:hover {
      color: var(--text-main);
      background: var(--bg-subtle);
    }
    .drawer-nav {
      flex: 1;
      padding: 1rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    /* Subfiltros de Curación (Inbox) */
    .curation-subfilters {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .subfilter-pill {
      background: var(--bg-surface);
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 0.5rem 0.9rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
      min-height: 40px;
    }
    .subfilter-pill:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
      border-color: var(--border-strong);
    }
    .subfilter-pill.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
      box-shadow: 0 4px 12px rgba(108, 59, 255, 0.25);
    }

    /* Grid de Bandeja de Curación */
    .inbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 1.25rem;
    }

    /* Tarjetas de Curación Claras */
    .inbox-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      transition: all 0.2s ease;
      position: relative;
      box-shadow: var(--shadow-sm);
    }
    .inbox-card:hover {
      border-color: var(--border-strong);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    /* Tarjeta Alerta 9999 (Ámbar suave claro) */
    .inbox-card.card-warning {
      border: 1.5px solid var(--amber);
      background: linear-gradient(180deg, var(--amber-bg) 0%, var(--bg-surface) 35%);
    }
    .card-banner-warning {
      background: var(--amber-bg);
      border: 1px solid var(--amber-border);
      color: var(--amber-text);
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    /* Tarjeta Alerta Colisión (Rojo suave claro) */
    .inbox-card.card-collision {
      border: 1.5px solid var(--red);
      background: linear-gradient(180deg, var(--red-bg) 0%, var(--bg-surface) 35%);
    }
    .card-banner-collision {
      background: var(--red-bg);
      border: 1px solid var(--red-border);
      color: var(--red-text);
      padding: 0.65rem 0.85rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .collision-header-text {
      font-weight: 800;
      color: var(--red);
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    .collision-actions-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }

    /* Elementos dentro de las tarjetas */
    .card-meta-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .badge-category {
      background: var(--primary-soft);
      color: var(--primary);
      border: 1px solid rgba(108, 59, 255, 0.2);
      font-size: 0.6875rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
    }
    .card-price {
      font-size: 0.8125rem;
      font-weight: 800;
      color: var(--emerald);
    }
    .card-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.35;
    }
    .card-timing {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
      flex-wrap: wrap;
    }
    .card-timing-item {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .card-venue-box {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.65rem 0.85rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .card-venue-info {
      overflow: hidden;
    }
    .card-venue-name {
      font-size: 0.875rem;
      font-weight: 700;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-venue-meta {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-top: 0.15rem;
    }

    /* Acciones de Tarjeta */
    .card-actions-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: auto;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .btn-card-publish {
      background: var(--emerald);
      color: #ffffff;
      border: 1px solid #047857;
      padding: 0.45rem 0.85rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      box-shadow: 0 2px 6px rgba(5, 150, 105, 0.2);
      transition: all 0.15s ease;
    }
    .btn-card-publish:hover {
      background: #047857;
      transform: translateY(-1px);
    }
    .btn-card-publish-disabled {
      background: var(--bg-subtle);
      color: var(--text-dim);
      border: 1px solid var(--border);
      padding: 0.45rem 0.85rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: not-allowed;
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-card-reassign {
      background: var(--amber);
      color: #ffffff;
      border: 1px solid #b45309;
      padding: 0.45rem 0.85rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      box-shadow: 0 2px 6px rgba(217, 119, 6, 0.2);
      transition: all 0.15s ease;
    }
    .btn-card-reassign:hover {
      background: #b45309;
    }
    .btn-card-reassign-subtle {
      background: var(--bg-surface);
      color: var(--primary);
      border: 1px solid rgba(108, 59, 255, 0.3);
      padding: 0.45rem 0.85rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .btn-card-reassign-subtle:hover {
      background: var(--primary-soft);
    }
    .btn-card-action {
      background: var(--bg-surface);
      color: var(--text-muted);
      border: 1px solid var(--border-strong);
      padding: 0.45rem 0.65rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      box-shadow: var(--shadow-sm);
      transition: all 0.15s ease;
    }
    .btn-card-action:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
      border-color: #94a3b8;
    }

    /* Estado Vacío Inbox Zero */
    .inbox-zero-card {
      grid-column: 1 / -1;
      background: var(--bg-surface);
      border: 1.5px dashed var(--border-strong);
      border-radius: var(--radius);
      padding: 3.5rem 2rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      box-shadow: var(--shadow-sm);
    }
    .inbox-zero-icon {
      font-size: 3.5rem;
      line-height: 1;
    }
    .inbox-zero-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
    }
    .inbox-zero-desc {
      font-size: 0.9375rem;
      color: var(--text-dim);
      max-width: 480px;
      line-height: 1.5;
    }
    .inbox-zero-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    /* Modal Reassign Venue Pills Claras */
    .zone-pills-container {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.35rem;
    }
    .zone-pill-btn {
      background: var(--bg-subtle);
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
    }
    .zone-pill-btn:hover {
      background: #e2e8f0;
      color: var(--text-main);
    }
    .zone-pill-btn.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(108, 59, 255, 0.25);
    }

    /* Toolbar, Tablas y Formularios Claros */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .filter-group {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }
    select, input[type="text"], input[type="date"], input[type="time"], input[type="number"], input[type="email"], input[type="password"], textarea {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      color: var(--text-main);
      padding: 0.55rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      box-shadow: var(--shadow-sm);
    }
    select:focus, input:focus, textarea:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(108, 59, 255, 0.15);
    }
    .table-container {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow-x: auto;
      box-shadow: var(--shadow-sm);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }
    th {
      background: var(--bg-subtle);
      color: var(--text-muted);
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      color: var(--text-main);
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background: #fafbfd;
    }

    /* Píldoras de estado */
    .status-pill {
      font-size: 0.6875rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      display: inline-block;
    }
    .status-tentative { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .status-published { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .status-cancelled { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .status-outdated { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    .status-archived { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    .status-duplicate { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .status-active { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .status-scheduled { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .status-completed { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    .status-refunded { background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }

    /* Promociones Responsive: Tabla en Desktop y Tarjetas en Móvil */
    .promo-cards-mobile {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }
    .promo-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.125rem;
      box-shadow: 0 1px 3px rgba(11, 15, 59, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .promo-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .promo-card-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0.25rem 0 0 0;
    }
    .promo-card-venue {
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }
    .promo-card-times {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      background: var(--bg-subtle);
      border-radius: 8px;
      padding: 0.625rem 0.75rem;
      font-size: 0.8125rem;
    }
    .promo-card-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }

    /* Agenda Responsive: Tabla en Desktop y Tarjetas en Móvil */
    .events-cards-mobile {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }
    .event-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.125rem;
      box-shadow: 0 1px 3px rgba(11, 15, 59, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .event-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .event-card-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.35;
    }
    .event-card-meta {
      font-size: 0.8125rem;
      color: var(--text-dim);
      padding: 0.5rem 0.75rem;
      background: var(--bg-subtle);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .event-card-actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      align-items: center;
    }

    /* Locales (Venues) Responsive */
    .venues-cards-mobile {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }
    .venue-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.125rem;
      box-shadow: 0 1px 3px rgba(11, 15, 59, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .venue-card.venue-card-warning {
      background: #fffdf5;
      border-color: #fde68a;
    }
    .venue-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .venue-card-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.35;
    }
    .venue-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    .venue-card-actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      align-items: center;
    }

    /* Recurrencias Responsive */
    .recurrences-cards-mobile {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }
    .recurrence-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.125rem;
      box-shadow: 0 1px 3px rgba(11, 15, 59, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .recurrence-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .recurrence-card-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.35;
    }
    .recurrence-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    .recurrence-card-actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      align-items: center;
    }

    /* Lugares Permanentes (Places) Responsive */
    .places-cards-mobile {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }
    .place-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.125rem;
      box-shadow: 0 1px 3px rgba(11, 15, 59, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .place-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .place-card-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.35;
    }
    .place-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    .place-card-actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      align-items: center;
    }

    /* Códigos QR Responsive */
    .qr-cards-mobile {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }
    .qr-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.125rem;
      box-shadow: 0 1px 3px rgba(11, 15, 59, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .qr-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .qr-card-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.35;
    }
    .qr-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }
    .qr-card-actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      align-items: center;
    }

    .btn-table-action {
      background: var(--bg-surface);
      color: var(--text-muted);
      border: 1px solid var(--border-strong);
      padding: 0.35rem 0.55rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.15s ease;
    }
    .btn-table-action:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
      border-color: #94a3b8;
    }
    .btn-table-action.btn-danger {
      color: var(--red);
      border-color: #fecaca;
    }
    .btn-table-action.btn-danger:hover {
      background: #fef2f2;
      border-color: #ef4444;
    }
    .btn-table-action.btn-primary-action {
      background: var(--emerald);
      color: #ffffff;
      border-color: #047857;
    }
    .btn-table-action.btn-primary-action:hover {
      background: #047857;
    }
    .btn-table-action.btn-cancel-action {
      color: #b91c1c;
      border-color: #fecaca;
    }
    .btn-table-action.btn-cancel-action:hover {
      background: #fef2f2;
    }

    .collision-box {
      margin-top: 0.5rem;
      padding: 0.625rem 0.75rem;
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-left: 3px solid #f59e0b;
      border-radius: 8px;
      font-size: 0.8125rem;
      color: #92400e;
    }
    .collision-title {
      font-weight: 600;
      line-height: 1.4;
      margin-bottom: 0.35rem;
    }
    .collision-actions {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-top: 0.35rem;
    }
    .btn-publish-force {
      background: #f59e0b;
      color: #ffffff;
      border: 1px solid #d97706;
      padding: 0.35rem 0.65rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.15s ease;
    }
    .btn-publish-force:hover {
      background: #d97706;
    }

    /* Modal de Métricas de Evento (Tema Claro) */
    .metrics-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-bottom: 0.875rem;
    }
    @media (max-width: 600px) {
      .metrics-stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .metric-box {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.875rem 0.75rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .metric-box .metric-value {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--primary);
      line-height: 1.2;
    }
    .metric-box .metric-lbl {
      font-size: 0.6875rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    @media (max-width: 768px) {
      .events-table-desktop,
      .promo-table-desktop,
      .venues-table-desktop,
      .recurrences-table-desktop,
      .places-table-desktop,
      .qr-table-desktop {
        display: none !important;
      }
      .events-cards-mobile,
      .promo-cards-mobile,
      .venues-cards-mobile,
      .recurrences-cards-mobile,
      .places-cards-mobile,
      .qr-cards-mobile {
        display: flex !important;
      }
    }
    @media (min-width: 769px) {
      .events-table-desktop,
      .promo-table-desktop,
      .venues-table-desktop,
      .recurrences-table-desktop,
      .places-table-desktop,
      .qr-table-desktop {
        display: block !important;
      }
      .events-cards-mobile,
      .promo-cards-mobile,
      .venues-cards-mobile,
      .recurrences-cards-mobile,
      .places-cards-mobile,
      .qr-cards-mobile {
        display: none !important;
      }
    }

    /* Grids de Métricas en Informes */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .metric-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.875rem 1rem;
      box-shadow: var(--shadow-sm);
    }
    .metric-value {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.2;
    }
    .metric-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-top: 0.35rem;
      line-height: 1.3;
    }
    .metric-sublabel {
      font-size: 0.6875rem;
      color: var(--text-dim);
      margin-top: 0.2rem;
    }

    /* Modales Claros */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(6px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
    }
    .modal-header {
      padding: 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafbfd;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 6px;
    }
    .modal-close:hover {
      color: var(--text-main);
      background: var(--bg-subtle);
    }
    .modal-body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .modal-footer {
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      background: #fafbfd;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .form-group label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .form-grid {
      display: grid;
      gap: 1rem;
    }
    .two-cols { grid-template-columns: 1fr 1fr; }

    /* Bloqueo de scroll de fondo y contención de modales */
    html {
      scrollbar-gutter: stable;
    }
    body.modal-open,
    body:has(.modal-overlay.active) {
      overflow: hidden;
      overscroll-behavior: contain;
    }

    /* Modal de Locales (Nuevo / Editar): Zona única de scroll vertical */
    #modal-venue {
      overscroll-behavior: contain;
    }
    #modal-venue .modal-card {
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden; /* Elimina la barra de scroll exterior del contenedor */
    }
    #modal-venue .modal-header {
      flex-shrink: 0;
    }
    #modal-venue #form-venue {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden; /* Confinamiento estricto para evitar desbordes */
    }
    #modal-venue .modal-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto; /* ÚNICA zona desplazable del modal */
      overscroll-behavior: contain;
      padding: 1.25rem;
      padding-right: 0.75rem;
    }
    #modal-venue .modal-footer {
      flex-shrink: 0;
    }

    @media (max-width: 640px) {
      #modal-venue {
        padding: 0.5rem;
      }
      #modal-venue .modal-card {
        max-height: 96vh;
        border-radius: 12px;
      }
      #modal-venue .modal-header {
        padding: 1rem;
      }
      #modal-venue .modal-body {
        padding: 1rem 0.75rem;
      }
      #modal-venue .modal-footer {
        padding: 0.85rem 1rem;
      }
    }

    /* =========================================================================
       NUEVO EDITOR DE CREACIÓN Y EDICIÓN DE EVENTOS (DESKTOP & MÓVIL)
       ========================================================================= */
    #modal-event {
      z-index: 1000;
      padding: 1.5rem;
      overscroll-behavior: contain;
    }
    #modal-event.active {
      display: flex;
    }
    .modal-event-editor {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      width: 100%;
      max-width: 1180px;
      height: 92vh;
      max-height: 920px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 45px rgba(11, 15, 59, 0.18);
      position: relative;
      overflow: hidden;
      animation: modalEventFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalEventFadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .modal-event-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      flex-shrink: 0;
      gap: 1rem;
    }
    .modal-event-header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .modal-event-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.3;
    }
    .modal-event-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 1.5rem;
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(320px, 1fr);
      grid-template-areas:
        "data     poster"
        "venue    poster"
        "schedule poster"
        "details  poster"
        "source   poster"
        "advanced poster";
      gap: 1.25rem 1.75rem;
      align-items: start;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .modal-event-footer {
      padding: 0.875rem 1.5rem;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      flex-shrink: 0;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .modal-event-footer-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .modal-event-footer-right {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    /* Asignación de áreas para dos columnas en escritorio */
    .sec-data     { grid-area: data; }
    .sec-venue    { grid-area: venue; }
    .sec-schedule { grid-area: schedule; }
    .sec-poster   { grid-area: poster; position: sticky; top: 0; }
    .sec-details  { grid-area: details; }
    .sec-source   { grid-area: source; }
    .sec-advanced { grid-area: advanced; }

    /* Estilos unificados de campos del editor */
    .event-field-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.15rem;
      box-shadow: 0 1px 2px rgba(11, 15, 59, 0.03);
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .event-field-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.15rem;
    }
    .event-section-label {
      font-size: 0.8125rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .event-input,
    .event-select,
    .event-textarea {
      width: 100%;
      padding: 0.65rem 0.85rem;
      font-size: 0.9375rem;
      font-family: inherit;
      color: var(--text-main);
      background-color: #ffffff;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      min-height: 44px;
      box-sizing: border-box;
    }
    .event-input:focus,
    .event-select:focus,
    .event-textarea:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(108, 59, 255, 0.12);
    }
    .event-textarea {
      min-height: 100px;
      resize: vertical;
      line-height: 1.45;
    }
    .event-input-large {
      font-size: 1.05rem;
      font-weight: 600;
      padding: 0.75rem 0.95rem;
      min-height: 48px;
    }

    /* Alert / Error accesible */
    .editor-alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      color: #991b1b;
      font-size: 0.875rem;
      line-height: 1.4;
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }

    /* Selector de local con búsqueda */
    .venue-search-wrap {
      position: relative;
    }
    .venue-search-results {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 50;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      max-height: 220px;
      overflow-y: auto;
      margin-top: 4px;
    }
    .venue-search-item {
      padding: 0.65rem 0.85rem;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
      transition: background 0.12s ease;
    }
    .venue-search-item:last-child {
      border-bottom: none;
    }
    .venue-search-item:hover,
    .venue-search-item.highlighted {
      background: var(--bg-selected);
    }
    .venue-search-item-name {
      font-weight: 700;
      font-size: 0.875rem;
      color: var(--text-main);
    }
    .venue-search-item-meta {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .venue-selected-card {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
    }
    .venue-unassigned-notice {
      font-size: 0.8125rem;
      color: var(--text-dim);
      background: #f1f5f9;
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      line-height: 1.4;
      margin-top: 0.5rem;
    }

    /* Resumen de jornada editorial */
    .editorial-summary-badge {
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      font-size: 0.85rem;
      color: #5b21b6;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      line-height: 1.35;
    }

    /* Selector de Precio */
    .price-type-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .price-type-btn {
      flex: 1;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--border-strong);
      background: #ffffff;
      color: var(--text-main);
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
      min-height: 40px;
    }
    .price-type-btn:hover {
      background: var(--bg-subtle);
    }
    .price-type-btn.active {
      background: var(--bg-selected);
      border-color: var(--primary);
      color: var(--primary);
      font-weight: 700;
    }

    /* Cartel / Panel de Previsualización */
    .poster-panel-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.15rem;
      box-shadow: 0 1px 2px rgba(11, 15, 59, 0.03);
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .poster-upload-box {
      border: 2px dashed #cbd5e1;
      border-radius: 10px;
      padding: 1.75rem 1rem;
      text-align: center;
      background: #f8fafc;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .poster-upload-box:hover,
    .poster-upload-box.drag-over {
      border-color: var(--primary);
      background: #f5f3ff;
    }
    .poster-preview-card {
      width: 100%;
      background: #0b0f3b;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 240px;
      max-height: 480px;
      position: relative;
    }
    .poster-preview-img {
      max-width: 100%;
      max-height: 480px;
      object-fit: contain;
      display: block;
    }

    /* Acordeón Opciones Avanzadas */
    .advanced-accordion {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .advanced-accordion summary {
      padding: 0.85rem 1.15rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: #fafbfd;
      transition: background 0.15s ease;
    }
    .advanced-accordion summary:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
    }
    .advanced-accordion[open] summary {
      border-bottom: 1px solid var(--border);
    }
    .advanced-accordion-content {
      padding: 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    /* ADAPTACIÓN MÓVIL ESTRICTA */
    @media (max-width: 900px) {
      #modal-event {
        padding: 0 !important;
      }
      .modal-event-editor {
        position: fixed !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        border: none !important;
      }
      .modal-event-header {
        padding: 0.85rem 1rem !important;
      }
      .modal-event-body {
        padding: 1rem !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 1.15rem !important;
        overflow-x: hidden !important;
      }
      /* Orden explícito en móvil: datos principales, local, horario, cartel, detalles y fuente */
      .sec-data     { order: 1 !important; width: 100% !important; }
      .sec-venue    { order: 2 !important; width: 100% !important; }
      .sec-schedule { order: 3 !important; width: 100% !important; }
      .sec-poster   { order: 4 !important; width: 100% !important; position: static !important; }
      .sec-details  { order: 5 !important; width: 100% !important; }
      .sec-source   { order: 6 !important; width: 100% !important; }
      .sec-advanced { order: 7 !important; width: 100% !important; }

      .poster-preview-card {
        min-height: 180px !important;
        max-height: 320px !important;
      }
      .poster-preview-img {
        max-height: 320px !important;
      }
      .modal-event-footer {
        padding: 0.85rem 1rem !important;
        gap: 0.5rem !important;
      }
      .modal-event-footer-right {
        width: 100% !important;
        justify-content: flex-end !important;
      }
      .modal-event-footer-left {
        width: 100% !important;
        justify-content: flex-start !important;
      }
    }

    /* Login View Claro */
    #login-view {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
      background: var(--bg-page);
    }
    .login-container {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 420px;
      box-shadow: var(--shadow-md);
    }
    .login-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 0.4rem;
    }
    .login-desc {
      font-size: 0.875rem;
      color: var(--text-dim);
      margin-bottom: 1.5rem;
    }
    .alert-error {
      background: var(--red-bg);
      border: 1px solid var(--red-border);
      color: var(--red-text);
      padding: 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      margin-bottom: 1rem;
      display: none;
    }

    /* Modal Reassign Lista de Venues Clara */
    .venue-list-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.15s ease;
      /* reset button styles so it looks like a row */
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      font: inherit;
      color: inherit;
    }
    .venue-list-item:hover {
      background: var(--bg-subtle);
    }
    .venue-list-item.selected {
      background: var(--bg-selected);
      border-left: 3px solid var(--primary);
    }
    .venue-badge {
      font-size: 0.6875rem;
      background: var(--bg-subtle);
      color: var(--text-dim);
      border: 1px solid var(--border);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }

    /* Responsive Breakpoints */
    @media (max-width: 900px) {
      .admin-sidebar {
        display: none;
      }
      .mobile-header {
        display: flex;
      }
      .admin-main {
        margin-left: 0;
        padding: 5rem 1rem 1.5rem 1rem;
      }
      .inbox-grid {
        grid-template-columns: 1fr;
      }
      .two-cols {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>

  <!-- Vista 1: Login de Administración -->
  <div id="login-view" style="display: none;">
    <div class="login-container">
      <h2 class="login-title">Acceso Panel Curador</h2>
      <p class="login-desc">Introduce tus credenciales administrativas para gestionar la agenda.</p>

      <div id="login-error" class="alert-error"></div>

      <form onsubmit="handleLogin(event)">
        <div class="form-group" style="margin-bottom: 1rem;">
          <label>Email administrativo</label>
          <input type="email" id="login-email" required value="admin@vayaplan.com">
        </div>
        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label>Contraseña</label>
          <input type="password" id="login-password" required placeholder="••••••••">
        </div>
        <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">
          Iniciar Sesión
        </button>
      </form>
    </div>
  </div>

    <!-- Vista 2: Panel de Administración Principal (Rediseño Shell + Curación en Tema Claro) -->
  <div id="dashboard-view" style="display: none; min-height: 100vh;">
    <!-- Elemento para compatibilidad con scripts existentes -->
    <span id="current-user-email" style="display:none;"></span>

    <!-- Mobile Header Claro -->
    <header class="mobile-header">
      <button class="btn-hamburger" id="btn-hamburger" onclick="toggleMobileDrawer(true)" aria-label="Abrir menú de navegación" aria-expanded="false" aria-controls="mobile-drawer">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div class="mobile-brand">
        <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0.00 0.00 570.00 148.00" class="admin-brand-svg" role="img" aria-label="VayaPlan">
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
        <span class="admin-badge">ADMIN</span>
      </div>
      <div class="mobile-top-actions">
        <button class="mobile-inbox-counter" onclick="switchSection('inbox')" title="Bandeja de Curación">
          📥 <span id="mobile-inbox-badge">0</span>
        </button>
      </div>
    </header>

    <!-- Mobile Drawer Overlay & Backdrop -->
    <div id="mobile-drawer-backdrop" class="mobile-drawer-backdrop" onclick="toggleMobileDrawer(false)"></div>
    <aside id="mobile-drawer" class="mobile-drawer" aria-label="Menú móvil de administración">
      <div class="drawer-header">
        <div class="drawer-brand">
          <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0.00 0.00 570.00 148.00" class="admin-brand-svg" role="img" aria-label="VayaPlan">
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
          <span class="admin-badge">ADMIN</span>
        </div>
        <button class="drawer-close" onclick="toggleMobileDrawer(false)" aria-label="Cerrar menú">✕</button>
      </div>
      <nav class="drawer-nav">
        <div class="nav-group-title">CURACIÓN Y AGENDA</div>
        <button class="drawer-nav-item active" id="drawer-nav-inbox" onclick="switchSection('inbox'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">📥</span>
          <span class="nav-item-label">Bandeja de curación</span>
          <span id="drawer-badge-inbox" class="badge-count" style="display:none;">0</span>
        </button>
        <button class="drawer-nav-item" id="drawer-nav-events" onclick="switchSection('events'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">📅</span>
          <span class="nav-item-label">Agenda publicada</span>
        </button>
        <button class="drawer-nav-item" id="drawer-nav-promotions" onclick="switchSection('promotions'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">⭐</span>
          <span class="nav-item-label">Promociones</span>
        </button>
        <button class="drawer-nav-item" id="drawer-nav-routes" onclick="switchSection('routes'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">🍴</span>
          <span class="nav-item-label">Rutas Gastronómicas</span>
        </button>

        <div class="nav-group-title" style="margin-top:1.25rem;">GESTIÓN</div>
        <button class="drawer-nav-item" id="drawer-nav-venues" onclick="switchSection('venues'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">📍</span>
          <span class="nav-item-label">Locales (Venues)</span>
        </button>
        <button class="drawer-nav-item" id="drawer-nav-recurrences" onclick="switchSection('recurrences'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">↻</span>
          <span class="nav-item-label">Recurrencias</span>
        </button>
        <button class="drawer-nav-item" id="drawer-nav-places" onclick="switchSection('places'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">★</span>
          <span class="nav-item-label">Planes permanentes</span>
        </button>
        <button class="drawer-nav-item" id="drawer-nav-qr" onclick="switchSection('qr'); toggleMobileDrawer(false);">
          <span class="nav-item-icon">📱</span>
          <span class="nav-item-label">Códigos QR</span>
        </button>
      </nav>

      <div class="drawer-footer">
        <button class="btn-refresh" onclick="refreshCurrentSection()">🔄 Actualizar datos</button>
        <a href="/" target="_blank" class="drawer-link-web">Ver Web pública ↗</a>
        <div class="drawer-user-info">
          <span class="drawer-user-email" id="drawer-user-email">admin@vayaplan.com</span>
          <button class="btn-sm btn-logout" onclick="handleLogout()">Salir</button>
        </div>
      </div>
    </aside>

    <!-- Desktop Sidebar Claro -->
    <aside class="admin-sidebar" aria-label="Menú lateral de administración">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0.00 0.00 570.00 148.00" class="admin-brand-svg" role="img" aria-label="VayaPlan">
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
          <span class="admin-badge">ADMIN</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-group-title">CURACIÓN Y AGENDA</div>
        <button class="sidebar-nav-item active" id="sidebar-nav-inbox" onclick="switchSection('inbox')">
          <span class="nav-item-icon">📥</span>
          <span class="nav-item-label">Bandeja de curación</span>
          <span id="sidebar-badge-inbox" class="badge-count" style="display:none;">0</span>
        </button>
        <button class="sidebar-nav-item" id="sidebar-nav-events" onclick="switchSection('events')">
          <span class="nav-item-icon">📅</span>
          <span class="nav-item-label">Agenda publicada</span>
        </button>
        <button class="sidebar-nav-item" id="sidebar-nav-promotions" onclick="switchSection('promotions')">
          <span class="nav-item-icon">⭐</span>
          <span class="nav-item-label">Promociones</span>
        </button>
        <button class="sidebar-nav-item" id="sidebar-nav-routes" onclick="switchSection('routes')">
          <span class="nav-item-icon">🍴</span>
          <span class="nav-item-label">Rutas Gastronómicas</span>
        </button>

        <div class="nav-group-title" style="margin-top:1.5rem;">GESTIÓN</div>
        <button class="sidebar-nav-item" id="sidebar-nav-venues" onclick="switchSection('venues')">
          <span class="nav-item-icon">📍</span>
          <span class="nav-item-label">Locales (Venues)</span>
        </button>
        <button class="sidebar-nav-item" id="sidebar-nav-recurrences" onclick="switchSection('recurrences')">
          <span class="nav-item-icon">↻</span>
          <span class="nav-item-label">Recurrencias</span>
        </button>
        <button class="sidebar-nav-item" id="sidebar-nav-places" onclick="switchSection('places')">
          <span class="nav-item-icon">★</span>
          <span class="nav-item-label">Planes permanentes</span>
        </button>
        <button class="sidebar-nav-item" id="sidebar-nav-qr" onclick="switchSection('qr')">
          <span class="nav-item-icon">📱</span>
          <span class="nav-item-label">Códigos QR</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <button class="btn-refresh" onclick="refreshCurrentSection()">🔄 Actualizar datos</button>
        <a href="/" target="_blank" class="sidebar-link-web">Ver Web pública ↗</a>
        <div class="sidebar-user-info">
          <div class="user-meta">
            <span class="user-avatar">👤</span>
            <span class="sidebar-user-email" id="sidebar-user-email">admin@vayaplan.com</span>
          </div>
          <button class="btn-sm btn-logout" onclick="handleLogout()">Salir</button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area Claro -->
    <main class="admin-main">
      <!-- Topbar -->
      <header class="admin-topbar">
        <div>
          <h1 class="topbar-title" id="topbar-title">Bandeja de Curación</h1>
          <p class="topbar-subtitle" id="topbar-subtitle">Revisión y validación de borradores antes de su publicación en la agenda</p>
        </div>
        <div class="topbar-actions">
          <button class="btn-refresh-top" onclick="refreshCurrentSection()" title="Recargar datos">🔄 Actualizar</button>
          <button class="btn-primary" onclick="openNewEventModal()">+ Nuevo Evento</button>
        </div>
      </header>

      <!-- SECCIÓN BANDEJA DE CURACIÓN (INBOX ZERO) -->
      <section id="section-inbox">
        <div class="curation-subfilters" style="margin-bottom: 1.25rem;">
          <button id="inbox-subfilter-all" class="subfilter-pill active" onclick="setCurationSubfilter('tentative_all')">
            📝 Todos los borradores <span id="inbox-badge-all" class="badge-count" style="display:none;">0</span>
          </button>
          <button id="inbox-subfilter-unassigned" class="subfilter-pill" onclick="setCurationSubfilter('tentative_unassigned')">
            ⚠️ Pendientes de local <span id="inbox-badge-unassigned" class="badge-count badge-warning" style="display:none;">0</span>
          </button>
          <button id="inbox-subfilter-collisions" class="subfilter-pill" onclick="setCurationSubfilter('tentative_collisions')">
            💥 Posibles colisiones <span id="inbox-badge-collisions" class="badge-count badge-danger" style="display:none;">0</span>
          </button>
        </div>

        <div id="inbox-cards-grid" class="inbox-grid">
          <div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 2.5rem;">
            Cargando bandeja de curación...
          </div>
        </div>
      </section>

      <!-- SECCIÓN AGENDA COMPLETA / PUBLICADA (TABLA EN DESKTOP, TARJETAS EN MÓVIL) -->
      <section id="section-events" style="display:none;">
        <div class="toolbar">
          <div class="filter-group">
            <select id="event-filter-status" onchange="onManualStatusFilterChange()" aria-label="Filtrar por estado del evento">
              <option value="">Todos los estados</option>
              <option value="published">Publicados</option>
              <option value="tentative">Borradores Tentativos (WhatsApp/Web)</option>
              <option value="cancelled">Cancelados</option>
              <option value="outdated">Caducados (Outdated)</option>
              <option value="archived">Archivados</option>
              <option value="duplicate">Duplicados</option>
            </select>
            <input type="date" id="event-filter-date" onchange="loadAdminEvents()" aria-label="Filtrar por fecha editorial">
          </div>
          <button class="btn-primary" onclick="openNewEventModal()">+ Nuevo Evento</button>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container events-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Evento / Local / Colisión</th>
                <th>Fecha / Hora (Madrid)</th>
                <th>Precio</th>
                <th>Fuente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="events-tbody">
              <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando eventos...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales -->
        <div id="events-cards-container" class="events-cards-mobile" style="display:none; flex-direction:column; gap:0.875rem;">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando eventos...</div>
        </div>
      </section><!-- SECCIÓN PROMOCIONES -->
      <section id="section-promotions" style="display:none;">
        <div class="toolbar">
          <div class="filter-group">
            <select id="promo-filter-status" onchange="loadAdminPromotions()" aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              <option value="active">Activas</option>
              <option value="scheduled">Programadas</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
              <option value="refunded">Reembolsadas</option>
            </select>
          </div>
          <button class="btn-primary" onclick="openNewPromotionModal()">+ Nueva Promoción</button>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container promo-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Estado</th>
                <th>Evento / Local</th>
                <th>Horario del Evento</th>
                <th>Vigencia de Campaña</th>
                <th>Precio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="promotions-tbody">
              <tr><td colspan="7" style="text-align:center;">Cargando promociones...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas adaptadas -->
        <div class="promo-cards-mobile" id="promo-cards-mobile">
          <!-- Renderizado dinámicamente -->
        </div>
      </section>

      <!-- SECCIÓN 2: LOCALES (VENUES) -->
      <section id="section-venues" style="display:none;">
        <div class="toolbar" style="margin-bottom:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h3 style="margin:0; font-size:1.125rem; font-weight:800; color:var(--text-main);">Locales Censados</h3>
            <span id="venues-count-badge" class="badge-count" style="display:none;">0</span>
          </div>
          <button class="btn-primary" onclick="openNewVenueModal()">+ Nuevo Local</button>
        </div>

        <!-- Filtros y Búsqueda -->
        <div class="toolbar" style="background:var(--bg-subtle); padding:0.875rem; border-radius:var(--radius); border:1px solid var(--border); margin-bottom:1rem; gap:0.75rem; align-items:stretch;">
          <div style="flex:1; min-width:220px;">
            <input type="text" id="venue-filter-search" placeholder="🔍 Buscar por nombre, ciudad, teléfono..." oninput="onVenueSearchInput(this.value)" style="width:100%; box-sizing:border-box;" aria-label="Buscar locales">
          </div>
          <div class="filter-group" style="flex-wrap:wrap; gap:0.5rem;">
            <select id="venue-filter-city" onchange="onVenueFilterChange()" aria-label="Filtrar por ciudad">
              <option value="">Todas las ciudades</option>
            </select>
            <select id="venue-filter-category" onchange="onVenueFilterChange()" aria-label="Filtrar por categoría">
              <option value="">Todas las categorías</option>
            </select>
            <select id="venue-filter-status" onchange="onVenueFilterChange()" aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <select id="venue-filter-whatsapp" onchange="onVenueFilterChange()" aria-label="Filtrar por WhatsApp">
              <option value="">WhatsApp (Todos)</option>
              <option value="yes">Con WhatsApp</option>
              <option value="no">Sin WhatsApp</option>
            </select>
            <select id="venue-filter-sort" onchange="onVenueSortChange()" aria-label="Ordenar locales">
              <option value="name_asc">Nombre (A-Z)</option>
              <option value="name_desc">Nombre (Z-A)</option>
              <option value="city_asc">Ciudad (A-Z)</option>
              <option value="created_at_desc">Más recientes</option>
              <option value="created_at_asc">Más antiguos</option>
            </select>
            <button type="button" class="btn-table-action" onclick="resetVenueFilters()" title="Restablecer filtros" style="padding:0.55rem 0.75rem;">↺ Limpiar</button>
          </div>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container venues-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ciudad</th>
                <th>Categoría</th>
                <th>Teléfono</th>
                <th>WhatsApp</th>
                <th>Estado</th>
                <th>Fecha Creación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="venues-tbody">
              <tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando locales...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales -->
        <div id="venues-cards-container" class="venues-cards-mobile">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando locales...</div>
        </div>

        <!-- Paginación Server-Side -->
        <div id="venues-pagination-container" style="display:flex; justify-content:space-between; align-items:center; padding:1rem 0; margin-top:0.75rem; flex-wrap:wrap; gap:0.75rem;">
          <div id="venues-pagination-info" style="font-size:0.875rem; color:var(--text-muted);">
            Cargando información de páginas...
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <button type="button" id="venues-prev-page-btn" class="btn-table-action" onclick="changeVenuePage(-1)" disabled>◀ Anterior</button>
            <span id="venues-page-indicator" style="font-size:0.875rem; font-weight:700; color:var(--text-main); padding:0 0.5rem;">Página 1 de 1</span>
            <button type="button" id="venues-next-page-btn" class="btn-table-action" onclick="changeVenuePage(1)" disabled>Siguiente ▶</button>
          </div>
        </div>
      </section>

      <!-- SECCIÓN 3: RECURRENCIAS -->
      <section id="section-recurrences" style="display:none;">
        <div class="toolbar">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h3 style="margin:0; font-size:1.125rem; font-weight:800; color:var(--text-main);">Planes Semanales Periódicos</h3>
            <span id="recurrences-count-badge" class="badge-count" style="display:none;">0</span>
          </div>
          <button class="btn-primary" onclick="openNewRecurrenceModal()">+ Nueva Recurrencia</button>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container recurrences-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Día</th>
                <th>Actividad / Local</th>
                <th>Horario</th>
                <th>Precio</th>
                <th>Estado</th>
                <th>Excepciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="recurrences-tbody">
              <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando recurrencias...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales -->
        <div id="recurrences-cards-container" class="recurrences-cards-mobile">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando recurrencias...</div>
        </div>
      </section>

      <!-- SECCIÓN 4: LUGARES PERMANENTES (PLACES) -->
      <section id="section-places" style="display:none;">
        <div class="toolbar">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h3 style="margin:0; font-size:1.125rem; font-weight:800; color:var(--text-main);">Lugares y Oferta Estable (Cine, Teatros, Salas)</h3>
            <span id="places-count-badge" class="badge-count" style="display:none;">0</span>
          </div>
          <button class="btn-primary" onclick="openNewPlaceModal()">+ Nuevo Lugar</button>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container places-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Lugar</th>
                <th>Categoría</th>
                <th>Destacado</th>
                <th>Horario / Precio</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="places-tbody">
              <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando lugares...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales -->
        <div id="places-cards-container" class="places-cards-mobile">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando lugares...</div>
        </div>
      </section>

      <!-- SECCIÓN 5: QR ALOJAMIENTOS -->
      <section id="section-qr" style="display:none;">
        <div class="toolbar">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h3 style="margin:0; font-size:1.125rem; font-weight:800; color:var(--text-main);">Captación Turística: Códigos QR para Alojamientos</h3>
            <span id="qr-count-badge" class="badge-count" style="display:none;">0</span>
          </div>
          <button class="btn-primary" onclick="openNewQrModal()">+ Nuevo QR Alojamiento</button>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container qr-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Alojamiento</th>
                <th>Tipo</th>
                <th>Código / Enlace</th>
                <th>Escaneos Totales</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="qr-tbody">
              <tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando fuentes QR...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales -->
        <div id="qr-cards-container" class="qr-cards-mobile">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando fuentes QR...</div>
        </div>
      </section>

      <!-- SECCIÓN 8: RUTAS GASTRONÓMICAS -->
      <section id="section-routes" style="display:none;">
        <div class="toolbar" style="margin-bottom:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h3 style="margin:0; font-size:1.125rem; font-weight:800; color:var(--text-main);">Rutas Gastronómicas</h3>
            <span id="routes-count-badge" class="badge-count" style="display:none;">0</span>
          </div>
          <button type="button" class="btn-primary" onclick="openNewRouteModal()">+ Nueva Ruta Gastronómica</button>
        </div>

        <!-- Filtros y Búsqueda -->
        <div class="toolbar" style="background:var(--bg-subtle); padding:0.875rem; border-radius:var(--radius); border:1px solid var(--border); margin-bottom:1rem; gap:0.75rem; align-items:stretch;">
          <div style="flex:1; min-width:220px;">
            <input type="text" id="route-filter-search" placeholder="🔍 Buscar por título o categoría..." oninput="onRouteSearchInput(this.value)" style="width:100%; box-sizing:border-box;" aria-label="Buscar rutas gastronómicas">
          </div>
          <div class="filter-group" style="flex-wrap:wrap; gap:0.5rem;">
            <select id="route-filter-city" onchange="onRouteFilterChange()" aria-label="Filtrar por ciudad">
              <option value="1">Palencia</option>
            </select>
            <select id="route-filter-status" onchange="onRouteFilterChange()" aria-label="Filtrar por estado">
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
              <option value="archived">Archivada</option>
            </select>
            <button type="button" class="btn-table-action" onclick="resetRouteFilters()" title="Restablecer filtros" style="padding:0.55rem 0.75rem;">↺ Limpiar</button>
          </div>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container routes-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Locales</th>
                <th>Fechas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="routes-tbody">
              <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando rutas gastronómicas...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales sin desbordamiento horizontal -->
        <div id="routes-cards-container" class="routes-cards-mobile">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando rutas gastronómicas...</div>
        </div>
      </section>
    </main>
  </div>

  <!-- MODAL: EDITOR DE CREACIÓN Y EDICIÓN DE EVENTOS (REDISEÑO AMPLIO CLARO) -->
  <div id="modal-event" class="modal-overlay" onclick="handleEventBackdropClick(event)">
    <div class="modal-event-editor" role="dialog" aria-modal="true" aria-labelledby="modal-event-title" onclick="event.stopPropagation()">
      
      <!-- Cabecera Persistente -->
      <header class="modal-event-header">
        <div class="modal-event-header-left">
          <h2 id="modal-event-title" class="modal-event-title">Nuevo evento</h2>
          <span id="modal-event-status-badge" style="display:none;"></span>
        </div>
        <button type="button" class="modal-close" onclick="requestCloseEventModal()" aria-label="Cerrar editor de evento">✕</button>
      </header>

      <!-- Mensaje de Error Accesible (Global al formulario) -->
      <div id="ev-form-error" role="alert" style="display:none; margin: 1rem 1.5rem 0 1.5rem;" class="editor-alert-error"></div>

      <!-- Contenido Principal Desplazable -->
      <form id="form-event" onsubmit="event.preventDefault();" style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;">
        <input type="hidden" id="ev-id">

        <div class="modal-event-body">
          
          <!-- SECCIÓN A: DATOS DEL EVENTO -->
          <section class="sec-data event-field-card" aria-labelledby="sec-data-title">
            <div class="event-field-header">
              <span id="sec-data-title" class="event-section-label">📌 Datos del evento</span>
            </div>
            
            <div class="form-group">
              <label for="ev-title" style="font-weight:700; color:var(--text-main);">Título del evento *</label>
              <input type="text" id="ev-title" class="event-input event-input-large" required placeholder="Ej: Concierto acústico de jazz" oninput="markFormDirty()">
              <small style="font-size:0.75rem; color:var(--text-muted);">Nombre con el que se anunciará en la agenda pública (mínimo 3 caracteres).</small>
            </div>

            <div class="form-group">
              <label for="ev-category" style="font-weight:700; color:var(--text-main);">Categoría *</label>
              <select id="ev-category" class="event-select" required onchange="markFormDirty()">
                <option value="" disabled selected>Selecciona una categoría...</option>
                <option value="musica_directo">Música en directo (conciertos, acústicos, jam sessions)</option>
                <option value="dj_tardeo">DJ & Tardeo (sesiones, tardeos, electrónica)</option>
                <option value="monologo">Monólogo & Humor (stand-up, comedia)</option>
                <option value="cine">Cine (proyecciones, cineclub, estrenos)</option>
                <option value="teatro">Teatro & Artes escénicas</option>
                <option value="exposicion">Exposición & Arte</option>
                <option value="cultura">Cultura & Divulgación (talleres, catas, conferencias)</option>
                <option value="baloncesto">🏀 Baloncesto (competiciones y partidos)</option>
                <option value="futbol">⚽ Fútbol (competiciones y partidos)</option>
                <option value="rugby">🏉 Rugby (competiciones y partidos)</option>
                <option value="conferencia">🗣️ Charla & Conferencia</option>
              </select>
            </div>
          </section>

          <!-- SECCIÓN B: LOCAL -->
          <section class="sec-venue event-field-card" aria-labelledby="sec-venue-title">
            <div class="event-field-header">
              <span id="sec-venue-title" class="event-section-label">🏢 Local</span>
            </div>

            <div class="venue-search-wrap">
              <label for="ev-venue-search" style="font-weight:700; color:var(--text-main); display:block; margin-bottom:0.35rem;">Local</label>
              <div style="position:relative;">
                <input type="text" id="ev-venue-search" class="event-input" placeholder="Escribe el nombre o calle del establecimiento..." autocomplete="off" aria-describedby="ev-venue-unassigned-notice" oninput="onEventVenueSearchInput(this.value)" onfocus="onEventVenueSearchFocus()">
                <input type="hidden" id="ev-venue-id">
                <div id="ev-venue-dropdown" class="venue-search-results" style="display:none;" role="listbox"></div>
              </div>
              <div id="ev-venue-field-error" style="display:none; color:#dc2626; font-size:0.75rem; font-weight:600; margin-top:0.35rem;"></div>
            </div>

            <!-- Ficha de local seleccionado -->
            <div id="ev-venue-selected-card" class="venue-selected-card" style="display:none;">
              <div style="display:flex; align-items:center; gap:0.6rem; flex:1; min-width:0;">
                <span style="font-size:1.25rem;">📍</span>
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <div id="ev-venue-selected-name" style="font-weight:700; color:var(--text-main); font-size:0.9rem;"></div>
                  <div id="ev-venue-selected-meta" style="font-size:0.75rem; color:var(--text-muted);"></div>
                </div>
              </div>
              <div style="display:flex; gap:0.4rem; align-items:center;">
                <button type="button" class="btn-sm btn-secondary" onclick="clearSelectedVenue()">Cambiar</button>
                <button type="button" class="btn-sm btn-link" style="color:var(--text-muted); background:none; border:none; cursor:pointer; font-size:0.8125rem; padding:0.25rem 0.5rem;" onclick="clearSelectedVenue()">Quitar</button>
              </div>
            </div>

            <!-- Ayuda breve de asignación de local -->
            <div id="ev-venue-unassigned-notice" class="venue-unassigned-notice" style="display:block;">
              Obligatorio para publicar; opcional en borradores.
            </div>
          </section>

          <!-- SECCIÓN C: FECHA Y HORA (CONTRATO TEMPORAL EUROPE/MADRID) -->
          <section class="sec-schedule event-field-card" aria-labelledby="sec-schedule-title">
            <div class="event-field-header">
              <span id="sec-schedule-title" class="event-section-label">⏰ Horario y Modalidad Temporal</span>
              <span style="font-size:0.75rem; color:var(--text-dim); background:var(--bg-subtle); border:1px solid var(--border); padding:0.15rem 0.5rem; border-radius:9999px;">🌐 Europe/Madrid</span>
            </div>

            <!-- Modalidad temporal -->
            <div class="form-group">
              <label for="ev-time-status" style="font-weight:700; color:var(--text-main);">Modalidad temporal del evento *</label>
              <select id="ev-time-status" class="event-select" onchange="onTimeStatusChange(this.value)">
                <option value="confirmed">⏰ Fecha y hora confirmadas (Inicio puntual)</option>
                <option value="pending_time">⏳ Fecha confirmada, hora pendiente (Por confirmar)</option>
                <option value="continuous">🏛️ Periodo continuado / Exposición (Sin hora puntual)</option>
                <option value="tentative_date">📅 Fecha orientativa / Borrador preliminar</option>
              </select>
              <small id="ev-time-status-hint" style="font-size:0.75rem; color:var(--text-muted); display:block; margin-top:0.25rem;">
                Determina cómo se procesa y publica la actividad en la agenda de Palencia.
              </small>
            </div>

            <!-- Fecha exacta o de inicio -->
            <div class="form-group" id="ev-date-group">
              <label for="ev-date-local" style="font-weight:700; color:var(--text-main);" id="lbl-date-local">Fecha del evento *</label>
              <input type="date" id="ev-date-local" class="event-input event-input-large" required oninput="onEvDateChange()">
              <small id="hint-date-local" style="font-size:0.75rem; color:var(--text-muted);">Día en que se celebra (o inicio de la exposición).</small>
            </div>

            <!-- Hora puntual en Palencia (Europe/Madrid) -->
            <div class="form-group" id="ev-time-group">
              <label for="ev-time-local" style="font-weight:700; color:var(--text-main);">Hora de inicio (Europe/Madrid) *</label>
              <input type="time" id="ev-time-local" class="event-input" oninput="onEvTimeChange()">
              <input type="hidden" id="ev-start-time">
              <small style="font-size:0.75rem; color:var(--text-muted);">Hora local oficial en Palencia (formato HH:MM, ej. 20:30).</small>
            </div>

            <!-- Resumen humano de jornada editorial -->
            <div id="ev-editorial-summary" class="editorial-summary-badge" role="status">
              <span>📅</span> <span id="ev-editorial-summary-text">Calculando jornada editorial...</span>
            </div>

            <!-- Botón / Sección desplegable de finalización -->
            <div id="ev-end-time-wrapper">
              <button type="button" id="btn-toggle-end-time" class="btn-sm btn-secondary" onclick="toggleEndTime()" style="display:inline-flex; align-items:center; gap:0.4rem;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Añadir hora de finalización (opcional)
              </button>
              
              <div id="ev-end-time-container" style="display:none; margin-top:0.6rem; padding:0.75rem; background:#f8fafc; border:1px solid var(--border); border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                  <label for="ev-end-time" style="font-weight:700; font-size:0.8125rem; color:var(--text-main);">Fecha y hora de finalización</label>
                  <button type="button" class="btn-sm btn-link" style="color:#dc2626; padding:0; font-size:0.75rem; background:none; border:none; cursor:pointer;" onclick="removeEndTime()">Quitar finalización</button>
                </div>
                <input type="datetime-local" id="ev-end-time" class="event-input" oninput="onEvEndTimeChange()">
                <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:0.25rem;">Admite eventos que finalizan de madrugada o al día siguiente.</small>
              </div>
            </div>

            <!-- Campos específicos para exposiciones continuas -->
            <div id="ev-continuous-fields" style="display:none; margin-top:0.75rem; padding:0.85rem; background:#f8fafc; border:1px solid var(--border); border-radius:8px;">
              <div style="font-weight:700; font-size:0.8125rem; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                <span>🏛️</span> Configuración de Exposición / Periodo
              </div>
              <div class="form-group" style="margin-bottom:0.6rem;">
                <label for="ev-end-date" style="font-weight:700; font-size:0.8125rem; color:var(--text-main);">Fecha final de periodo (Obligatoria para publicar)</label>
                <input type="date" id="ev-end-date" class="event-input" oninput="markFormDirty()">
                <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:0.25rem;">
                  Último día de visita. Si aún no se conoce la fecha de clausura, el evento debe conservarse como borrador (tentative).
                </small>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label for="ev-schedule-text" style="font-weight:700; font-size:0.8125rem; color:var(--text-main);">Horario de visita publicado (Texto)</label>
                <input type="text" id="ev-schedule-text" class="event-input" placeholder="Ej: L-V 10:00-14:00 y 17:00-20:00, Sábados 10:00-14:00" oninput="markFormDirty()">
                <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:0.25rem;">
                  Horario de apertura de la sala que se mostrará en la ficha para guiar al visitante.
                </small>
              </div>
            </div>

            <!-- Campos para hora pendiente / orientativa -->
            <div id="ev-pending-fields" style="display:none; margin-top:0.75rem; padding:0.85rem; background:#fffbeb; border:1px solid var(--amber-border); border-radius:8px;">
              <div style="font-weight:700; font-size:0.8125rem; color:var(--amber-text); margin-bottom:0.4rem; display:flex; align-items:center; gap:0.4rem;">
                <span>⏳</span> Nota orientativa de horario o jornada
              </div>
              <input type="text" id="ev-approximate-schedule" class="event-input" placeholder="Ej: Jornada 8 - Pendiente de confirmación por la federación" oninput="markFormDirty()">
              <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:0.25rem;">
                Aviso explicativo para el público. No inventa una hora puntual; indica el estado real de la convocatoria.
              </small>
            </div>
          </section>

          <!-- SECCIÓN FESTIVALES Y PROGRAMAS MARCO (N:M) -->
          <section class="sec-festivals event-field-card" aria-labelledby="sec-festivals-title">
            <div class="event-field-header">
              <span id="sec-festivals-title" class="event-section-label">🎪 Festivales y Ciclos Temáticos (N:M)</span>
              <button type="button" class="btn-sm btn-link" style="color:var(--primary); font-weight:700; cursor:pointer;" onclick="toggleNewFestivalForm()">+ Nuevo programa</button>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
              Asocia esta actividad a uno o varios programas marco o festivales (p. ej. XIII Jazz Palencia Festival, Otoño Cultural 2026) sin duplicar el evento.
            </div>
            
            <div id="ev-festivals-checkbox-list" style="display:flex; flex-direction:column; gap:0.4rem; max-height:160px; overflow-y:auto; padding:0.5rem; background:#f8fafc; border:1px solid var(--border); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding:0.5rem;">Cargando programas...</div>
            </div>

            <!-- Mini-formulario para alta inline de programas marco -->
            <div id="new-festival-form" style="display:none; margin-top:0.6rem; padding:0.75rem; background:#ffffff; border:1px dashed var(--primary); border-radius:8px;">
              <div style="font-weight:700; font-size:0.8125rem; color:var(--primary); margin-bottom:0.5rem;">Crear nuevo programa marco o festival</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.5rem;">
                <div>
                  <label style="font-size:0.7rem; font-weight:700; display:block;">Nombre del festival *</label>
                  <input type="text" id="new-fest-name" class="event-input" placeholder="Ej: XIII Jazz Palencia Festival" style="font-size:0.8rem;">
                </div>
                <div>
                  <label style="font-size:0.7rem; font-weight:700; display:block;">Edición</label>
                  <input type="text" id="new-fest-edition" class="event-input" placeholder="Ej: 13ª edición" style="font-size:0.8rem;">
                </div>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.5rem;">
                <div>
                  <label style="font-size:0.7rem; font-weight:700; display:block;">Fecha de inicio *</label>
                  <input type="date" id="new-fest-start" class="event-input" style="font-size:0.8rem;">
                </div>
                <div>
                  <label style="font-size:0.7rem; font-weight:700; display:block;">Fecha de fin *</label>
                  <input type="date" id="new-fest-end" class="event-input" style="font-size:0.8rem;">
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:0.4rem;">
                <button type="button" class="btn-sm btn-secondary" onclick="toggleNewFestivalForm(false)">Cancelar</button>
                <button type="button" class="btn-sm btn-primary" onclick="submitCreateFestivalInline()">Guardar y seleccionar</button>
              </div>
            </div>
          </section>

          <!-- SECCIÓN D: CARTEL O IMAGEN -->
          <section class="sec-poster poster-panel-card" aria-labelledby="sec-poster-title">
            <div class="event-field-header">
              <span id="sec-poster-title" class="event-section-label">🖼️ Cartel o imagen</span>
            </div>

            <input type="file" id="ev-image-file" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="handleEventImageFileSelect(event)">
            <input type="hidden" id="ev-image-url">
            <input type="hidden" id="ev-image-thumb-url">
            <input type="hidden" id="ev-image-original-url">

            <!-- Caja de subida / Drag & Drop -->
            <div id="ev-image-upload-box" class="poster-upload-box" onclick="triggerEventImageUpload()" ondragover="handleEventImageDragOver(event)" ondragleave="handleEventImageDragLeave(event)" ondrop="handleEventImageDrop(event)">
              <div style="font-size:2rem; margin-bottom:0.4rem;">🎨</div>
              <button type="button" class="btn-primary" style="pointer-events:none; margin-bottom:0.5rem;">
                Subir cartel
              </button>
              <div style="font-size:0.8125rem; font-weight:600; color:var(--text-main); margin-bottom:0.25rem;">O arrastra y suelta aquí tu archivo</div>
              <div style="font-size:0.72rem; color:var(--text-muted); line-height:1.4;">JPEG, PNG o WebP (máx. 5 MB). Compatible con galería y cámara móvil.</div>

              <!-- Indicador de subida -->
              <div id="ev-image-uploading" role="status" style="display:none; font-size:0.875rem; color:#4f46e5; font-weight:600; margin-top:0.75rem; align-items:center; justify-content:center; gap:0.5rem;">
                <span>⏳ Subiendo cartel a Cloudflare R2...</span>
              </div>
            </div>

            <!-- Error accesible de imagen -->
            <div id="ev-image-error" role="alert" style="display:none;" class="editor-alert-error"></div>

            <!-- Vista previa completa sin recortes -->
            <div id="ev-image-preview-wrap" style="display:none; flex-direction:column; gap:0.75rem;">
              <div class="poster-preview-card">
                <img id="ev-image-preview" class="poster-preview-img" src="" alt="Vista previa completa del cartel">
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <span id="ev-image-preview-info" style="font-size:0.75rem; font-weight:600; color:var(--text-muted); word-break:break-all;"></span>
                <div style="display:flex; gap:0.5rem;">
                  <button type="button" class="btn-sm btn-secondary" onclick="triggerEventImageUpload()">Sustituir</button>
                  <button type="button" class="btn-sm btn-logout" onclick="removeEventImage()">Quitar imagen</button>
                </div>
              </div>
            </div>

            <!-- Opción secundaria para introducir URL externa -->
            <div style="margin-top:0.25rem; text-align:right;">
              <button type="button" id="btn-toggle-manual-url" onclick="toggleManualImageUrl()" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; text-decoration:underline; cursor:pointer; padding:0;">O introducir URL externa</button>
            </div>
            <div id="ev-image-manual-wrap" style="display:none; margin-top:0.35rem;">
              <input type="url" id="ev-image-url-manual" class="event-input" placeholder="https://ejemplo.com/cartel.jpg" oninput="handleManualImageUrl(this.value)" style="font-size:0.85rem;">
            </div>

            <!-- Aviso informativo de imagen de origen -->
            <div id="ev-source-image-notice" style="display:none; margin-top:0.6rem; padding:0.65rem 0.85rem; background:#fffbeb; border:1px solid var(--amber-border); border-radius:8px;">
              <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                <span style="font-size:1.1rem;">⚠️</span>
                <div style="font-size:0.75rem; color:var(--amber-text); line-height:1.4;">
                  <strong>Imagen de origen detectada:</strong> La fuente oficial incluye una imagen (<a id="ev-source-image-link" href="#" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:700; text-decoration:underline;">Ver imagen original de origen ↗</a>).
                  <br>Por política estricta de derechos, <em>no se publica automáticamente ni se usa en og:image</em>. La agenda pública mostrará el cartel de categoría por defecto salvo que subas un cartel con derechos expresamente autorizados.
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN E: DETALLES -->
          <section class="sec-details event-field-card" aria-labelledby="sec-details-title">
            <div class="event-field-header">
              <span id="sec-details-title" class="event-section-label">📝 Detalles y Precio</span>
            </div>

            <div class="form-group">
              <label for="ev-description" style="font-weight:700; color:var(--text-main);">Descripción</label>
              <textarea id="ev-description" class="event-textarea" placeholder="Detalles de la actuación, artistas, programa, horarios específicos o información relevante..." oninput="markFormDirty()"></textarea>
            </div>

            <!-- Selector de Precio -->
            <div class="form-group">
              <label style="font-weight:700; color:var(--text-main); display:block; margin-bottom:0.35rem;">Precio de entrada *</label>
              <div class="price-type-toggle">
                <button type="button" id="btn-price-free" class="price-type-btn" onclick="setPriceType('free')">
                  Gratis (Entrada libre)
                </button>
                <button type="button" id="btn-price-paid" class="price-type-btn" onclick="setPriceType('paid')">
                  💶 De pago
                </button>
              </div>
              <input type="hidden" id="ev-is-free" value="">

              <div id="ev-price-hint" style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
                Selecciona Gratis o De pago.
              </div>

              <div id="ev-price-input-wrap" style="display:none; margin-top:0.5rem;">
                <div style="position:relative; max-width:220px;">
                  <input type="text" id="ev-price-euros" class="event-input" placeholder="0,00" style="padding-right:2rem; font-weight:700;" oninput="markFormDirty()">
                  <span style="position:absolute; right:0.75rem; top:50%; transform:translateY(-50%); color:var(--text-muted); font-weight:700;">€</span>
                </div>
                <small style="font-size:0.75rem; color:var(--text-muted); display:block; margin-top:0.25rem;">
                  Admite coma o punto (ej. 15,50 €). Debe ser mayor que cero.
                </small>
              </div>
            </div>
          </section>

          <!-- SECCIÓN F: FUENTE -->
          <section class="sec-source event-field-card" aria-labelledby="sec-source-title">
            <div class="event-field-header">
              <span id="sec-source-title" class="event-section-label">🔗 Fuente y Procedencia</span>
            </div>

            <!-- Badge de procedencia -->
            <div id="ev-source-provenance-box" style="display:none; margin-bottom:0.75rem; padding:0.6rem 0.75rem; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
                <div style="display:flex; align-items:center; gap:0.4rem;">
                  <span style="font-size:1.1rem;">🏛️</span>
                  <span id="ev-source-type-badge" style="font-size:0.75rem; font-weight:700; color:#0369a1;">Origen: Manual</span>
                </div>
                <a id="ev-source-provenance-link" href="#" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:#0284c7; font-weight:700; text-decoration:underline;">Abrir fuente oficial ↗</a>
              </div>
            </div>

            <div class="form-group">
              <label for="ev-source-url" style="font-weight:700; color:var(--text-main);">URL de la fuente oficial o publicación</label>
              <input type="url" id="ev-source-url" class="event-input" placeholder="https://instagram.com/p/... o página oficial de federación/teatro" oninput="markFormDirty()">
              <small style="font-size:0.75rem; color:var(--text-muted);">Enlace a la publicación original, cartelera oficial, acta federativa o programación cultural.</small>
            </div>
          </section>

          <!-- SECCIÓN G: OPCIONES AVANZADAS -->
          <section class="sec-advanced">
            <details class="advanced-accordion" id="ev-advanced-details">
              <summary>
                <span>⚙️</span>
                <span>Opciones avanzadas (Jornada editorial y zona horaria)</span>
              </summary>
              <div class="advanced-accordion-content">
                <div class="form-group">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                    <label for="ev-editorial-date" style="font-weight:700; color:var(--text-main); font-size:0.8125rem;">Fecha editorial asignada (YYYY-MM-DD)</label>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                      <span id="ev-manual-override-tag" style="display:none; font-size:0.72rem; font-weight:700; color:var(--amber-text); background:var(--amber-bg); border:1px solid var(--amber-border); padding:0.1rem 0.4rem; border-radius:4px;">⚠️ Ajuste manual</span>
                      <button type="button" id="btn-reset-editorial-date" style="display:none; font-size:0.75rem; background:none; border:none; cursor:pointer;" class="btn-sm btn-link" onclick="resetToAutoEditorialDate()">Volver a auto</button>
                    </div>
                  </div>
                  <input type="date" id="ev-editorial-date" class="event-input" oninput="onManualEditorialDateChange()">
                  <small id="ev-editorial-date-hint" style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:0.25rem;">
                    Por defecto se calcula con frontera a las 06:00 en Europe/Madrid.
                  </small>
                </div>

                <div style="font-size:0.75rem; color:var(--text-dim); background:#f8fafc; border:1px solid var(--border); border-radius:6px; padding:0.6rem 0.75rem; line-height:1.4;">
                  🌐 <strong>Zona horaria de la agenda:</strong> <code>Europe/Madrid</code> (fija por contrato editorial). Todos los cálculos de cambio de hora y frontera de madrugada operan sobre esta zona horaria.
                </div>
              </div>
            </details>
          </section>

        </div>

        <!-- Pie de Acciones Persistente -->
        <footer class="modal-event-footer">
          <div class="modal-event-footer-left">
            <button type="button" class="btn-secondary" onclick="requestCloseEventModal()">Cancelar</button>
          </div>
          <div class="modal-event-footer-right">
            <!-- Botones en Modo Creación -->
            <div id="modal-event-create-actions" style="display:flex; gap:0.6rem;">
              <button type="button" class="btn-secondary" id="btn-save-draft" onclick="submitEventForm('tentative')">Guardar borrador</button>
              <button type="button" class="btn-primary" id="btn-publish-event" onclick="submitEventForm('published')">Publicar</button>
            </div>
            <!-- Botones en Modo Edición -->
            <div id="modal-event-edit-actions" style="display:none; gap:0.6rem; align-items:center; flex-wrap:wrap;">
              <div id="modal-event-secondary-status-btns" style="display:inline-flex; gap:0.5rem;"></div>
              <button type="button" class="btn-primary" id="btn-save-event-changes" onclick="submitEventForm()">Guardar cambios</button>
            </div>
          </div>
        </footer>

      </form>
    </div>
  </div>

  <!-- MODAL: MÉTRICAS DE EVENTO (TEMA CLARO) -->
  <div id="modal-metrics" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-metrics-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Métricas de Conversión</h3>
        <button class="modal-close" onclick="closeModal('modal-metrics')" aria-label="Cerrar modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="metrics-stats">
          <div class="metric-box">
            <div class="metric-value" id="m-impressions">0</div>
            <div class="metric-lbl">Impresiones</div>
          </div>
          <div class="metric-box">
            <div class="metric-value" id="m-maps">0</div>
            <div class="metric-lbl">Cómo llegar</div>
          </div>
          <div class="metric-box">
            <div class="metric-value" id="m-tickets">0</div>
            <div class="metric-lbl">Entradas / Web</div>
          </div>
          <div class="metric-box">
            <div class="metric-value" id="m-whatsapp">0</div>
            <div class="metric-lbl">WhatsApp</div>
          </div>
        </div>

        <div style="background:var(--bg-subtle); padding:0.875rem 1rem; border-radius:8px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.875rem;">
            <span style="color:var(--text-dim); font-weight:600;">Sesiones Únicas Anónimas:</span>
            <strong id="m-sessions" style="color:var(--emerald); font-size:1.1rem;">0</strong>
          </div>
        </div>

        <div style="font-weight:700; font-size:0.8125rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-top:0.25rem;">
          Desglose de Interacciones por Canal
        </div>

        <div class="table-container" style="max-height:240px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Acción</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody id="metrics-breakdown-tbody">
              <tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:1rem;">Cargando desglose...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-primary" onclick="closeModal('modal-metrics')">Cerrar</button>
      </div>
    </div>
  </div>

    <!-- MODAL: REASIGNACIÓN RÁPIDA DE LOCAL CON FILTRO DE ZONAS (TEMA CLARO) -->
  <div id="modal-reassign-venue" class="modal-overlay">
    <div class="modal-card" style="max-width: 650px;">
      <div class="modal-header">
        <h3 id="modal-reassign-title" style="color:var(--text-main); font-weight:800;">Asignar Local del Censo</h3>
        <button class="modal-close" onclick="closeModal('modal-reassign-venue')" aria-label="Cerrar modal">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="reassign-event-id">
        <div id="reassign-event-info" style="background:var(--bg-subtle); padding:0.85rem 1rem; border-radius:8px; border:1px solid var(--border); margin-bottom:0.75rem; font-size:0.875rem;">
        </div>

        <!-- Filtro por Zonas (Pills interactivas que mapean directamente a v.zone) -->
        <div class="form-group" style="margin-bottom:0.75rem;">
          <label style="color:var(--text-muted); font-weight:700;">Filtrar por Zona del Censo</label>
          <div class="zone-pills-container" id="reassign-zone-pills">
            <button type="button" class="zone-pill-btn active" data-zone="" onclick="setReassignZone('')">Todas las zonas</button>
            <button type="button" class="zone-pill-btn" data-zone="centro_puebla" onclick="setReassignZone('centro_puebla')">Centro / Puebla</button>
            <button type="button" class="zone-pill-btn" data-zone="seminario" onclick="setReassignZone('seminario')">Seminario</button>
            <button type="button" class="zone-pill-btn" data-zone="salon" onclick="setReassignZone('salon')">El Salón</button>
            <button type="button" class="zone-pill-btn" data-zone="otros" onclick="setReassignZone('otros')">Otros recintos</button>
          </div>
          <input type="hidden" id="reassign-filter-zone" value="">
        </div>

        <div class="form-grid two-cols" style="margin-bottom:0.75rem;">
          <div class="form-group">
            <label style="color:var(--text-muted); font-weight:700;">Buscar local por nombre</label>
            <input type="text" id="reassign-search" placeholder="Ej: Teatro Principal, Bar Alaska..." oninput="filterReassignVenues()">
          </div>
          <div class="form-group">
            <label style="color:var(--text-muted); font-weight:700;">Filtrar por Categoría</label>
            <select id="reassign-filter-category" onchange="filterReassignVenues()">
              ${renderVenueCategorySelectOptions('Todas las categorías')}
            </select>
          </div>
        </div>

        <div style="font-size:0.8125rem; color:var(--text-dim); margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
          <span>Selecciona un local del censo:</span>
          <span id="reassign-results-count">Cargando locales...</span>
        </div>

        <div id="reassign-venues-list" style="max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-surface);">
        </div>

        <div id="reassign-selected-preview" style="display:none; margin-top:0.75rem; padding:0.875rem; background:var(--primary-soft); border:1px solid #d8b4fe; border-radius:8px;">
          <div style="font-size:0.75rem; text-transform:uppercase; color:var(--primary); font-weight:800;">Local Seleccionado para Asignar:</div>
          <div id="reassign-preview-name" style="font-size:1rem; font-weight:800; color:var(--text-main); margin-top:0.25rem;"></div>
          <div id="reassign-preview-address" style="font-size:0.8125rem; color:var(--text-muted); margin-top:0.25rem;"></div>
          <div id="reassign-preview-meta" style="font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;"></div>
        </div>
        <input type="hidden" id="reassign-selected-id">
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.75rem; color:var(--text-dim);">⚠️ Asigna el local sin publicar automáticamente.</span>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-reassign-venue')">Cancelar</button>
          <button type="button" id="btn-save-reassign" class="btn-primary" disabled onclick="saveReassignVenue()">Guardar Asignación</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: NUEVO / EDITAR LOCAL (TEMA CLARO) -->
  <div id="modal-venue" class="modal-overlay">
    <div class="modal-card" style="max-width: 640px;">
      <div class="modal-header">
        <h3 id="modal-venue-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nuevo Local</h3>
        <button class="modal-close" onclick="closeModal('modal-venue')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-venue" onsubmit="saveVenue(event)">
        <div class="modal-body">
          <input type="hidden" id="venue-id">

          <!-- Banner de error accesible -->
          <div id="venue-form-error" role="alert" style="display:none; padding:0.65rem 0.85rem; border-radius:8px; background:#fef2f2; border:1px solid #fecaca; color:var(--red); font-size:0.8125rem; font-weight:600; margin-bottom:1rem;"></div>

          <!-- SECCIÓN 1: IDENTIDAD -->
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin-bottom:0.65rem; border-bottom:1px solid var(--border); padding-bottom:0.25rem;">Identidad</div>

          <div class="form-group">
            <label for="venue-name" style="font-weight:700; color:var(--text-main);">Nombre del local *</label>
            <input type="text" id="venue-name" required placeholder="Ej: Bar Central">
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="venue-slug" style="font-weight:700; color:var(--text-main);">Slug (identificador URL)</label>
              <input type="text" id="venue-slug" placeholder="bar-central (generado si se vacía)">
            </div>
            <div class="form-group">
              <label for="venue-category" style="font-weight:700; color:var(--text-main);">Categoría</label>
              <select id="venue-category" aria-label="Categoría del local">
                ${renderVenueCategorySelectOptions('— Selecciona una categoría —')}
              </select>
            </div>
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem; align-items:center;">
            <div class="form-group">
              <label for="venue-zone" style="font-weight:700; color:var(--text-main);">Zona</label>
              <input type="text" id="venue-zone" placeholder="Ej: centro_puebla, seminario, salon, otros">
            </div>
            <div class="form-group" style="padding-top:1.25rem;">
              <label class="checkbox-label" style="display:inline-flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:700; color:var(--text-main);">
                <input type="checkbox" id="venue-is-active" style="width:1.15rem; height:1.15rem; accent-color:var(--primary); cursor:pointer;">
                <span>Local activo en catálogo</span>
              </label>
            </div>
          </div>

          <!-- SECCIÓN 2: UBICACIÓN -->
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin-top:1.25rem; margin-bottom:0.65rem; border-bottom:1px solid var(--border); padding-bottom:0.25rem;">Ubicación</div>

          <div class="form-group">
            <label for="venue-address" style="font-weight:700; color:var(--text-main);">Dirección</label>
            <input type="text" id="venue-address" placeholder="Calle Mayor 12, 34001 Palencia">
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="venue-latitude" style="font-weight:700; color:var(--text-main);">Latitud</label>
              <input type="number" step="any" id="venue-latitude" placeholder="Ej: 42.0085587">
            </div>
            <div class="form-group">
              <label for="venue-longitude" style="font-weight:700; color:var(--text-main);">Longitud</label>
              <input type="number" step="any" id="venue-longitude" placeholder="Ej: -4.5295375">
            </div>
          </div>

          <div class="form-group">
            <label for="venue-maps-url" style="font-weight:700; color:var(--text-main);">Enlace Google Maps</label>
            <input type="url" id="venue-maps-url" placeholder="https://maps.google.com/?cid=...">
          </div>

          <!-- SECCIÓN 3: CONTACTO -->
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin-top:1.25rem; margin-bottom:0.65rem; border-bottom:1px solid var(--border); padding-bottom:0.25rem;">Contacto</div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="venue-phone" style="font-weight:700; color:var(--text-main);">Teléfono</label>
              <input type="tel" id="venue-phone" placeholder="Ej: +34 979 12 34 56">
            </div>
            <div class="form-group">
              <label for="venue-whatsapp" style="font-weight:700; color:var(--text-main);">WhatsApp de contacto</label>
              <input type="tel" id="venue-whatsapp" placeholder="Ej: +34 600 11 22 33">
            </div>
          </div>

          <!-- SECCIÓN 4: WEB Y REDES OFICIALES -->
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin-top:1.25rem; margin-bottom:0.65rem; border-bottom:1px solid var(--border); padding-bottom:0.25rem;">Web y Redes Oficiales</div>

          <div class="form-group">
            <label for="venue-website" style="font-weight:700; color:var(--text-main);">Sitio Web Oficial</label>
            <input type="url" id="venue-website" placeholder="https://www.barcentral.com (solo web oficial, no redes)">
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="venue-instagram" style="font-weight:700; color:var(--text-main);">Instagram</label>
              <input type="text" id="venue-instagram" placeholder="barcentral (usuario sin @)">
            </div>
            <div class="form-group">
              <label for="venue-facebook" style="font-weight:700; color:var(--text-main);">Página de Facebook</label>
              <input type="url" id="venue-facebook" placeholder="https://www.facebook.com/barcentral">
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-venue')">Cancelar</button>
          <button type="submit" id="btn-save-venue" class="btn-primary">Guardar Local</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ELIMINAR LOCAL (BORRADO SEGURO CON COMPROBACIÓN DE DEPENDENCIAS) -->
  <div id="modal-delete-venue" class="modal-overlay">
    <div class="modal-card" style="max-width: 520px;">
      <div class="modal-header">
        <h3 id="modal-delete-venue-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Eliminar Local</h3>
        <button class="modal-close" onclick="closeModal('modal-delete-venue')" aria-label="Cerrar modal">✕</button>
      </div>
      <div id="modal-delete-venue-error" role="alert" style="display:none; margin: 1rem 1.5rem 0 1.5rem; padding: 0.75rem 1rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 0.875rem; line-height: 1.4;"></div>
      <div class="modal-body" id="modal-delete-venue-body">
        <div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Comprobando dependencias del local...</div>
      </div>
      <div class="modal-footer" id="modal-delete-venue-footer">
        <button type="button" class="btn-secondary" onclick="closeModal('modal-delete-venue')">Cancelar</button>
        <button type="button" id="btn-confirm-delete-venue" class="btn-primary" style="background:var(--red); border-color:#dc2626; display:none;" onclick="executeDeleteVenue()">Eliminar definitivamente</button>
      </div>
    </div>
  </div>

  <!-- MODAL: NUEVA / EDITAR RECURRENCIA (TEMA CLARO) -->
  <div id="modal-recurrence" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-recurrence-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nueva Recurrencia Semanal</h3>
        <button class="modal-close" onclick="closeModal('modal-recurrence')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-recurrence" onsubmit="saveRecurrence(event)">
        <div class="modal-body">
          <input type="hidden" id="rec-id">

          <div class="form-group">
            <label for="rec-title" style="font-weight:700; color:var(--text-main);">Título de la actividad *</label>
            <input type="text" id="rec-title" required placeholder="Ej: Tardeo Indie">
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="rec-venue-id" style="font-weight:700; color:var(--text-main);">Local *</label>
              <select id="rec-venue-id" required></select>
            </div>
            <div class="form-group">
              <label for="rec-dow" style="font-weight:700; color:var(--text-main);">Día de la semana *</label>
              <select id="rec-dow" required>
                <option value="5">Viernes</option>
                <option value="6">Sábado</option>
                <option value="0">Domingo</option>
                <option value="4">Jueves</option>
                <option value="3">Miércoles</option>
                <option value="2">Martes</option>
                <option value="1">Lunes</option>
              </select>
            </div>
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="rec-start-time" style="font-weight:700; color:var(--text-main);">Hora de inicio *</label>
              <input type="time" id="rec-start-time" required value="18:00">
            </div>
            <div class="form-group">
              <label for="rec-end-time" style="font-weight:700; color:var(--text-main);">Hora de fin</label>
              <input type="time" id="rec-end-time" value="22:00">
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-recurrence')">Cancelar</button>
          <button type="submit" id="btn-save-recurrence" class="btn-primary">Guardar Recurrencia</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EXCEPCIÓN DE RECURRENCIA (TEMA CLARO) -->
  <div id="modal-exception" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-exception-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Excepción Puntual de Recurrencia</h3>
        <button class="modal-close" onclick="closeModal('modal-exception')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-exception" onsubmit="saveException(event)">
        <div class="modal-body">
          <input type="hidden" id="exc-rec-id">

          <div class="form-group">
            <label for="exc-date" style="font-weight:700; color:var(--text-main);">Fecha de la excepción (YYYY-MM-DD) *</label>
            <input type="date" id="exc-date" required>
          </div>

          <div class="form-group" style="margin-top:0.75rem;">
            <label for="exc-reason" style="font-weight:700; color:var(--text-main);">Motivo *</label>
            <input type="text" id="exc-reason" required value="Cancelación puntual por festivo" placeholder="Ej: Cancelación puntual por festivo">
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-exception')">Cancelar</button>
          <button type="submit" id="btn-save-exception" class="btn-primary">Registrar Excepción</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: LUGAR PERMANENTE (TEMA CLARO) -->
  <div id="modal-place" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-place-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nuevo Lugar Permanente</h3>
        <button class="modal-close" onclick="closeModal('modal-place')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-place" onsubmit="savePlace(event)">
        <div class="modal-body" style="padding: 1.25rem; display:flex; flex-direction:column; gap:0.875rem;">
          <input type="hidden" id="place-id">
          <div class="form-group">
            <label for="place-name" style="font-weight:700; color:var(--text-main);">Nombre del lugar *</label>
            <input type="text" id="place-name" required placeholder="Ej: Cine Ortega">
          </div>
          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="place-category" style="font-weight:700; color:var(--text-main);">Categoría *</label>
              <select id="place-category" required>
                <option value="cine">Cine</option>
                <option value="teatro">Teatro</option>
                <option value="exposicion">Exposición</option>
                <option value="cultura">Cultura</option>
                <option value="museo">Museo</option>
                <option value="monumento">Monumento</option>
                <option value="sala_conciertos">Sala de conciertos</option>
                <option value="ocio">Ocio</option>
              </select>
            </div>
            <div class="form-group">
              <label for="place-highlight" style="font-weight:700; color:var(--text-main);">Texto destacado *</label>
              <input type="text" id="place-highlight" required placeholder="Ej: Salas históricas de estreno">
            </div>
          </div>
          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="place-hours" style="font-weight:700; color:var(--text-main);">Horario</label>
              <input type="text" id="place-hours" placeholder="Miércoles a Domingo de 17:00 a 22:30">
            </div>
            <div class="form-group">
              <label for="place-price" style="font-weight:700; color:var(--text-main);">Precio orientativo</label>
              <input type="text" id="place-price" placeholder="6,50 € / 8,00 €">
            </div>
          </div>
          <div class="form-group">
            <label for="place-maps-url" style="font-weight:700; color:var(--text-main);">Enlace Google Maps</label>
            <input type="url" id="place-maps-url" placeholder="https://maps.google.com/?cid=...">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-place')">Cancelar</button>
          <button type="submit" id="btn-save-place" class="btn-primary">Guardar Lugar</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: NUEVO QR ALOJAMIENTO (TEMA CLARO) -->
  <div id="modal-qr" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-qr-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nuevo QR para Alojamiento</h3>
        <button class="modal-close" onclick="closeModal('modal-qr')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-qr" onsubmit="saveQrSource(event)">
        <div class="modal-body" style="padding: 1.25rem; display:flex; flex-direction:column; gap:0.875rem;">
          <div class="form-group">
            <label for="qr-name" style="font-weight:700; color:var(--text-main);">Nombre del hotel / alojamiento *</label>
            <input type="text" id="qr-name" required placeholder="Ej: Hotel San Antolín">
          </div>
          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="qr-type" style="font-weight:700; color:var(--text-main);">Tipo de establecimiento</label>
              <select id="qr-type">
                <option value="hotel">Hotel</option>
                <option value="apartamento">Apartamento turístico</option>
                <option value="hostal">Hostal</option>
                <option value="casa_rural">Casa rural</option>
              </select>
            </div>
            <div class="form-group">
              <label for="qr-code-input" style="font-weight:700; color:var(--text-main);">Código identificador (Opcional)</label>
              <input type="text" id="qr-code-input" placeholder="palencia-hotel-san-antolin">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-qr')">Cancelar</button>
          <button type="submit" id="btn-save-qr" class="btn-primary">Generar QR</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL NUEVA PROMOCIÓN (TEMA CLARO - CONTROL DE VIGENCIA) -->
  <div id="modal-promotion" class="modal-overlay">
    <div class="modal-card" style="max-width: 620px;">
      <div class="modal-header">
        <h3 id="modal-promo-title" style="color:var(--text-main); font-weight:800;">Nueva Promoción Comercial</h3>
        <button class="modal-close" onclick="closeModal('modal-promotion')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-promotion" onsubmit="submitPromotion(event)">
        <div class="modal-body">
          <div class="form-group" style="margin-bottom: 0.875rem;">
            <label for="promo-event-id" style="font-weight:700; color:var(--text-main);">Evento Publicado del Catálogo *</label>
            <select id="promo-event-id" required onchange="onPromoEventSelected()">
              <option value="">Selecciona un evento...</option>
            </select>
          </div>

          <!-- Referencia informativa del evento -->
          <div id="promo-event-reference" style="display:none; background:var(--bg-subtle); padding:0.75rem 1rem; border-radius:8px; border:1px solid var(--border); margin-bottom: 0.875rem;"></div>

          <!-- Alerta de Escasez / Conflicto preventivo -->
          <div id="promo-conflict-alert" style="display:none; padding: 0.75rem; border-radius: 8px; background: #fffbeb; border: 1px solid #f59e0b; color: #92400e; font-size: 0.8125rem; margin-bottom: 0.875rem;"></div>

          <!-- Bloque de Vigencia de Campaña Comercial -->
          <div style="background:var(--bg-subtle); border:1px solid var(--border); border-radius:10px; padding:1rem; margin-bottom:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.625rem;">
              <span style="font-size:0.8125rem; font-weight:800; text-transform:uppercase; color:var(--primary);">Vigencia de la Campaña Comercial</span>
              <span style="font-size:0.75rem; color:var(--text-dim); background:#ffffff; border:1px solid var(--border); padding:0.15rem 0.5rem; border-radius:9999px;">🌐 Europe/Madrid</span>
            </div>

            <div class="form-group" style="margin-bottom:0.75rem;">
              <label for="promo-status" style="font-weight:600; font-size:0.8125rem; color:var(--text-muted);">Modalidad de activación</label>
              <select id="promo-status" onchange="onPromoStatusChanged()">
                <option value="active">Activa (visible desde su activación inmediata)</option>
                <option value="scheduled">Programada (visible en fecha y hora futura)</option>
              </select>
              <div id="promo-scheduled-hint" style="display:none; font-size:0.75rem; color:var(--text-muted); margin-top:0.35rem; background:#eff6ff; padding:0.4rem 0.6rem; border-radius:6px; border:1px solid #bfdbfe;">
                ℹ️ <strong>Campaña programada:</strong> no será visible en la plataforma pública hasta la fecha y hora de inicio fijadas.
              </div>
            </div>

            <div class="form-grid two-cols" style="gap:0.75rem;">
              <div class="form-group">
                <label for="promo-starts-at" style="font-weight:600; font-size:0.8125rem; color:var(--text-muted);">Visible desde *</label>
                <input type="datetime-local" id="promo-starts-at" required oninput="onUserModifiedStartsAt()">
                <small style="font-size:0.6875rem; color:var(--text-dim); display:block; margin-top:0.25rem;">Inicio de campaña en portada</small>
              </div>
              <div class="form-group">
                <label for="promo-ends-at" style="font-weight:600; font-size:0.8125rem; color:var(--text-muted);">Visible hasta *</label>
                <input type="datetime-local" id="promo-ends-at" required oninput="onUserModifiedEndsAt()">
                <small id="promo-ends-at-hint" style="font-size:0.6875rem; color:var(--text-dim); display:block; margin-top:0.25rem;">Fin de campaña en portada</small>
              </div>
            </div>
          </div>

          <!-- Bloque Comercial -->
          <div class="form-row" style="display:flex; gap:1rem;">
            <div class="form-group" style="flex:1;">
              <label for="promo-price-euros" style="font-weight:700; color:var(--text-main);">Precio comercial de campaña (€) *</label>
              <input type="number" step="0.01" id="promo-price-euros" value="19.00" required min="0">
              <small style="font-size:0.6875rem; color:var(--text-dim);">Tarifa estándar: 19,00 € por día reservado</small>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-promotion')">Cancelar</button>
          <button type="submit" id="btn-save-promo" class="btn-primary">Guardar Promoción</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL INFORME POST-EVENTO (TEMA CLARO) -->
  <div id="modal-promotion-report" class="modal-overlay">
    <div class="modal-card" style="max-width: 680px;">
      <div class="modal-header">
        <h3 id="modal-report-title" style="color:var(--text-main); font-weight:800;">Informe Post-Evento</h3>
        <button class="modal-close" onclick="closeModal('modal-promotion-report')" aria-label="Cerrar informe">✕</button>
      </div>
      <div class="modal-body">
        <div id="report-summary-box" style="background:var(--bg-subtle); padding:0.875rem; border-radius:8px; margin-bottom:1rem; border:1px solid var(--border);">
          <!-- Info básica del evento cargada por JS -->
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <h4 style="font-size:0.8125rem; text-transform:uppercase; color:var(--primary); font-weight:800; margin:0;">Métricas Atribuidas a la Campaña (starts_at a ends_at)</h4>
          <span style="font-size:0.6875rem; color:var(--text-dim);">Filtradas por ventana de campaña</span>
        </div>
        <div class="metrics-grid" id="report-metrics-grid">
          <!-- Métricas de la promoción cargadas dinámicamente -->
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; margin-bottom:0.5rem;">
          <h4 style="font-size:0.8125rem; text-transform:uppercase; color:var(--text-muted); font-weight:800; margin:0;">Métricas Globales Acumuladas del Evento</h4>
          <span style="font-size:0.6875rem; color:var(--text-dim);">Ciclo de vida completo del evento</span>
        </div>
        <div class="metrics-grid" id="report-event-metrics-grid">
          <!-- Métricas globales del evento cargadas dinámicamente -->
        </div>

        <div style="background:#f1f5f9; padding:0.625rem 0.75rem; border-radius:6px; font-size:0.6875rem; color:var(--text-dim); margin-bottom:0.875rem; line-height:1.4;">
          ℹ️ <strong>Definición técnica de métricas:</strong> "Aperturas de ficha" mide usuarios que abrieron los detalles del evento promocionado (no impresiones en hero de portada). Las "sesiones únicas" corresponden a identificadores de sesión distintos, sin garantizar personas físicas únicas ni asistencia al recinto.
        </div>

        <h4 style="font-size:0.8125rem; text-transform:uppercase; color:var(--text-muted); font-weight:700; margin-bottom:0.35rem;">Formato WhatsApp para el Hostelero</h4>
        <textarea id="report-whatsapp-textarea" rows="6" readonly style="width:100%; background:var(--bg-subtle); color:var(--text-main); border:1px solid var(--border); border-radius:6px; padding:0.5rem; font-size:0.8125rem; font-family:monospace; resize:vertical;"></textarea>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
        <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-promotion-report')">Cerrar</button>
        <button type="button" class="btn-primary" onclick="copyReportText()">📋 Copiar para WhatsApp</button>
      </div>
    </div>
  </div>

  <!-- MODAL: CREACIÓN Y EDICIÓN DE RUTA GASTRONÓMICA -->
  <div id="modal-route" class="modal-overlay" onclick="if(event.target===this)closeModal('modal-route')">
    <div class="modal-card modal-card-large" role="dialog" aria-modal="true" aria-labelledby="modal-route-title" style="max-width:850px; width:95%; max-height:90vh; display:flex; flex-direction:column; overflow:hidden;" onclick="event.stopPropagation()">
      <div class="modal-header" style="flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <h3 id="modal-route-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nueva Ruta Gastronómica</h3>
          <span id="modal-route-status-badge" style="display:none;"></span>
        </div>
        <button type="button" class="modal-close" onclick="closeModal('modal-route')" aria-label="Cerrar modal">✕</button>
      </div>

      <!-- Pestañas internas del modal: Datos Generales vs Locales Participantes -->
      <div id="modal-route-tabs" style="display:flex; border-bottom:1px solid var(--border); background:var(--bg-subtle); padding:0 1rem; flex-shrink:0;">
        <button type="button" id="tab-btn-route-data" class="tab-btn active" onclick="switchRouteModalTab('data')" style="padding:0.75rem 1rem; border:none; background:none; font-weight:700; color:var(--primary); border-bottom:2px solid var(--primary); cursor:pointer;">1. Datos de la Ruta</button>
        <button type="button" id="tab-btn-route-participants" class="tab-btn" onclick="switchRouteModalTab('participants')" style="display:none; padding:0.75rem 1rem; border:none; background:none; font-weight:700; color:var(--text-muted); cursor:pointer;">2. Locales Participantes <span id="route-participants-count-tag" style="background:var(--border); padding:0.15rem 0.5rem; border-radius:10px; font-size:0.75rem;">0</span></button>
      </div>

      <div id="route-form-error" role="alert" style="display:none; margin:1rem 1.5rem 0 1.5rem; padding:0.75rem 1rem; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:0.875rem;"></div>
      <div id="route-form-success" role="status" style="display:none; margin:1rem 1.5rem 0 1.5rem; padding:0.75rem 1rem; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-size:0.875rem;"></div>

      <div class="modal-body" style="flex:1; overflow-y:auto; padding:1.25rem 1.5rem;">
        <!-- PESTAÑA A: DATOS GENERALES -->
        <form id="form-route" onsubmit="event.preventDefault(); saveRouteMetadata();">
          <input type="hidden" id="route-id">
          <div id="tab-content-route-data">
            <div class="form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-bottom:1rem;">
              <div class="form-group">
                <label for="route-city-id" style="font-weight:700; color:var(--text-main);">Ciudad *</label>
                <select id="route-city-id" required>
                  <option value="1">Palencia</option>
                </select>
              </div>
              <div class="form-group">
                <label for="route-category" style="font-weight:700; color:var(--text-main);">Categoría *</label>
                <select id="route-category" required>
                  <option value="tapas">Tapas de Autor</option>
                  <option value="bravas">Ruta de las Bravas</option>
                  <option value="puchero">Puchero y Cuchara</option>
                  <option value="reposteria">Repostería y Dulces</option>
                  <option value="vino">Vinos y Maridaje</option>
                  <option value="general">Selección Gastronómica</option>
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:1rem;">
              <label for="route-title" style="font-weight:700; color:var(--text-main);">Título de la Ruta *</label>
              <input type="text" id="route-title" required placeholder="Ej. Ruta de las Mejores Bravas de Palencia" oninput="onRouteTitleInput(this.value)">
            </div>

            <div class="form-group" style="margin-bottom:1rem;">
              <label for="route-slug" style="font-weight:700; color:var(--text-main);">Slug URL *</label>
              <input type="text" id="route-slug" required placeholder="ej. ruta-bravas-palencia">
              <small style="color:var(--text-muted); font-size:0.75rem;">Identificador único en la ciudad (letras minúsculas, números y guiones).</small>
            </div>

            <div class="form-group" style="margin-bottom:1rem;">
              <label for="route-summary" style="font-weight:700; color:var(--text-main);">Resumen Editorial *</label>
              <textarea id="route-summary" rows="2" required placeholder="Breve síntesis atractiva para el listado público..." style="width:100%; box-sizing:border-box;"></textarea>
            </div>

            <div class="form-group" style="margin-bottom:1rem;">
              <label for="route-description" style="font-weight:700; color:var(--text-main);">Descripción Detallada (Opcional)</label>
              <textarea id="route-description" rows="3" placeholder="Contexto histórico, ingredientes destacados, notas del autor..." style="width:100%; box-sizing:border-box;"></textarea>
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1rem;">
              <div class="form-group">
                <label for="route-start-date" style="font-weight:700; color:var(--text-main);">Fecha Inicio (Opcional)</label>
                <input type="date" id="route-start-date">
                <small style="color:var(--text-muted); font-size:0.75rem;">Vacío si es permanente.</small>
              </div>
              <div class="form-group">
                <label for="route-end-date" style="font-weight:700; color:var(--text-main);">Fecha Fin (Opcional)</label>
                <input type="date" id="route-end-date">
                <small style="color:var(--text-muted); font-size:0.75rem;">Vacío si es permanente.</small>
              </div>
              <div class="form-group">
                <label for="route-price-eur" style="font-weight:700; color:var(--text-main);">Precio Orientativo (€)</label>
                <input type="number" id="route-price-eur" step="0.5" min="0" placeholder="Ej. 12.50">
              </div>
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem;">
              <div class="form-group">
                <label for="route-badge-label" style="font-weight:700; color:var(--text-main);">Badge Editorial (Opcional)</label>
                <input type="text" id="route-badge-label" placeholder="Ej. Otoño 2026, Clásicos">
              </div>
              <div class="form-group">
                <label for="route-image-url" style="font-weight:700; color:var(--text-main);">URL Foto de Portada (Opcional)</label>
                <input type="url" id="route-image-url" placeholder="https://images.vayaplan.com/rutas/...">
              </div>
            </div>
          </div>
        </form>

        <!-- PESTAÑA B: LOCALES PARTICIPANTES -->
        <div id="tab-content-route-participants" style="display:none;">
          <div style="background:var(--bg-subtle); padding:1rem; border-radius:8px; border:1px solid var(--border); margin-bottom:1rem;">
            <h4 style="margin:0 0 0.5rem 0; font-size:0.95rem; font-weight:800; color:var(--text-main);">Añadir Local del Censo Activo</h4>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
              <select id="route-add-venue-select" style="flex:1; min-width:240px;" aria-label="Seleccionar local activo para añadir">
                <option value="">— Selecciona un establecimiento —</option>
              </select>
              <button type="button" class="btn-primary" onclick="addParticipantVenue()" style="padding:0.55rem 1rem;">+ Añadir a la Ruta</button>
            </div>
          </div>

          <div id="participants-container">
            <!-- Renderizado dinámico de tarjetas de participantes -->
          </div>
        </div>
      </div>

      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; flex-shrink:0;">
        <div id="modal-route-secondary-actions" style="display:flex; gap:0.5rem;">
          <!-- Botones de Publicar / Archivar cuando esté en edición -->
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-route')">Cerrar</button>
          <button type="button" id="btn-save-route-data" class="btn-primary" onclick="saveRouteMetadata()">Guardar Datos</button>
          <button type="button" id="btn-save-route-participants" class="btn-primary" style="display:none;" onclick="saveRouteParticipants()">Guardar Participantes</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: PREVIEW PÚBLICO FIEL -->
  <div id="modal-route-preview" class="modal-overlay" onclick="if(event.target===this)closeModal('modal-route-preview')">
    <div class="modal-card modal-card-large" role="dialog" aria-modal="true" aria-labelledby="modal-preview-title" style="max-width:800px; width:95%; max-height:90vh; display:flex; flex-direction:column; overflow:hidden;" onclick="event.stopPropagation()">
      <div class="modal-header" style="flex-shrink:0; background:linear-gradient(135deg, #1e1b4b, #312e81); color:#ffffff;">
        <div>
          <span style="font-size:0.75rem; font-weight:800; letter-spacing:1px; opacity:0.8; text-transform:uppercase;">Vista Previa Fiel (Contrato Público)</span>
          <h3 id="modal-preview-title" style="margin:0.25rem 0 0 0; font-size:1.25rem; font-weight:800; color:#ffffff;"></h3>
        </div>
        <button type="button" class="modal-close" onclick="closeModal('modal-route-preview')" aria-label="Cerrar vista previa" style="color:#ffffff;">✕</button>
      </div>
      <div class="modal-body" id="modal-preview-body" style="flex:1; overflow-y:auto; padding:1.5rem; background:#f8fafc;">
        <!-- Renderizado del contrato público exacto -->
      </div>
      <div class="modal-footer" style="flex-shrink:0;">
        <button type="button" class="btn-secondary" onclick="closeModal('modal-route-preview')">Cerrar Previsualización</button>
      </div>
    </div>
  </div>

  <!-- MODAL: CONFIRMACIÓN DE ARCHIVADO ACCESIBLE -->
  <div id="modal-confirm-archive-route" class="modal-overlay" onclick="if(event.target===this)closeModal('modal-confirm-archive-route')">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-archive-route-title" style="max-width:450px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h3 id="modal-archive-route-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Confirmar Archivado</h3>
        <button type="button" class="modal-close" onclick="closeModal('modal-confirm-archive-route')" aria-label="Cerrar modal">✕</button>
      </div>
      <div class="modal-body" id="modal-archive-route-body" style="padding:1.25rem; color:var(--text-main); font-size:0.95rem; line-height:1.5;">
        ¿Estás seguro de que deseas archivar esta ruta gastronómica? Dejará de mostrarse en la web pública pero sus locales y propuestas permanecerán guardados.
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" class="btn-secondary" onclick="closeModal('modal-confirm-archive-route')">Cancelar</button>
        <button type="button" id="btn-confirm-archive-route" class="btn-danger" onclick="executeArchiveRoute()">Archivar Ruta</button>
      </div>
    </div>
  </div>

  <script>
    // ==============================================================================
    // Estado y Helpers del Panel de Curación (Rediseño Shell + Curación en Tema Claro)
    // ==============================================================================
    let cachedVenues = [];
    let currentLoadedEvents = [];
    let curationSubfilter = 'tentative_all';
    let currentSection = 'inbox';
    let reassignFilterZoneValue = '';
    let reassignSelectedVenueId = null;
    let cachedPromotions = [];
    let publishedEventsCache = [];
    let currentAdminRoutes = [];
    let currentEditingRoute = null;
    let currentEditingParticipants = [];
    let routeToArchiveId = null;
    let modalRouteSaveInProgress = false;
    let isActionInProgress = false; // Guarda contra clics repetidos
    let promoSaveInProgress = false; // Guarda contra clics repetidos en guardado de promociones
    let promoUserModifiedStartsAt = false;
    let promoUserModifiedEndsAt = false;
    let adminEventsRequestId = 0;
    const eventActionsInProgress = new Set();
    let modalEventSaveInProgress = false;
    let isEventImageUploading = false;
    let modalVenueSaveInProgress = false;
    let currentEditingEvent = null;
    let editEventOrigin = 'events';
    let eventModalFormDirty = false;
    let editorialDateManualOverride = false;
    let eventImageUploadSessionId = 0;

    function formatVenueZone(zone) {
      if (!zone) return '';
      const map = {
        'centro_puebla': 'Centro / Puebla',
        'seminario': 'Seminario',
        'salon': 'El Salón',
        'otros': 'Otros recintos'
      };
      return map[zone] || zone;
    }

    function getEventStatusBadge(status) {
      if (status === 'published') return '<span class="status-pill status-published">Publicado</span>';
      if (status === 'tentative') return '<span class="status-pill status-tentative">Borrador</span>';
      if (status === 'cancelled') return '<span class="status-pill status-cancelled">Cancelado</span>';
      if (status === 'outdated') return '<span class="status-pill status-outdated">Caducado</span>';
      if (status === 'archived') return '<span class="status-pill status-archived">Archivado</span>';
      if (status === 'duplicate') return '<span class="status-pill status-duplicate">Duplicado</span>';
      return \`<span class="status-pill">\${escapeHtml(status)}</span>\`;
    }

    // Control de Drawer Móvil (con focus trap para D1-D4)
    let drawerTrapAttached = false;
    function getDrawerFocusables() {
      const drawer = document.getElementById('mobile-drawer');
      if (!drawer) return [];
      return Array.from(drawer.querySelectorAll(
        'button:not([disabled]), a[href]:not([disabled])'
      ));
    }
    function drawerTrapKeydown(e) {
      const drawer = document.getElementById('mobile-drawer');
      if (!drawer || !drawer.classList.contains('active')) return;
      if (e.key !== 'Tab') return;
      const focusables = getDrawerFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.toggleMobileDrawer = function(open) {
      const drawer = document.getElementById('mobile-drawer');
      const backdrop = document.getElementById('mobile-drawer-backdrop');
      const hamburger = document.getElementById('btn-hamburger');
      if (drawer && backdrop) {
        if (open) {
          drawer.classList.add('active');
          backdrop.classList.add('active');
          if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
          // Registrar trap solo una vez
          if (!drawerTrapAttached) {
            document.addEventListener('keydown', drawerTrapKeydown);
            drawerTrapAttached = true;
          }
          // Foco en el primer elemento interactivo del drawer
          const firstFocusable = getDrawerFocusables()[0];
          if (firstFocusable) firstFocusable.focus();
        } else {
          drawer.classList.remove('active');
          backdrop.classList.remove('active');
          if (hamburger) {
            hamburger.setAttribute('aria-expanded', 'false');
            hamburger.focus();
          }
        }
      }
    };

    function formatMadridTime(isoStr) {
      if (!isoStr) return '—';
      try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        return isoStr.slice(11, 16);
      }
    }

    function formatCategory(cat) {
      const map = {
        'musica_directo': 'Música Directo',
        'dj_tardeo': 'DJ & Tardeo',
        'monologo': 'Monólogo',
        'cine': 'Cine',
        'teatro': 'Teatro',
        'exposicion': 'Exposición',
        'cultura': 'Cultura',
        'baloncesto': 'Baloncesto',
        'futbol': 'Fútbol',
        'rugby': 'Rugby',
        'conferencia': 'Conferencia',
      };
      return map[cat] || cat;
    }

    function normalizeSearchText(str) {
      return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    }

    function getToken() {
      return localStorage.getItem('vp_admin_token') || '';
    }

    function setToken(token) {
      localStorage.setItem('vp_admin_token', token);
    }

    async function apiFetch(url, options = {}) {
      const token = getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...options.headers,
      };

      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        setToken('');
        showLogin();
        throw new Error('Sesión no autorizada o expirada.');
      }
      return res;
    }

    // ==============================================================================
    // Flujo de Autenticación
    // ==============================================================================
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        showLogin();
        return;
      }

      try {
        const res = await apiFetch('/api/v1/admin/me');
        if (res.ok) {
          const data = await res.json();
          const userEmail = data.user?.email || 'admin@vayaplan.com';
          ['current-user-email', 'sidebar-user-email', 'drawer-user-email'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = userEmail;
          });
          showDashboard();
        } else {
          showLogin();
        }
      } catch {
        showLogin();
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      const errBox = document.getElementById('login-error');
      errBox.style.display = 'none';

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/v1/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          errBox.innerText = data.message || 'Error en inicio de sesión.';
          errBox.style.display = 'block';
          return;
        }

        setToken(data.token);
        const userEmail = data.user?.email || 'admin@vayaplan.com';
          ['current-user-email', 'sidebar-user-email', 'drawer-user-email'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = userEmail;
          });
        showDashboard();
      } catch (err) {
        errBox.innerText = 'Error de conexión con el servidor.';
        errBox.style.display = 'block';
      }
    }

    async function handleLogout() {
      try {
        await apiFetch('/api/v1/admin/logout', { method: 'POST' });
      } catch {}
      setToken('');
      showLogin();
    }

    function showLogin() {
      document.getElementById('login-view').style.display = 'block';
      document.getElementById('dashboard-view').style.display = 'none';
    }

        function showDashboard() {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('dashboard-view').style.display = 'flex';
      loadVenuesCache();
      switchSection('inbox');
    }

    // ==============================================================================
    // Navegación de Secciones (Escritorio y Móvil)
    // ==============================================================================
    window.switchSection = function(section) {
      currentSection = section;
      const allSections = ['inbox', 'events', 'promotions', 'venues', 'recurrences', 'places', 'qr', 'routes'];
      allSections.forEach(s => {
        const el = document.getElementById('section-' + s);
        if (el) el.style.display = s === section ? 'block' : 'none';
      });

      // Actualizar estado activo en Sidebar Escritorio
      document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));
      const activeSidebarBtn = document.getElementById('sidebar-nav-' + section);
      if (activeSidebarBtn) activeSidebarBtn.classList.add('active');

      // Actualizar estado activo en Drawer Móvil
      document.querySelectorAll('.drawer-nav-item').forEach(btn => btn.classList.remove('active'));
      const activeDrawerBtn = document.getElementById('drawer-nav-' + section);
      if (activeDrawerBtn) activeDrawerBtn.classList.add('active');

      // Actualizar Título y Subtítulo en Topbar
      const titleEl = document.getElementById('topbar-title');
      const subtitleEl = document.getElementById('topbar-subtitle');
      if (section === 'inbox') {
        if (titleEl) titleEl.innerText = 'Bandeja de Curación';
        if (subtitleEl) subtitleEl.innerText = 'Revisión y validación de borradores antes de su publicación en la agenda';
        loadAdminInbox();
      } else if (section === 'events') {
        if (titleEl) titleEl.innerText = 'Agenda Publicada';
        if (subtitleEl) subtitleEl.innerText = 'Gestión completa de eventos, historial y archivo';
        loadAdminEvents();
      } else if (section === 'promotions') {
        if (titleEl) titleEl.innerText = 'Promociones Comerciales';
        if (subtitleEl) subtitleEl.innerText = 'Campañas destacadas vigentes y programadas';
        loadAdminPromotions();
      } else if (section === 'venues') {
        if (titleEl) titleEl.innerText = 'Censo de Locales (Venues)';
        if (subtitleEl) subtitleEl.innerText = 'Directorio de recintos, zonas y categorías';
        loadAdminVenues();
      } else if (section === 'recurrences') {
        if (titleEl) titleEl.innerText = 'Actividades Periódicas';
        if (subtitleEl) subtitleEl.innerText = 'Eventos semanales y patrones recurrentes';
        loadAdminRecurrences();
      } else if (section === 'places') {
        if (titleEl) titleEl.innerText = 'Planes Permanentes';
        if (subtitleEl) subtitleEl.innerText = 'Museos, monumentos y lugares de interés constante';
        loadAdminPlaces();
      } else if (section === 'qr') {
        if (titleEl) titleEl.innerText = 'Códigos QR y Canales';
        if (subtitleEl) subtitleEl.innerText = 'Generación de QR y analítica de fuentes físicas';
        loadAdminQr();
      } else if (section === 'routes') {
        if (titleEl) titleEl.innerText = 'Rutas Gastronómicas';
        if (subtitleEl) subtitleEl.innerText = 'Selecciones editoriales curadas de locales participantes y propuestas culinarias';
        loadAdminRoutes();
      }
    };

    window.refreshCurrentSection = function() {
      loadVenuesCache();
      updateCurationCounts();
      if (currentSection === 'inbox') {
        loadAdminInbox();
      } else if (currentSection === 'events') {
        loadAdminEvents();
      } else if (currentSection === 'promotions') {
        loadAdminPromotions();
      } else if (currentSection === 'venues') {
        loadAdminVenues();
      } else if (currentSection === 'recurrences') {
        loadAdminRecurrences();
      } else if (currentSection === 'places') {
        loadAdminPlaces();
      } else if (currentSection === 'qr') {
        loadAdminQr();
      } else if (currentSection === 'routes') {
        loadAdminRoutes();
      }
    };

    // ==============================================================================
    // Gestión de Eventos
    // ==============================================================================
    async function loadVenuesCache() {
      try {
        const res = await apiFetch('/api/v1/admin/venues?all=true');
        const data = await res.json();
        cachedVenues = data.venues || [];

        // Rellenar selects
        const selects = ['rec-venue-id'];
        selects.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.tagName === 'SELECT') {
            el.innerHTML = cachedVenues.map(v => \`<option value="\${v.id}">\${escapeHtml(v.name)}</option>\`).join('');
          }
        });
        const evVenueId = document.getElementById('ev-venue-id')?.value;
        if (evVenueId && typeof window.selectVenue === 'function') {
          window.selectVenue(evVenueId);
        }
      } catch {}
    }

        window.setCurationSubfilter = function(filter) {
      curationSubfilter = filter;

      // Actualizar pills de la Bandeja de Curación
      const inboxSubfilterBtns = [
        { id: 'inbox-subfilter-all', key: 'tentative_all' },
        { id: 'inbox-subfilter-unassigned', key: 'tentative_unassigned' },
        { id: 'inbox-subfilter-collisions', key: 'tentative_collisions' },
      ];
      inboxSubfilterBtns.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) el.classList.toggle('active', b.key === filter);
      });

      if (currentSection === 'inbox') {
        loadAdminInbox();
      } else {
        loadAdminEvents();
      }
    };

    window.onManualStatusFilterChange = function() {
      loadAdminEvents();
    };

    async function updateCurationCounts() {
      try {
        const res = await apiFetch('/api/v1/admin/events?status=tentative');
        const data = await res.json();
        const drafts = data.events || [];

        const totalTentative = drafts.length;
        const totalUnassigned = drafts.filter(e => !e.venue_id || Number(e.venue_id) === 9999).length;
        const totalCollisions = drafts.filter(e => Boolean(e.collision_alert)).length;

        // Actualizar badges en Sidebar Escritorio y Drawer Móvil
        const sidebarBadge = document.getElementById('sidebar-badge-inbox');
        if (sidebarBadge) {
          sidebarBadge.innerText = totalTentative;
          sidebarBadge.style.display = totalTentative > 0 ? 'inline-block' : 'none';
        }

        const drawerBadge = document.getElementById('drawer-badge-inbox');
        if (drawerBadge) {
          drawerBadge.innerText = totalTentative;
          drawerBadge.style.display = totalTentative > 0 ? 'inline-block' : 'none';
        }

        const mobileBadge = document.getElementById('mobile-inbox-badge');
        if (mobileBadge) {
          mobileBadge.innerText = totalTentative;
        }

        // Actualizar subfiltros de Bandeja
        const bAll = document.getElementById('inbox-badge-all');
        if (bAll) {
          bAll.innerText = totalTentative;
          bAll.style.display = totalTentative > 0 ? 'inline-block' : 'none';
        }

        const bUnassigned = document.getElementById('inbox-badge-unassigned');
        if (bUnassigned) {
          bUnassigned.innerText = totalUnassigned;
          bUnassigned.style.display = totalUnassigned > 0 ? 'inline-block' : 'none';
        }

        const bCollisions = document.getElementById('inbox-badge-collisions');
        if (bCollisions) {
          bCollisions.innerText = totalCollisions;
          bCollisions.style.display = totalCollisions > 0 ? 'inline-block' : 'none';
        }
      } catch {}
    }

    // ==============================================================================
    // BANDEJA DE CURACIÓN (INBOX ZERO & TARJETAS EN TEMA CLARO)
    // ==============================================================================
    async function loadAdminInbox() {
      const grid = document.getElementById('inbox-cards-grid');
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 2.5rem;">Cargando borradores pendientes...</div>';

      let url = '/api/v1/admin/events?status=tentative&';
      if (curationSubfilter === 'tentative_unassigned') {
        url += 'venue_id=unassigned&';
      } else if (curationSubfilter === 'tentative_collisions') {
        url += 'has_collision=true&';
      }

      try {
        const res = await apiFetch(url);
        const data = await res.json();
        const events = data.events || [];
        currentLoadedEvents = events;

        updateCurationCounts();

        // ESTADO INBOX ZERO
        if (events.length === 0) {
          grid.innerHTML = \`
            <div class="inbox-zero-card">
              <div class="inbox-zero-icon">🎉</div>
              <h3 class="inbox-zero-title">¡Bandeja al día!</h3>
              <p class="inbox-zero-desc">
                No hay eventos pendientes de revisión en esta vista. Todos los borradores han sido procesados y asignados.
              </p>
              <div class="inbox-zero-actions">
                <button class="btn-primary" onclick="switchSection('events')">Ver Agenda Publicada</button>
                <button class="btn-secondary" onclick="openNewEventModal()">+ Crear Nuevo Evento</button>
              </div>
            </div>
          \`;
          return;
        }

        // RENDERIZADO DE TARJETAS DIFERENCIADAS (TEMA CLARO)
        grid.innerHTML = events.map(e => {
          const isUnassigned = !e.venue_id || Number(e.venue_id) === 9999;
          const hasCollision = Boolean(e.collision_alert);

          let cardClass = 'inbox-card';
          if (isUnassigned) cardClass += ' card-warning';
          if (hasCollision) cardClass += ' card-collision';

          return \`
            <article class="\${cardClass}" id="inbox-card-\${e.id}">
              \${isUnassigned ? \`
                <div class="card-banner-warning">
                  <span>⚠️ Local pendiente de asignación</span>
                </div>
              \` : ''}

              \${hasCollision ? \`
                <div class="card-banner-collision">
                  <div class="collision-header-text">
                    💥 <strong>Posible colisión detectada</strong>
                  </div>
                  <div>
                    Coincide con: <em>"\${escapeHtml(e.collision_alert.colliding_title)}"</em> (\${formatMadridTime(e.collision_alert.colliding_start_time)}) — Diferencia: \${e.collision_alert.diff_minutes} min
                  </div>
                  <div class="collision-actions-row">
                    \${!isUnassigned ? \`
                      <button class="btn-card-action" style="color:var(--emerald); font-weight:700;" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar de todos modos</button>
                    \` : ''}
                    <button class="btn-card-action" onclick="markDuplicate(\${e.id})">⧉ Marcar Duplicado</button>
                    <button class="btn-card-action" onclick="editEvent(\${e.id})">✏️ Ajustar Hora</button>
                  </div>
                </div>
              \` : ''}

              <div class="card-meta-top">
                <span class="badge-category">\${formatCategory(e.category)}</span>
                \${e.time_status === 'pending_time' ? '<span class="badge-tag" style="background:#fef3c7; color:#92400e; font-size:0.7rem;">⏳ Hora pdte</span>' : ''}
                \${e.time_status === 'continuous' ? '<span class="badge-tag" style="background:#ede9fe; color:#6d28d9; font-size:0.7rem;">🏛️ Exposición</span>' : ''}
                \${e.time_status === 'tentative_date' ? '<span class="badge-tag" style="background:#f1f5f9; color:#475569; font-size:0.7rem;">📅 Borrador</span>' : ''}
                <span class="card-price">\${e.is_free ? 'Gratis' : ((e.price_cents || 0)/100).toFixed(2).replace('.', ',') + ' €'}</span>
              </div>

              <h3 class="card-title">\${escapeHtml(e.title)}</h3>

              \${e.festivals && e.festivals.length > 0 ? \`
                <div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-bottom:0.45rem;">
                  \${e.festivals.map(f => \`<span style="font-size:0.7rem; font-weight:700; background:#dbeafe; color:#1e40af; padding:0.15rem 0.45rem; border-radius:4px;">🎪 \${escapeHtml(f.name)}</span>\`).join('')}
                </div>
              \` : ''}

              <div class="card-timing">
                <span class="card-timing-item">📅 <strong>\${e.editorial_date}</strong></span>
                \${e.time_status === 'pending_time' ? \`
                  <span class="card-timing-item" style="color:#d97706; font-weight:700;">⏳ Hora pendiente</span>
                \` : e.time_status === 'continuous' ? \`
                  <span class="card-timing-item" style="color:#7c3aed; font-weight:700;">🏛️ Hasta \${e.end_date || '—'}</span>
                \` : \`
                  <span class="card-timing-item">⏰ <strong style="color:var(--primary);">\${formatMadridTime(e.start_time)}</strong></span>
                \`}
                \${e.source_url ? \`
                  <a href="\${escapeHtml(e.source_url)}" target="_blank" rel="noopener" class="card-timing-item" style="color:var(--primary); font-weight:600; text-decoration:none;">🔗 Fuente ↗</a>
                \` : \`
                  <span class="card-timing-item" style="color:var(--text-dim); font-size:0.75rem;">\${escapeHtml(e.source_type || 'manual')}</span>
                \`}
              </div>

              <div class="card-venue-box">
                <div class="card-venue-info">
                  \${isUnassigned ? \`
                    <div class="card-venue-name" style="color:var(--amber);">⚠️ Sin local verificado asignado</div>
                    <div class="card-venue-meta">Asigna un local del censo para desbloquear publicación</div>
                  \` : \`
                    <div class="card-venue-name">📍 \${escapeHtml(e.venue_name)}</div>
                    <div class="card-venue-meta">Zona: \${escapeHtml(e.venue_zone || 'otros')} • Cat: \${escapeHtml(e.venue_category || 'general')}</div>
                  \`}
                </div>
                <div>
                  <button class="\${isUnassigned ? 'btn-card-reassign' : 'btn-card-reassign-subtle'}" onclick="openReassignModal(\${e.id})" title="Asignar local del censo">
                    \${isUnassigned ? '🏢 Asignar Local' : '✏️ Cambiar'}
                  </button>
                </div>
              </div>

              <div class="card-actions-bar">
                \${isUnassigned ? \`
                  <button class="btn-card-publish-disabled" disabled title="Debes asignar un local del censo antes de publicar">
                    ✓ Publicar (Bloqueado)
                  </button>
                \` : \`
                  <button class="btn-card-publish" onclick="publishEvent(\${e.id}, \${e.venue_id})">
                    ✓ Publicar
                  </button>
                \`}
                <button class="btn-card-action" onclick="editEvent(\${e.id})" title="Editar datos">
                  ✏️ Editar
                </button>
                <button class="btn-card-action" onclick="archiveEvent(\${e.id})" title="Descartar y archivar">
                  📦 Descartar
                </button>
              </div>
            </article>
          \`;
        }).join('');
      } catch (err) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--red); padding: 2rem;">Error al cargar la bandeja de curación.</div>';
      }
    }

    async function loadAdminEvents() {
      const currentReqId = ++adminEventsRequestId;
      const tbody = document.getElementById('events-tbody');
      const cardsContainer = document.getElementById('events-cards-container');

      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando eventos...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando eventos...</div>';

      const statusEl = document.getElementById('event-filter-status');
      const dateEl = document.getElementById('event-filter-date');
      const status = statusEl ? statusEl.value : '';
      const date = dateEl ? dateEl.value : '';

      let url = '/api/v1/admin/events?';
      if (status) url += 'status=' + encodeURIComponent(status) + '&';
      if (date) url += 'date=' + encodeURIComponent(date) + '&';

      if (status === 'tentative') {
        if (curationSubfilter === 'tentative_unassigned') {
          url += 'venue_id=unassigned&';
        } else if (curationSubfilter === 'tentative_collisions') {
          url += 'has_collision=true&';
        }
      }

      try {
        const res = await apiFetch(url);
        if (currentReqId !== adminEventsRequestId) return; // Descartar respuesta obsoleta
        const data = await res.json();
        const events = data.events || [];
        currentLoadedEvents = events;

        updateCurationCounts();

        if (events.length === 0) {
          const emptyMsg = 'No se encontraron eventos con los filtros seleccionados.';
          if (tbody) tbody.innerHTML = \`<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:2.5rem 1rem;">\${emptyMsg}</td></tr>\`;
          if (cardsContainer) cardsContainer.innerHTML = \`<div style="text-align:center; color:var(--text-dim); padding:2.5rem 1rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">\${emptyMsg}</div>\`;
          return;
        }

        // Render Desktop (Tabla)
        if (tbody) {
          tbody.innerHTML = events.map(e => {
            const isTentative = e.status === 'tentative';
            const isUnassigned = !e.venue_id || Number(e.venue_id) === 9999;
            const hasCollision = Boolean(e.collision_alert);
            const statusBadge = getEventStatusBadge(e.status);

            return \`
              <tr id="event-row-\${e.id}">
                <td>\${statusBadge}</td>
                <td>
                  <div style="font-weight:700; font-size:0.9375rem; color:var(--text-main); line-height:1.35;">\${escapeHtml(e.title)}</div>
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.3rem; flex-wrap:wrap;">
                    <span class="badge-tag">\${formatCategory(e.category)}</span>
                    \${e.time_status === 'pending_time' ? '<span class="badge-tag" style="background:#fef3c7; color:#92400e;">⏳ Hora pdte</span>' : ''}
                    \${e.time_status === 'continuous' ? '<span class="badge-tag" style="background:#ede9fe; color:#6d28d9;">🏛️ Exposición</span>' : ''}
                    \${e.time_status === 'tentative_date' ? '<span class="badge-tag" style="background:#f1f5f9; color:#475569;">📅 Borrador fecha</span>' : ''}
                    \${e.festivals && e.festivals.length > 0 ? e.festivals.map(f => \`<span class="badge-tag" style="background:#dbeafe; color:#1e40af;">🎪 \${escapeHtml(f.name)}</span>\`).join('') : ''}
                  </div>
                  \${isUnassigned ? \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <span class="badge-unverified">⚠️ Local pendiente de asignación</span>
                      <button class="btn-card-reassign" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="openReassignModal(\${e.id})">🏢 Asignar Local</button>
                    </div>
                  \` : \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; font-size:0.8125rem;">
                      <span>📍 <strong>\${escapeHtml(e.venue_name || 'Sin local')}</strong></span>
                      <span class="venue-badge">Zona: \${escapeHtml(e.venue_zone || 'otros')}</span>
                      <span class="venue-badge">Cat: \${escapeHtml(e.venue_category || 'general')}</span>
                      <button class="btn-card-action" style="padding:0.15rem 0.45rem; font-size:0.6875rem;" onclick="openReassignModal(\${e.id})" title="Reasignar local">✏️ Cambiar</button>
                    </div>
                  \`}
                  \${hasCollision ? \`
                    <div class="collision-box">
                      <div class="collision-title">
                        ⚠️ <strong>Posible colisión con:</strong> "\${escapeHtml(e.collision_alert.colliding_title)}" (\${formatMadridTime(e.collision_alert.colliding_start_time)}) — Diferencia: \${e.collision_alert.diff_minutes} min
                      </div>
                      <div class="collision-actions">
                        \${!isUnassigned && isTentative ? \`
                          <button class="btn-publish-force" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar de todos modos</button>
                        \` : ''}
                        <button class="btn-table-action" onclick="archiveEvent(\${e.id})">📦 Descartar / Archivar</button>
                        <button class="btn-table-action" onclick="markDuplicate(\${e.id})">⧉ Marcar duplicado</button>
                        <button class="btn-table-action" onclick="editEvent(\${e.id})">✏️ Ajustar hora</button>
                      </div>
                    </div>
                  \` : ''}
                </td>
                <td>
                  <div>📅 <strong>\${e.editorial_date}</strong></div>
                  \${e.time_status === 'pending_time' ? \`
                    <div style="margin-top:0.25rem; font-size:0.8125rem; color:#d97706; font-weight:700;">⏳ Hora pendiente</div>
                    \${e.approximate_schedule ? \`<div style="font-size:0.7rem; color:var(--text-muted);">\${escapeHtml(e.approximate_schedule)}</div>\` : ''}
                  \` : e.time_status === 'continuous' ? \`
                    <div style="margin-top:0.25rem; font-size:0.8125rem; color:#7c3aed; font-weight:700;">🏛️ Hasta \${e.end_date || '—'}</div>
                    \${e.schedule_text ? \`<div style="font-size:0.7rem; color:var(--text-muted);">\${escapeHtml(e.schedule_text)}</div>\` : ''}
                  \` : \`
                    <div style="margin-top:0.25rem; font-size:0.8125rem;">⏰ <strong style="color:var(--primary); font-size:0.875rem;">\${formatMadridTime(e.start_time)}</strong> <span style="font-size:0.6875rem; color:var(--text-dim);">(Madrid)</span></div>
                  \`}
                </td>
                <td>
                  <strong style="font-size:0.875rem; color:var(--text-main);">\${e.is_free ? '<span style="color:var(--emerald);">Gratis</span>' : ((e.price_cents || 0) / 100).toFixed(2).replace('.', ',') + ' €'}</strong>
                </td>
                <td>
                  <div style="font-size:0.75rem; color:var(--text-muted); text-transform:capitalize;">\${escapeHtml(e.source_type || 'manual')}</div>
                  \${e.source_url ? \`<a href="\${escapeHtml(e.source_url)}" target="_blank" rel="noopener" class="link-source" style="font-size:0.75rem; color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:0.2rem; margin-top:0.25rem;">🔗 Fuente oficial ↗</a>\` : ''}
                </td>
                <td>
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">
                    \${isTentative ? \`
                      <button class="btn-table-action btn-primary-action" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar</button>
                      <button class="btn-table-action" onclick="openReassignModal(\${e.id})">🏢 Asignar</button>
                      <button class="btn-table-action" onclick="markDuplicate(\${e.id})">⧉ Duplicado</button>
                      <button class="btn-table-action" onclick="archiveEvent(\${e.id})">📦 Archivar</button>
                    \` : ''}
                    \${e.status === 'published' ? \`
                      <button class="btn-table-action btn-cancel-action" onclick="cancelEvent(\${e.id})">✕ Cancelar</button>
                      <button class="btn-table-action" onclick="archiveEvent(\${e.id})">📦 Archivar</button>
                    \` : ''}
                    <button class="btn-table-action" onclick="viewMetrics(\${e.id})" title="Ver métricas de conversión" aria-label="Ver métricas del evento #\${e.id}">📊</button>
                    <button class="btn-table-action" onclick="editEvent(\${e.id})" title="Editar evento" aria-label="Editar evento #\${e.id}">✏️</button>
                    <button class="btn-table-action btn-danger" onclick="deleteEvent(\${e.id})" title="Eliminar evento" aria-label="Eliminar evento #\${e.id}">🗑️</button>
                  </div>
                </td>
              </tr>
            \`;
          }).join('');
        }

        // Render Móvil (Tarjetas)
        if (cardsContainer) {
          cardsContainer.innerHTML = events.map(e => {
            const isTentative = e.status === 'tentative';
            const isUnassigned = !e.venue_id || Number(e.venue_id) === 9999;
            const hasCollision = Boolean(e.collision_alert);
            const statusBadge = getEventStatusBadge(e.status);

            return \`
              <div class="event-card" id="event-card-\${e.id}">
                <div class="event-card-header">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    \${statusBadge}
                    <span class="badge-tag">\${formatCategory(e.category)}</span>
                    \${e.time_status === 'pending_time' ? '<span class="badge-tag" style="background:#fef3c7; color:#92400e; font-size:0.7rem;">⏳ Hora pdte</span>' : ''}
                    \${e.time_status === 'continuous' ? '<span class="badge-tag" style="background:#ede9fe; color:#6d28d9; font-size:0.7rem;">🏛️ Exposición</span>' : ''}
                    \${e.time_status === 'tentative_date' ? '<span class="badge-tag" style="background:#f1f5f9; color:#475569; font-size:0.7rem;">📅 Borrador</span>' : ''}
                    \${e.festivals && e.festivals.length > 0 ? e.festivals.map(f => \`<span class="badge-tag" style="background:#dbeafe; color:#1e40af; font-size:0.7rem;">🎪 \${escapeHtml(f.name)}</span>\`).join('') : ''}
                    <span style="font-size:0.75rem; font-weight:700; color:var(--text-dim);">#\${e.id}</span>
                  </div>
                  <div style="font-size:0.9375rem; font-weight:800; color:var(--text-main);">
                    \${e.is_free ? '<span style="color:var(--emerald);">Gratis</span>' : ((e.price_cents || 0) / 100).toFixed(2).replace('.', ',') + ' €'}
                  </div>
                </div>

                <div>
                  <h4 class="event-card-title">\${escapeHtml(e.title)}</h4>
                  \${isUnassigned ? \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <span class="badge-unverified">⚠️ Local pendiente de asignación</span>
                      <button class="btn-card-reassign" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="openReassignModal(\${e.id})">🏢 Asignar Local</button>
                    </div>
                  \` : \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap; font-size:0.8125rem;">
                      <span>📍 <strong>\${escapeHtml(e.venue_name || 'Sin local')}</strong></span>
                      <span class="venue-badge">Zona: \${escapeHtml(e.venue_zone || 'otros')}</span>
                      <span class="venue-badge">Cat: \${escapeHtml(e.venue_category || 'general')}</span>
                      <button class="btn-card-action" style="padding:0.15rem 0.45rem; font-size:0.6875rem;" onclick="openReassignModal(\${e.id})" title="Reasignar local">✏️ Cambiar</button>
                    </div>
                  \`}
                </div>

                \${hasCollision ? \`
                  <div class="collision-box">
                    <div class="collision-title">
                      ⚠️ <strong>Posible colisión con:</strong> "\${escapeHtml(e.collision_alert.colliding_title)}" (\${formatMadridTime(e.collision_alert.colliding_start_time)}) — Diferencia: \${e.collision_alert.diff_minutes} min
                    </div>
                    <div class="collision-actions">
                      \${!isUnassigned && isTentative ? \`
                        <button class="btn-publish-force" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar de todos modos</button>
                      \` : ''}
                      <button class="btn-card-action" onclick="archiveEvent(\${e.id})">📦 Descartar / Archivar</button>
                      <button class="btn-card-action" onclick="markDuplicate(\${e.id})">⧉ Marcar duplicado</button>
                      <button class="btn-card-action" onclick="editEvent(\${e.id})">✏️ Ajustar hora</button>
                    </div>
                  </div>
                \` : ''}

                <div class="event-card-meta">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                    <div>
                      <span>📅 <strong>\${e.editorial_date}</strong></span> •
                      \${e.time_status === 'pending_time' ? \`
                        <span style="color:#d97706; font-weight:700;">⏳ Hora pendiente</span>
                      \` : e.time_status === 'continuous' ? \`
                        <span style="color:#7c3aed; font-weight:700;">🏛️ Hasta \${e.end_date || '—'}</span>
                      \` : \`
                        <span>⏰ <strong style="color:var(--primary);">\${formatMadridTime(e.start_time)}</strong> <span style="font-size:0.6875rem; color:var(--text-dim);">(Madrid)</span></span>
                      \`}
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                      Fuente: <span style="text-transform:capitalize;">\${escapeHtml(e.source_type || 'manual')}</span>
                      \${e.source_url ? \` · <a href="\${escapeHtml(e.source_url)}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">Oficial ↗</a>\` : ''}
                    </div>
                  </div>
                </div>

                <div class="event-card-actions">
                  \${isTentative ? \`
                    <button class="btn-card-publish" style="flex:1;" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar</button>
                    <button class="btn-card-reassign-subtle" style="flex:1;" onclick="openReassignModal(\${e.id})">🏢 Asignar</button>
                    <button class="btn-card-action" onclick="markDuplicate(\${e.id})" title="Marcar como duplicado">⧉ Duplicado</button>
                    <button class="btn-card-action" onclick="archiveEvent(\${e.id})" title="Archivar borrador">📦 Archivar</button>
                  \` : ''}
                  \${e.status === 'published' ? \`
                    <button class="btn-table-action btn-cancel-action" style="flex:1; justify-content:center; padding:0.45rem;" onclick="cancelEvent(\${e.id})">✕ Cancelar</button>
                    <button class="btn-card-action" onclick="archiveEvent(\${e.id})">📦 Archivar</button>
                  \` : ''}
                  <button class="btn-card-action" onclick="viewMetrics(\${e.id})" title="Métricas de conversión" aria-label="Ver métricas del evento #\${e.id}">📊</button>
                  <button class="btn-card-action" onclick="editEvent(\${e.id})" title="Editar datos" aria-label="Editar evento #\${e.id}">✏️</button>
                  <button class="btn-card-action" style="color:var(--red); border-color:#fecaca;" onclick="deleteEvent(\${e.id})" title="Eliminar definitivamente" aria-label="Eliminar evento #\${e.id}">🗑️</button>
                </div>
              </div>
            \`;
          }).join('');
        }
      } catch (err) {
        if (currentReqId !== adminEventsRequestId) return;
        const errMsg = 'Error al cargar los eventos de la agenda.';
        if (tbody) tbody.innerHTML = \`<tr><td colspan="6" style="text-align:center; color:var(--red); padding:2rem;">\${errMsg}</td></tr>\`;
        if (cardsContainer) cardsContainer.innerHTML = \`<div style="text-align:center; color:var(--red); padding:2rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">\${errMsg}</div>\`;
      }
    }

    window.publishEvent = async function(id, venueId) {
      if (eventActionsInProgress.has(id)) return;
      if (!venueId || Number(venueId) === 9999) {
        alert('No se puede publicar un evento sin local asignado. Asigna un local del censo primero.');
        return;
      }
      if (!confirm('¿Confirmar publicación del evento? Pasará a ser visible en la agenda pública.')) return;
      eventActionsInProgress.add(id);
      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}/publish\`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Error al publicar evento.');
          return;
        }
        await loadAdminEvents();
        if (currentSection === 'inbox') await loadAdminInbox();
        updateCurationCounts();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      } finally {
        eventActionsInProgress.delete(id);
      }
    };

    window.cancelEvent = async function(id) {
      if (eventActionsInProgress.has(id)) return;
      if (!confirm('¿Marcar este evento como cancelado?')) return;
      eventActionsInProgress.add(id);
      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}/cancel\`, { method: 'POST' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Error al cancelar evento.');
          return;
        }
        await loadAdminEvents();
        if (currentSection === 'inbox') await loadAdminInbox();
        updateCurationCounts();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      } finally {
        eventActionsInProgress.delete(id);
      }
    };

    window.archiveEvent = async function(id) {
      if (eventActionsInProgress.has(id)) return;
      eventActionsInProgress.add(id);
      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}/archive\`, { method: 'POST' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Error al archivar evento.');
          return;
        }
        await loadAdminEvents();
        if (currentSection === 'inbox') await loadAdminInbox();
        updateCurationCounts();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      } finally {
        eventActionsInProgress.delete(id);
      }
    };

    window.markDuplicate = async function(id) {
      if (eventActionsInProgress.has(id)) return;
      eventActionsInProgress.add(id);
      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}/duplicate\`, { method: 'POST' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Error al marcar duplicado.');
          return;
        }
        await loadAdminEvents();
        if (currentSection === 'inbox') await loadAdminInbox();
        updateCurationCounts();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      } finally {
        eventActionsInProgress.delete(id);
      }
    };

    window.deleteEvent = async function(id) {
      if (eventActionsInProgress.has(id)) return;
      if (!confirm('¿Estás seguro de eliminar este evento definitivamente?')) return;
      eventActionsInProgress.add(id);
      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}\`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Error al eliminar evento.');
          return;
        }
        await loadAdminEvents();
        if (currentSection === 'inbox') await loadAdminInbox();
        updateCurationCounts();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      } finally {
        eventActionsInProgress.delete(id);
      }
    };
    // ==============================================================================
    // Lógica del Modal de Reasignación Rápida de Local
    // ==============================================================================
        window.setReassignZone = function(zone) {
      reassignFilterZoneValue = zone;
      document.getElementById('reassign-filter-zone').value = zone;

      const pills = document.querySelectorAll('#reassign-zone-pills .zone-pill-btn');
      pills.forEach(p => {
        p.classList.toggle('active', p.dataset.zone === zone);
      });
      filterReassignVenues();
    };

    window.openReassignModal = async function(eventId) {
      let ev = currentLoadedEvents.find(e => e.id === eventId);
      if (!ev) {
        try {
          const res = await apiFetch(\`/api/v1/admin/events/\${eventId}\`);
          const data = await res.json();
          ev = data.event;
        } catch {}
      }
      if (!ev) return;

      document.getElementById('reassign-event-id').value = ev.id;
      document.getElementById('reassign-event-info').innerHTML = \`
        <div style="font-weight:700; color:#fff; font-size:1rem;">\${escapeHtml(ev.title)}</div>
        <div style="display:flex; gap:1rem; margin-top:0.35rem; color:#94a3b8; font-size:0.8125rem; flex-wrap:wrap;">
          <span>📅 Fecha: <strong>\${ev.editorial_date}</strong></span>
          <span>⏰ Hora: <strong>\${formatMadridTime(ev.start_time)}</strong></span>
          <span>Local actual: \${(!ev.venue_id || Number(ev.venue_id) === 9999) ? '<span style="color:#fbbf24; font-weight:700;">⚠️ Local pendiente de asignación</span>' : '<strong>' + escapeHtml(ev.venue_name || '') + '</strong>'}</span>
        </div>
      \`;

      document.getElementById('reassign-search').value = '';
      document.getElementById('reassign-filter-zone').value = '';
      document.getElementById('reassign-filter-category').value = '';
      reassignFilterZoneValue = '';
      document.querySelectorAll('#reassign-zone-pills .zone-pill-btn').forEach(p => {
        p.classList.toggle('active', p.dataset.zone === '');
      });
      reassignSelectedVenueId = null;
      document.getElementById('reassign-selected-id').value = '';
      document.getElementById('reassign-selected-preview').style.display = 'none';
      document.getElementById('btn-save-reassign').disabled = true;

      filterReassignVenues();
      openModal('modal-reassign-venue');
    };

    window.filterReassignVenues = function() {
      const query = normalizeSearchText(document.getElementById('reassign-search').value.trim());
      const zone = reassignFilterZoneValue || document.getElementById('reassign-filter-zone').value;
      const category = document.getElementById('reassign-filter-category').value;

      // EXCLUSIÓN ESTRICTA: El venue 9999 nunca se puede seleccionar
      const validVenues = cachedVenues.filter(v => v.id !== 9999);

      const filtered = validVenues.filter(v => {
        if (zone && v.zone !== zone) return false;
        if (category && v.category !== category) return false;
        if (query) {
          const normName = normalizeSearchText(v.name);
          const normAddress = normalizeSearchText(v.address);
          if (!normName.includes(query) && !normAddress.includes(query)) return false;
        }
        return true;
      });

      document.getElementById('reassign-results-count').innerText = \`\${filtered.length} locales disponibles\`;

      const listContainer = document.getElementById('reassign-venues-list');
      if (filtered.length === 0) {
        listContainer.innerHTML = \`
          <div style="padding:1.5rem; text-align:center; color:#94a3b8; font-size:0.875rem;">
            No se encontró ningún local con estos filtros.<br>
            <button type="button" class="btn-sm" style="margin-top:0.75rem; background:#1e3a8a; color:#93c5fd; border:1px solid #2563eb;" onclick="openNewVenueFromReassign()">+ Crear nuevo local en el censo</button>
          </div>
        \`;
        return;
      }

      listContainer.innerHTML = filtered.map(v => {
        const isSelected = reassignSelectedVenueId === v.id;
        return \`
          <button type="button" class="venue-list-item \${isSelected ? 'selected' : ''}" onclick="selectReassignVenue(\${v.id})" aria-pressed="\${isSelected ? 'true' : 'false'}">
            <div>
              <div style="font-weight:700; color:var(--text-main);">\${escapeHtml(v.name)}</div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.15rem;">📍 \${escapeHtml(v.address || 'Sin dirección')}</div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:0.25rem; align-items:flex-end;">
              <span class="venue-badge">Zona: \${escapeHtml(v.zone || 'otros')}</span>
              <span class="venue-badge">Cat: \${escapeHtml(v.category || 'general')}</span>
            </div>
          </button>
        \`;
      }).join('');
    };

    window.selectReassignVenue = function(venueId) {
      if (venueId === 9999) {
        alert('Prohibido seleccionar el local provisional 9999.');
        return;
      }
      const v = cachedVenues.find(item => item.id === venueId);
      if (!v) return;

      reassignSelectedVenueId = venueId;
      document.getElementById('reassign-selected-id').value = venueId;

      const preview = document.getElementById('reassign-selected-preview');
      preview.style.display = 'block';
      document.getElementById('reassign-preview-name').innerText = v.name;
      document.getElementById('reassign-preview-address').innerText = '📍 ' + (v.address || 'Sin dirección especificada');
      document.getElementById('reassign-preview-meta').innerText = \`Zona: \${v.zone || 'otros'} • Categoría: \${v.category || 'general'}\`;

      document.getElementById('btn-save-reassign').disabled = false;
      filterReassignVenues();
    };

    window.saveReassignVenue = async function() {
      const eventId = Number(document.getElementById('reassign-event-id').value);
      const venueId = Number(document.getElementById('reassign-selected-id').value);

      if (!venueId || venueId === 9999) {
        alert('Prohibido asignar venue provisional 9999. Selecciona un local válido del censo.');
        return;
      }

      const saveBtn = document.getElementById('btn-save-reassign');
      const cancelBtn = document.querySelector('#modal-reassign-venue .btn-logout');
      modalSaveInProgress = true;
      if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${eventId}\`, {
          method: 'PATCH',
          body: JSON.stringify({ venue_id: venueId }),
        });

        if (!res.ok) {
          const err = await res.json();
          alert(err.message || 'Error al reasignar local.');
          return;
        }

        modalSaveInProgress = false; // liberar antes de cerrar
        closeModal('modal-reassign-venue');
        await loadAdminEvents(); if (currentSection === 'inbox') await loadAdminInbox(); updateCurationCounts();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      } finally {
        // Liberar siempre: tanto en éxito, error o timeout
        modalSaveInProgress = false;
        if (saveBtn) { saveBtn.textContent = 'Guardar Asignación'; saveBtn.disabled = false; }
        if (cancelBtn) cancelBtn.disabled = false;
      }
    };

    window.openNewVenueFromReassign = function() {
      closeModal('modal-reassign-venue');
      openNewVenueModal();
    };

    // ==============================================================================
    // EDITOR DE EVENTOS (REDISEÑO AMPLIO, CLARO Y ACCESIBLE)
    // ==============================================================================

    window.markFormDirty = function() {
      eventModalFormDirty = true;
    };

    function showFormError(msg, focusElId) {
      const errBox = document.getElementById('ev-form-error');
      if (errBox) {
        errBox.innerHTML = '<strong>⚠️ Error:</strong> ' + escapeHtml(msg);
        errBox.style.display = 'block';
        errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (focusElId) {
        const el = document.getElementById(focusElId);
        if (el) el.focus();
      }
    }

    function clearFormError() {
      const errBox = document.getElementById('ev-form-error');
      if (errBox) {
        errBox.innerHTML = '';
        errBox.style.display = 'none';
      }
      const venueErr = document.getElementById('ev-venue-field-error');
      if (venueErr) {
        venueErr.innerText = '';
        venueErr.style.display = 'none';
      }
      const venueInput = document.getElementById('ev-venue-search');
      if (venueInput) {
        venueInput.style.borderColor = '';
        venueInput.removeAttribute('aria-invalid');
        venueInput.setAttribute('aria-describedby', 'ev-venue-unassigned-notice');
      }
    }

    // Cálculo y resumen de jornada editorial (Europe/Madrid)
    function computeEditorialDateFromLocal(madridLocalStr) {
      if (!madridLocalStr) return '';
      const parts = madridLocalStr.split('T');
      if (parts.length < 2) return '';
      const dateParts = parts[0].split('-').map(Number);
      const timeParts = parts[1].split(':').map(Number);
      if (dateParts.length < 3 || timeParts.length < 1) return '';
      const y = dateParts[0];
      const m = dateParts[1];
      const d = dateParts[2];
      const h = timeParts[0];
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      if (h < 6) {
        dt.setUTCDate(dt.getUTCDate() - 1);
      }
      const ry = dt.getUTCFullYear();
      const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const rd = String(dt.getUTCDate()).padStart(2, '0');
      return \`\${ry}-\${rm}-\${rd}\`;
    }

    function formatHumanEditorialSummary(editorialDateStr, madridLocalStr) {
      if (!editorialDateStr) return 'Fecha no especificada';
      const parts = editorialDateStr.split('-').map(Number);
      if (parts.length < 3) return editorialDateStr;
      const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
      let humanDate = dt.toLocaleDateString('es-ES', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      humanDate = humanDate.charAt(0).toUpperCase() + humanDate.slice(1);

      let timeNote = '';
      if (madridLocalStr && madridLocalStr.includes('T')) {
        const tParts = madridLocalStr.split('T')[1].split(':');
        const h = parseInt(tParts[0], 10);
        const m = tParts[1] || '00';
        if (h < 6) {
          timeNote = \` • 🌙 Madrugada (\${String(h).padStart(2, '0')}:\${m})\`;
        } else {
          timeNote = \` • ⏰ Comienza a las \${String(h).padStart(2, '0')}:\${m}\`;
        }
      }
      return \`Jornada del \${humanDate}\${timeNote}\`;
    }

    function updateEditorialDateUI() {
      const timeStatus = document.getElementById('ev-time-status')?.value || 'confirmed';
      const dateVal = document.getElementById('ev-date-local')?.value || '';
      const startVal = document.getElementById('ev-start-time')?.value || '';
      const editorialDateInput = document.getElementById('ev-editorial-date');
      const tagManual = document.getElementById('ev-manual-override-tag');
      const btnReset = document.getElementById('btn-reset-editorial-date');
      const summaryText = document.getElementById('ev-editorial-summary-text');

      if (!editorialDateManualOverride) {
        let autoDate = '';
        if (timeStatus === 'confirmed' && startVal) {
          autoDate = computeEditorialDateFromLocal(startVal);
        } else if (dateVal) {
          autoDate = dateVal;
        }
        if (autoDate && editorialDateInput) {
          editorialDateInput.value = autoDate;
        }
        if (tagManual) tagManual.style.display = 'none';
        if (btnReset) btnReset.style.display = 'none';
      } else {
        if (tagManual) tagManual.style.display = 'inline-block';
        if (btnReset) btnReset.style.display = 'inline-block';
      }

      if (summaryText && editorialDateInput) {
        if (timeStatus === 'pending_time') {
          summaryText.innerHTML = escapeHtml('Jornada del ' + (editorialDateInput.value || dateVal) + ' • ⏳ Hora pendiente de confirmación');
        } else if (timeStatus === 'continuous') {
          const endDateVal = document.getElementById('ev-end-date')?.value || '';
          summaryText.innerHTML = escapeHtml('Exposición del ' + (editorialDateInput.value || dateVal) + (endDateVal ? ' al ' + endDateVal : ' (fin sin determinar)'));
        } else if (timeStatus === 'tentative_date') {
          summaryText.innerHTML = escapeHtml('Fecha orientativa: ' + (editorialDateInput.value || dateVal) + ' • 📅 Borrador preliminar');
        } else {
          summaryText.innerHTML = escapeHtml(formatHumanEditorialSummary(editorialDateInput.value, startVal));
        }
      }
    }

    window.onTimeStatusChange = function(status) {
      markFormDirty();
      clearFormError();

      const timeGroup = document.getElementById('ev-time-group');
      const endTimeWrapper = document.getElementById('ev-end-time-wrapper');
      const continuousFields = document.getElementById('ev-continuous-fields');
      const pendingFields = document.getElementById('ev-pending-fields');
      const lblDate = document.getElementById('lbl-date-local');
      const hintStatus = document.getElementById('ev-time-status-hint');

      if (status === 'confirmed') {
        if (timeGroup) timeGroup.style.display = 'block';
        if (endTimeWrapper) endTimeWrapper.style.display = 'block';
        if (continuousFields) continuousFields.style.display = 'none';
        if (pendingFields) pendingFields.style.display = 'none';
        if (lblDate) lblDate.textContent = 'Fecha del evento *';
        if (hintStatus) hintStatus.textContent = '⏰ Fecha y hora confirmadas. Exige hora puntual.';
      } else if (status === 'pending_time') {
        if (timeGroup) timeGroup.style.display = 'none';
        if (endTimeWrapper) endTimeWrapper.style.display = 'none';
        if (continuousFields) continuousFields.style.display = 'none';
        if (pendingFields) pendingFields.style.display = 'block';
        if (lblDate) lblDate.textContent = 'Fecha del evento *';
        if (hintStatus) hintStatus.textContent = '⏳ Fecha confirmada pero hora aún por fijar (ej. partido pendiente de televisión o programación provisional).';
      } else if (status === 'continuous') {
        if (timeGroup) timeGroup.style.display = 'none';
        if (endTimeWrapper) endTimeWrapper.style.display = 'none';
        if (continuousFields) continuousFields.style.display = 'block';
        if (pendingFields) pendingFields.style.display = 'none';
        if (lblDate) lblDate.textContent = 'Fecha de inicio del periodo *';
        if (hintStatus) hintStatus.textContent = '🏛️ Periodo continuado / Exposición sin hora puntual. Exige fecha final para publicar.';
      } else if (status === 'tentative_date') {
        if (timeGroup) timeGroup.style.display = 'none';
        if (endTimeWrapper) endTimeWrapper.style.display = 'none';
        if (continuousFields) continuousFields.style.display = 'none';
        if (pendingFields) pendingFields.style.display = 'block';
        if (lblDate) lblDate.textContent = 'Fecha orientativa preliminar *';
        if (hintStatus) hintStatus.textContent = '📅 Fecha tentativa o jornada orientativa. No puede publicarse como confirmada (debe permanecer en borrador).';
      }

      onEvDateChange();
    };

    window.onEvDateChange = function() {
      markFormDirty();
      clearFormError();
      const dateVal = document.getElementById('ev-date-local')?.value || '';
      const timeVal = document.getElementById('ev-time-local')?.value || '20:00';
      const status = document.getElementById('ev-time-status')?.value || 'confirmed';

      if (status === 'confirmed') {
        document.getElementById('ev-start-time').value = dateVal ? (dateVal + 'T' + timeVal) : '';
      } else {
        document.getElementById('ev-start-time').value = '';
      }
      updateEditorialDateUI();
    };

    window.onEvTimeChange = function() {
      markFormDirty();
      clearFormError();
      const dateVal = document.getElementById('ev-date-local')?.value || '';
      const timeVal = document.getElementById('ev-time-local')?.value || '';
      if (dateVal && timeVal) {
        document.getElementById('ev-start-time').value = dateVal + 'T' + timeVal;
      }
      updateEditorialDateUI();
    };

    let adminFestivalsCache = [];

    window.loadAdminFestivals = async function(selectedIds = []) {
      const container = document.getElementById('ev-festivals-checkbox-list');
      if (!container) return;
      try {
        const res = await apiFetch('/api/v1/admin/festivals');
        const data = await res.json();
        adminFestivalsCache = data.festivals || [];
        renderFestivalsCheckboxList(selectedIds);
      } catch (err) {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--red); padding:0.5rem;">Error al cargar festivales.</div>';
      }
    };

    function renderFestivalsCheckboxList(selectedIds = []) {
      const container = document.getElementById('ev-festivals-checkbox-list');
      if (!container) return;
      if (adminFestivalsCache.length === 0) {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding:0.5rem;">No hay programas o festivales dados de alta en Palencia. Pulsa "+ Nuevo programa" para añadir uno.</div>';
        return;
      }
      container.innerHTML = adminFestivalsCache.map(f => {
        const isChecked = selectedIds.includes(f.id);
        return \`
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.8rem; color:var(--text-main); cursor:pointer; padding:0.2rem 0.3rem; border-radius:4px;">
            <input type="checkbox" name="ev-festivals" value="\${f.id}" \${isChecked ? 'checked' : ''} onchange="markFormDirty()">
            <span><strong>\${escapeHtml(f.name)}</strong> \${f.edition ? \`<span style="color:var(--text-dim); font-size:0.75rem;">(\${escapeHtml(f.edition)})</span>\` : ''} <span style="font-size:0.7rem; color:var(--text-muted); margin-left:0.25rem;">[\${f.start_date || '—'} → \${f.end_date || '—'}]</span></span>
          </label>
        \`;
      }).join('');
    }

    window.toggleNewFestivalForm = function(force) {
      const form = document.getElementById('new-festival-form');
      if (!form) return;
      const shouldShow = typeof force === 'boolean' ? force : (form.style.display === 'none');
      form.style.display = shouldShow ? 'block' : 'none';
      if (shouldShow) {
        const nameInput = document.getElementById('new-fest-name');
        if (nameInput) nameInput.focus();
      }
    };

    window.submitCreateFestivalInline = async function() {
      const name = (document.getElementById('new-fest-name')?.value || '').trim();
      const edition = (document.getElementById('new-fest-edition')?.value || '').trim();
      const startDate = (document.getElementById('new-fest-start')?.value || '').trim();
      const endDate = (document.getElementById('new-fest-end')?.value || '').trim();

      if (!name) {
        alert('El nombre del festival o programa es obligatorio.');
        return;
      }
      if (!startDate || !endDate) {
        alert('Las fechas de inicio y fin son obligatorias.');
        return;
      }

      try {
        const res = await apiFetch('/api/v1/admin/festivals', {
          method: 'POST',
          body: JSON.stringify({
            name,
            edition: edition || null,
            start_date: startDate,
            end_date: endDate,
            location_scope: 'Palencia'
          })
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Error al crear festival.');
          return;
        }

        const currentChecked = Array.from(document.querySelectorAll('input[name="ev-festivals"]:checked')).map(cb => Number(cb.value));
        if (data.festival && data.festival.id) {
          currentChecked.push(data.festival.id);
        }

        document.getElementById('new-fest-name').value = '';
        document.getElementById('new-fest-edition').value = '';
        document.getElementById('new-fest-start').value = '';
        document.getElementById('new-fest-end').value = '';
        toggleNewFestivalForm(false);

        await loadAdminFestivals(currentChecked);
        markFormDirty();
      } catch (err) {
        alert('Error al conectar con el servidor.');
      }
    };

    window.onEvStartTimeChange = function() {
      markFormDirty();
      clearFormError();
      updateEditorialDateUI();
    };

    window.onManualEditorialDateChange = function() {
      editorialDateManualOverride = true;
      markFormDirty();
      updateEditorialDateUI();
    };

    window.resetToAutoEditorialDate = function() {
      editorialDateManualOverride = false;
      markFormDirty();
      updateEditorialDateUI();
    };

    // Horario de finalización
    window.toggleEndTime = function() {
      const container = document.getElementById('ev-end-time-container');
      const toggleBtn = document.getElementById('btn-toggle-end-time');
      const endInput = document.getElementById('ev-end-time');
      if (container) container.style.display = 'block';
      if (toggleBtn) toggleBtn.style.display = 'none';

      if (endInput && !endInput.value) {
        const startVal = document.getElementById('ev-start-time').value;
        if (startVal && startVal.includes('T')) {
          const [dp, tp] = startVal.split('T');
          const [y, m, d] = dp.split('-').map(Number);
          const [h, min] = tp.split(':').map(Number);
          const endDt = new Date(Date.UTC(y, m - 1, d, h + 2, min, 0));
          const ey = endDt.getUTCFullYear();
          const em = String(endDt.getUTCMonth() + 1).padStart(2, '0');
          const ed = String(endDt.getUTCDate()).padStart(2, '0');
          const eh = String(endDt.getUTCHours()).padStart(2, '0');
          const emin = String(endDt.getUTCMinutes()).padStart(2, '0');
          endInput.value = \`\${ey}-\${em}-\${ed}T\${eh}:\${emin}\`;
        }
        endInput.focus();
      }
      markFormDirty();
    };

    window.removeEndTime = function() {
      const container = document.getElementById('ev-end-time-container');
      const toggleBtn = document.getElementById('btn-toggle-end-time');
      const endInput = document.getElementById('ev-end-time');
      if (endInput) endInput.value = '';
      if (container) container.style.display = 'none';
      if (toggleBtn) toggleBtn.style.display = 'inline-flex';
      markFormDirty();
      clearFormError();
    };

    window.onEvEndTimeChange = function() {
      markFormDirty();
      clearFormError();
    };

    // Selector y búsqueda de local para el evento
    window.onEventVenueSearchInput = function(val) {
      // Si se modifica el texto del buscador, desvincular el local seleccionado previamente
      document.getElementById('ev-venue-id').value = '';
      const selectedCard = document.getElementById('ev-venue-selected-card');
      if (selectedCard) selectedCard.style.display = 'none';
      const notice = document.getElementById('ev-venue-unassigned-notice');
      if (notice) notice.style.display = 'block';

      const venueErr = document.getElementById('ev-venue-field-error');
      if (venueErr) {
        venueErr.innerText = '';
        venueErr.style.display = 'none';
      }
      const venueInput = document.getElementById('ev-venue-search');
      if (venueInput) {
        venueInput.style.borderColor = '';
        venueInput.removeAttribute('aria-invalid');
        venueInput.setAttribute('aria-describedby', 'ev-venue-unassigned-notice');
      }

      const query = normalizeSearchText(val || '');
      const dropdown = document.getElementById('ev-venue-dropdown');
      if (!dropdown) return;

      const validVenues = (cachedVenues || []).filter(v => Number(v.id) !== 9999);
      const matches = validVenues.filter(v => {
        if (!query) return true;
        const nName = normalizeSearchText(v.name || '');
        const nAddr = normalizeSearchText(v.address || '');
        const nZone = normalizeSearchText(v.zone || '');
        return nName.includes(query) || nAddr.includes(query) || nZone.includes(query);
      }).slice(0, 10);

      if (matches.length === 0) {
        dropdown.innerHTML = \`
          <div style="padding:0.75rem 1rem; color:var(--text-muted); font-size:0.8125rem;">
            No se encontró ningún local para "<strong>\${escapeHtml(query)}</strong>".
          </div>
        \`;
      } else {
        dropdown.innerHTML = matches.map(v => \`
          <div class="venue-search-item" onclick="selectEventVenue(\${v.id})" role="option" tabindex="0" onkeydown="if(event.key==='Enter') selectEventVenue(\${v.id})">
            <div>
              <div style="font-weight:700; color:var(--text-main); font-size:0.875rem;">\${escapeHtml(v.name)}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">📍 \${escapeHtml(v.address || 'Sin dirección')}</div>
            </div>
            <div style="text-align:right;">
              <span class="venue-badge">\${escapeHtml(v.zone || 'otros')}</span>
            </div>
          </div>
        \`).join('');
      }
      dropdown.style.display = 'block';
    };

    window.onEventVenueSearchFocus = function() {
      const input = document.getElementById('ev-venue-search');
      onEventVenueSearchInput(input ? input.value : '');
    };

    window.selectEventVenue = function(venueId) {
      if (Number(venueId) === 9999) {
        alert('Prohibido seleccionar el local técnico provisional 9999.');
        return;
      }
      const v = (cachedVenues || []).find(item => Number(item.id) === Number(venueId));
      if (!v) return;

      document.getElementById('ev-venue-id').value = v.id;
      document.getElementById('ev-venue-selected-name').innerText = v.name;
      document.getElementById('ev-venue-selected-meta').innerText = '📍 ' + (v.address || 'Sin dirección') + ' • Zona: ' + (v.zone || 'otros');
      document.getElementById('ev-venue-selected-card').style.display = 'flex';
      document.getElementById('ev-venue-unassigned-notice').style.display = 'none';

      const searchInput = document.getElementById('ev-venue-search');
      if (searchInput) {
        searchInput.value = '';
        searchInput.removeAttribute('aria-invalid');
        searchInput.setAttribute('aria-describedby', 'ev-venue-unassigned-notice');
        searchInput.style.borderColor = '';
      }
      const dropdown = document.getElementById('ev-venue-dropdown');
      if (dropdown) dropdown.style.display = 'none';

      markFormDirty();
      clearFormError();
    };

    window.clearSelectedVenue = function() {
      document.getElementById('ev-venue-id').value = '';
      document.getElementById('ev-venue-selected-card').style.display = 'none';
      document.getElementById('ev-venue-unassigned-notice').style.display = 'block';
      const searchInput = document.getElementById('ev-venue-search');
      if (searchInput) {
        searchInput.value = '';
        searchInput.removeAttribute('aria-invalid');
        searchInput.setAttribute('aria-describedby', 'ev-venue-unassigned-notice');
        searchInput.style.borderColor = '';
        searchInput.focus();
      }
      const dropdown = document.getElementById('ev-venue-dropdown');
      if (dropdown) dropdown.style.display = 'none';

      markFormDirty();
      clearFormError();
    };

    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', function(e) {
      const dropdown = document.getElementById('ev-venue-dropdown');
      const searchInput = document.getElementById('ev-venue-search');
      if (!dropdown || !searchInput) return;
      if (!dropdown.contains(e.target) && e.target !== searchInput) {
        dropdown.style.display = 'none';
      }
    });

    // Control de precio
    window.setPriceType = function(type) {
      const isFreeHidden = document.getElementById('ev-is-free');
      const btnFree = document.getElementById('btn-price-free');
      const btnPaid = document.getElementById('btn-price-paid');
      const wrap = document.getElementById('ev-price-input-wrap');
      const hint = document.getElementById('ev-price-hint');
      const eurosInput = document.getElementById('ev-price-euros');

      if (type === 'free') {
        isFreeHidden.value = 'true';
        btnFree.classList.add('active');
        btnPaid.classList.remove('active');
        wrap.style.display = 'none';
        eurosInput.value = '';
        if (hint) hint.style.display = 'none';
      } else if (type === 'paid') {
        isFreeHidden.value = 'false';
        btnPaid.classList.add('active');
        btnFree.classList.remove('active');
        wrap.style.display = 'block';
        if (hint) hint.style.display = 'none';
        eurosInput.focus();
      } else {
        isFreeHidden.value = '';
        btnFree.classList.remove('active');
        btnPaid.classList.remove('active');
        wrap.style.display = 'none';
        eurosInput.value = '';
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = 'Selecciona Gratis o De pago.';
        }
      }
      markFormDirty();
      clearFormError();
    };

    function parseEurosToCents(val) {
      if (val === null || val === undefined) return null;
      const clean = String(val).trim().replace(',', '.');
      if (!clean) return null;
      const num = Number(clean);
      if (isNaN(num) || num < 0) return null;
      return Math.round(num * 100);
    }

    // Gestión de cartel / imagen del evento (Cloudflare R2)
    window.triggerEventImageUpload = function() {
      const fileInput = document.getElementById('ev-image-file');
      if (fileInput) fileInput.click();
    };

    window.handleEventImageDragOver = function(e) {
      e.preventDefault();
      const box = document.getElementById('ev-image-upload-box');
      if (box) box.classList.add('dragover');
    };

    window.handleEventImageDragLeave = function(e) {
      e.preventDefault();
      const box = document.getElementById('ev-image-upload-box');
      if (box) box.classList.remove('dragover');
    };

    window.handleEventImageDrop = function(e) {
      e.preventDefault();
      const box = document.getElementById('ev-image-upload-box');
      if (box) box.classList.remove('dragover');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        processEventImageFile(files[0]);
      }
    };

    window.handleEventImageFileSelect = function(e) {
      const files = e.target.files;
      if (files && files.length > 0) {
        processEventImageFile(files[0]);
      }
      e.target.value = '';
    };

    async function processEventImageFile(file) {
      const errBox = document.getElementById('ev-image-error');
      const uploadingEl = document.getElementById('ev-image-uploading');
      if (errBox) { errBox.style.display = 'none'; errBox.innerHTML = ''; }

      // 1. Validación de formato JPEG, PNG, WebP
      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const nameLower = (file.name || '').toLowerCase();
      const hasValidExt = nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg') || nameLower.endsWith('.png') || nameLower.endsWith('.webp');
      const isValidType = (file.type && validTypes.includes(file.type)) || hasValidExt;
      if (!isValidType) {
        if (errBox) {
          errBox.innerHTML = '<strong>⚠️ Error:</strong> Formato no admitido. Selecciona una imagen JPEG, PNG o WebP.';
          errBox.style.display = 'block';
        }
        return;
      }

      // 2. Validación de tamaño (máx 5 MB)
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        if (errBox) {
          errBox.innerHTML = '<strong>⚠️ Error:</strong> La imagen supera el límite máximo permitido de 5 MB (' + (file.size / (1024 * 1024)).toFixed(2) + ' MB).';
          errBox.style.display = 'block';
        }
        return;
      }

      // 3. Concurrencia y sesiones de subida
      eventImageUploadSessionId++;
      const currentSessionId = eventImageUploadSessionId;

      isEventImageUploading = true;
      if (uploadingEl) uploadingEl.style.display = 'flex';
      setSaveButtonsLoading(true, 'Subiendo cartel...');

      let localPreviewUrl = null;
      try {
        localPreviewUrl = URL.createObjectURL(file);
      } catch (_) {}

      const previewImg = document.getElementById('ev-image-preview');
      const previewWrap = document.getElementById('ev-image-preview-wrap');
      const uploadBox = document.getElementById('ev-image-upload-box');
      const previewInfo = document.getElementById('ev-image-preview-info');

      if (localPreviewUrl && previewImg) {
        previewImg.src = localPreviewUrl;
        if (previewInfo) previewInfo.textContent = 'Subiendo: ' + file.name + '...';
        if (previewWrap) previewWrap.style.display = 'flex';
        if (uploadBox) uploadBox.style.display = 'none';
      }

      try {
        const token = getToken();
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/v1/admin/uploads', {
          method: 'POST',
          headers: token ? { 'Authorization': 'Bearer ' + token } : {},
          body: formData,
          signal: AbortSignal.timeout(30000),
        });

        const data = await res.json().catch(() => ({}));
        if (currentSessionId !== eventImageUploadSessionId) return; // Sesión descartada por otra subida

        if (!res.ok) {
          throw new Error(data.message || 'Error al subir la imagen al almacenamiento.');
        }

        document.getElementById('ev-image-url').value = data.url;
        const thumbInput = document.getElementById('ev-image-thumb-url');
        if (thumbInput) thumbInput.value = data.thumb_url || data.variants?.thumb?.url || '';
        const origInput = document.getElementById('ev-image-original-url');
        if (origInput) origInput.value = data.original_url || data.variants?.original?.url || '';

        const manualInput = document.getElementById('ev-image-url-manual');
        if (manualInput) manualInput.value = data.url;

        if (previewImg) previewImg.src = data.url;
        if (previewInfo) previewInfo.textContent = 'Cartel subido (' + (data.size_bytes ? (data.size_bytes / 1024).toFixed(1) + ' KB' : file.name) + ')';
        if (previewWrap) previewWrap.style.display = 'flex';
        if (uploadBox) uploadBox.style.display = 'none';
        markFormDirty();
      } catch (err) {
        if (currentSessionId !== eventImageUploadSessionId) return;
        if (errBox) {
          errBox.innerHTML = '<strong>⚠️ Error de subida:</strong> ' + escapeHtml(err.message || 'No se pudo subir la imagen.');
          errBox.style.display = 'block';
        }
        const currentUrl = document.getElementById('ev-image-url').value;
        if (!currentUrl) {
          if (previewImg) previewImg.src = '';
          if (previewWrap) previewWrap.style.display = 'none';
          if (uploadBox) uploadBox.style.display = 'block';
        } else {
          if (previewImg) previewImg.src = currentUrl;
          if (previewWrap) previewWrap.style.display = 'flex';
          if (uploadBox) uploadBox.style.display = 'none';
        }
      } finally {
        if (localPreviewUrl) {
          try { URL.revokeObjectURL(localPreviewUrl); } catch (_) {}
        }
        if (currentSessionId === eventImageUploadSessionId) {
          isEventImageUploading = false;
          if (uploadingEl) uploadingEl.style.display = 'none';
          setSaveButtonsLoading(false);
        }
      }
    }

    window.removeEventImage = function() {
      const urlInput = document.getElementById('ev-image-url');
      if (urlInput) urlInput.value = '';
      const thumbInput = document.getElementById('ev-image-thumb-url');
      if (thumbInput) thumbInput.value = '';
      const origInput = document.getElementById('ev-image-original-url');
      if (origInput) origInput.value = '';
      const manualInput = document.getElementById('ev-image-url-manual');
      if (manualInput) manualInput.value = '';

      const previewImg = document.getElementById('ev-image-preview');
      if (previewImg) previewImg.src = '';

      const previewWrap = document.getElementById('ev-image-preview-wrap');
      if (previewWrap) previewWrap.style.display = 'none';

      const uploadBox = document.getElementById('ev-image-upload-box');
      if (uploadBox) uploadBox.style.display = 'block';

      const errBox = document.getElementById('ev-image-error');
      if (errBox) { errBox.style.display = 'none'; errBox.innerHTML = ''; }
      const uploadingEl = document.getElementById('ev-image-uploading');
      if (uploadingEl) uploadingEl.style.display = 'none';

      markFormDirty();
    };

    window.toggleManualImageUrl = function() {
      const manualWrap = document.getElementById('ev-image-manual-wrap');
      if (!manualWrap) return;
      const isHidden = manualWrap.style.display === 'none';
      manualWrap.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        const manualInput = document.getElementById('ev-image-url-manual');
        if (manualInput) {
          manualInput.value = document.getElementById('ev-image-url').value;
          manualInput.focus();
        }
      }
    };

    window.handleManualImageUrl = function(val) {
      const trimmed = (val || '').trim();
      document.getElementById('ev-image-url').value = trimmed;
      const previewImg = document.getElementById('ev-image-preview');
      const previewWrap = document.getElementById('ev-image-preview-wrap');
      const uploadBox = document.getElementById('ev-image-upload-box');
      const previewInfo = document.getElementById('ev-image-preview-info');

      if (trimmed) {
        if (previewImg) previewImg.src = trimmed;
        if (previewInfo) previewInfo.textContent = 'Imagen por URL externa';
        if (previewWrap) previewWrap.style.display = 'flex';
        if (uploadBox) uploadBox.style.display = 'none';
      } else {
        if (previewImg) previewImg.src = '';
        if (previewWrap) previewWrap.style.display = 'none';
        if (uploadBox) uploadBox.style.display = 'block';
      }
      markFormDirty();
    };

    // Estados de carga de botones
    function setSaveButtonsLoading(isLoading, customText) {
      const btnSaveDraft = document.getElementById('btn-save-draft');
      const btnPublish = document.getElementById('btn-publish-event');
      const btnSaveEdit = document.getElementById('btn-save-event-changes');
      const btnCancel = document.querySelector('.modal-event-footer .btn-secondary');
      const btnClose = document.querySelector('.modal-event-header .modal-close');

      const btns = [btnSaveDraft, btnPublish, btnSaveEdit];
      btns.forEach(b => {
        if (!b) return;
        b.disabled = isLoading;
        if (isLoading && customText) {
          b.dataset.prevText = b.textContent;
          b.textContent = customText;
        } else if (!isLoading && b.dataset.prevText) {
          b.textContent = b.dataset.prevText;
          delete b.dataset.prevText;
        }
      });

      if (btnCancel) btnCancel.disabled = isLoading;
      if (btnClose) btnClose.disabled = isLoading;

      const secondaryBtns = document.querySelectorAll('#modal-event-secondary-status-btns button');
      secondaryBtns.forEach(sb => { sb.disabled = isLoading; });
    };

    // Modal: Apertura en modo creación
    window.openNewEventModal = function() {
      currentEditingEvent = null;
      editEventOrigin = 'events';
      lastActiveElementBeforeModal = document.activeElement;

      document.getElementById('modal-event-title').innerText = 'Nuevo evento';
      document.getElementById('form-event').reset();
      document.getElementById('ev-id').value = '';

      // Visibilidad de cabecera y acciones
      const statusBadge = document.getElementById('modal-event-status-badge');
      if (statusBadge) statusBadge.style.display = 'none';
      document.getElementById('modal-event-create-actions').style.display = 'flex';
      document.getElementById('modal-event-edit-actions').style.display = 'none';

      // Resetear local
      clearSelectedVenue();

      // Resetear cartel / imagen
      removeEventImage();
      const manualWrap = document.getElementById('ev-image-manual-wrap');
      if (manualWrap) manualWrap.style.display = 'none';
      isEventImageUploading = false;

      // Resetear finalización
      removeEndTime();

      // Resetear precio (sin preselección: exige elección explícita)
      setPriceType(null);

      // Limpiar errores
      clearFormError();

      // Categoría sin preselección
      document.getElementById('ev-category').value = '';

      // Resetear modalidad temporal a confirmed
      const timeStatusSelect = document.getElementById('ev-time-status');
      if (timeStatusSelect) timeStatusSelect.value = 'confirmed';
      onTimeStatusChange('confirmed');

      // Fecha y hora de inicio por defecto en Europe/Madrid a las 20:00
      const nowMadrid = formatToMadridDatetimeLocal(new Date());
      const todayMadridDate = nowMadrid ? nowMadrid.split('T')[0] : new Date().toISOString().split('T')[0];
      document.getElementById('ev-date-local').value = todayMadridDate;
      document.getElementById('ev-time-local').value = '20:00';
      document.getElementById('ev-start-time').value = todayMadridDate + 'T20:00';
      document.getElementById('ev-end-date').value = '';
      document.getElementById('ev-schedule-text').value = '';
      document.getElementById('ev-approximate-schedule').value = '';

      editorialDateManualOverride = false;
      updateEditorialDateUI();

      // Cargar programas marco / festivales
      loadAdminFestivals([]);

      // Resetear avisos de procedencia e imagen de origen
      const srcNotice = document.getElementById('ev-source-image-notice');
      if (srcNotice) srcNotice.style.display = 'none';
      const provBox = document.getElementById('ev-source-provenance-box');
      if (provBox) provBox.style.display = 'none';

      setSaveButtonsLoading(false);
      eventModalFormDirty = false;

      openModal('modal-event');
      const titleInput = document.getElementById('ev-title');
      if (titleInput) titleInput.focus();
    };

    // Modal: Apertura en modo edición
    window.editEvent = async function(id) {
      lastActiveElementBeforeModal = document.activeElement;
      editEventOrigin = currentSection === 'inbox' ? 'inbox' : 'events';

      clearFormError();
      setSaveButtonsLoading(true, 'Cargando...');

      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}\`);
        const data = await res.json();
        const ev = data.event;
        currentEditingEvent = ev;

        document.getElementById('modal-event-title').innerText = 'Editar evento #' + ev.id;
        document.getElementById('ev-id').value = ev.id;
        document.getElementById('ev-title').value = ev.title || '';
        document.getElementById('ev-category').value = ev.category || '';
        document.getElementById('ev-description').value = ev.description || '';
        document.getElementById('ev-source-url').value = ev.source_url || '';

        // Local asignado
        if (ev.venue_id && Number(ev.venue_id) !== 9999) {
          selectEventVenue(Number(ev.venue_id));
        } else {
          clearSelectedVenue();
        }

        // Modalidad temporal
        const timeStatus = ev.time_status || 'confirmed';
        document.getElementById('ev-time-status').value = timeStatus;
        onTimeStatusChange(timeStatus);

        // Fecha y hora local
        let datePart = '';
        let timePart = '';
        if (ev.start_time) {
          const localStart = formatToMadridDatetimeLocal(ev.start_time);
          if (localStart && localStart.includes('T')) {
            const p = localStart.split('T');
            datePart = p[0];
            timePart = p[1].slice(0, 5);
          }
        } else if (ev.editorial_date) {
          datePart = ev.editorial_date;
        }

        document.getElementById('ev-date-local').value = datePart;
        document.getElementById('ev-time-local').value = timePart;
        document.getElementById('ev-start-time').value = (datePart && timePart) ? (datePart + 'T' + timePart) : '';
        document.getElementById('ev-end-date').value = ev.end_date || '';
        document.getElementById('ev-schedule-text').value = ev.schedule_text || '';
        document.getElementById('ev-approximate-schedule').value = ev.approximate_schedule || '';

        // Horario y jornada editorial
        const autoEditorial = (timeStatus === 'confirmed' && datePart && timePart)
          ? computeEditorialDateFromLocal(datePart + 'T' + timePart)
          : datePart;
        document.getElementById('ev-editorial-date').value = ev.editorial_date || autoEditorial;
        editorialDateManualOverride = (ev.editorial_date && ev.editorial_date !== autoEditorial);
        updateEditorialDateUI();

        // Finalización
        if (ev.end_time) {
          document.getElementById('ev-end-time').value = formatToMadridDatetimeLocal(ev.end_time);
          document.getElementById('ev-end-time-container').style.display = 'block';
          document.getElementById('btn-toggle-end-time').style.display = 'none';
        } else {
          removeEndTime();
        }

        // Programas / Festivales vinculados (N:M)
        loadAdminFestivals(ev.festival_ids || []);

        // Precio
        if (!ev.is_free && ev.price_cents > 0) {
          setPriceType('paid');
          document.getElementById('ev-price-euros').value = (ev.price_cents / 100).toFixed(2).replace('.', ',');
        } else {
          setPriceType('free');
        }

        // Cartel / imagen pública
        document.getElementById('ev-image-url').value = ev.image_url || '';
        const thumbInput = document.getElementById('ev-image-thumb-url');
        if (thumbInput) thumbInput.value = ev.image_thumb_url || '';
        const origInput = document.getElementById('ev-image-original-url');
        if (origInput) origInput.value = ev.image_original_url || '';
        const manualInput = document.getElementById('ev-image-url-manual');
        if (manualInput) manualInput.value = ev.image_url || '';
        const manualWrap = document.getElementById('ev-image-manual-wrap');
        if (manualWrap) manualWrap.style.display = 'none';

        const previewImg = document.getElementById('ev-image-preview');
        const previewWrap = document.getElementById('ev-image-preview-wrap');
        const uploadBox = document.getElementById('ev-image-upload-box');
        const previewInfo = document.getElementById('ev-image-preview-info');

        if (ev.image_url) {
          if (previewImg) previewImg.src = ev.image_url;
          if (previewInfo) previewInfo.textContent = 'Cartel actual del evento';
          if (previewWrap) previewWrap.style.display = 'flex';
          if (uploadBox) uploadBox.style.display = 'none';
        } else {
          removeEventImage();
        }

        // Aviso de imagen de origen no publicada automáticamente
        const srcImageNotice = document.getElementById('ev-source-image-notice');
        const srcImageLink = document.getElementById('ev-source-image-link');
        if (ev.image_original_url && !ev.image_url) {
          if (srcImageNotice) srcImageNotice.style.display = 'block';
          if (srcImageLink) srcImageLink.href = ev.image_original_url;
        } else {
          if (srcImageNotice) srcImageNotice.style.display = 'none';
        }

        // Badge de procedencia y enlace a fuente oficial
        const provBox = document.getElementById('ev-source-provenance-box');
        const provBadge = document.getElementById('ev-source-type-badge');
        const provLink = document.getElementById('ev-source-provenance-link');
        if (provBox) {
          if (ev.source_type || ev.source_url) {
            provBox.style.display = 'block';
            if (provBadge) {
              if (ev.source_type === 'jcyl_cultural') {
                provBadge.innerHTML = '🏛️ Origen: Importación JCyL (Cultura CyL)';
              } else if (ev.source_type) {
                provBadge.innerHTML = \`Origen: \${escapeHtml(ev.source_type)}\`;
              } else {
                provBadge.innerHTML = 'Origen: Fuente externa';
              }
            }
            if (provLink) {
              if (ev.source_url) {
                provLink.href = ev.source_url;
                provLink.style.display = 'inline-block';
              } else {
                provLink.style.display = 'none';
              }
            }
          } else {
            provBox.style.display = 'none';
          }
        }

        // Badge de estado en cabecera
        const statusBadge = document.getElementById('modal-event-status-badge');
        if (statusBadge) {
          statusBadge.style.display = 'inline-block';
          statusBadge.className = 'status-badge status-' + (ev.status || 'tentative');
          const statusLabels = {
            'published': 'Publicado',
            'tentative': 'Borrador',
            'cancelled': 'Cancelado',
            'archived': 'Archivado',
            'duplicate': 'Duplicado',
            'outdated': 'Obsoleto'
          };
          statusBadge.innerText = statusLabels[ev.status] || ev.status;
        }

        // Botones de acción en modo edición
        document.getElementById('modal-event-create-actions').style.display = 'none';
        document.getElementById('modal-event-edit-actions').style.display = 'flex';
        renderEditStatusActions(ev.status);

        setSaveButtonsLoading(false);
        eventModalFormDirty = false;

        openModal('modal-event');
        const titleInput = document.getElementById('ev-title');
        if (titleInput) titleInput.focus();
      } catch (err) {
        alert('Error al cargar datos del evento.');
        setSaveButtonsLoading(false);
      }
    };

    function renderEditStatusActions(status) {
      const container = document.getElementById('modal-event-secondary-status-btns');
      if (!container) return;
      container.innerHTML = '';

      if (status === 'tentative') {
        container.innerHTML = \`<button type="button" class="btn-sm btn-publish" onclick="submitEventStatusChange('published')">🚀 Publicar ahora</button>\`;
      } else if (status === 'published') {
        container.innerHTML = \`<button type="button" class="btn-sm btn-logout" onclick="submitEventStatusChange('cancelled')">🚫 Cancelar evento</button>\`;
      } else if (status === 'cancelled') {
        container.innerHTML = \`<button type="button" class="btn-sm btn-secondary" onclick="submitEventStatusChange('published')">🔄 Republicar</button>\`;
      }

      if (status !== 'archived') {
        container.innerHTML += \`<button type="button" class="btn-sm btn-secondary" onclick="submitEventStatusChange('archived')">📦 Archivar</button>\`;
      }
    }

    // Guardado de evento con soporte para borrador y publicación
    window.submitEventForm = async function(statusOverride) {
      if (modalEventSaveInProgress) return;
      if (isEventImageUploading) {
        showFormError('Espera a que finalice la subida del cartel antes de guardar el evento.');
        return;
      }

      clearFormError();

      const id = document.getElementById('ev-id').value;
      const title = document.getElementById('ev-title').value.trim();
      const category = document.getElementById('ev-category').value;
      const venueIdStr = document.getElementById('ev-venue-id').value;
      const venueId = venueIdStr ? Number(venueIdStr) : null;

      const timeStatus = document.getElementById('ev-time-status')?.value || 'confirmed';
      const dateLocal = document.getElementById('ev-date-local')?.value || '';
      const timeLocal = document.getElementById('ev-time-local')?.value || '';
      const endDate = document.getElementById('ev-end-date')?.value || '';
      const scheduleText = document.getElementById('ev-schedule-text')?.value.trim() || null;
      const approximateSchedule = document.getElementById('ev-approximate-schedule')?.value.trim() || null;
      const editorialDate = document.getElementById('ev-editorial-date')?.value || '';
      const endVal = document.getElementById('ev-end-time')?.value || '';

      const isFreeVal = document.getElementById('ev-is-free').value;
      const eurosVal = document.getElementById('ev-price-euros').value;
      const description = document.getElementById('ev-description').value.trim() || null;
      const sourceUrl = document.getElementById('ev-source-url').value.trim() || null;
      const imageUrl = document.getElementById('ev-image-url').value.trim() || null;
      const imageThumbUrl = document.getElementById('ev-image-thumb-url')?.value.trim() || null;
      const imageOriginalUrl = document.getElementById('ev-image-original-url')?.value.trim() || null;

      // Festivales seleccionados
      const festivalCheckboxes = document.querySelectorAll('input[name="ev-festivals"]:checked');
      const festivalIds = Array.from(festivalCheckboxes).map(cb => Number(cb.value));

      // Determinar estado objetivo
      let targetStatus = statusOverride;
      if (!targetStatus) {
        targetStatus = currentEditingEvent ? currentEditingEvent.status : 'published';
      }

      // Validaciones de formulario
      if (!title || title.length < 3) {
        showFormError('El título del evento debe tener al menos 3 caracteres.', 'ev-title');
        return;
      }

      if (!category) {
        showFormError('Debes seleccionar una categoría para el evento.', 'ev-category');
        return;
      }

      if (!dateLocal) {
        showFormError('Debes indicar la fecha del evento.', 'ev-date-local');
        return;
      }

      if (timeStatus === 'confirmed') {
        if (!timeLocal) {
          showFormError('Para un evento con hora confirmada debes indicar la hora puntual de inicio (HH:MM).', 'ev-time-local');
          return;
        }
      } else if (timeStatus === 'continuous') {
        if (targetStatus === 'published' && !endDate) {
          showFormError('Para publicar una exposición continuada es obligatorio indicar la fecha final de periodo.', 'ev-end-date');
          return;
        }
      } else if (timeStatus === 'tentative_date') {
        if (targetStatus === 'published') {
          showFormError('Un evento con fecha orientativa o preliminar no puede publicarse como confirmado. Guárdalo como borrador.', 'ev-time-status');
          return;
        }
      }

      // Verificación de local: obligatorio para publicar
      if (targetStatus === 'published' && (!venueId || Number(venueId) === 9999)) {
        const venueErrMsg = 'Para publicar el evento es obligatorio seleccionar un local del censo. Si aún no tienes local, guárdalo como borrador.';
        showFormError(venueErrMsg, 'ev-venue-search');
        const venueErr = document.getElementById('ev-venue-field-error');
        if (venueErr) {
          venueErr.innerText = venueErrMsg;
          venueErr.style.display = 'block';
        }
        const venueInput = document.getElementById('ev-venue-search');
        if (venueInput) {
          venueInput.style.borderColor = '#dc2626';
          venueInput.setAttribute('aria-invalid', 'true');
          venueInput.setAttribute('aria-describedby', 'ev-venue-field-error ev-venue-unassigned-notice');
        }
        return;
      }

      // Validación de precio: obligatoria elección explícita antes de guardar o publicar
      if (isFreeVal !== 'true' && isFreeVal !== 'false') {
        showFormError('Debes seleccionar si el evento es Gratis o De pago antes de guardar.', 'btn-price-free');
        return;
      }

      const isFree = isFreeVal === 'true';
      let priceCents = 0;
      if (!isFree) {
        const parsed = parseEurosToCents(eurosVal);
        if (parsed === null || parsed <= 0) {
          showFormError('Para eventos de pago debes indicar un importe mayor que cero (ej. 15,50 €).', 'ev-price-euros');
          return;
        }
        priceCents = parsed;
      }

      // Cálculo de ISO timestamps en Europe/Madrid
      let startTimeIso = null;
      if (timeStatus === 'confirmed' && dateLocal && timeLocal) {
        const localCombined = dateLocal + 'T' + timeLocal;
        if (currentEditingEvent && id && formatToMadridDatetimeLocal(currentEditingEvent.start_time) === localCombined) {
          startTimeIso = currentEditingEvent.start_time;
        } else {
          startTimeIso = parseMadridToUtcIso(localCombined);
        }
      }

      let endTimeIso = null;
      if (timeStatus === 'confirmed' && endVal) {
        if (currentEditingEvent && id && formatToMadridDatetimeLocal(currentEditingEvent.end_time) === endVal) {
          endTimeIso = currentEditingEvent.end_time;
        } else {
          endTimeIso = parseMadridToUtcIso(endVal);
        }

        if (endTimeIso && startTimeIso && new Date(endTimeIso) <= new Date(startTimeIso)) {
          showFormError('La fecha y hora de finalización debe ser posterior a la de inicio.', 'ev-end-time');
          return;
        }
      }

      const payload = {
        title,
        category,
        editorial_date: editorialDate || dateLocal,
        time_status: timeStatus,
        start_time: startTimeIso,
        end_time: endTimeIso,
        end_date: timeStatus === 'continuous' ? (endDate || null) : null,
        schedule_text: timeStatus === 'continuous' ? scheduleText : null,
        approximate_schedule: (timeStatus === 'pending_time' || timeStatus === 'tentative_date') ? approximateSchedule : null,
        festival_ids: festivalIds,
        price_cents: priceCents,
        is_free: isFree,
        status: targetStatus,
        description,
        source_url: sourceUrl,
        image_url: imageUrl,
        image_thumb_url: imageThumbUrl,
        image_original_url: imageOriginalUrl,
      };

      if (venueId && Number(venueId) !== 9999) {
        payload.venue_id = Number(venueId);
      } else {
        payload.venue_id = null;
      }

      modalEventSaveInProgress = true;
      setSaveButtonsLoading(true, 'Guardando...');

      try {
        let res;
        if (id) {
          res = await apiFetch(\`/api/v1/admin/events/\${id}\`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          // Si es borrador sin local, utilizar endpoint dedicado de draft
          if (targetStatus === 'tentative' && !payload.venue_id) {
            res = await apiFetch('/api/v1/admin/events/draft', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          } else {
            res = await apiFetch('/api/v1/admin/events', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          }
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showFormError(errData.message || 'Error al guardar el evento.');
          return;
        }

        modalEventSaveInProgress = false;
        eventModalFormDirty = false;
        closeModal('modal-event');

        if (editEventOrigin === 'inbox') {
          await loadAdminInbox();
          updateCurationCounts();
        } else {
          await loadAdminEvents();
        }
      } catch (err) {
        showFormError(err.message || 'Error de conexión al guardar el evento.');
      } finally {
        modalEventSaveInProgress = false;
        setSaveButtonsLoading(false);
      }
    };

    window.submitEventStatusChange = async function(newStatus) {
      if (modalEventSaveInProgress) return;
      const id = document.getElementById('ev-id').value;
      if (!id) return;

      // Si se pasa a published, verificar precondiciones
      if (newStatus === 'published') {
        const venueId = document.getElementById('ev-venue-id').value;
        if (!venueId || Number(venueId) === 9999) {
          const venueErrMsg = 'Para publicar el evento es obligatorio asignar un local del censo.';
          showFormError(venueErrMsg, 'ev-venue-search');
          const venueErr = document.getElementById('ev-venue-field-error');
          if (venueErr) {
            venueErr.innerText = venueErrMsg;
            venueErr.style.display = 'block';
          }
          const venueInput = document.getElementById('ev-venue-search');
          if (venueInput) {
            venueInput.style.borderColor = '#dc2626';
            venueInput.setAttribute('aria-invalid', 'true');
            venueInput.setAttribute('aria-describedby', 'ev-venue-field-error ev-venue-unassigned-notice');
          }
          return;
        }

        const timeStatus = document.getElementById('ev-time-status')?.value;
        if (timeStatus === 'tentative_date') {
          showFormError('Un evento con fecha orientativa o preliminar no puede publicarse como confirmado.');
          return;
        }
        if (timeStatus === 'continuous' && !document.getElementById('ev-end-date')?.value) {
          showFormError('Para publicar una exposición continuada es obligatorio indicar la fecha final de periodo.');
          return;
        }
        if (timeStatus === 'confirmed' && !document.getElementById('ev-time-local')?.value) {
          showFormError('Para publicar un evento puntual confirmado es obligatoria la hora de inicio (HH:MM).');
          return;
        }
      }

      await submitEventForm(newStatus);
    };

    // Alias retrocompatible
    window.saveEvent = async function(e) {
      if (e && e.preventDefault) e.preventDefault();
      return submitEventForm();
    };

    // Cierre controlado y comprobación de cambios sin guardar
    window.requestCloseEventModal = function() {
      if (modalEventSaveInProgress || isEventImageUploading) return;
      if (eventModalFormDirty) {
        const ok = window.confirm('Hay cambios sin guardar en el evento. ¿Seguro que deseas salir y descartar los cambios?');
        if (!ok) return;
      }
      forceCloseEventModal();
    };

    window.forceCloseEventModal = function() {
      eventModalFormDirty = false;
      closeModal('modal-event');
      const dropdown = document.getElementById('ev-venue-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    };

    window.handleEventBackdropClick = function(event) {
      if (event.target && event.target.id === 'modal-event') {
        requestCloseEventModal();
      }
    };

    // ==============================================================================
    // Métricas por Evento
    // ==============================================================================
    window.viewMetrics = async function(id) {
      lastActiveElementBeforeModal = document.activeElement;
      openModal('modal-metrics');
      document.getElementById('modal-metrics-title').innerText = 'Cargando métricas...';
      document.getElementById('m-impressions').innerText = '—';
      document.getElementById('m-maps').innerText = '—';
      document.getElementById('m-tickets').innerText = '—';
      document.getElementById('m-whatsapp').innerText = '—';
      document.getElementById('m-sessions').innerText = '—';

      const breakdownTbody = document.getElementById('metrics-breakdown-tbody');
      breakdownTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:1rem;">Cargando desglose...</td></tr>';

      try {
        const res = await apiFetch(\`/api/v1/admin/metrics/events/\${id}\`);
        if (!res.ok) {
          document.getElementById('modal-metrics-title').innerText = 'Error al cargar métricas';
          breakdownTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--red); padding:1rem;">No se pudieron obtener las métricas del evento.</td></tr>';
          return;
        }
        const data = await res.json();
        const s = data.summary || {};

        document.getElementById('modal-metrics-title').innerText = 'Métricas: ' + (data.event?.title || ('#' + id));
        document.getElementById('m-impressions').innerText = s.total_impressions ?? 0;
        document.getElementById('m-maps').innerText = s.total_map_clicks ?? 0;
        document.getElementById('m-tickets').innerText = s.total_ticket_clicks ?? 0;
        document.getElementById('m-whatsapp').innerText = s.total_whatsapp_clicks ?? 0;
        document.getElementById('m-sessions').innerText = s.unique_sessions ?? 0;

        if (data.breakdown && data.breakdown.length > 0) {
          breakdownTbody.innerHTML = data.breakdown.map(b => \`
            <tr>
              <td><span class="venue-badge">\${escapeHtml(b.channel || 'web')}</span></td>
              <td><strong>\${escapeHtml(b.metric_type || '—')}</strong></td>
              <td style="text-align:right;"><strong style="color:var(--text-main); font-size:0.9375rem;">\${b.count ?? 0}</strong></td>
            </tr>
          \`).join('');
        } else {
          breakdownTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:1.25rem;">Sin interacciones registradas aún para este evento.</td></tr>';
        }
      } catch (err) {
        document.getElementById('modal-metrics-title').innerText = 'Error al cargar métricas';
        breakdownTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--red); padding:1rem;">Error de conexión con el servidor.</td></tr>';
      }
    };
    // ==============================================================================
    // Gestión de Locales (Venues)
    // ==============================================================================
    let currentVenuesList = [];
    let venueCurrentPage = 1;
    const venuePageLimit = 15;
    let venueSearchQuery = '';
    let venueFilterCategory = '';
    let venueFilterCity = '';
    let venueFilterStatus = '';
    let venueFilterWhatsapp = '';
    let venueSortBy = 'name';
    let venueSortOrder = 'asc';
    let venueTotalPages = 1;
    let venueTotalCount = 0;
    let venueSearchDebounceTimer = null;
    let venueDeletingId = null;
    let modalVenueDeleteInProgress = false;

    function formatMadridDate(isoStr) {
      if (!isoStr) return '—';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
    }

    window.onVenueSearchInput = function(val) {
      venueSearchQuery = (val || '').trim();
      if (venueSearchDebounceTimer) clearTimeout(venueSearchDebounceTimer);
      venueSearchDebounceTimer = setTimeout(() => {
        venueCurrentPage = 1;
        loadAdminVenues();
      }, 300);
    };

    window.onVenueFilterChange = function() {
      venueFilterCity = document.getElementById('venue-filter-city')?.value || '';
      venueFilterCategory = document.getElementById('venue-filter-category')?.value || '';
      venueFilterStatus = document.getElementById('venue-filter-status')?.value || '';
      venueFilterWhatsapp = document.getElementById('venue-filter-whatsapp')?.value || '';
      venueCurrentPage = 1;
      loadAdminVenues();
    };

    window.onVenueSortChange = function() {
      const val = document.getElementById('venue-filter-sort')?.value || 'name_asc';
      if (val === 'name_asc') { venueSortBy = 'name'; venueSortOrder = 'asc'; }
      else if (val === 'name_desc') { venueSortBy = 'name'; venueSortOrder = 'desc'; }
      else if (val === 'city_asc') { venueSortBy = 'city'; venueSortOrder = 'asc'; }
      else if (val === 'created_at_desc') { venueSortBy = 'created_at'; venueSortOrder = 'desc'; }
      else if (val === 'created_at_asc') { venueSortBy = 'created_at'; venueSortOrder = 'asc'; }
      venueCurrentPage = 1;
      loadAdminVenues();
    };

    window.resetVenueFilters = function() {
      venueSearchQuery = '';
      venueFilterCategory = '';
      venueFilterCity = '';
      venueFilterStatus = '';
      venueFilterWhatsapp = '';
      venueSortBy = 'name';
      venueSortOrder = 'asc';
      venueCurrentPage = 1;

      const searchEl = document.getElementById('venue-filter-search');
      if (searchEl) searchEl.value = '';
      const cityEl = document.getElementById('venue-filter-city');
      if (cityEl) cityEl.value = '';
      const catEl = document.getElementById('venue-filter-category');
      if (catEl) catEl.value = '';
      const statusEl = document.getElementById('venue-filter-status');
      if (statusEl) statusEl.value = '';
      const waEl = document.getElementById('venue-filter-whatsapp');
      if (waEl) waEl.value = '';
      const sortEl = document.getElementById('venue-filter-sort');
      if (sortEl) sortEl.value = 'name_asc';

      loadAdminVenues();
    };

    window.changeVenuePage = function(delta) {
      const newPage = venueCurrentPage + delta;
      if (newPage >= 1 && newPage <= venueTotalPages) {
        venueCurrentPage = newPage;
        loadAdminVenues();
      }
    };

    async function loadAdminVenues() {
      const tbody = document.getElementById('venues-tbody');
      const cardsContainer = document.getElementById('venues-cards-container');
      const countBadge = document.getElementById('venues-count-badge');
      const paginationContainer = document.getElementById('venues-pagination-container');
      const prevBtn = document.getElementById('venues-prev-page-btn');
      const nextBtn = document.getElementById('venues-next-page-btn');
      const pageIndicator = document.getElementById('venues-page-indicator');
      const pageInfo = document.getElementById('venues-pagination-info');

      if (tbody) tbody.innerHTML = '<tr><td colspan=\"8\" style=\"text-align:center; padding:2rem; color:var(--text-muted);\">Cargando locales...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style=\"text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);\">Cargando locales...</div>';

      try {
        const params = new URLSearchParams();
        params.set('page', String(venueCurrentPage));
        params.set('limit', String(venuePageLimit));
        params.set('sort_by', venueSortBy);
        params.set('sort_order', venueSortOrder);
        if (venueSearchQuery) params.set('q', venueSearchQuery);
        if (venueFilterCategory) params.set('category', venueFilterCategory);
        if (venueFilterCity) params.set('city', venueFilterCity);
        if (venueFilterStatus) params.set('status', venueFilterStatus);
        if (venueFilterWhatsapp) params.set('has_whatsapp', venueFilterWhatsapp);

        const res = await apiFetch(\`/api/v1/admin/venues?\${params.toString()}\`);
        if (!res.ok) {
          throw new Error('Error al consultar el censo de locales.');
        }

        const data = await res.json();
        const venues = data.venues || [];
        currentVenuesList = venues;
        venueTotalCount = typeof data.total === 'number' ? data.total : venues.length;
        venueTotalPages = data.total_pages || 1;

        if (countBadge) {
          countBadge.innerText = venueTotalCount;
          countBadge.style.display = 'inline-block';
        }

        // Población dinámica de selectores de filtros
        if (data.filters) {
          const citySelect = document.getElementById('venue-filter-city');
          if (citySelect && citySelect.options.length <= 1 && Array.isArray(data.filters.cities)) {
            data.filters.cities.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c.slug || String(c.id);
              opt.textContent = c.name;
              citySelect.appendChild(opt);
            });
            if (venueFilterCity) citySelect.value = venueFilterCity;
          }

          const catSelect = document.getElementById('venue-filter-category');
          if (catSelect && catSelect.options.length <= 1 && Array.isArray(data.filters.categories)) {
            data.filters.categories.forEach(cat => {
              if (cat) {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
                catSelect.appendChild(opt);
              }
            });
            if (venueFilterCategory) catSelect.value = venueFilterCategory;
          }
        }

        // Paginación UI
        if (prevBtn) prevBtn.disabled = venueCurrentPage <= 1;
        if (nextBtn) nextBtn.disabled = venueCurrentPage >= venueTotalPages;
        if (pageIndicator) pageIndicator.textContent = \`Página \${venueCurrentPage} de \${venueTotalPages}\`;

        const startItem = venueTotalCount === 0 ? 0 : (venueCurrentPage - 1) * venuePageLimit + 1;
        const endItem = Math.min(venueCurrentPage * venuePageLimit, venueTotalCount);
        if (pageInfo) pageInfo.textContent = \`Mostrando \${startItem} - \${endItem} de \${venueTotalCount} locales\`;
        if (paginationContainer) paginationContainer.style.display = 'flex';

        if (venues.length === 0) {
          const emptyMsg = venueSearchQuery || venueFilterCategory || venueFilterCity || venueFilterStatus || venueFilterWhatsapp
            ? 'No se encontraron locales con los filtros aplicados.'
            : 'No hay locales censados registrados.';
          if (tbody) tbody.innerHTML = \`<tr><td colspan=\"8\" style=\"text-align:center; color:var(--text-dim); padding:2.5rem 1rem;\">\${emptyMsg}</td></tr>\`;
          if (cardsContainer) cardsContainer.innerHTML = \`<div style=\"text-align:center; color:var(--text-dim); padding:2.5rem 1rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);\">\${emptyMsg}</div>\`;
          return;
        }

        // Render Desktop (8 columnas: nombre, ciudad, categoría, teléfono, WhatsApp, estado, fecha de creación, acciones)
        if (tbody) {
          tbody.innerHTML = venues.map(v => {
            const is9999 = v.id === 9999;
            const statusBadge = is9999
              ? '<span class=\"badge-status\" style=\"background:#fef3c7; color:#92400e; border:1px solid #fde68a;\">⚠️ Provisional</span>'
              : \`<span class=\"badge-status \${v.is_active ? 'badge-active' : 'badge-cancelled'}\">\${v.is_active ? 'Activo' : 'Inactivo'}</span>\`;

            // Contacto WhatsApp
            let waHtml = '<span style=\"color:var(--text-dim);\">—</span>';
            if (v.whatsapp_contact) {
              const cleanWa = v.whatsapp_contact.replace(/[^0-9]/g, '');
              waHtml = \`<div>💬 <a href=\"https://wa.me/\${encodeURIComponent(cleanWa)}\" target=\"_blank\" rel=\"noopener\" style=\"color:#059669; font-weight:600; text-decoration:none;\">\${escapeHtml(v.whatsapp_contact)}</a></div>\`;
            }

            // Contacto Teléfono
            const phoneHtml = v.phone
              ? \`<a href=\"tel:\${escapeHtml(v.phone)}\" style=\"color:var(--text-main); font-weight:600; text-decoration:none;\">📞 \${escapeHtml(v.phone)}</a>\`
              : '<span style=\"color:var(--text-dim);\">—</span>';

            // Ciudad
            const cityName = v.city_name || '—';

            // Categoría
            const categoryBadge = \`<span class=\"venue-badge\" style=\"text-transform:capitalize;\">\${escapeHtml(v.category || 'general')}</span>\`;

            // Fecha de creación
            const createdFormatted = formatMadridDate(v.created_at);

            // Enlaces externos de nombre
            const extLinks = [];
            if (v.google_maps_url) {
              extLinks.push(\`<a href=\"\${escapeHtml(v.google_maps_url)}\" target=\"_blank\" rel=\"noopener\" class=\"link-source\" style=\"display:inline-flex; align-items:center; gap:0.2rem; font-size:0.75rem; color:var(--primary); text-decoration:none;\">🗺️ Maps ↗</a>\`);
            }
            if (v.instagram_handle) {
              extLinks.push(\`<a href=\"https://instagram.com/\${encodeURIComponent(v.instagram_handle)}\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-flex; align-items:center; gap:0.2rem; font-size:0.75rem; color:var(--primary); text-decoration:none;\">📷 @\${escapeHtml(v.instagram_handle)}</a>\`);
            }
            if (v.facebook_url) {
              extLinks.push(\`<a href=\"\${escapeHtml(v.facebook_url)}\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-flex; align-items:center; gap:0.2rem; font-size:0.75rem; color:var(--primary); text-decoration:none;\">📘 FB ↗</a>\`);
            }
            if (v.website_url) {
              extLinks.push(\`<a href=\"\${escapeHtml(v.website_url)}\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-flex; align-items:center; gap:0.2rem; font-size:0.75rem; color:var(--primary); text-decoration:none;\">🌐 Web ↗</a>\`);
            }
            const linksHtml = extLinks.length > 0
              ? \`<div style=\"display:flex; gap:0.5rem; margin-top:0.25rem; flex-wrap:wrap;\">\${extLinks.join('')}</div>\`
              : \`<div style=\"font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;\">Sin enlaces registrados</div>\`;

            return \`
              <tr id=\"venue-row-\${v.id}\">
                <td>
                  <div style=\"font-weight:700; font-size:0.9375rem; color:var(--text-main); line-height:1.35;\">
                    \${escapeHtml(v.name)}
                    <span style=\"color:var(--text-dim); font-size:0.75rem; font-weight:500; margin-left:0.25rem;\">#\${v.id}</span>
                  </div>
                  \${v.address ? \`<div style=\"font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;\">📍 \${escapeHtml(v.address)}</div>\` : ''}
                  \${linksHtml}
                  \${is9999 ? \`<div style=\"margin-top:0.35rem;\"><span class=\"badge-unverified\">⚠️ Registro técnico para eventos pendientes de asignación</span></div>\` : ''}
                </td>
                <td><strong style=\"color:var(--text-main); font-size:0.875rem;\">\${escapeHtml(cityName)}</strong></td>
                <td>\${categoryBadge}</td>
                <td>\${phoneHtml}</td>
                <td>\${waHtml}</td>
                <td>\${statusBadge}</td>
                <td><span style=\"font-size:0.8125rem; color:var(--text-muted); white-space:nowrap;\">\${createdFormatted}</span></td>
                <td>
                  <div style=\"display:flex; gap:0.35rem; align-items:center; flex-wrap:wrap;\">
                    <button class=\"btn-table-action\" onclick=\"editVenue(\${v.id})\" aria-label=\"Editar local #\${v.id}\" title=\"Editar local\">✏️ Editar</button>
                    <button class=\"btn-table-action btn-danger\" onclick=\"openDeleteVenueModal(\${v.id})\" aria-label=\"Eliminar local #\${v.id}\" title=\"Eliminar local\">🗑️ Eliminar</button>
                  </div>
                </td>
              </tr>
            \`;
          }).join('');
        }

        // Render Móvil (Tarjetas)
        if (cardsContainer) {
          cardsContainer.innerHTML = venues.map(v => {
            const is9999 = v.id === 9999;
            const statusBadge = is9999
              ? '<span class=\"badge-status\" style=\"background:#fef3c7; color:#92400e; border:1px solid #fde68a;\">⚠️ Provisional</span>'
              : \`<span class=\"badge-status \${v.is_active ? 'badge-active' : 'badge-cancelled'}\">\${v.is_active ? 'Activo' : 'Inactivo'}</span>\`;

            return \`
              <article class=\"venue-card \${is9999 ? 'venue-card-warning' : ''}\" id=\"venue-card-\${v.id}\">
                <div class=\"venue-card-header\">
                  <div style=\"display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;\">
                    \${statusBadge}
                    <span style=\"font-size:0.75rem; font-weight:700; color:var(--text-dim);\">#\${v.id}</span>
                    <span class=\"venue-badge\" style=\"font-weight:600;\">📍 \${escapeHtml(v.city_name || '—')}</span>
                    <span class=\"venue-badge\">Cat: \${escapeHtml(v.category || 'general')}</span>
                  </div>
                </div>
                <h4 class=\"venue-card-title\">\${escapeHtml(v.name)}</h4>
                \${is9999 ? \`
                  <div style=\"font-size:0.8125rem; color:#b45309; font-weight:600; line-height:1.4;\">
                    ⚠️ Registro técnico para eventos pendientes de asignación.
                  </div>
                \` : ''}
                <div class=\"venue-card-body\" style=\"display:flex; flex-direction:column; gap:0.35rem; font-size:0.875rem;\">
                  \${v.address ? \`<div>📍 Dirección: <strong>\${escapeHtml(v.address)}</strong></div>\` : ''}
                  \${v.phone ? \`<div>📞 Teléfono: <strong>\${escapeHtml(v.phone)}</strong></div>\` : ''}
                  \${v.whatsapp_contact ? \`<div>💬 WhatsApp: <strong>\${escapeHtml(v.whatsapp_contact)}</strong></div>\` : ''}
                  \${v.instagram_handle ? \`<div>📷 Instagram: <strong>@\${escapeHtml(v.instagram_handle)}</strong></div>\` : ''}
                  \${v.facebook_url ? \`<div>📘 Facebook: <a href=\"\${escapeHtml(v.facebook_url)}\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--primary); font-size:0.8125rem;\">Página de Facebook ↗</a></div>\` : ''}
                  \${v.google_maps_url ? \`<div>🗺️ <a href=\"\${escapeHtml(v.google_maps_url)}\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--primary); font-size:0.8125rem;\">Ver en Google Maps ↗</a></div>\` : ''}
                  \${v.website_url ? \`<div>🌐 <a href=\"\${escapeHtml(v.website_url)}\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--primary); font-size:0.8125rem;\">Web oficial ↗</a></div>\` : ''}
                  \${(!v.google_maps_url && !v.instagram_handle && !v.facebook_url && !v.website_url) ? \`<div style=\"font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;\">Sin enlaces registrados</div>\` : ''}
                  <div style=\"font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;\">📅 Alta: \${formatMadridDate(v.created_at)}</div>
                </div>
                <div class=\"venue-card-actions\" style=\"display:flex; gap:0.5rem; margin-top:0.5rem;\">
                  <button class=\"btn-card-action\" onclick=\"editVenue(\${v.id})\" aria-label=\"Editar local #\${v.id}\" style=\"flex:1;\">✏️ Editar Local</button>
                  <button class=\"btn-card-action\" style=\"color:var(--red); border-color:#fecaca;\" onclick=\"openDeleteVenueModal(\${v.id})\" aria-label=\"Eliminar local #\${v.id}\">🗑️ Eliminar</button>
                </div>
              </article>
            \`;
          }).join('');
        }
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan=\"8\" style=\"text-align:center; color:var(--red); padding:2rem;\">Error al cargar el censo de locales.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style=\"text-align:center; color:var(--red); padding:2rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);\">Error al cargar el censo de locales.</div>';
      }
    }

    window.openNewVenueModal = function() {
      modalVenueSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-venue-title').innerText = 'Nuevo Local';
      document.getElementById('form-venue').reset();
      document.getElementById('venue-id').value = '';

      const errBanner = document.getElementById('venue-form-error');
      if (errBanner) {
        errBanner.style.display = 'none';
        errBanner.textContent = '';
      }

      // Eliminar opciones heredadas temporales que pudiera haber dejado una edición anterior
      const catEl = document.getElementById('venue-category');
      if (catEl) {
        Array.from(catEl.options).forEach(opt => {
          if (opt.dataset && opt.dataset.legacy === 'true') catEl.removeChild(opt);
        });
        catEl.value = '';
      }

      const activeCheckbox = document.getElementById('venue-is-active');
      if (activeCheckbox) activeCheckbox.checked = true;

      const saveBtn = document.getElementById('btn-save-venue');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Local';
      }
      openModal('modal-venue');
      const input = document.getElementById('venue-name');
      if (input) input.focus();
    };

    window.editVenue = function(id) {
      const v = currentVenuesList.find(x => x.id === id) || cachedVenues.find(x => x.id === id);
      if (!v) return;
      modalVenueSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-venue-title').innerText = 'Editar Local #' + v.id;
      document.getElementById('venue-id').value = v.id;

      const errBanner = document.getElementById('venue-form-error');
      if (errBanner) {
        errBanner.style.display = 'none';
        errBanner.textContent = '';
      }

      // Identidad
      document.getElementById('venue-name').value = v.name || '';
      const slugEl = document.getElementById('venue-slug');
      if (slugEl) slugEl.value = v.slug || '';
      const catEl = document.getElementById('venue-category');
      if (catEl) {
        const currentCat = v.category || '';
        // Si la categoría del registro existe pero no está en las opciones del select
        // (valor heredado), la añadimos como opción temporal para no perderla.
        const existingOpts = Array.from(catEl.options).map(o => o.value);
        if (currentCat && !existingOpts.includes(currentCat)) {
          const legacyOpt = document.createElement('option');
          legacyOpt.value = currentCat;
          legacyOpt.textContent = currentCat + ' (heredado)';
          legacyOpt.dataset.legacy = 'true';
          catEl.insertBefore(legacyOpt, catEl.options[1]); // tras el placeholder
        }
        catEl.value = currentCat;
      }
      const zoneEl = document.getElementById('venue-zone');
      if (zoneEl) zoneEl.value = v.zone || '';
      const activeCheckbox = document.getElementById('venue-is-active');
      if (activeCheckbox) {
        activeCheckbox.checked = v.is_active !== false;
      }

      // Ubicación
      document.getElementById('venue-address').value = v.address || '';
      const latEl = document.getElementById('venue-latitude');
      if (latEl) latEl.value = v.latitude != null ? v.latitude : '';
      const lngEl = document.getElementById('venue-longitude');
      if (lngEl) lngEl.value = v.longitude != null ? v.longitude : '';
      const mapsEl = document.getElementById('venue-maps-url');
      if (mapsEl) mapsEl.value = v.google_maps_url || '';

      // Contacto
      const phoneEl = document.getElementById('venue-phone');
      if (phoneEl) phoneEl.value = v.phone || '';
      const waEl = document.getElementById('venue-whatsapp');
      if (waEl) waEl.value = v.whatsapp_contact || '';

      // Web y redes
      const webEl = document.getElementById('venue-website');
      if (webEl) webEl.value = v.website_url || '';
      const igEl = document.getElementById('venue-instagram');
      if (igEl) igEl.value = v.instagram_handle || '';
      const fbEl = document.getElementById('venue-facebook');
      if (fbEl) fbEl.value = v.facebook_url || '';

      const saveBtn = document.getElementById('btn-save-venue');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Cambios';
      }
      openModal('modal-venue');
      const nameInput = document.getElementById('venue-name');
      if (nameInput) nameInput.focus();
    };

    window.saveVenue = async function(e) {
      e.preventDefault();
      if (modalVenueSaveInProgress) return;

      const errBanner = document.getElementById('venue-form-error');
      const showFormError = (msg) => {
        if (errBanner) {
          errBanner.textContent = msg;
          errBanner.style.display = 'block';
          const modalBody = errBanner.closest('.modal-body');
          if (modalBody) modalBody.scrollTop = 0;
        } else {
          alert(msg);
        }
      };

      if (errBanner) {
        errBanner.style.display = 'none';
        errBanner.textContent = '';
      }

      const saveBtn = document.getElementById('btn-save-venue');
      const id = document.getElementById('venue-id').value;
      const nameVal = document.getElementById('venue-name').value.trim();

      // Prevalidación: nombre obligatorio >= 2 caracteres
      if (!nameVal || nameVal.length < 2) {
        showFormError('El nombre del local debe tener al menos 2 caracteres.');
        document.getElementById('venue-name')?.focus();
        return;
      }

      const websiteVal = document.getElementById('venue-website')?.value.trim() || '';
      const facebookVal = document.getElementById('venue-facebook')?.value.trim() || '';
      const mapsVal = document.getElementById('venue-maps-url')?.value.trim() || '';
      const latVal = document.getElementById('venue-latitude')?.value.trim() || '';
      const lngVal = document.getElementById('venue-longitude')?.value.trim() || '';

      // Prevalidación: website_url no puede ser Facebook
      if (websiteVal) {
        try {
          const parsedWeb = new URL(websiteVal.startsWith('http://') || websiteVal.startsWith('https://') ? websiteVal : 'https://' + websiteVal);
          const webHost = parsedWeb.hostname.toLowerCase();
          if (webHost === 'facebook.com' || webHost.endsWith('.facebook.com')) {
            showFormError('Las URLs de Facebook deben guardarse en el campo específico "Página de Facebook", no en "Sitio Web Oficial".');
            document.getElementById('venue-website')?.focus();
            return;
          }
        } catch {}
      }

      // Prevalidación URLs válidas si se introducen
      const isValidHttpUrl = (str) => {
        try {
          const u = new URL(str.startsWith('http://') || str.startsWith('https://') ? str : 'https://' + str);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      };

      if (websiteVal && !isValidHttpUrl(websiteVal)) {
        showFormError('El formato del Sitio Web Oficial no es válido.');
        document.getElementById('venue-website')?.focus();
        return;
      }

      if (facebookVal) {
        if (!isValidHttpUrl(facebookVal)) {
          showFormError('El formato de la Página de Facebook no es válido.');
          document.getElementById('venue-facebook')?.focus();
          return;
        }
        try {
          const parsedFb = new URL(facebookVal.startsWith('http://') || facebookVal.startsWith('https://') ? facebookVal : 'https://' + facebookVal);
          const fbHost = parsedFb.hostname.toLowerCase();
          if (fbHost !== 'facebook.com' && !fbHost.endsWith('.facebook.com')) {
            showFormError('La URL de Facebook debe pertenecer a facebook.com o a sus subdominios oficiales.');
            document.getElementById('venue-facebook')?.focus();
            return;
          }
          if (!parsedFb.pathname || parsedFb.pathname === '/' || parsedFb.pathname.trim() === '') {
            showFormError('La URL de Facebook debe incluir la ruta de la página o perfil.');
            document.getElementById('venue-facebook')?.focus();
            return;
          }
        } catch {
          showFormError('El formato de la Página de Facebook no es válido.');
          document.getElementById('venue-facebook')?.focus();
          return;
        }
      }

      if (mapsVal && !isValidHttpUrl(mapsVal)) {
        showFormError('El formato del enlace de Google Maps no es válido.');
        document.getElementById('venue-maps-url')?.focus();
        return;
      }

      // Prevalidación coordenadas
      let parsedLat = null;
      if (latVal !== '') {
        parsedLat = parseFloat(latVal);
        if (Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
          showFormError('La latitud debe ser un número decimal entre -90 y 90.');
          document.getElementById('venue-latitude')?.focus();
          return;
        }
      }

      let parsedLng = null;
      if (lngVal !== '') {
        parsedLng = parseFloat(lngVal);
        if (Number.isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
          showFormError('La longitud debe ser un número decimal entre -180 y 180.');
          document.getElementById('venue-longitude')?.focus();
          return;
        }
      }

      const activeCheckbox = document.getElementById('venue-is-active');
      const isActiveVal = activeCheckbox ? activeCheckbox.checked : true;

      const instagramRaw = document.getElementById('venue-instagram')?.value.trim() || '';
      const instagramClean = instagramRaw.replace(/^@+/, '').trim();

      const payload = {
        name: nameVal,
        slug: document.getElementById('venue-slug')?.value.trim() || null,
        category: document.getElementById('venue-category')?.value.trim() || null,
        zone: document.getElementById('venue-zone')?.value.trim() || null,
        is_active: isActiveVal,
        address: document.getElementById('venue-address')?.value.trim() || null,
        latitude: parsedLat,
        longitude: parsedLng,
        google_maps_url: mapsVal || null,
        phone: document.getElementById('venue-phone')?.value.trim() || null,
        whatsapp_contact: document.getElementById('venue-whatsapp')?.value.trim() || null,
        website_url: websiteVal || null,
        instagram_handle: instagramClean || null,
        facebook_url: facebookVal || null,
      };

      modalVenueSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';
      }

      try {
        let res;
        if (id) {
          res = await apiFetch('/api/v1/admin/venues/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          res = await apiFetch('/api/v1/admin/venues', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showFormError(errData.message || 'Error al guardar el local.');
          return;
        }

        closeModal('modal-venue');
        await loadVenuesCache();
        loadAdminVenues();
      } catch (err) {
        showFormError('Error de conexión al guardar el local.');
      } finally {
        modalVenueSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = id ? 'Guardar Cambios' : 'Guardar Local';
        }
      }
    };

    window.openDeleteVenueModal = async function(id) {
      venueDeletingId = id;
      const modalBody = document.getElementById('modal-delete-venue-body');
      const confirmBtn = document.getElementById('btn-confirm-delete-venue');
      const errBox = document.getElementById('modal-delete-venue-error');
      if (errBox) {
        errBox.style.display = 'none';
        errBox.innerHTML = '';
      }

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.display = 'none';
      }
      if (modalBody) {
        modalBody.innerHTML = '<div style=\"text-align:center; padding:2rem; color:var(--text-muted);\">Comprobando dependencias del local...</div>';
      }

      openModal('modal-delete-venue');

      try {
        const res = await apiFetch(\`/api/v1/admin/venues/\${id}/dependencies\`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (modalBody) {
            modalBody.innerHTML = \`<div style=\"padding:1rem; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:0.875rem;\">\${escapeHtml(errData.message || 'Error al comprobar dependencias.')}</div>\`;
          }
          return;
        }

        const data = await res.json();
        const venue = data.venue || {};
        const isProtected = data.is_protected;
        const canDelete = data.can_delete;
        const deps = data.dependencies || [];

        if (modalBody) {
          let statusHtml = '';
          if (deps.length > 0) {
            statusHtml = \`
              <div style=\"padding:0.875rem; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; color:#92400e; font-size:0.875rem; line-height:1.4;\">
                <strong>🚫 Borrado bloqueado por dependencias activas</strong>
                <p style=\"margin:0.4rem 0 0.5rem 0;\">No se puede eliminar el local porque contiene datos asociados en la base de datos:</p>
                <ul style=\"margin:0; padding-left:1.25rem;\">
                  \${deps.map(d => \`<li style=\"margin-bottom:0.25rem; font-weight:600;\">\${escapeHtml(d)}</li>\`).join('')}
                </ul>
                <p style=\"margin:0.5rem 0 0 0; font-size:0.8125rem; color:#78350f;\">
                  Para proteger la integridad referencial, primero deben eliminarse o desvincularse estas referencias antes de poder borrar el local.
                </p>
              </div>
            \`;
          } else {
            statusHtml = \`
              <div style=\"padding:0.875rem; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:0.875rem; line-height:1.4;\">
                <strong>⚠️ Confirmar eliminación definitiva</strong>
                <p style=\"margin:0.4rem 0 0 0;\">
                  El local no tiene dependencias activas. Esta acción ejecutará un borrado definitivo e irreversible de la base de datos.
                </p>
              </div>
            \`;
          }

          modalBody.innerHTML = \`
            <div style=\"display:flex; flex-direction:column; gap:0.875rem;\">
              <div style=\"background:var(--bg-subtle); padding:0.875rem; border-radius:8px; border:1px solid var(--border);\">
                <div style=\"font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;\">Local seleccionado</div>
                <div style=\"font-size:1.15rem; font-weight:800; color:var(--text-main); margin-top:0.25rem;\">
                  \${escapeHtml(venue.name || 'Local')}
                </div>
                <div style=\"font-size:0.875rem; color:var(--text-muted); margin-top:0.35rem; display:flex; gap:1.25rem; flex-wrap:wrap;\">
                  <span><strong>ID:</strong> #\${venue.id}</span>
                  <span><strong>Ciudad:</strong> \${escapeHtml(venue.city_name || 'Desconocida')}</span>
                </div>
              </div>
              \${statusHtml}
            </div>
          \`;
        }

        if (confirmBtn) {
          if (canDelete) {
            confirmBtn.disabled = false;
            confirmBtn.style.display = 'inline-block';
            confirmBtn.innerText = 'Eliminar definitivamente';
          } else {
            confirmBtn.disabled = true;
            confirmBtn.style.display = 'none';
          }
        }
      } catch (err) {
        if (modalBody) {
          modalBody.innerHTML = '<div style=\"padding:1rem; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:0.875rem;\">Error de conexión al verificar dependencias.</div>';
        }
      }
    };

    window.executeDeleteVenue = async function() {
      if (!venueDeletingId || modalVenueDeleteInProgress) return;
      modalVenueDeleteInProgress = true;
      const confirmBtn = document.getElementById('btn-confirm-delete-venue');
      const cancelBtn = document.querySelector('#modal-delete-venue .btn-secondary');
      const errBox = document.getElementById('modal-delete-venue-error');
      if (errBox) {
        errBox.style.display = 'none';
        errBox.innerHTML = '';
      }
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = 'Eliminando...';
      }
      if (cancelBtn) cancelBtn.disabled = true;

      const targetId = venueDeletingId;
      let deleteSucceeded = false;

      const showModalError = (msg) => {
        if (errBox) {
          errBox.innerHTML = '<strong>⚠️ Error:</strong> ' + escapeHtml(msg);
          errBox.style.display = 'block';
        } else {
          alert(msg);
        }
      };

      try {
        const res = await apiFetch(\`/api/v1/admin/venues/\${targetId}\`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(10000),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showModalError(data.message || 'Error al eliminar el local.');
          return;
        }

        deleteSucceeded = true;
      } catch (err) {
        const isTimeoutOrNetwork = err && (err.name === 'TimeoutError' || err.name === 'AbortError' || err.name === 'TypeError' || (err.message && (err.message.includes('fetch') || err.message.includes('network'))));
        if (isTimeoutOrNetwork) {
          try {
            const checkRes = await apiFetch(\`/api/v1/admin/venues/\${targetId}/dependencies\`, {
              signal: AbortSignal.timeout(5000),
            });
            if (checkRes.status === 404) {
              // El local ya no existe en el servidor: el borrado se completó con éxito
              deleteSucceeded = true;
            } else if (checkRes.ok) {
              showModalError('Tiempo de espera agotado. El local sigue existiendo en el servidor; puede reintentar la eliminación.');
              return;
            } else {
              showModalError('Tiempo de espera agotado. No se pudo confirmar el estado del local; compruebe la conexión antes de reintentar.');
              return;
            }
          } catch {
            showModalError('Error de conexión con el servidor. No se pudo confirmar si el local fue eliminado; verifique la red antes de reintentar.');
            return;
          }
        } else {
          showModalError(err?.message || 'Error al conectar con el servidor.');
          return;
        }
      } finally {
        modalVenueDeleteInProgress = false;
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerText = 'Eliminar definitivamente';
        }
        if (cancelBtn) cancelBtn.disabled = false;
      }

      if (deleteSucceeded) {
        modalVenueDeleteInProgress = false;
        closeModal('modal-delete-venue');
        venueDeletingId = null;

        try {
          await loadVenuesCache();
          await loadAdminVenues();
        } catch {
          alert('Local eliminado; no se pudo actualizar el listado.');
        }
      }
    };

    // ==============================================================================
    // Gestión de Recurrencias
    // ==============================================================================
    const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let cachedRecurrences = [];
    let modalRecurrenceSaveInProgress = false;
    let modalExceptionSaveInProgress = false;

    async function loadAdminRecurrences() {
      const tbody = document.getElementById('recurrences-tbody');
      const cardsContainer = document.getElementById('recurrences-cards-container');
      const badge = document.getElementById('recurrences-count-badge');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando recurrencias...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando recurrencias...</div>';

      try {
        const res = await apiFetch('/api/v1/admin/recurrences');
        const data = await res.json();
        const recs = data.recurrences || [];
        cachedRecurrences = recs;

        if (badge) {
          badge.textContent = String(recs.length);
          badge.style.display = recs.length > 0 ? 'inline-block' : 'none';
        }

        if (recs.length === 0) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No hay actividades periódicas configuradas.</td></tr>';
          if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">No hay actividades periódicas configuradas.</div>';
          return;
        }

        // Render Desktop Rows
        if (tbody) {
          tbody.innerHTML = recs.map(r => {
            const dayLabel = DAY_NAMES[r.day_of_week] !== undefined ? DAY_NAMES[r.day_of_week] : String(r.day_of_week);
            const startTimeStr = r.start_time ? String(r.start_time).slice(0, 5) : '';
            const endTimeStr = r.end_time ? String(r.end_time).slice(0, 5) : '';
            const scheduleStr = startTimeStr ? (endTimeStr ? \`\${startTimeStr} – \${endTimeStr}\` : startTimeStr) : '—';
            const priceStr = r.is_free ? 'Gratis' : (r.price_cents ? (r.price_cents / 100).toFixed(2).replace('.', ',') + ' €' : 'Gratis');
            const excCount = (r.exceptions && Array.isArray(r.exceptions)) ? r.exceptions.length : 0;
            const excStr = excCount > 0 ? \`\${excCount} registrada(s)\` : '—';
            const isActive = r.is_active !== false;
            const statusBadge = isActive
              ? '<span class="badge badge-published">Activa</span>'
              : '<span class="badge badge-outdated">Inactiva</span>';

            return \`
              <tr id="recurrence-row-\${r.id}">
                <td>
                  <span class="badge" style="background:var(--primary-soft); color:var(--primary); font-weight:800;">\${escapeHtml(dayLabel)}</span>
                </td>
                <td>
                  <div style="font-weight:700; color:var(--text-main);">\${escapeHtml(r.title)}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">📍 \${escapeHtml(r.venue_name || 'Sin local')}</div>
                </td>
                <td style="font-weight:600; color:var(--text-main); font-size:0.875rem;">\${escapeHtml(scheduleStr)}</td>
                <td style="color:var(--text-muted); font-size:0.875rem;">\${escapeHtml(priceStr)}</td>
                <td>\${statusBadge}</td>
                <td style="font-size:0.8125rem; color:var(--text-dim);">\${escapeHtml(excStr)}</td>
                <td>
                  <div style="display:flex; gap:0.35rem; align-items:center;">
                    <button type="button" class="btn-table-action" onclick="editRecurrence(\${r.id})">✏️ Editar</button>
                    <button type="button" class="btn-table-action btn-secondary-action" onclick="openExceptionModal(\${r.id})">+ Excepción</button>
                  </div>
                </td>
              </tr>
            \`;
          }).join('');
        }

        // Render Mobile Cards
        if (cardsContainer) {
          cardsContainer.innerHTML = recs.map(r => {
            const dayLabel = DAY_NAMES[r.day_of_week] !== undefined ? DAY_NAMES[r.day_of_week] : String(r.day_of_week);
            const startTimeStr = r.start_time ? String(r.start_time).slice(0, 5) : '';
            const endTimeStr = r.end_time ? String(r.end_time).slice(0, 5) : '';
            const scheduleStr = startTimeStr ? (endTimeStr ? \`\${startTimeStr} – \${endTimeStr}\` : startTimeStr) : '—';
            const priceStr = r.is_free ? 'Gratis' : (r.price_cents ? (r.price_cents / 100).toFixed(2).replace('.', ',') + ' €' : 'Gratis');
            const excCount = (r.exceptions && Array.isArray(r.exceptions)) ? r.exceptions.length : 0;
            const excStr = excCount > 0 ? \`\${excCount} registrada(s)\` : '—';
            const isActive = r.is_active !== false;
            const statusBadge = isActive
              ? '<span class="badge badge-published">Activa</span>'
              : '<span class="badge badge-outdated">Inactiva</span>';

            return \`
              <div class="recurrence-card" id="recurrence-card-\${r.id}">
                <div class="recurrence-card-header">
                  <span class="badge" style="background:var(--primary-soft); color:var(--primary); font-weight:800;">\${escapeHtml(dayLabel)}</span>
                  \${statusBadge}
                </div>
                <h4 class="recurrence-card-title">\${escapeHtml(r.title)}</h4>
                <div class="recurrence-card-body">
                  <div>📍 <strong>Local:</strong> \${escapeHtml(r.venue_name || 'Sin local')}</div>
                  <div>⏰ <strong>Horario:</strong> \${escapeHtml(scheduleStr)}</div>
                  <div>🏷️ <strong>Precio:</strong> \${escapeHtml(priceStr)}</div>
                  <div>⚠️ <strong>Excepciones:</strong> \${escapeHtml(excStr)}</div>
                </div>
                <div class="recurrence-card-actions">
                  <button type="button" class="btn-table-action" onclick="editRecurrence(\${r.id})">✏️ Editar Recurrencia</button>
                  <button type="button" class="btn-table-action btn-secondary-action" onclick="openExceptionModal(\${r.id})">+ Excepción</button>
                </div>
              </div>
            \`;
          }).join('');
        }
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--red); padding:2rem;">Error al cargar recurrencias.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; color:var(--red); padding:2rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">Error al cargar recurrencias.</div>';
      }
    }

    window.openNewRecurrenceModal = function() {
      modalRecurrenceSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-recurrence-title').innerText = 'Nueva Recurrencia Semanal';
      document.getElementById('form-recurrence').reset();
      document.getElementById('rec-id').value = '';
      const saveBtn = document.getElementById('btn-save-recurrence');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Recurrencia';
      }
      openModal('modal-recurrence');
      const titleInput = document.getElementById('rec-title');
      if (titleInput) titleInput.focus();
    };

    window.editRecurrence = function(id) {
      const r = cachedRecurrences.find(x => x.id === id);
      if (!r) return;
      modalRecurrenceSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-recurrence-title').innerText = 'Editar Recurrencia #' + r.id;
      document.getElementById('rec-id').value = r.id;
      document.getElementById('rec-title').value = r.title || '';
      if (document.getElementById('rec-venue-id')) {
        document.getElementById('rec-venue-id').value = r.venue_id;
      }
      if (document.getElementById('rec-dow')) {
        document.getElementById('rec-dow').value = r.day_of_week;
      }
      document.getElementById('rec-start-time').value = r.start_time ? String(r.start_time).slice(0, 5) : '18:00';
      document.getElementById('rec-end-time').value = r.end_time ? String(r.end_time).slice(0, 5) : '';
      const saveBtn = document.getElementById('btn-save-recurrence');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Cambios';
      }
      openModal('modal-recurrence');
      const titleInput = document.getElementById('rec-title');
      if (titleInput) titleInput.focus();
    };

    window.saveRecurrence = async function(e) {
      e.preventDefault();
      if (modalRecurrenceSaveInProgress) return;
      const saveBtn = document.getElementById('btn-save-recurrence');
      const id = document.getElementById('rec-id').value;
      const titleVal = document.getElementById('rec-title').value.trim();
      if (!titleVal) {
        alert('El título de la actividad es obligatorio.');
        return;
      }
      const venueId = Number(document.getElementById('rec-venue-id').value);
      if (!venueId) {
        alert('Debes seleccionar un local.');
        return;
      }
      const startTimeVal = document.getElementById('rec-start-time').value;
      if (!startTimeVal) {
        alert('La hora de inicio es obligatoria.');
        return;
      }
      const endTimeVal = document.getElementById('rec-end-time').value;

      const payload = {
        title: titleVal,
        venue_id: venueId,
        day_of_week: Number(document.getElementById('rec-dow').value),
        start_time: startTimeVal + (startTimeVal.length === 5 ? ':00' : ''),
        end_time: endTimeVal ? endTimeVal + (endTimeVal.length === 5 ? ':00' : '') : null,
      };

      modalRecurrenceSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';
      }

      try {
        let res;
        if (id) {
          res = await apiFetch(\`/api/v1/admin/recurrences/\${id}\`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          res = await apiFetch('/api/v1/admin/recurrences', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.message || 'Error al guardar la recurrencia.');
          return;
        }

        closeModal('modal-recurrence');
        loadAdminRecurrences();
      } catch (err) {
        alert('Error de conexión al guardar la recurrencia.');
      } finally {
        modalRecurrenceSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = id ? 'Guardar Cambios' : 'Guardar Recurrencia';
        }
      }
    };

    window.openExceptionModal = function(recId) {
      modalExceptionSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('exc-rec-id').value = recId;
      document.getElementById('exc-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('exc-reason').value = 'Cancelación puntual por festivo';
      const saveBtn = document.getElementById('btn-save-exception');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Registrar Excepción';
      }
      openModal('modal-exception');
      const dateInput = document.getElementById('exc-date');
      if (dateInput) dateInput.focus();
    };

    window.saveException = async function(e) {
      e.preventDefault();
      if (modalExceptionSaveInProgress) return;
      const saveBtn = document.getElementById('btn-save-exception');
      const recId = document.getElementById('exc-rec-id').value;
      const excDate = document.getElementById('exc-date').value.trim();
      if (!excDate) {
        alert('La fecha de la excepción es obligatoria.');
        return;
      }
      const reasonVal = document.getElementById('exc-reason').value.trim();
      if (!reasonVal) {
        alert('El motivo de la excepción es obligatorio.');
        return;
      }

      const payload = {
        exception_date: excDate,
        reason: reasonVal,
        status: 'cancelled',
      };

      modalExceptionSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Registrando...';
      }

      try {
        const res = await apiFetch(\`/api/v1/admin/recurrences/\${recId}/exceptions\`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.message || 'Error al registrar la excepción.');
          return;
        }

        closeModal('modal-exception');
        loadAdminRecurrences();
      } catch (err) {
        alert('Error de conexión al registrar la excepción.');
      } finally {
        modalExceptionSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Registrar Excepción';
        }
      }
    };

    // ==============================================================================
    // Gestión de Lugares Permanentes (Places)
    // ==============================================================================
    let cachedPlaces = [];
    let modalPlaceSaveInProgress = false;

    async function loadAdminPlaces() {
      const tbody = document.getElementById('places-tbody');
      const cardsContainer = document.getElementById('places-cards-container');
      const badge = document.getElementById('places-count-badge');

      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando lugares...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando lugares...</div>';

      try {
        const res = await apiFetch('/api/v1/admin/places');
        const data = await res.json();
        const places = data.places || [];
        cachedPlaces = places;

        if (badge) {
          badge.textContent = String(places.length);
          badge.style.display = places.length > 0 ? 'inline-block' : 'none';
        }

        if (places.length === 0) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No hay lugares permanentes registrados.</td></tr>';
          if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">No hay lugares permanentes registrados.</div>';
          return;
        }

        // Render Desktop Table
        if (tbody) {
          tbody.innerHTML = places.map(p => {
            const hasCoords = p.latitude !== null && p.latitude !== undefined && p.longitude !== null && p.longitude !== undefined;
            const coordsStr = hasCoords ? \`\${p.latitude}, \${p.longitude}\` : '';
            const mapsLink = p.google_maps_url ? \`<a href="\${escapeHtml(p.google_maps_url)}" target="_blank" rel="noopener" style="color:var(--primary); font-weight:600; text-decoration:underline; font-size:0.75rem;">Ver en Maps ↗</a>\` : '';
            const locationContent = hasCoords || mapsLink
              ? \`<div style="font-size:0.8125rem;">\${coordsStr ? \`<span style="color:var(--text-main); font-family:var(--font-mono, monospace); font-size:0.75rem;">📍 \${escapeHtml(coordsStr)}</span>\` : ''}\${coordsStr && mapsLink ? '<br>' : ''}\${mapsLink}</div>\`
              : '<span style="color:var(--text-dim);">—</span>';

            const scheduleStr = p.opening_hours_text ? escapeHtml(p.opening_hours_text) : '—';
            const priceStr = p.price_text ? escapeHtml(p.price_text) : '';
            const schedPriceContent = \`<div style="font-size:0.8125rem;"><span style="color:var(--text-main); font-weight:600;">\${scheduleStr}</span>\${priceStr ? \`<br><span style="color:var(--text-muted); font-size:0.75rem;">\${priceStr}</span>\` : ''}</div>\`;

            const isActive = p.is_active !== false;
            const statusBadge = isActive
              ? '<span class="badge badge-published">Activo</span>'
              : '<span class="badge badge-outdated">Inactivo</span>';

            return \`
              <tr id="place-row-\${p.id}">
                <td>
                  <strong style="color:var(--text-main); font-size:0.9rem;">\${escapeHtml(p.name)}</strong>
                  \${p.slug ? \`<br><span style="font-size:0.7rem; color:var(--text-dim); font-family:monospace;">\${escapeHtml(p.slug)}</span>\` : ''}
                </td>
                <td><span class="badge" style="background:var(--primary-soft); color:var(--primary); font-weight:800; text-transform:capitalize;">\${escapeHtml(p.category || 'cultura')}</span></td>
                <td><div style="font-size:0.8125rem; color:var(--text-muted); max-width:240px; line-height:1.35;">\${escapeHtml(p.highlight_text || '—')}</div></td>
                <td>\${schedPriceContent}</td>
                <td>\${locationContent}</td>
                <td>\${statusBadge}</td>
                <td>
                  <div class="action-group">
                    <button type="button" class="btn-table-action" onclick="editPlace(\${p.id})">✏️ Editar</button>
                  </div>
                </td>
              </tr>
            \`;
          }).join('');
        }

        // Render Mobile Cards
        if (cardsContainer) {
          cardsContainer.innerHTML = places.map(p => {
            const hasCoords = p.latitude !== null && p.latitude !== undefined && p.longitude !== null && p.longitude !== undefined;
            const coordsStr = hasCoords ? \`\${p.latitude}, \${p.longitude}\` : '';
            const mapsLink = p.google_maps_url ? \`<a href="\${escapeHtml(p.google_maps_url)}" target="_blank" rel="noopener" style="color:var(--primary); font-weight:600; text-decoration:underline;">Ver en Google Maps ↗</a>\` : '';
            const isActive = p.is_active !== false;
            const statusBadge = isActive
              ? '<span class="badge badge-published">Activo</span>'
              : '<span class="badge badge-outdated">Inactivo</span>';

            return \`
              <div class="place-card" id="place-card-\${p.id}">
                <div class="place-card-header">
                  <span class="badge" style="background:var(--primary-soft); color:var(--primary); font-weight:800; text-transform:capitalize;">\${escapeHtml(p.category || 'cultura')}</span>
                  \${statusBadge}
                </div>
                <h4 class="place-card-title">\${escapeHtml(p.name)}</h4>
                <div class="place-card-body">
                  \${p.highlight_text ? \`<div>✨ <strong>Destacado:</strong> \${escapeHtml(p.highlight_text)}</div>\` : ''}
                  <div>⏰ <strong>Horario:</strong> \${escapeHtml(p.opening_hours_text || '—')}</div>
                  <div>🏷️ <strong>Precio:</strong> \${escapeHtml(p.price_text || '—')}</div>
                  \${hasCoords ? \`<div>📍 <strong>Coordenadas:</strong> <span style="font-family:monospace; font-size:0.8rem;">\${escapeHtml(coordsStr)}</span></div>\` : ''}
                  \${mapsLink ? \`<div>🗺️ <strong>Maps:</strong> \${mapsLink}</div>\` : ''}
                </div>
                <div class="place-card-actions">
                  <button type="button" class="btn-table-action" onclick="editPlace(\${p.id})">✏️ Editar Lugar</button>
                </div>
              </div>
            \`;
          }).join('');
        }
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--red); padding:2rem;">Error al cargar lugares permanentes.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; color:var(--red); padding:2rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">Error al cargar lugares permanentes.</div>';
      }
    }

    window.openNewPlaceModal = function() {
      modalPlaceSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-place-title').innerText = 'Nuevo Lugar Permanente';
      document.getElementById('form-place').reset();
      document.getElementById('place-id').value = '';
      const saveBtn = document.getElementById('btn-save-place');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Lugar';
      }
      openModal('modal-place');
      const nameInput = document.getElementById('place-name');
      if (nameInput) nameInput.focus();
    };

    window.editPlace = function(id) {
      const p = cachedPlaces.find(x => x.id === id);
      if (!p) return;
      modalPlaceSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-place-title').innerText = 'Editar Lugar #' + p.id;
      document.getElementById('place-id').value = p.id;
      document.getElementById('place-name').value = p.name || '';
      const catSelect = document.getElementById('place-category');
      if (catSelect) {
        if (p.category && !Array.from(catSelect.options).some(o => o.value === p.category)) {
          const opt = document.createElement('option');
          opt.value = p.category;
          opt.textContent = p.category.charAt(0).toUpperCase() + p.category.slice(1);
          catSelect.appendChild(opt);
        }
        catSelect.value = p.category || 'cultura';
      }
      document.getElementById('place-highlight').value = p.highlight_text || '';
      document.getElementById('place-hours').value = p.opening_hours_text || '';
      document.getElementById('place-price').value = p.price_text || '';
      document.getElementById('place-maps-url').value = p.google_maps_url || '';
      const saveBtn = document.getElementById('btn-save-place');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Cambios';
      }
      openModal('modal-place');
      const nameInput = document.getElementById('place-name');
      if (nameInput) nameInput.focus();
    };

    window.savePlace = async function(e) {
      e.preventDefault();
      if (modalPlaceSaveInProgress) return;
      const saveBtn = document.getElementById('btn-save-place');
      const id = document.getElementById('place-id').value;
      const nameVal = document.getElementById('place-name').value.trim();
      if (!nameVal) {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = id ? 'Guardar Cambios' : 'Guardar Lugar';
        }
        alert('El nombre del lugar es obligatorio.');
        return;
      }
      const highlightVal = document.getElementById('place-highlight').value.trim();
      if (!highlightVal) {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = id ? 'Guardar Cambios' : 'Guardar Lugar';
        }
        alert('El texto destacado es obligatorio.');
        return;
      }

      const payload = {
        name: nameVal,
        category: document.getElementById('place-category').value,
        highlight_text: highlightVal,
        opening_hours_text: document.getElementById('place-hours').value.trim() || null,
        price_text: document.getElementById('place-price').value.trim() || null,
        google_maps_url: document.getElementById('place-maps-url').value.trim() || null,
      };

      modalPlaceSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';
      }

      try {
        let res;
        if (id) {
          res = await apiFetch(\`/api/v1/admin/places/\${id}\`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          res = await apiFetch('/api/v1/admin/places', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.message || 'Error al guardar el lugar.');
          return;
        }

        closeModal('modal-place');
        loadAdminPlaces();
      } catch (err) {
        alert('Error de conexión al guardar el lugar.');
      } finally {
        modalPlaceSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = id ? 'Guardar Cambios' : 'Guardar Lugar';
        }
      }
    };

    // ==============================================================================
    // Gestión de Códigos QR
    // ==============================================================================
    let cachedQrs = [];
    let modalQrSaveInProgress = false;

    async function loadAdminQr() {
      const tbody = document.getElementById('qr-tbody');
      const cardsContainer = document.getElementById('qr-cards-container');
      const badge = document.getElementById('qr-count-badge');

      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando fuentes QR...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando fuentes QR...</div>';

      try {
        const res = await apiFetch('/api/v1/admin/qr-sources');
        const data = await res.json();
        const qrs = data.qr_sources || [];
        cachedQrs = qrs;

        if (badge) {
          badge.textContent = String(qrs.length);
          badge.style.display = qrs.length > 0 ? 'inline-block' : 'none';
        }

        if (qrs.length === 0) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">No hay fuentes QR registradas.</td></tr>';
          if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">No hay fuentes QR registradas.</div>';
          return;
        }

        // Render Desktop Table
        if (tbody) {
          tbody.innerHTML = qrs.map(q => \`
            <tr id="qr-row-\${q.id}">
              <td>
                <strong style="color:var(--text-main); font-size:0.9rem;">\${escapeHtml(q.accommodation_name)}</strong>
              </td>
              <td><span class="badge" style="background:var(--primary-soft); color:var(--primary); font-weight:800; text-transform:capitalize;">\${escapeHtml(q.accommodation_type || 'hotel')}</span></td>
              <td>
                <code style="background:var(--bg-subtle); padding:0.2rem 0.4rem; border-radius:4px; font-size:0.8125rem; border:1px solid var(--border); font-family:var(--font-mono, monospace);">\${escapeHtml(q.qr_code)}</code><br>
                <a href="https://vayaplan.com/qr/\${escapeHtml(q.qr_code)}" target="_blank" rel="noopener" style="color:var(--primary); font-size:0.75rem; font-weight:600; text-decoration:underline;">https://vayaplan.com/qr/\${escapeHtml(q.qr_code)} ↗</a>
              </td>
              <td>
                <strong style="color:var(--emerald); font-size:1.15rem; font-weight:800;">\${q.total_scans}</strong> <span style="font-size:0.8125rem; color:var(--text-muted);">escaneos</span>
              </td>
              <td>
                <div class="action-group">
                  <a href="/api/v1/admin/qr-sources/\${q.id}/svg?format=card" target="_blank" class="btn-table-action" style="text-decoration:none;">📥 Descargar Tarjeta SVG</a>
                  <button type="button" class="btn-table-action" onclick="copyQrLink('\${escapeHtml(q.qr_code)}')">📋 Copiar Link</button>
                </div>
              </td>
            </tr>
          \`).join('');
        }

        // Render Mobile Cards
        if (cardsContainer) {
          cardsContainer.innerHTML = qrs.map(q => \`
            <div class="qr-card" id="qr-card-\${q.id}">
              <div class="qr-card-header">
                <span class="badge" style="background:var(--primary-soft); color:var(--primary); font-weight:800; text-transform:capitalize;">\${escapeHtml(q.accommodation_type || 'hotel')}</span>
                <span class="badge" style="background:var(--emerald-soft, #ecfdf5); color:var(--emerald, #059669); font-weight:800;">\${q.total_scans} escaneos</span>
              </div>
              <h4 class="qr-card-title">\${escapeHtml(q.accommodation_name)}</h4>
              <div class="qr-card-body">
                <div>🏷️ <strong>Código:</strong> <code style="font-family:monospace; font-size:0.8rem;">\${escapeHtml(q.qr_code)}</code></div>
                <div>🔗 <strong>Enlace directo:</strong> <a href="https://vayaplan.com/qr/\${escapeHtml(q.qr_code)}" target="_blank" rel="noopener" style="color:var(--primary); word-break:break-all; text-decoration:underline;">https://vayaplan.com/qr/\${escapeHtml(q.qr_code)} ↗</a></div>
                <div>📊 <strong>Total de escaneos:</strong> <strong style="color:var(--emerald);">\${q.total_scans}</strong></div>
              </div>
              <div class="qr-card-actions">
                <a href="/api/v1/admin/qr-sources/\${q.id}/svg?format=card" target="_blank" class="btn-table-action" style="text-decoration:none;">📥 Descargar Tarjeta SVG</a>
                <button type="button" class="btn-table-action" onclick="copyQrLink('\${escapeHtml(q.qr_code)}')">📋 Copiar Link</button>
              </div>
            </div>
          \`).join('');
        }
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--red); padding:2rem;">Error al cargar fuentes QR.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; color:var(--red); padding:2rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">Error al cargar fuentes QR.</div>';
      }
    }

    window.openNewQrModal = function() {
      modalQrSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-qr-title').innerText = 'Nuevo QR para Alojamiento';
      const form = document.getElementById('form-qr');
      if (form) form.reset();
      const saveBtn = document.getElementById('btn-save-qr');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Generar QR';
      }
      openModal('modal-qr');
      const nameInput = document.getElementById('qr-name');
      if (nameInput) nameInput.focus();
    };

    window.copyQrLink = function(code) {
      const url = 'https://vayaplan.com/qr/' + code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          alert('¡Enlace copiado al portapapeles!');
        }).catch(() => {
          prompt('Copia el enlace manualmente:', url);
        });
      } else {
        prompt('Copia el enlace manualmente:', url);
      }
    };

    window.saveQrSource = async function(e) {
      e.preventDefault();
      if (modalQrSaveInProgress) return;
      const saveBtn = document.getElementById('btn-save-qr');
      const nameVal = document.getElementById('qr-name').value.trim();
      if (!nameVal || nameVal.length < 3) {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Generar QR';
        }
        alert('El nombre del alojamiento debe tener al menos 3 caracteres.');
        return;
      }

      const payload = {
        accommodation_name: nameVal,
        accommodation_type: document.getElementById('qr-type').value,
        qr_code: document.getElementById('qr-code-input').value.trim() || undefined,
      };

      modalQrSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Generando...';
      }

      try {
        const res = await apiFetch('/api/v1/admin/qr-sources', { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.message || 'Error al guardar fuente QR.');
          return;
        }

        closeModal('modal-qr');
        loadAdminQr();
      } catch (err) {
        alert('Error de conexión al guardar fuente QR.');
      } finally {
        modalQrSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Generar QR';
        }
      }
    };

    // ==============================================================================
    // Gestión de Promociones Comerciales (Sprint 4 & Fase C)
    // ==============================================================================

    // Helpers de Zona Horaria (Europe/Madrid)
    function formatToMadridDatetimeLocal(isoOrDate) {
      if (!isoOrDate) return '';
      const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
      if (isNaN(date.getTime())) return '';
      const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return formatter.format(date).replace(' ', 'T').slice(0, 16);
    }

    function parseMadridToUtcIso(madridDatetimeLocal) {
      if (!madridDatetimeLocal) return null;
      const [datePart, timePart] = madridDatetimeLocal.split('T');
      if (!datePart || !timePart) return null;
      const [y, m, d] = datePart.split('-').map(Number);
      const [h, min] = timePart.split(':').map(Number);
      let guessUtc = new Date(Date.UTC(y, m - 1, d, h, min, 0));
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
      });
      for (let i = 0; i < 2; i++) {
        const parts = Object.fromEntries(dtf.formatToParts(guessUtc).map(p => [p.type, parseInt(p.value, 10)]));
        const madH = parts.hour === 24 ? 0 : parts.hour;
        const madAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, madH, parts.minute, parts.second || 0);
        const offsetMs = madAsUtc - guessUtc.getTime();
        guessUtc = new Date(Date.UTC(y, m - 1, d, h, min, 0) - offsetMs);
      }
      return guessUtc.toISOString();
    }

    function formatMadridDateTime(isoOrDate) {
      if (!isoOrDate) return '—';
      const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);
    }

    function getPromoStatusBadge(status) {
      if (status === 'active') return '<span class="status-pill status-active">Activa</span>';
      if (status === 'scheduled') return '<span class="status-pill status-scheduled">Programada</span>';
      if (status === 'completed') return '<span class="status-pill status-completed">Completada</span>';
      if (status === 'cancelled') return '<span class="status-pill status-cancelled">Cancelada</span>';
      if (status === 'refunded') return '<span class="status-pill status-refunded">Reembolsada</span>';
      return \`<span class="status-pill">\${escapeHtml(status)}</span>\`;
    }

    window.onUserModifiedStartsAt = function() {
      promoUserModifiedStartsAt = true;
      checkPromoDateConflict();
    };

    window.onUserModifiedEndsAt = function() {
      promoUserModifiedEndsAt = true;
    };

    window.onPromoStatusChanged = function() {
      const status = document.getElementById('promo-status').value;
      const hint = document.getElementById('promo-scheduled-hint');
      if (hint) {
        hint.style.display = status === 'scheduled' ? 'block' : 'none';
      }
      if (status === 'active' && !promoUserModifiedStartsAt) {
        document.getElementById('promo-starts-at').value = formatToMadridDatetimeLocal(new Date());
      }
      checkPromoDateConflict();
    };

    async function loadAdminPromotions() {
      const tbody = document.getElementById('promotions-tbody');
      const cardsContainer = document.getElementById('promo-cards-mobile');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando promociones...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando promociones...</div>';

      const statusFilter = document.getElementById('promo-filter-status').value;
      let url = '/api/v1/admin/promotions';
      if (statusFilter) url += '?status=' + encodeURIComponent(statusFilter);

      try {
        const res = await apiFetch(url);
        const data = await res.json();
        cachedPromotions = data.promotions || [];

        if (cachedPromotions.length === 0) {
          const emptyMsg = 'No hay promociones registradas para este filtro.';
          if (tbody) tbody.innerHTML = \`<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:2.5rem 1rem;">\${emptyMsg}</td></tr>\`;
          if (cardsContainer) cardsContainer.innerHTML = \`<div style="text-align:center; color:var(--text-dim); padding:2.5rem 1rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">\${emptyMsg}</div>\`;
          return;
        }

        // Renderizar Desktop (Tabla)
        if (tbody) {
          tbody.innerHTML = cachedPromotions.map(p => {
            const statusBadge = getPromoStatusBadge(p.status);
            const canCancelOrRefund = p.status === 'active' || p.status === 'scheduled';
            const priceFormatted = (p.price_cents / 100).toFixed(2) + ' €';

            return \`
              <tr>
                <td>
                  <strong>#\${p.id}</strong>
                  <div style="font-size:0.6875rem; color:var(--text-dim);">\${formatMadridDateTime(p.created_at)}</div>
                </td>
                <td>\${statusBadge}</td>
                <td>
                  <strong style="color:var(--text-main);">\${escapeHtml(p.event_title)}</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted);">\${escapeHtml(p.venue_name)}</div>
                </td>
                <td>
                  <div style="font-weight:700; font-size:0.8125rem;">📅 \${p.editorial_date}</div>
                  <div style="font-size:0.75rem; color:var(--text-dim);">\${p.event_start_time ? formatMadridDateTime(p.event_start_time) : 'Hora no indicada'}</div>
                </td>
                <td>
                  <div style="font-size:0.75rem;"><span style="color:var(--text-dim); font-weight:700;">Desde:</span> \${formatMadridDateTime(p.starts_at)}</div>
                  <div style="font-size:0.75rem;"><span style="color:var(--text-dim); font-weight:700;">Hasta:</span> \${formatMadridDateTime(p.ends_at)}</div>
                </td>
                <td>
                  <strong style="color:var(--text-main); font-size:0.9375rem;">\${priceFormatted}</strong>
                </td>
                <td style="white-space:nowrap;">
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                    <button class="btn-sm" style="background:#0284c7; color:#fff;" onclick="viewPromotionReport(\${p.id})">📊 Informe</button>
                    <button class="btn-sm" style="background:#16a34a; color:#fff;" onclick="copyPromotionReportWhatsApp(\${p.id})">💬 WhatsApp</button>
                    \${canCancelOrRefund ? \`
                      <button class="btn-sm btn-logout" onclick="cancelPromotion(\${p.id})">Cancelar</button>
                      <button class="btn-sm" style="background:#ea580c; color:#fff;" onclick="refundPromotion(\${p.id})">Reembolsar</button>
                    \` : ''}
                  </div>
                </td>
              </tr>
            \`;
          }).join('');
        }

        // Renderizar Móvil (Tarjetas)
        if (cardsContainer) {
          cardsContainer.innerHTML = cachedPromotions.map(p => {
            const statusBadge = getPromoStatusBadge(p.status);
            const canCancelOrRefund = p.status === 'active' || p.status === 'scheduled';
            const priceFormatted = (p.price_cents / 100).toFixed(2) + ' €';

            return \`
              <div class="promo-card">
                <div class="promo-card-header">
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    \${statusBadge}
                    <span style="font-size:0.8125rem; font-weight:800; color:var(--text-dim);">#\${p.id}</span>
                  </div>
                  <div style="font-size:1.05rem; font-weight:800; color:var(--text-main);">\${priceFormatted}</div>
                </div>

                <div>
                  <h4 class="promo-card-title">\${escapeHtml(p.event_title)}</h4>
                  <div class="promo-card-venue">\${escapeHtml(p.venue_name)}</div>
                </div>

                <div class="promo-card-times">
                  <div>
                    <span style="font-size:0.6875rem; font-weight:800; text-transform:uppercase; color:var(--text-dim); display:block;">Horario del Evento</span>
                    <strong>📅 \${p.editorial_date}</strong> • \${p.event_start_time ? formatMadridDateTime(p.event_start_time) : 'Hora no indicada'}
                  </div>
                  <div style="border-top:1px dashed var(--border); padding-top:0.35rem; margin-top:0.25rem;">
                    <span style="font-size:0.6875rem; font-weight:800; text-transform:uppercase; color:var(--primary); display:block;">Vigencia Campaña (Europe/Madrid)</span>
                    <span style="font-size:0.75rem;">\${formatMadridDateTime(p.starts_at)} → \${formatMadridDateTime(p.ends_at)}</span>
                  </div>
                </div>

                <div class="promo-card-actions">
                  <button class="btn-sm" style="background:#0284c7; color:#fff; flex:1;" onclick="viewPromotionReport(\${p.id})">📊 Informe</button>
                  <button class="btn-sm" style="background:#16a34a; color:#fff; flex:1;" onclick="copyPromotionReportWhatsApp(\${p.id})">💬 WhatsApp</button>
                  \${canCancelOrRefund ? \`
                    <button class="btn-sm btn-logout" style="flex:1;" onclick="cancelPromotion(\${p.id})">Cancelar</button>
                    <button class="btn-sm" style="background:#ea580c; color:#fff; flex:1;" onclick="refundPromotion(\${p.id})">Reembolsar</button>
                  \` : ''}
                </div>
              </div>
            \`;
          }).join('');
        }
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:2rem;">Error al cargar promociones.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; color:#ef4444; padding:2rem;">Error al cargar promociones.</div>';
      }
    }

    window.openNewPromotionModal = async function() {
      const select = document.getElementById('promo-event-id');
      select.innerHTML = '<option value="">Cargando eventos publicados...</option>';
      const refBox = document.getElementById('promo-event-reference');
      if (refBox) { refBox.style.display = 'none'; refBox.innerHTML = ''; }
      const alertEl = document.getElementById('promo-conflict-alert');
      if (alertEl) alertEl.style.display = 'none';
      const saveBtn = document.getElementById('btn-save-promo');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = 'Guardar Promoción'; }

      document.getElementById('promo-price-euros').value = '19.00';
      document.getElementById('promo-status').value = 'active';
      const hint = document.getElementById('promo-scheduled-hint');
      if (hint) hint.style.display = 'none';

      promoUserModifiedStartsAt = false;
      promoUserModifiedEndsAt = false;
      promoSaveInProgress = false;

      // Vigencia por defecto: Momento actual en Madrid
      document.getElementById('promo-starts-at').value = formatToMadridDatetimeLocal(new Date());
      document.getElementById('promo-ends-at').value = '';
      const endsHint = document.getElementById('promo-ends-at-hint');
      if (endsHint) endsHint.innerText = 'Fin de campaña en portada';

      openModal('modal-promotion');

      try {
        const res = await apiFetch('/api/v1/admin/events?status=published');
        const data = await res.json();
        publishedEventsCache = data.events || [];

        if (publishedEventsCache.length === 0) {
          select.innerHTML = '<option value="">No hay eventos publicados disponibles</option>';
          return;
        }

        select.innerHTML = '<option value="">Selecciona un evento...</option>' +
          publishedEventsCache.map(e => \`
            <option value="\${e.id}">\${escapeHtml(e.title)} (\${e.editorial_date} — \${escapeHtml(e.venue_name)})</option>
          \`).join('');
      } catch (err) {
        select.innerHTML = '<option value="">Error al cargar eventos publicados</option>';
      }
    };

    window.onPromoEventSelected = function() {
      const eventId = Number(document.getElementById('promo-event-id').value);
      const ev = publishedEventsCache.find(e => e.id === eventId);
      const refBox = document.getElementById('promo-event-reference');
      const endsHint = document.getElementById('promo-ends-at-hint');

      if (!ev) {
        if (refBox) { refBox.style.display = 'none'; refBox.innerHTML = ''; }
        document.getElementById('promo-conflict-alert').style.display = 'none';
        document.getElementById('btn-save-promo').disabled = false;
        return;
      }

      // 1. Mostrar ficha de referencia informativa del evento
      if (refBox) {
        refBox.style.display = 'block';
        const startFormatted = ev.start_time ? formatMadridDateTime(ev.start_time) : 'Hora no indicada';
        const endFormatted = ev.end_time ? formatMadridDateTime(ev.end_time) : 'No definida';
        const ticketDisplay = ev.ticket_price ? \`\${ev.ticket_price} €\` : (ev.price_type === 'free' ? 'Entrada libre / gratuita' : 'No indicada');

        refBox.innerHTML = \`
          <div style="font-size:0.875rem; font-weight:800; color:var(--text-main); margin-bottom:0.25rem;">
            \${escapeHtml(ev.title)}
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); display:flex; flex-direction:column; gap:0.2rem;">
            <div><strong>Local:</strong> \${escapeHtml(ev.venue_name)}</div>
            <div><strong>Fecha editorial:</strong> \${ev.editorial_date} | <strong>Horario evento:</strong> \${startFormatted} → \${endFormatted}</div>
            <div><strong>Entrada al evento:</strong> \${ticketDisplay}</div>
          </div>
        \`;
      }

      // 2. Coherencia de vigencia: respetar si el usuario ya modificó los campos
      const currentMode = document.getElementById('promo-status').value;
      if (!promoUserModifiedStartsAt) {
        if (currentMode === 'active') {
          document.getElementById('promo-starts-at').value = formatToMadridDatetimeLocal(new Date());
        } else if (ev.start_time) {
          document.getElementById('promo-starts-at').value = formatToMadridDatetimeLocal(ev.start_time);
        }
      }

      if (!promoUserModifiedEndsAt) {
        if (ev.end_time) {
          document.getElementById('promo-ends-at').value = formatToMadridDatetimeLocal(ev.end_time);
          if (endsHint) endsHint.innerText = 'Fin de campaña (inicializado con la hora de fin del evento)';
        } else {
          document.getElementById('promo-ends-at').value = '';
          if (endsHint) endsHint.innerText = '⚠️ El evento no tiene hora de fin. Indica manualmente hasta cuándo es visible la campaña.';
        }
      }

      checkPromoDateConflict();
    };

    window.checkPromoDateConflict = function() {
      const eventId = Number(document.getElementById('promo-event-id').value);
      const ev = publishedEventsCache.find(e => e.id === eventId);
      const selectedStatus = document.getElementById('promo-status').value;
      const alertEl = document.getElementById('promo-conflict-alert');
      const saveBtn = document.getElementById('btn-save-promo');

      if (!ev) {
        if (alertEl) alertEl.style.display = 'none';
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const conflict = cachedPromotions.find(p =>
        p.editorial_date === ev.editorial_date && (p.status === 'active' || p.status === 'scheduled')
      );

      if (conflict && (selectedStatus === 'active' || selectedStatus === 'scheduled')) {
        alertEl.style.display = 'block';
        alertEl.innerHTML = \`⚠️ <strong>Conflicto de Escasez:</strong> Ya existe una promoción \${conflict.status === 'active' ? 'activa' : 'programada'} (#\${conflict.id}: "\${escapeHtml(conflict.event_title)}") para la fecha editorial \${conflict.editorial_date}. Solo se permite 1 promoción activa/programada por día.\`;
        saveBtn.disabled = true;
      } else {
        alertEl.style.display = 'none';
        saveBtn.disabled = false;
      }
    };

    window.submitPromotion = async function(e) {
      e.preventDefault();
      if (promoSaveInProgress) return;

      const eventId = Number(document.getElementById('promo-event-id').value);
      if (!eventId) {
        alert('Debes seleccionar un evento publicado del catálogo.');
        return;
      }

      const ev = publishedEventsCache.find(it => it.id === eventId);
      if (!ev) {
        alert('Evento no encontrado en la lista de eventos publicados.');
        return;
      }

      if (!ev.venue_id || Number(ev.venue_id) === 9999) {
        alert('No se puede promocionar un evento sin local asignado. Debes asignarle un local censado antes de promocionarlo.');
        return;
      }

      const startsAtVal = document.getElementById('promo-starts-at').value;
      const endsAtVal = document.getElementById('promo-ends-at').value;

      if (!startsAtVal || !endsAtVal) {
        alert('Debes indicar las fechas y horas de inicio y fin de vigencia de la campaña.');
        return;
      }

      const startsAtUtc = parseMadridToUtcIso(startsAtVal);
      const endsAtUtc = parseMadridToUtcIso(endsAtVal);

      if (!startsAtUtc || !endsAtUtc) {
        alert('Formato de fecha u hora no válido.');
        return;
      }

      const startsAtTime = new Date(startsAtUtc).getTime();
      const endsAtTime = new Date(endsAtUtc).getTime();

      if (endsAtTime <= startsAtTime) {
        alert('La fecha de fin (Visible hasta) debe ser estrictamente posterior a la fecha de inicio (Visible desde).');
        return;
      }

      const nowTime = Date.now();
      const status = document.getElementById('promo-status').value;

      if ((status === 'active' || status === 'scheduled') && endsAtTime <= nowTime) {
        alert('La fecha de fin de campaña debe ser posterior al momento actual para tener vigencia activa o programada.');
        return;
      }

      const priceEuros = parseFloat(document.getElementById('promo-price-euros').value);
      if (isNaN(priceEuros) || priceEuros < 0) {
        alert('El precio comercial debe ser un número mayor o igual a 0.');
        return;
      }

      const priceCents = Math.round(priceEuros * 100);

      const payload = {
        event_id: eventId,
        editorial_date: ev.editorial_date,
        starts_at: startsAtUtc,
        ends_at: endsAtUtc,
        price_cents: priceCents,
        status: status,
      };

      const saveBtn = document.getElementById('btn-save-promo');
      promoSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';
      }

      try {
        const res = await apiFetch('/api/v1/admin/promotions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const alertEl = document.getElementById('promo-conflict-alert');
          if (res.status === 409) {
            if (alertEl) {
              alertEl.style.display = 'block';
              alertEl.innerHTML = \`⚠️ <strong>Conflicto de Escasez (409):</strong> \${escapeHtml(errData.message || 'Ya existe una promoción activa o programada para esta fecha editorial.')}\`;
            }
            alert(\`⚠️ Conflicto de Escasez (409): \${errData.message || 'Ya existe una promoción para esta fecha.'}\`);
          } else {
            alert(errData.message || 'Error al crear la promoción comercial.');
          }
          return;
        }

        closeModal('modal-promotion');
        loadAdminPromotions();
      } catch (err) {
        alert('Error de red al guardar la promoción.');
      } finally {
        promoSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Guardar Promoción';
        }
      }
    };

    window.cancelPromotion = async function(id) {
      if (!confirm(\`¿Estás seguro de que deseas cancelar la promoción #\${id}? Se liberará inmediatamente el hueco de reserva comercial y la campaña dejará de mostrarse en portada.\`)) {
        return;
      }
      const res = await apiFetch('/api/v1/admin/promotions/' + id + '/cancel', { method: 'POST' });
      if (res.ok) {
        loadAdminPromotions();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Error al cancelar la promoción.');
      }
    };

    window.refundPromotion = async function(id) {
      if (!confirm(\`¿Estás seguro de que deseas marcar como reembolsada la promoción #\${id}? Esto registrará administrativamente la devolución y liberará el hueco de reserva comercial.\`)) {
        return;
      }
      const res = await apiFetch('/api/v1/admin/promotions/' + id + '/refund', { method: 'POST' });
      if (res.ok) {
        loadAdminPromotions();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Error al reembolsar la promoción.');
      }
    };

    window.viewPromotionReport = async function(id) {
      openModal('modal-promotion-report');
      document.getElementById('modal-report-title').innerText = \`Informe Post-Evento — Promoción #\${id}\`;
      document.getElementById('report-summary-box').innerHTML = '<div style="color:var(--text-muted); padding:0.5rem 0;">Cargando datos de la campaña...</div>';
      document.getElementById('report-metrics-grid').innerHTML = '<div style="color:var(--text-muted); padding:0.5rem 0;">Cargando métricas...</div>';
      document.getElementById('report-event-metrics-grid').innerHTML = '<div style="color:var(--text-muted); padding:0.5rem 0;">Cargando métricas del evento...</div>';
      document.getElementById('report-whatsapp-textarea').value = '';

      try {
        const res = await apiFetch('/api/v1/admin/promotions/' + id + '/report');
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.message || 'Error al cargar informe post-evento.');
          closeModal('modal-promotion-report');
          return;
        }
        const data = await res.json();
        const pm = data.promotion_metrics || {};
        const em = data.event_overall_metrics || {};

        document.getElementById('report-summary-box').innerHTML = \`
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; align-items:center;">
            <div>
              <strong style="font-size:1.05rem; color:var(--text-main);">\${escapeHtml(data.event_title)}</strong>
              <div style="color:var(--text-muted); font-size:0.8125rem;">\${escapeHtml(data.venue_name)} • Fecha editorial: \${data.editorial_date}</div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;">
                <strong>Vigencia campaña:</strong> \${formatMadridDateTime(data.starts_at)} → \${formatMadridDateTime(data.ends_at)}
              </div>
            </div>
            <div style="text-align:right;">
              \${getPromoStatusBadge(data.status)}
              <div style="font-weight:800; color:var(--primary); font-size:1rem; margin-top:0.25rem;">\${(data.price_cents / 100).toFixed(2)} €</div>
            </div>
          </div>
        \`;

        document.getElementById('report-metrics-grid').innerHTML = \`
          <div class="metric-card">
            <div class="metric-value">\${pm.impressions || 0}</div>
            <div class="metric-label">Aperturas de ficha (promoción, no hero)</div>
            <div class="metric-sublabel">\${pm.unique_impressions_sessions || 0} sesiones únicas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">\${pm.map_clicks || 0}</div>
            <div class="metric-label">Clics "Cómo llegar"</div>
            <div class="metric-sublabel">\${pm.unique_map_clicks_sessions || 0} sesiones únicas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">\${(pm.booking_clicks || 0) + (pm.ticket_clicks || 0)}</div>
            <div class="metric-label">Clics Reserva / Entradas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">\${pm.whatsapp_clicks || 0}</div>
            <div class="metric-label">Clics a WhatsApp Local</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">\${pm.profile_clicks || 0}</div>
            <div class="metric-label">Clics a Web / Redes</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">\${(pm.channel_views || 0) + (pm.qr_scans || 0)}</div>
            <div class="metric-label">Canal WhatsApp / QR Atribuidos</div>
          </div>
          <div class="metric-card" style="border-color:var(--primary); background:var(--primary-soft);">
            <div class="metric-value" style="color:var(--primary);">\${pm.total_actions || 0}</div>
            <div class="metric-label" style="font-weight:700;">Total Interacciones Promoción</div>
            <div class="metric-sublabel">\${pm.unique_action_sessions || 0} sesiones únicas</div>
          </div>
        \`;

        document.getElementById('report-event-metrics-grid').innerHTML = \`
          <div class="metric-card">
            <div class="metric-value">\${em.impressions || 0}</div>
            <div class="metric-label">Aperturas Totales Evento</div>
            <div class="metric-sublabel">\${em.unique_impressions_sessions || 0} sesiones únicas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">\${em.total_actions || 0}</div>
            <div class="metric-label">Interacciones Totales Evento</div>
            <div class="metric-sublabel">\${em.unique_action_sessions || 0} sesiones únicas</div>
          </div>
        \`;

        document.getElementById('report-whatsapp-textarea').value = data.whatsapp_text || '';
      } catch (err) {
        alert('Error al obtener informe post-evento.');
      }
    };

    window.copyReportText = function() {
      const text = document.getElementById('report-whatsapp-textarea').value;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        alert('📋 ¡Informe para WhatsApp copiado al portapapeles!');
      });
    };

    window.copyPromotionReportWhatsApp = async function(id) {
      try {
        const res = await apiFetch('/api/v1/admin/promotions/' + id + '/report/text');
        if (!res.ok) {
          alert('No se pudo obtener el texto del informe.');
          return;
        }
        const text = await res.text();
        navigator.clipboard.writeText(text).then(() => {
          alert('📋 ¡Informe para WhatsApp copiado al portapapeles con éxito!');
        });
      } catch (err) {
        alert('Error al copiar informe para WhatsApp.');
      }
    };


    // ==============================================================================
    // Utilidades de Modal (con focus trap para M2/M4)
    // ==============================================================================
let lastActiveElementBeforeModal = null;
let modalSaveInProgress = false; // Bloqueo propio del modal de reasignación

    // ---- Focus trap reutilizable para cualquier modal activo ----
    function getModalFocusables(modal) {
      return Array.from(modal.querySelectorAll(
        'button:not([disabled]), input:not([type="hidden"]):not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      )).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
    }
    function modalTrapKeydown(e) {
      if (e.key !== 'Tab') return;
      const activeModal = document.querySelector('.modal-overlay.active');
      if (!activeModal) return;
      const focusables = getModalFocusables(activeModal);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', modalTrapKeydown);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) {
          // Bloquear Escape si hay una petición de reasignación en vuelo
          if (activeModal.id === 'modal-reassign-venue' && modalSaveInProgress) return;
          if (activeModal.id === 'modal-promotion' && promoSaveInProgress) return;
          if (activeModal.id === 'modal-event') {
            if (modalEventSaveInProgress || isEventImageUploading) return;
            requestCloseEventModal();
            return;
          }
          if (activeModal.id === 'modal-venue' && modalVenueSaveInProgress) return;
          if (activeModal.id === 'modal-delete-venue' && modalVenueDeleteInProgress) return;
          if (activeModal.id === 'modal-recurrence' && modalRecurrenceSaveInProgress) return;
          if (activeModal.id === 'modal-exception' && modalExceptionSaveInProgress) return;
          if (activeModal.id === 'modal-place' && modalPlaceSaveInProgress) return;
          if (activeModal.id === 'modal-qr' && modalQrSaveInProgress) return;
          closeModal(activeModal.id);
        } else {
          toggleMobileDrawer(false);
        }
      }
    });

    window.openModal = function(id) {
      lastActiveElementBeforeModal = document.activeElement;
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('active');
        document.body.classList.add('modal-open');
        // Foco en el primer campo interactivo visible
        const focusables = getModalFocusables(el);
        if (focusables.length > 0) focusables[0].focus();
      }
    };

    window.closeModal = function(id) {
      // Bloquear cierre del modal de reasignación si hay petición activa en vuelo
      if (id === 'modal-reassign-venue' && modalSaveInProgress) return;
      if (id === 'modal-promotion' && promoSaveInProgress) return;
      if (id === 'modal-event' && (modalEventSaveInProgress || isEventImageUploading)) return;
      if (id === 'modal-venue' && modalVenueSaveInProgress) return;
      if (id === 'modal-delete-venue' && modalVenueDeleteInProgress) return;
      if (id === 'modal-recurrence' && modalRecurrenceSaveInProgress) return;
      if (id === 'modal-exception' && modalExceptionSaveInProgress) return;
      if (id === 'modal-place' && modalPlaceSaveInProgress) return;
      if (id === 'modal-qr' && modalQrSaveInProgress) return;
      if (id === 'modal-route' && modalRouteSaveInProgress) return;
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
      const activeModals = document.querySelectorAll('.modal-overlay.active');
      if (activeModals.length === 0) {
        document.body.classList.remove('modal-open');
      }
      const target = lastActiveElementBeforeModal;
      if (target && typeof target.focus === 'function' && document.body.contains(target)) {
        target.focus();
      } else {
        // Destino lógico si el disparador desapareció
        const fallback = document.getElementById('btn-hamburger') || document.querySelector('.admin-sidebar .sidebar-nav-item.active');
        if (fallback) fallback.focus();
      }
    };

    // ==============================================================================
    // RUTAS GASTRONÓMICAS — CONTROLADOR DE PANEL
    // ==============================================================================
    const ROUTE_CATEGORY_LABELS = {
      tapas: 'Tapas de Autor',
      bravas: 'Ruta de las Bravas',
      puchero: 'Puchero y Cuchara',
      reposteria: 'Repostería y Dulces',
      vino: 'Vinos y Maridaje',
      general: 'Selección Gastronómica'
    };

    function slugify(text) {
      return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    }

    window.loadAdminRoutes = async function() {
      const cityId = document.getElementById('route-filter-city')?.value || '1';
      const status = document.getElementById('route-filter-status')?.value || 'all';
      const tbody = document.getElementById('routes-tbody');
      const cards = document.getElementById('routes-cards-container');
      const badge = document.getElementById('routes-count-badge');

      try {
        const res = await apiFetch('/api/v1/admin/cities/' + cityId + '/routes?status=' + status);
        const data = await res.json();
        currentAdminRoutes = data.routes || [];

        if (badge) {
          badge.innerText = currentAdminRoutes.length;
          badge.style.display = 'inline-block';
        }

        renderRoutesList(currentAdminRoutes);
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#dc2626;">Error al cargar rutas: ' + escapeHtml(err.message) + '</td></tr>';
        if (cards) cards.innerHTML = '<div style="text-align:center; padding:2rem; color:#dc2626;">Error al cargar rutas.</div>';
      }
    };

    window.renderRoutesList = function renderRoutesList(routes) {
      const tbody = document.getElementById('routes-tbody');
      const cards = document.getElementById('routes-cards-container');

      if (routes.length === 0) {
        const emptyMsg = 'No hay rutas gastronómicas registradas con los filtros actuales.';
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">' + emptyMsg + '</td></tr>';
        if (cards) cards.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#fff; border-radius:12px; border:1px solid var(--border);">' + emptyMsg + '</div>';
        return;
      }

      const getStatusBadge = (st) => {
        if (st === 'published') return '<span class="badge-status" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">Publicada</span>';
        if (st === 'draft') return '<span class="badge-status" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">Borrador</span>';
        return '<span class="badge-status" style="background:#f3f4f6; color:#374151; border:1px solid #e5e7eb;">Archivada</span>';
      };

      const getDatesText = (r) => {
        if (!r.start_date && !r.end_date) return 'Permanente';
        return (r.start_date || '—') + ' al ' + (r.end_date || '—');
      };

      // Desktop
      if (tbody) {
        tbody.innerHTML = routes.map(r => {
          const catLabel = ROUTE_CATEGORY_LABELS[r.category] || r.category;
          return '<tr>' +
            '<td>' +
              '<div style="font-weight:700; color:var(--text-main);">' + escapeHtml(r.title) + '</div>' +
              (r.badge_label ? '<span style="font-size:0.75rem; background:var(--primary-soft); color:var(--primary); padding:0.1rem 0.4rem; border-radius:4px; font-weight:700;">' + escapeHtml(r.badge_label) + '</span>' : '') +
            '</td>' +
            '<td><span class="badge-category">' + escapeHtml(catLabel) + '</span></td>' +
            '<td>' + getStatusBadge(r.status) + '</td>' +
            '<td>' + (r.participants_count || 0) + ' locales</td>' +
            '<td style="font-size:0.85rem; color:var(--text-muted);">' + escapeHtml(getDatesText(r)) + '</td>' +
            '<td>' +
              '<div style="display:flex; gap:0.4rem; flex-wrap:wrap;">' +
                '<button type="button" class="btn-table-action" onclick="editRoute(' + r.id + ')">Ver / Editar</button>' +
                '<button type="button" class="btn-table-action" onclick="previewRoute(' + r.id + ')">Previsualizar</button>' +
                (r.status === 'draft' ? '<button type="button" class="btn-table-action" style="color:#059669;" onclick="publishRoute(' + r.id + ')">Publicar</button>' : '') +
                (r.status === 'published' ? '<button type="button" class="btn-table-action" style="color:#dc2626;" onclick="confirmArchiveRoute(' + r.id + ')">Archivar</button>' : '') +
              '</div>' +
            '</td>' +
          '</tr>';
        }).join('');
      }

      // Móvil
      if (cards) {
        cards.innerHTML = routes.map(r => {
          const catLabel = ROUTE_CATEGORY_LABELS[r.category] || r.category;
          return '<article class="venue-card" style="margin-bottom:0.75rem;">' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; margin-bottom:0.5rem;">' +
              '<div>' +
                '<h4 style="margin:0; font-size:1rem; font-weight:800; color:var(--text-main);">' + escapeHtml(r.title) + '</h4>' +
                (r.badge_label ? '<span style="font-size:0.75rem; background:var(--primary-soft); color:var(--primary); padding:0.1rem 0.4rem; border-radius:4px; font-weight:700;">' + escapeHtml(r.badge_label) + '</span>' : '') +
              '</div>' +
              getStatusBadge(r.status) +
            '</div>' +
            '<div style="display:flex; gap:0.5rem; font-size:0.8125rem; color:var(--text-muted); margin-bottom:0.75rem; flex-wrap:wrap;">' +
              '<span>🏷️ ' + escapeHtml(catLabel) + '</span>' +
              '<span>📍 ' + (r.participants_count || 0) + ' locales</span>' +
              '<span>📅 ' + escapeHtml(getDatesText(r)) + '</span>' +
            '</div>' +
            '<div style="display:flex; gap:0.4rem; flex-wrap:wrap;">' +
              '<button type="button" class="btn-table-action" onclick="editRoute(' + r.id + ')">Ver / Editar</button>' +
              '<button type="button" class="btn-table-action" onclick="previewRoute(' + r.id + ')">Previsualizar</button>' +
              (r.status === 'draft' ? '<button type="button" class="btn-table-action" style="color:#059669;" onclick="publishRoute(' + r.id + ')">Publicar</button>' : '') +
              (r.status === 'published' ? '<button type="button" class="btn-table-action" style="color:#dc2626;" onclick="confirmArchiveRoute(' + r.id + ')">Archivar</button>' : '') +
            '</div>' +
          '</article>';
        }).join('');
      }
    }

    window.onRouteSearchInput = function(val) {
      const query = (val || '').toLowerCase().trim();
      if (!query) {
        renderRoutesList(currentAdminRoutes);
        return;
      }
      const filtered = currentAdminRoutes.filter(r => {
        const titleMatch = (r.title || '').toLowerCase().includes(query);
        const catMatch = (r.category || '').toLowerCase().includes(query) || (ROUTE_CATEGORY_LABELS[r.category] || '').toLowerCase().includes(query);
        return titleMatch || catMatch;
      });
      renderRoutesList(filtered);
    };

    window.onRouteFilterChange = function() {
      loadAdminRoutes();
    };

    window.resetRouteFilters = function() {
      const searchInput = document.getElementById('route-filter-search');
      const statusSelect = document.getElementById('route-filter-status');
      if (searchInput) searchInput.value = '';
      if (statusSelect) statusSelect.value = 'all';
      loadAdminRoutes();
    };

    window.openNewRouteModal = function() {
      currentEditingRoute = null;
      currentEditingParticipants = [];
      document.getElementById('modal-route-title').innerText = 'Nueva Ruta Gastronómica';
      document.getElementById('modal-route-status-badge').style.display = 'none';
      document.getElementById('form-route').reset();
      document.getElementById('route-id').value = '';
      document.getElementById('tab-btn-route-participants').style.display = 'none';
      document.getElementById('modal-route-secondary-actions').innerHTML = '';
      document.getElementById('route-form-error').style.display = 'none';
      document.getElementById('route-form-success').style.display = 'none';
      switchRouteModalTab('data');
      openModal('modal-route');
    };

    window.editRoute = async function(id) {
      try {
        const res = await apiFetch('/api/v1/admin/routes/' + id);
        const r = await res.json();
        currentEditingRoute = r;
        currentEditingParticipants = (r.participants || []).map(p => ({ ...p }));

        document.getElementById('modal-route-title').innerText = 'Editar Ruta #' + r.id;
        document.getElementById('route-id').value = r.id;
        document.getElementById('route-city-id').value = r.city_id;
        document.getElementById('route-category').value = r.category;
        document.getElementById('route-title').value = r.title;
        document.getElementById('route-slug').value = r.slug;
        document.getElementById('route-summary').value = r.summary;
        document.getElementById('route-description').value = r.description || '';
        document.getElementById('route-start-date').value = r.start_date || '';
        document.getElementById('route-end-date').value = r.end_date || '';
        document.getElementById('route-price-eur').value = r.approximate_price_cents !== null && r.approximate_price_cents !== undefined ? (r.approximate_price_cents / 100) : '';
        document.getElementById('route-badge-label').value = r.badge_label || '';
        document.getElementById('route-image-url').value = r.image_url || '';

        // Badge de estado en el modal
        const badgeEl = document.getElementById('modal-route-status-badge');
        badgeEl.style.display = 'inline-block';
        if (r.status === 'published') badgeEl.innerHTML = '<span class="badge-status" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">Publicada</span>';
        else if (r.status === 'draft') badgeEl.innerHTML = '<span class="badge-status" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">Borrador</span>';
        else badgeEl.innerHTML = '<span class="badge-status" style="background:#f3f4f6; color:#374151; border:1px solid #e5e7eb;">Archivada</span>';

        // Acciones secundarias en footer
        const secActions = document.getElementById('modal-route-secondary-actions');
        secActions.innerHTML = '';
        if (r.status === 'draft') {
          secActions.innerHTML = '<button type="button" class="btn-primary" style="background:#059669;" onclick="publishRoute(' + r.id + ')">Publicar Ruta</button>';
        } else if (r.status === 'published') {
          secActions.innerHTML = '<button type="button" class="btn-danger" onclick="confirmArchiveRoute(' + r.id + ')">Archivar Ruta</button>';
        }

        // Mostrar pestaña de participantes
        document.getElementById('tab-btn-route-participants').style.display = 'inline-block';
        updateParticipantsCountTag();
        renderParticipantsEditor();
        populateAddVenueSelect(r.city_id);

        document.getElementById('route-form-error').style.display = 'none';
        document.getElementById('route-form-success').style.display = 'none';
        switchRouteModalTab('data');
        openModal('modal-route');
      } catch (err) {
        alert('Error al cargar la ruta: ' + err.message);
      }
    };

    window.switchRouteModalTab = function(tab) {
      const dataTabBtn = document.getElementById('tab-btn-route-data');
      const partTabBtn = document.getElementById('tab-btn-route-participants');
      const dataContent = document.getElementById('tab-content-route-data');
      const partContent = document.getElementById('tab-content-route-participants');
      const saveDateBtn = document.getElementById('btn-save-route-data');
      const savePartBtn = document.getElementById('btn-save-route-participants');

      if (tab === 'data') {
        dataTabBtn.style.color = 'var(--primary)';
        dataTabBtn.style.borderBottom = '2px solid var(--primary)';
        partTabBtn.style.color = 'var(--text-muted)';
        partTabBtn.style.borderBottom = 'none';
        dataContent.style.display = 'block';
        partContent.style.display = 'none';
        saveDateBtn.style.display = 'inline-block';
        savePartBtn.style.display = 'none';
      } else {
        partTabBtn.style.color = 'var(--primary)';
        partTabBtn.style.borderBottom = '2px solid var(--primary)';
        dataTabBtn.style.color = 'var(--text-muted)';
        dataTabBtn.style.borderBottom = 'none';
        partContent.style.display = 'block';
        dataContent.style.display = 'none';
        savePartBtn.style.display = 'inline-block';
        saveDateBtn.style.display = 'none';
      }
    };

    window.onRouteTitleInput = function(val) {
      const id = document.getElementById('route-id')?.value;
      if (!id) {
        const slugEl = document.getElementById('route-slug');
        if (slugEl) slugEl.value = slugify(val);
      }
    };

    window.saveRouteMetadata = async function() {
      const id = document.getElementById('route-id').value;
      const city_id = parseInt(document.getElementById('route-city-id').value, 10);
      const category = document.getElementById('route-category').value;
      const title = document.getElementById('route-title').value.trim();
      const slug = document.getElementById('route-slug').value.trim();
      const summary = document.getElementById('route-summary').value.trim();
      const description = document.getElementById('route-description').value.trim() || null;
      const start_date = document.getElementById('route-start-date').value || null;
      const end_date = document.getElementById('route-end-date').value || null;
      const priceEur = parseFloat(document.getElementById('route-price-eur').value);
      const approximate_price_cents = !isNaN(priceEur) && priceEur >= 0 ? Math.round(priceEur * 100) : null;
      const badge_label = document.getElementById('route-badge-label').value.trim() || null;
      const image_url = document.getElementById('route-image-url').value.trim() || null;

      const errBanner = document.getElementById('route-form-error');
      const succBanner = document.getElementById('route-form-success');
      errBanner.style.display = 'none';
      succBanner.style.display = 'none';

      const payload = {
        city_id,
        category,
        title,
        slug,
        summary,
        description,
        start_date,
        end_date,
        approximate_price_cents,
        badge_label,
        image_url
      };

      modalRouteSaveInProgress = true;
      try {
        let res;
        if (id) {
          res = await apiFetch('/api/v1/admin/routes/' + id, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });
        } else {
          res = await apiFetch('/api/v1/admin/routes', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        }

        const data = await res.json();
        if (!res.ok) {
          errBanner.innerText = data.message || 'Error al guardar los datos de la ruta.';
          errBanner.style.display = 'block';
          return;
        }

        succBanner.innerText = id ? 'Datos actualizados correctamente.' : 'Borrador creado correctamente. Ahora puedes añadir participantes.';
        succBanner.style.display = 'block';
        loadAdminRoutes();

        if (!id && data.id) {
          editRoute(data.id);
        }
      } catch (err) {
        errBanner.innerText = err.message || 'Error de conexión.';
        errBanner.style.display = 'block';
      } finally {
        modalRouteSaveInProgress = false;
      }
    };

    // ==============================================================================
    // GESTIÓN DE PARTICIPANTES (LOCALES Y PROPUESTAS)
    // ==============================================================================
    function updateParticipantsCountTag() {
      const tag = document.getElementById('route-participants-count-tag');
      if (tag) tag.innerText = currentEditingParticipants.length;
    }

    function populateAddVenueSelect(cityId) {
      const sel = document.getElementById('route-add-venue-select');
      if (!sel) return;
      const addedVenueIds = new Set(currentEditingParticipants.map(p => p.venue_id));
      const venuesList = (typeof cachedVenues !== 'undefined' && cachedVenues.length > 0) ? cachedVenues : (window.cachedVenues || []);
      const eligible = venuesList.filter(v => v.city_id === cityId && v.is_active && !addedVenueIds.has(v.id));
      sel.innerHTML = '<option value="">— Selecciona un establecimiento —</option>' +
        eligible.map(v => '<option value="' + v.id + '">' + escapeHtml(v.name) + (v.address ? ' (' + escapeHtml(v.address) + ')' : '') + '</option>').join('');
    }

    window.addParticipantVenue = function() {
      const sel = document.getElementById('route-add-venue-select');
      const venueId = parseInt(sel?.value, 10);
      if (!venueId) return;

      const venuesList = (typeof cachedVenues !== 'undefined' && cachedVenues.length > 0) ? cachedVenues : (window.cachedVenues || []);
      const venue = venuesList.find(v => v.id === venueId);
      if (!venue) return;

      const newOrder = currentEditingParticipants.length + 1;
      currentEditingParticipants.push({
        venue_id: venue.id,
        display_order: newOrder,
        dish_name: '',
        dish_description: '',
        dish_price_cents: null,
        dish_image_url: null,
        is_optional: false,
        is_active: true,
        venue: {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          address: venue.address,
          latitude: venue.latitude,
          longitude: venue.longitude,
          google_maps_url: venue.google_maps_url
        }
      });

      populateAddVenueSelect(currentEditingRoute.city_id);
      updateParticipantsCountTag();
      renderParticipantsEditor();
    };

    window.removeParticipant = function(index) {
      currentEditingParticipants.splice(index, 1);
      // Recalcular display_order correlativo 1..N
      currentEditingParticipants.forEach((p, idx) => { p.display_order = idx + 1; });
      populateAddVenueSelect(currentEditingRoute.city_id);
      updateParticipantsCountTag();
      renderParticipantsEditor();
    };

    window.moveParticipant = function(index, direction) {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= currentEditingParticipants.length) return;

      const temp = currentEditingParticipants[index];
      currentEditingParticipants[index] = currentEditingParticipants[targetIndex];
      currentEditingParticipants[targetIndex] = temp;

      // Recalcular display_order correlativo 1..N
      currentEditingParticipants.forEach((p, idx) => { p.display_order = idx + 1; });
      renderParticipantsEditor();
    };

    window.renderParticipantsEditor = function renderParticipantsEditor() {
      const container = document.getElementById('participants-container');
      if (!container) return;

      if (currentEditingParticipants.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:var(--bg-subtle); border-radius:8px; border:1px dashed var(--border);">No hay locales participantes vinculados a esta ruta. Utiliza el selector superior para añadir locales.</div>';
        return;
      }

      container.innerHTML = currentEditingParticipants.map((p, idx) => {
        const vName = p.venue ? p.venue.name : ('Local #' + p.venue_id);
        const vAddr = p.venue && p.venue.address ? p.venue.address : '';
        const priceEur = p.dish_price_cents !== null && p.dish_price_cents !== undefined ? (p.dish_price_cents / 100) : '';

        return '<div class="participant-editor-card" style="background:#ffffff; border:1px solid var(--border); border-radius:8px; padding:1rem; margin-bottom:0.75rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem; flex-wrap:wrap; gap:0.5rem;">' +
            '<div>' +
              '<strong style="font-size:0.95rem; color:var(--text-main);">🏢 ' + escapeHtml(vName) + '</strong>' +
              (vAddr ? '<span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.5rem;">(' + escapeHtml(vAddr) + ')</span>' : '') +
              '<div style="font-size:0.75rem; color:var(--primary); font-weight:700;">Orden de visualización: #' + p.display_order + '</div>' +
            '</div>' +
            '<div style="display:flex; gap:0.35rem; align-items:center;">' +
              '<button type="button" class="btn-table-action" onclick="moveParticipant(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + ' aria-label="Subir orden técnico">▲ Subir</button>' +
              '<button type="button" class="btn-table-action" onclick="moveParticipant(' + idx + ', 1)" ' + (idx === currentEditingParticipants.length - 1 ? 'disabled' : '') + ' aria-label="Bajar orden técnico">▼ Bajar</button>' +
              '<button type="button" class="btn-table-action" style="color:#dc2626;" onclick="removeParticipant(' + idx + ')" aria-label="Quitar de la ruta">🗑️ Quitar</button>' +
            '</div>' +
          '</div>' +
          '<div class="form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem; margin-bottom:0.5rem;">' +
            '<div class="form-group">' +
              '<label style="font-size:0.8rem; font-weight:700; color:var(--text-main);">Nombre de la Tapa / Plato *</label>' +
              '<input type="text" value="' + escapeHtml(p.dish_name || '') + '" oninput="currentEditingParticipants[' + idx + '].dish_name = this.value" placeholder="Ej. Patatas bravas caseras" required>' +
            '</div>' +
            '<div class="form-group">' +
              '<label style="font-size:0.8rem; font-weight:700; color:var(--text-main);">Precio (€) (Opcional)</label>' +
              '<input type="number" step="0.1" min="0" value="' + priceEur + '" oninput="const val = parseFloat(this.value); currentEditingParticipants[' + idx + '].dish_price_cents = (!isNaN(val) && val >= 0) ? Math.round(val * 100) : null;" placeholder="Ej. 3.50">' +
            '</div>' +
          '</div>' +
          '<div class="form-group" style="margin-bottom:0.5rem;">' +
            '<label style="font-size:0.8rem; font-weight:700; color:var(--text-main);">Descripción de la Propuesta Culinaria (Opcional)</label>' +
            '<input type="text" value="' + escapeHtml(p.dish_description || '') + '" oninput="currentEditingParticipants[' + idx + '].dish_description = this.value" placeholder="Ingredientes destacados, elaboración...">' +
          '</div>' +
          '<div class="form-group" style="margin-bottom:0.5rem;">' +
            '<label style="font-size:0.8rem; font-weight:700; color:var(--text-main);">URL Foto de la Tapa (Opcional)</label>' +
            '<input type="url" value="' + escapeHtml(p.dish_image_url || '') + '" oninput="currentEditingParticipants[' + idx + '].dish_image_url = this.value.trim() || null" placeholder="https://images.vayaplan.com/tapas/...">' +
          '</div>' +
          '<div style="display:flex; gap:1.5rem; align-items:center; margin-top:0.5rem;">' +
            '<label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:600; cursor:pointer;">' +
              '<input type="checkbox" ' + (p.is_optional ? 'checked' : '') + ' onchange="currentEditingParticipants[' + idx + '].is_optional = this.checked"> Recomendación opcional' +
            '</label>' +
            '<label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-weight:600; cursor:pointer;">' +
              '<input type="checkbox" ' + (p.is_active ? 'checked' : '') + ' onchange="currentEditingParticipants[' + idx + '].is_active = this.checked"> Participación activa' +
            '</label>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    window.saveRouteParticipants = async function() {
      if (!currentEditingRoute) return;
      const errBanner = document.getElementById('route-form-error');
      const succBanner = document.getElementById('route-form-success');
      errBanner.style.display = 'none';
      succBanner.style.display = 'none';

      // Validar campos obligatorios en memoria
      for (let i = 0; i < currentEditingParticipants.length; i++) {
        const p = currentEditingParticipants[i];
        if (!p.dish_name || !p.dish_name.trim()) {
          errBanner.innerText = 'El participante en posición #' + (i + 1) + ' debe tener un nombre de propuesta culinaria.';
          errBanner.style.display = 'block';
          return;
        }
      }

      const payload = {
        participants: currentEditingParticipants.map((p, idx) => ({
          venue_id: p.venue_id,
          display_order: idx + 1,
          dish_name: p.dish_name.trim(),
          dish_description: p.dish_description ? p.dish_description.trim() : null,
          dish_price_cents: p.dish_price_cents !== null && p.dish_price_cents !== undefined ? p.dish_price_cents : null,
          dish_image_url: p.dish_image_url ? p.dish_image_url.trim() : null,
          is_optional: p.is_optional === true,
          is_active: p.is_active !== false
        }))
      };

      try {
        const res = await apiFetch('/api/v1/admin/routes/' + currentEditingRoute.id + '/participants', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          errBanner.innerText = data.message || 'Error al guardar los participantes.';
          errBanner.style.display = 'block';
          return;
        }

        succBanner.innerText = 'Participantes guardados correctamente (' + payload.participants.length + ' locales).';
        succBanner.style.display = 'block';
        currentEditingParticipants = (data.participants || []).map(p => ({ ...p }));
        updateParticipantsCountTag();
        renderParticipantsEditor();
        loadAdminRoutes();
      } catch (err) {
        errBanner.innerText = err.message || 'Error de conexión.';
        errBanner.style.display = 'block';
      }
    };

    // ==============================================================================
    // PUBLICACIÓN, ARCHIVADO Y PREVIEW
    // ==============================================================================
    window.publishRoute = async function(id) {
      try {
        const res = await apiFetch('/api/v1/admin/routes/' + id + '/publish', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 422 || data.error === 'insufficient_stops') {
            alert('Se necesitan al menos 2 locales participantes activos con su local activo para publicar la ruta.');
          } else {
            alert(data.message || 'Error al publicar la ruta.');
          }
          return;
        }

        alert('Ruta gastronómica publicada con éxito.');
        loadAdminRoutes();
        if (currentEditingRoute && currentEditingRoute.id === id) {
          editRoute(id);
        }
      } catch (err) {
        alert('Error al publicar: ' + err.message);
      }
    };

    window.confirmArchiveRoute = function(id) {
      routeToArchiveId = id;
      const route = currentAdminRoutes.find(r => r.id === id) || currentEditingRoute;
      const title = route ? route.title : ('#' + id);
      const bodyEl = document.getElementById('modal-archive-route-body');
      if (bodyEl) {
        bodyEl.innerHTML = '¿Estás seguro de que deseas archivar la ruta gastronómica «<strong>' + escapeHtml(title) + '</strong>»? Dejará de mostrarse en la web pública pero sus locales y propuestas permanecerán guardados.';
      }
      openModal('modal-confirm-archive-route');
    };

    window.executeArchiveRoute = async function() {
      if (!routeToArchiveId) return;
      const id = routeToArchiveId;
      closeModal('modal-confirm-archive-route');

      try {
        const res = await apiFetch('/api/v1/admin/routes/' + id + '/archive', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Error al archivar la ruta.');
          return;
        }

        loadAdminRoutes();
        if (currentEditingRoute && currentEditingRoute.id === id) {
          editRoute(id);
        }
      } catch (err) {
        alert('Error al archivar: ' + err.message);
      }
    };

    window.previewRoute = async function(id) {
      try {
        const res = await apiFetch('/api/v1/admin/routes/' + id + '/preview');
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Error al obtener la previsualización.');
          return;
        }

        const r = data.route;
        document.getElementById('modal-preview-title').innerText = r.title;

        const bodyEl = document.getElementById('modal-preview-body');
        const catLabel = ROUTE_CATEGORY_LABELS[r.category] || r.category;
        const timingText = r.is_permanent ? 'Ruta Permanente' : ('Temporada: ' + (r.start_date || '—') + ' al ' + (r.end_date || '—'));

        let participantsHtml = '<div style="margin-top:1.5rem;"><h4 style="font-size:1.05rem; font-weight:800; color:var(--text-main); margin-bottom:0.75rem;">Locales Participantes (' + (r.participants ? r.participants.length : 0) + ')</h4>';
        if (!r.participants || r.participants.length === 0) {
          participantsHtml += '<p style="color:var(--text-muted); font-size:0.9rem;">No hay locales participantes activos configurados en esta ruta.</p>';
        } else {
          participantsHtml += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem;">' +
            r.participants.map(p => {
              return '<article style="background:#ffffff; border:1px solid var(--border); border-radius:10px; padding:1rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
                (p.dish.image_url ? '<div style="height:140px; margin:-1rem -1rem 0.75rem -1rem; overflow:hidden; border-radius:10px 10px 0 0;"><img src="' + escapeHtml(p.dish.image_url) + '" alt="' + escapeHtml(p.dish.name) + '" style="width:100%; height:100%; object-fit:cover;"></div>' : '') +
                '<div style="font-size:0.8rem; font-weight:700; color:var(--primary); margin-bottom:0.25rem;">🏢 ' + escapeHtml(p.venue.name) + '</div>' +
                '<h5 style="margin:0 0 0.35rem 0; font-size:1rem; font-weight:800; color:var(--text-main);">' + escapeHtml(p.dish.name) + '</h5>' +
                (p.dish.description ? '<p style="margin:0 0 0.5rem 0; font-size:0.85rem; color:var(--text-muted); line-height:1.4;">' + escapeHtml(p.dish.description) + '</p>' : '') +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; border-top:1px solid var(--border); padding-top:0.5rem;">' +
                  (p.dish.price_label ? '<span style="font-weight:800; color:#059669; font-size:0.9rem;">' + escapeHtml(p.dish.price_label) + '</span>' : '<span></span>') +
                  (p.venue.google_maps_url ? '<a href="' + escapeHtml(p.venue.google_maps_url) + '" target="_blank" rel="noopener noreferrer" style="font-size:0.8rem; color:var(--primary); font-weight:700; text-decoration:none;">Cómo llegar ↗</a>' : '') +
                '</div>' +
              '</article>';
            }).join('') +
          '</div>';
        }
        participantsHtml += '</div>';

        bodyEl.innerHTML = '<div style="background:#ffffff; padding:1.25rem; border-radius:10px; border:1px solid var(--border); margin-bottom:1rem;">' +
          '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.5rem; align-items:center;">' +
            '<span class="badge-category">' + escapeHtml(catLabel) + '</span>' +
            '<span style="font-size:0.75rem; background:var(--bg-subtle); color:var(--text-muted); padding:0.2rem 0.5rem; border-radius:999px; font-weight:700;">' + escapeHtml(timingText) + '</span>' +
            '<span class="badge-status" style="margin-left:auto;">Estado: ' + escapeHtml(r.status) + '</span>' +
          '</div>' +
          '<p style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0 0 0.5rem 0;">' + escapeHtml(r.summary) + '</p>' +
          (r.description ? '<p style="font-size:0.9rem; color:var(--text-muted); line-height:1.5; margin:0;">' + escapeHtml(r.description) + '</p>' : '') +
        '</div>' +
        participantsHtml;

        openModal('modal-route-preview');
      } catch (err) {
        alert('Error al previsualizar: ' + err.message);
      }
    };

    window.getCurrentEditingRoute = function() { return currentEditingRoute; };
    window.setCurrentEditingRoute = function(r) { currentEditingRoute = r; };
    window.getCurrentEditingParticipants = function() { return currentEditingParticipants; };
    window.setCurrentEditingParticipants = function(p) { currentEditingParticipants = p; };
    window.getRouteToArchiveId = function() { return routeToArchiveId; };
    window.setRouteToArchiveId = function(id) { routeToArchiveId = id; };

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Inicializar verificación de autenticación al arrancar
    document.addEventListener('DOMContentLoaded', checkAuth);
  </script>
</body>
</html>`;
}
