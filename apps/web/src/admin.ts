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
      .recurrences-table-desktop {
        display: none !important;
      }
      .events-cards-mobile,
      .promo-cards-mobile,
      .venues-cards-mobile,
      .recurrences-cards-mobile {
        display: flex !important;
      }
    }
    @media (min-width: 769px) {
      .events-table-desktop,
      .promo-table-desktop,
      .venues-table-desktop,
      .recurrences-table-desktop {
        display: block !important;
      }
      .events-cards-mobile,
      .promo-cards-mobile,
      .venues-cards-mobile,
      .recurrences-cards-mobile {
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
            ⚠️ Locales por verificar (9999) <span id="inbox-badge-unassigned" class="badge-count badge-warning" style="display:none;">0</span>
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
        <div class="toolbar">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h3 style="margin:0; font-size:1.125rem; font-weight:800; color:var(--text-main);">Locales Censados en Palencia</h3>
            <span id="venues-count-badge" class="badge-count" style="display:none;">0</span>
          </div>
          <button class="btn-primary" onclick="openNewVenueModal()">+ Nuevo Local</button>
        </div>

        <!-- Vista Desktop: Tabla estructurada -->
        <div class="table-container venues-table-desktop">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Local / Zona / Categoría</th>
                <th>Dirección</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="venues-tbody">
              <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando locales...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Vista Móvil: Tarjetas individuales -->
        <div id="venues-cards-container" class="venues-cards-mobile">
          <div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando locales...</div>
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
          <h3>Lugares y Oferta Estable (Cine, Teatros, Salas)</h3>
          <button class="btn-primary" onclick="openNewPlaceModal()">+ Nuevo Lugar</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Destacado</th>
                <th>Horario / Precio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="places-tbody">
              <tr><td colspan="5" style="text-align:center;">Cargando lugares...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- SECCIÓN 5: QR ALOJAMIENTOS -->
      <section id="section-qr" style="display:none;">
        <div class="toolbar">
          <h3>Captación Turística: Códigos QR para Alojamientos</h3>
          <button class="btn-primary" onclick="openNewQrModal()">+ Nuevo QR Alojamiento</button>
        </div>
        <div class="table-container">
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
              <tr><td colspan="5" style="text-align:center;">Cargando fuentes QR...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>

  <!-- MODAL: CREAR / EDITAR EVENTO (TEMA CLARO) -->
  <div id="modal-event" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-event-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nuevo Evento</h3>
        <button class="modal-close" onclick="closeModal('modal-event')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-event" onsubmit="saveEvent(event)">
        <div class="modal-body">
          <input type="hidden" id="ev-id">

          <div class="form-group">
            <label for="ev-title" style="font-weight:700; color:var(--text-main);">Título del evento *</label>
            <input type="text" id="ev-title" required placeholder="Ej: Concierto acústico">
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="ev-venue-id" style="font-weight:700; color:var(--text-main);">Local (Venue) *</label>
              <select id="ev-venue-id" required></select>
            </div>
            <div class="form-group">
              <label for="ev-category" style="font-weight:700; color:var(--text-main);">Categoría *</label>
              <select id="ev-category" required>
                <option value="musica_directo">Música en directo</option>
                <option value="dj_tardeo">DJ & Tardeo</option>
                <option value="monologo">Monólogo</option>
                <option value="cine">Cine</option>
                <option value="teatro">Teatro</option>
                <option value="exposicion">Exposición</option>
                <option value="cultura">Cultura</option>
              </select>
            </div>
          </div>

          <!-- Bloque de Horarios (Europe/Madrid) -->
          <div style="background:var(--bg-subtle); border:1px solid var(--border); border-radius:10px; padding:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.625rem;">
              <span style="font-size:0.8125rem; font-weight:800; text-transform:uppercase; color:var(--primary);">Horarios y Jornada Editorial</span>
              <span style="font-size:0.75rem; color:var(--text-dim); background:#ffffff; border:1px solid var(--border); padding:0.15rem 0.5rem; border-radius:9999px;">🌐 Europe/Madrid</span>
            </div>
            <div class="form-grid two-cols" style="gap:0.75rem;">
              <div class="form-group">
                <label for="ev-start-time" style="font-weight:600; font-size:0.8125rem; color:var(--text-muted);">Fecha y hora de inicio *</label>
                <input type="datetime-local" id="ev-start-time" required oninput="onEvStartTimeChange()">
                <small style="font-size:0.6875rem; color:var(--text-dim); display:block; margin-top:0.25rem;">Hora oficial en Palencia</small>
              </div>
              <div class="form-group">
                <label for="ev-editorial-date" style="font-weight:600; font-size:0.8125rem; color:var(--text-muted);">Fecha editorial (YYYY-MM-DD) *</label>
                <input type="date" id="ev-editorial-date" required>
                <small id="ev-editorial-date-hint" style="font-size:0.6875rem; color:var(--text-dim); display:block; margin-top:0.25rem;">Frontera editorial a las 06:00</small>
              </div>
            </div>
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="ev-price-cents" style="font-weight:700; color:var(--text-main);">Precio en céntimos (0 = gratis)</label>
              <input type="number" id="ev-price-cents" value="0" min="0">
            </div>
            <div class="form-group">
              <label for="ev-status" style="font-weight:700; color:var(--text-main);">Estado</label>
              <select id="ev-status">
                <option value="published">Publicado</option>
                <option value="tentative">Borrador Tentativo</option>
                <option value="cancelled">Cancelado</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="ev-description" style="font-weight:700; color:var(--text-main);">Descripción / Cartel texto</label>
            <textarea id="ev-description" rows="3" placeholder="Detalles de la actuación..."></textarea>
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="ev-source-url" style="font-weight:700; color:var(--text-main);">URL de entradas / reserva</label>
              <input type="url" id="ev-source-url" placeholder="https://...">
            </div>
            <div class="form-group">
              <label for="ev-image-url" style="font-weight:700; color:var(--text-main);">URL de imagen / cartel</label>
              <input type="url" id="ev-image-url" placeholder="https://...">
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-event')">Cancelar</button>
          <button type="submit" class="btn-primary" id="btn-save-event">Guardar Evento</button>
        </div>
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
              <option value="">Todas las categorías</option>
              <option value="bar">Bar</option>
              <option value="bar_musical">Bar Musical</option>
              <option value="disco_bar">Disco Bar</option>
              <option value="discoteca">Discoteca</option>
              <option value="pub">Pub</option>
              <option value="sala_conciertos">Sala de conciertos</option>
              <option value="teatro">Teatro</option>
              <option value="cine">Cine</option>
              <option value="general">General</option>
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
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-venue-title" style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text-main);">Nuevo Local</h3>
        <button class="modal-close" onclick="closeModal('modal-venue')" aria-label="Cerrar modal">✕</button>
      </div>
      <form id="form-venue" onsubmit="saveVenue(event)">
        <div class="modal-body">
          <input type="hidden" id="venue-id">

          <div class="form-group">
            <label for="venue-name" style="font-weight:700; color:var(--text-main);">Nombre del local *</label>
            <input type="text" id="venue-name" required placeholder="Ej: Bar Central">
          </div>

          <div class="form-group">
            <label for="venue-address" style="font-weight:700; color:var(--text-main);">Dirección</label>
            <input type="text" id="venue-address" placeholder="Calle Mayor 12, Palencia">
          </div>

          <div class="form-grid two-cols" style="gap:0.75rem;">
            <div class="form-group">
              <label for="venue-whatsapp" style="font-weight:700; color:var(--text-main);">WhatsApp de contacto</label>
              <input type="text" id="venue-whatsapp" placeholder="+34600112233">
            </div>
            <div class="form-group">
              <label for="venue-instagram" style="font-weight:700; color:var(--text-main);">Instagram (@usuario)</label>
              <input type="text" id="venue-instagram" placeholder="barcentral">
            </div>
          </div>

          <div class="form-group">
            <label for="venue-maps-url" style="font-weight:700; color:var(--text-main);">Enlace Google Maps</label>
            <input type="url" id="venue-maps-url" placeholder="https://maps.google.com/?cid=...">
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" onclick="closeModal('modal-venue')">Cancelar</button>
          <button type="submit" id="btn-save-venue" class="btn-primary">Guardar Local</button>
        </div>
      </form>
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

  <!-- MODAL: NUEVO LUGAR PERMANENTE -->
  <div id="modal-place" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-place-title">Nuevo Lugar Permanente</h3>
        <button class="modal-close" onclick="closeModal('modal-place')">✕</button>
      </div>
      <form id="form-place" onsubmit="savePlace(event)">
        <input type="hidden" id="place-id">
        <div class="form-group">
          <label>Nombre del lugar *</label>
          <input type="text" id="place-name" required placeholder="Ej: Cine Ortega">
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Categoría *</label>
            <select id="place-category" required>
              <option value="cine">Cine</option>
              <option value="teatro">Teatro</option>
              <option value="exposicion">Exposición</option>
              <option value="cultura">Cultura</option>
            </select>
          </div>
          <div class="form-group">
            <label>Texto destacado *</label>
            <input type="text" id="place-highlight" required placeholder="Ej: Salas históricas de estreno">
          </div>
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Horario</label>
            <input type="text" id="place-hours" placeholder="Miércoles a Domingo de 17:00 a 22:30">
          </div>
          <div class="form-group">
            <label>Precio orientativo</label>
            <input type="text" id="place-price" placeholder="6,50 € / 8,00 €">
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Enlace Google Maps</label>
          <input type="url" id="place-maps-url" placeholder="https://maps.google.com/?cid=...">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-place')">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar Lugar</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: NUEVO QR ALOJAMIENTO -->
  <div id="modal-qr" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Nuevo QR para Alojamiento</h3>
        <button class="modal-close" onclick="closeModal('modal-qr')">✕</button>
      </div>
      <form onsubmit="saveQrSource(event)">
        <div class="form-group">
          <label>Nombre del hotel / alojamiento *</label>
          <input type="text" id="qr-name" required placeholder="Ej: Hotel San Antolín">
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Tipo de establecimiento</label>
            <select id="qr-type">
              <option value="hotel">Hotel</option>
              <option value="apartamento">Apartamento turístico</option>
              <option value="hostal">Hostal</option>
              <option value="casa_rural">Casa rural</option>
            </select>
          </div>
          <div class="form-group">
            <label>Código identificador (Opcional)</label>
            <input type="text" id="qr-code-input" placeholder="palencia-hotel-san-antolin">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-qr')">Cancelar</button>
          <button type="submit" class="btn-primary">Generar QR</button>
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
    let isActionInProgress = false; // Guarda contra clics repetidos
    let promoSaveInProgress = false; // Guarda contra clics repetidos en guardado de promociones
    let promoUserModifiedStartsAt = false;
    let promoUserModifiedEndsAt = false;
    let adminEventsRequestId = 0;
    const eventActionsInProgress = new Set();
    let modalEventSaveInProgress = false;
    let modalVenueSaveInProgress = false;
    let currentEditingEvent = null;
    let editEventOrigin = 'events';

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

    window.onEvStartTimeChange = function() {
      const startVal = document.getElementById('ev-start-time').value;
      if (!startVal) return;
      const [datePart, timePart] = startVal.split('T');
      if (!datePart || !timePart) return;
      const [h] = timePart.split(':').map(Number);
      let editDate = datePart;
      if (h < 6) {
        const [y, m, d] = datePart.split('-').map(Number);
        const prev = new Date(Date.UTC(y, m - 1, d - 1));
        const py = prev.getUTCFullYear();
        const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
        const pd = String(prev.getUTCDate()).padStart(2, '0');
        editDate = \`\${py}-\${pm}-\${pd}\`;
      }
      document.getElementById('ev-editorial-date').value = editDate;
      const hint = document.getElementById('ev-editorial-date-hint');
      if (hint) {
        hint.textContent = h < 6
          ? \`Madrugada (<06:00): jornada anterior (\${editDate})\`
          : \`Jornada del mismo día (\${editDate})\`;
      }
    };

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
      const allSections = ['inbox', 'events', 'promotions', 'venues', 'recurrences', 'places', 'qr'];
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
      }
    };

    // ==============================================================================
    // Gestión de Eventos
    // ==============================================================================
    async function loadVenuesCache() {
      try {
        const res = await apiFetch('/api/v1/admin/venues');
        const data = await res.json();
        cachedVenues = data.venues || [];

        // Rellenar selects
        const selects = ['ev-venue-id', 'rec-venue-id'];
        selects.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.innerHTML = cachedVenues.map(v => \`<option value="\${v.id}">\${escapeHtml(v.name)}</option>\`).join('');
          }
        });
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
        const totalUnassigned = drafts.filter(e => e.venue_id === 9999).length;
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
        url += 'venue_id=9999&';
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
          const isUnassigned = e.venue_id === 9999;
          const hasCollision = Boolean(e.collision_alert);

          let cardClass = 'inbox-card';
          if (isUnassigned) cardClass += ' card-warning';
          if (hasCollision) cardClass += ' card-collision';

          return \`
            <article class="\${cardClass}" id="inbox-card-\${e.id}">
              \${isUnassigned ? \`
                <div class="card-banner-warning">
                  <span>⚠️ Local por verificar (9999) — Asignación obligatoria</span>
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
                <span class="card-price">\${e.is_free ? 'Gratis' : ((e.price_cents || 0)/100).toFixed(2).replace('.', ',') + ' €'}</span>
              </div>

              <h3 class="card-title">\${escapeHtml(e.title)}</h3>

              <div class="card-timing">
                <span class="card-timing-item">📅 <strong>\${e.editorial_date}</strong></span>
                <span class="card-timing-item">⏰ <strong style="color:var(--primary);">\${formatMadridTime(e.start_time)}</strong></span>
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
          url += 'venue_id=9999&';
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
            const isUnassigned = e.venue_id === 9999;
            const hasCollision = Boolean(e.collision_alert);
            const statusBadge = getEventStatusBadge(e.status);

            return \`
              <tr id="event-row-\${e.id}">
                <td>\${statusBadge}</td>
                <td>
                  <div style="font-weight:700; font-size:0.9375rem; color:var(--text-main); line-height:1.35;">\${escapeHtml(e.title)}</div>
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.3rem;">
                    <span class="badge-tag">\${formatCategory(e.category)}</span>
                  </div>
                  \${isUnassigned ? \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <span class="badge-unverified">⚠️ Local por verificar</span>
                      <button class="btn-card-reassign" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="openReassignModal(\${e.id})">🏢 Asignar Local</button>
                    </div>
                  \` : \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; font-size:0.8125rem;">
                      <span>📍 <strong>\${escapeHtml(e.venue_name)}</strong></span>
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
                  <div style="margin-top:0.25rem; font-size:0.8125rem;">⏰ <strong style="color:var(--primary); font-size:0.875rem;">\${formatMadridTime(e.start_time)}</strong> <span style="font-size:0.6875rem; color:var(--text-dim);">(Madrid)</span></div>
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
            const isUnassigned = e.venue_id === 9999;
            const hasCollision = Boolean(e.collision_alert);
            const statusBadge = getEventStatusBadge(e.status);

            return \`
              <div class="event-card" id="event-card-\${e.id}">
                <div class="event-card-header">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    \${statusBadge}
                    <span class="badge-tag">\${formatCategory(e.category)}</span>
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
                      <span class="badge-unverified">⚠️ Local por verificar</span>
                      <button class="btn-card-reassign" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="openReassignModal(\${e.id})">🏢 Asignar Local</button>
                    </div>
                  \` : \`
                    <div style="margin-top:0.45rem; display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap; font-size:0.8125rem;">
                      <span>📍 <strong>\${escapeHtml(e.venue_name)}</strong></span>
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
                      <span>⏰ <strong style="color:var(--primary);">\${formatMadridTime(e.start_time)}</strong> <span style="font-size:0.6875rem; color:var(--text-dim);">(Madrid)</span></span>
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
      if (venueId === 9999) {
        alert('No se puede publicar un evento con Local por verificar (venue 9999). Asigna un local del censo primero.');
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
          <span>Local actual: \${ev.venue_id === 9999 ? '<span style="color:#fbbf24; font-weight:700;">⚠️ Local por verificar (9999)</span>' : '<strong>' + escapeHtml(ev.venue_name) + '</strong>'}</span>
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

    window.openNewEventModal = function() {
      currentEditingEvent = null;
      editEventOrigin = 'events';
      lastActiveElementBeforeModal = document.activeElement;

      document.getElementById('modal-event-title').innerText = 'Nuevo Evento';
      document.getElementById('form-event').reset();
      document.getElementById('ev-id').value = '';

      // Fecha y hora de inicio por defecto en Europe/Madrid a las 22:00
      const nowMadrid = formatToMadridDatetimeLocal(new Date());
      const todayMadridDate = nowMadrid ? nowMadrid.split('T')[0] : new Date().toISOString().split('T')[0];
      document.getElementById('ev-editorial-date').value = todayMadridDate;
      document.getElementById('ev-start-time').value = todayMadridDate + 'T22:00';

      const hint = document.getElementById('ev-editorial-date-hint');
      if (hint) hint.textContent = 'Frontera editorial a las 06:00 (Europe/Madrid)';

      const saveBtn = document.getElementById('btn-save-event');
      if (saveBtn) { saveBtn.textContent = 'Guardar Evento'; saveBtn.disabled = false; }

      openModal('modal-event');
      const titleInput = document.getElementById('ev-title');
      if (titleInput) titleInput.focus();
    };

    window.editEvent = async function(id) {
      lastActiveElementBeforeModal = document.activeElement;
      editEventOrigin = currentSection === 'inbox' ? 'inbox' : 'events';

      const saveBtn = document.getElementById('btn-save-event');
      if (saveBtn) { saveBtn.textContent = 'Guardar Evento'; saveBtn.disabled = false; }

      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}\`);
        const data = await res.json();
        const ev = data.event;
        currentEditingEvent = ev;

        document.getElementById('modal-event-title').innerText = 'Editar Evento #' + ev.id;
        document.getElementById('ev-id').value = ev.id;
        document.getElementById('ev-title').value = ev.title || '';
        document.getElementById('ev-venue-id').value = ev.venue_id;
        document.getElementById('ev-category').value = ev.category;
        document.getElementById('ev-editorial-date').value = ev.editorial_date;
        document.getElementById('ev-start-time').value = formatToMadridDatetimeLocal(ev.start_time);
        document.getElementById('ev-price-cents').value = ev.price_cents || 0;
        document.getElementById('ev-status').value = ev.status;
        document.getElementById('ev-description').value = ev.description || '';
        document.getElementById('ev-source-url').value = ev.source_url || '';
        document.getElementById('ev-image-url').value = ev.image_url || '';

        const hint = document.getElementById('ev-editorial-date-hint');
        if (hint) hint.textContent = 'Frontera editorial a las 06:00 (Europe/Madrid)';

        openModal('modal-event');
        const titleInput = document.getElementById('ev-title');
        if (titleInput) titleInput.focus();
      } catch (err) {
        alert('Error al cargar datos del evento.');
      }
    };

    window.saveEvent = async function(e) {
      e.preventDefault();
      if (modalEventSaveInProgress) return;

      const id = document.getElementById('ev-id').value;
      const startVal = document.getElementById('ev-start-time').value;
      if (!startVal) {
        alert('Debes indicar una fecha y hora de inicio.');
        return;
      }

      // Si no se editó start_time, preservamos el timestamp ISO exacto original
      let startTimeIso;
      if (currentEditingEvent && id && formatToMadridDatetimeLocal(currentEditingEvent.start_time) === startVal) {
        startTimeIso = currentEditingEvent.start_time;
      } else {
        startTimeIso = parseMadridToUtcIso(startVal);
      }

      const payload = {
        title: document.getElementById('ev-title').value.trim(),
        venue_id: Number(document.getElementById('ev-venue-id').value),
        category: document.getElementById('ev-category').value,
        editorial_date: document.getElementById('ev-editorial-date').value,
        start_time: startTimeIso,
        price_cents: Number(document.getElementById('ev-price-cents').value),
        status: document.getElementById('ev-status').value,
        description: document.getElementById('ev-description').value.trim() || null,
        source_url: document.getElementById('ev-source-url').value.trim() || null,
        image_url: document.getElementById('ev-image-url').value.trim() || null,
      };

      const saveBtn = document.getElementById('btn-save-event');
      const cancelBtn = document.querySelector('#modal-event .btn-logout');
      modalEventSaveInProgress = true;
      if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        let res;
        if (id) {
          res = await apiFetch(\`/api/v1/admin/events/\${id}\`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          res = await apiFetch('/api/v1/admin/events', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.message || 'Error al guardar el evento.');
          return;
        }

        modalEventSaveInProgress = false;
        closeModal('modal-event');

        // Refrescar según origen
        if (editEventOrigin === 'inbox') {
          await loadAdminInbox();
          updateCurationCounts();
        } else {
          await loadAdminEvents();
        }
      } catch (err) {
        alert(err.message || 'Error de conexión al guardar el evento.');
      } finally {
        modalEventSaveInProgress = false;
        if (saveBtn) { saveBtn.textContent = 'Guardar Evento'; saveBtn.disabled = false; }
        if (cancelBtn) cancelBtn.disabled = false;
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
    async function loadAdminVenues() {
      const tbody = document.getElementById('venues-tbody');
      const cardsContainer = document.getElementById('venues-cards-container');
      const countBadge = document.getElementById('venues-count-badge');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando locales...</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); background:#ffffff; border-radius:12px; border:1px solid var(--border);">Cargando locales...</div>';

      try {
        const res = await apiFetch('/api/v1/admin/venues');
        const data = await res.json();
        const venues = data.venues || [];
        cachedVenues = venues;

        if (countBadge) {
          countBadge.innerText = venues.length;
          countBadge.style.display = 'inline-block';
        }

        if (venues.length === 0) {
          const emptyMsg = 'No hay locales censados registrados.';
          if (tbody) tbody.innerHTML = \`<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:2.5rem 1rem;">\${emptyMsg}</td></tr>\`;
          if (cardsContainer) cardsContainer.innerHTML = \`<div style="text-align:center; color:var(--text-dim); padding:2.5rem 1rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">\${emptyMsg}</div>\`;
          return;
        }

        // Render Desktop
        if (tbody) {
          tbody.innerHTML = venues.map(v => {
            const is9999 = v.id === 9999;
            const statusBadge = is9999
              ? '<span class="badge-status" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">⚠️ Provisional</span>'
              : \`<span class="badge-status \${v.is_active ? 'badge-active' : 'badge-cancelled'}">\${v.is_active ? 'Activo' : 'Inactivo'}</span>\`;

            const contacts = [];
            if (v.whatsapp_contact) {
              const cleanWa = v.whatsapp_contact.replace(/[^0-9]/g, '');
              contacts.push(\`<div>💬 <a href="https://wa.me/\${encodeURIComponent(cleanWa)}" target="_blank" rel="noopener" style="color:var(--text-main); font-weight:600; text-decoration:none;">\${escapeHtml(v.whatsapp_contact)}</a></div>\`);
            }
            if (v.instagram_handle) {
              contacts.push(\`<div style="margin-top:0.2rem; font-size:0.8125rem;">📷 <a href="https://instagram.com/\${encodeURIComponent(v.instagram_handle)}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">@\${escapeHtml(v.instagram_handle)}</a></div>\`);
            }
            if (v.website_url) {
              contacts.push(\`<div style="margin-top:0.2rem; font-size:0.75rem;"><a href="\${escapeHtml(v.website_url)}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">🌐 Web oficial ↗</a></div>\`);
            }
            const contactHtml = contacts.length > 0 ? contacts.join('') : '<span style="color:var(--text-dim);">—</span>';

            return \`
              <tr id="venue-row-\${v.id}">
                <td><strong style="color:var(--text-dim); font-size:0.8125rem;">#\${v.id}</strong></td>
                <td>
                  <div style="font-weight:700; font-size:0.9375rem; color:var(--text-main); line-height:1.35;">\${escapeHtml(v.name)}</div>
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.3rem; flex-wrap:wrap;">
                    \${v.zone ? \`<span class="venue-badge">Zona: \${escapeHtml(formatVenueZone(v.zone))}</span>\` : ''}
                    \${v.category ? \`<span class="venue-badge">Cat: \${escapeHtml(v.category)}</span>\` : ''}
                  </div>
                  \${is9999 ? \`
                    <div style="margin-top:0.35rem;">
                      <span class="badge-unverified">⚠️ Local provisional del sistema</span>
                    </div>
                  \` : ''}
                </td>
                <td>
                  \${v.address ? \`<div>📍 <strong>\${escapeHtml(v.address)}</strong></div>\` : '<span style="color:var(--text-dim);">—</span>'}
                  \${v.google_maps_url ? \`<a href="\${escapeHtml(v.google_maps_url)}" target="_blank" rel="noopener" class="link-source" style="display:inline-flex; align-items:center; gap:0.2rem; margin-top:0.25rem; font-size:0.75rem; color:var(--primary); text-decoration:none;">🗺️ Maps ↗</a>\` : ''}
                </td>
                <td>\${contactHtml}</td>
                <td>\${statusBadge}</td>
                <td>
                  <button class="btn-table-action" onclick="editVenue(\${v.id})" aria-label="Editar local #\${v.id}" title="Editar local">✏️ Editar</button>
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
              ? '<span class="badge-status" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">⚠️ Provisional</span>'
              : \`<span class="badge-status \${v.is_active ? 'badge-active' : 'badge-cancelled'}">\${v.is_active ? 'Activo' : 'Inactivo'}</span>\`;

            return \`
              <article class="venue-card \${is9999 ? 'venue-card-warning' : ''}" id="venue-card-\${v.id}">
                <div class="venue-card-header">
                  <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    \${statusBadge}
                    <span style="font-size:0.75rem; font-weight:700; color:var(--text-dim);">#\${v.id}</span>
                    \${v.zone ? \`<span class="venue-badge">Zona: \${escapeHtml(formatVenueZone(v.zone))}</span>\` : ''}
                    \${v.category ? \`<span class="venue-badge">Cat: \${escapeHtml(v.category)}</span>\` : ''}
                  </div>
                </div>
                <h4 class="venue-card-title">\${escapeHtml(v.name)}</h4>
                \${is9999 ? \`
                  <div style="font-size:0.8125rem; color:#b45309; font-weight:600; line-height:1.4;">
                    ⚠️ Local provisional del sistema para borradores sin asignar. No asignable en curación.
                  </div>
                \` : ''}
                <div class="venue-card-body">
                  \${v.address ? \`<div>📍 <strong>\${escapeHtml(v.address)}</strong></div>\` : ''}
                  \${v.whatsapp_contact ? \`<div>💬 WhatsApp: <strong>\${escapeHtml(v.whatsapp_contact)}</strong></div>\` : ''}
                  \${v.instagram_handle ? \`<div>📷 Instagram: <strong>@\${escapeHtml(v.instagram_handle)}</strong></div>\` : ''}
                  \${v.google_maps_url ? \`<div>🗺️ <a href="\${escapeHtml(v.google_maps_url)}" target="_blank" rel="noopener" style="color:var(--primary); font-size:0.8125rem;">Ver en Google Maps ↗</a></div>\` : ''}
                  \${v.website_url ? \`<div>🌐 <a href="\${escapeHtml(v.website_url)}" target="_blank" rel="noopener" style="color:var(--primary); font-size:0.8125rem;">Web oficial ↗</a></div>\` : ''}
                </div>
                <div class="venue-card-actions">
                  <button class="btn-card-action" onclick="editVenue(\${v.id})" aria-label="Editar local #\${v.id}">✏️ Editar Local</button>
                </div>
              </article>
            \`;
          }).join('');
        }
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--red); padding:2rem;">Error al cargar el censo de locales.</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; color:var(--red); padding:2rem; background:#ffffff; border-radius:12px; border:1px solid var(--border);">Error al cargar el censo de locales.</div>';
      }
    }

    window.openNewVenueModal = function() {
      modalVenueSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-venue-title').innerText = 'Nuevo Local';
      document.getElementById('form-venue').reset();
      document.getElementById('venue-id').value = '';
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
      const v = cachedVenues.find(x => x.id === id);
      if (!v) return;
      modalVenueSaveInProgress = false;
      lastActiveElementBeforeModal = document.activeElement;
      document.getElementById('modal-venue-title').innerText = 'Editar Local #' + v.id;
      document.getElementById('venue-id').value = v.id;
      document.getElementById('venue-name').value = v.name || '';
      document.getElementById('venue-address').value = v.address || '';
      document.getElementById('venue-whatsapp').value = v.whatsapp_contact || '';
      document.getElementById('venue-instagram').value = v.instagram_handle || '';
      document.getElementById('venue-maps-url').value = v.google_maps_url || '';
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
      const saveBtn = document.getElementById('btn-save-venue');
      const id = document.getElementById('venue-id').value;
      const nameVal = document.getElementById('venue-name').value.trim();
      if (!nameVal) {
        alert('El nombre del local es obligatorio.');
        return;
      }

      const payload = {
        name: nameVal,
        address: document.getElementById('venue-address').value.trim() || null,
        whatsapp_contact: document.getElementById('venue-whatsapp').value.trim() || null,
        instagram_handle: document.getElementById('venue-instagram').value.trim()?.replace('@', '') || null,
        google_maps_url: document.getElementById('venue-maps-url').value.trim() || null,
      };

      modalVenueSaveInProgress = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';
      }

      try {
        let res;
        if (id) {
          res = await apiFetch(\`/api/v1/admin/venues/\${id}\`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          res = await apiFetch('/api/v1/admin/venues', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.message || 'Error al guardar el local.');
          return;
        }

        closeModal('modal-venue');
        await loadVenuesCache();
        loadAdminVenues();
      } catch (err) {
        alert('Error de conexión al guardar el local.');
      } finally {
        modalVenueSaveInProgress = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = id ? 'Guardar Cambios' : 'Guardar Local';
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
    async function loadAdminPlaces() {
      const tbody = document.getElementById('places-tbody');
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando lugares...</td></tr>';
      try {
        const res = await apiFetch('/api/v1/admin/places');
        const data = await res.json();
        const places = data.places || [];

        tbody.innerHTML = places.map(p => \`
          <tr>
            <td><strong>\${escapeHtml(p.name)}</strong></td>
            <td><small>\${escapeHtml(p.category)}</small></td>
            <td>\${escapeHtml(p.highlight_text)}</td>
            <td><small>\${escapeHtml(p.opening_hours_text || '—')}<br>\${escapeHtml(p.price_text || '')}</small></td>
            <td>
              <button class="btn-act" onclick="editPlace(\${p.id})">✏️ Editar</button>
            </td>
          </tr>
        \`).join('');
      } catch {}
    }

    window.openNewPlaceModal = function() {
      document.getElementById('modal-place-title').innerText = 'Nuevo Lugar Permanente';
      document.getElementById('form-place').reset();
      document.getElementById('place-id').value = '';
      openModal('modal-place');
    };

    window.savePlace = async function(e) {
      e.preventDefault();
      const id = document.getElementById('place-id').value;
      const payload = {
        name: document.getElementById('place-name').value.trim(),
        category: document.getElementById('place-category').value,
        highlight_text: document.getElementById('place-highlight').value.trim(),
        opening_hours_text: document.getElementById('place-hours').value.trim() || null,
        price_text: document.getElementById('place-price').value.trim() || null,
        google_maps_url: document.getElementById('place-maps-url').value.trim() || null,
      };

      if (id) {
        await apiFetch(\`/api/v1/admin/places/\${id}\`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/v1/admin/places', { method: 'POST', body: JSON.stringify(payload) });
      }

      closeModal('modal-place');
      loadAdminPlaces();
    };

    // ==============================================================================
    // Gestión de Códigos QR
    // ==============================================================================
    async function loadAdminQr() {
      const tbody = document.getElementById('qr-tbody');
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando fuentes QR...</td></tr>';
      try {
        const res = await apiFetch('/api/v1/admin/qr-sources');
        const data = await res.json();
        const qrs = data.qr_sources || [];

        tbody.innerHTML = qrs.map(q => \`
          <tr>
            <td><strong>\${escapeHtml(q.accommodation_name)}</strong></td>
            <td><span class="status-pill status-published">\${q.accommodation_type || 'hotel'}</span></td>
            <td>
              <code>\${escapeHtml(q.qr_code)}</code><br>
              <a href="https://vayaplan.com/qr/\${q.qr_code}" target="_blank" style="color:var(--accent-blue); font-size:0.75rem;">https://vayaplan.com/qr/\${q.qr_code}</a>
            </td>
            <td><strong style="color:var(--emerald); font-size:1.1rem;">\${q.total_scans}</strong> escaneos</td>
            <td>
              <div class="action-group">
                <a href="/api/v1/admin/qr-sources/\${q.id}/svg?format=card" target="_blank" class="btn-act btn-metrics">Descargar Tarjeta SVG</a>
                <button class="btn-act" onclick="navigator.clipboard.writeText('https://vayaplan.com/qr/\${q.qr_code}'); alert('Enlace copiado al portapapeles!');">Copiar Link</button>
              </div>
            </td>
          </tr>
        \`).join('');
      } catch {}
    }

    window.openNewQrModal = function() {
      openModal('modal-qr');
    };

    window.saveQrSource = async function(e) {
      e.preventDefault();
      const payload = {
        accommodation_name: document.getElementById('qr-name').value.trim(),
        accommodation_type: document.getElementById('qr-type').value,
        qr_code: document.getElementById('qr-code-input').value.trim() || undefined,
      };

      await apiFetch('/api/v1/admin/qr-sources', { method: 'POST', body: JSON.stringify(payload) });
      closeModal('modal-qr');
      loadAdminQr();
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

      if (Number(ev.venue_id) === 9999) {
        alert('No se puede promocionar un evento con Local por verificar (venue provisional). Debes asignarle un local censado antes de promocionarlo.');
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
          if (activeModal.id === 'modal-event' && modalEventSaveInProgress) return;
          if (activeModal.id === 'modal-venue' && modalVenueSaveInProgress) return;
          if (activeModal.id === 'modal-recurrence' && modalRecurrenceSaveInProgress) return;
          if (activeModal.id === 'modal-exception' && modalExceptionSaveInProgress) return;
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
        // Foco en el primer campo interactivo visible
        const focusables = getModalFocusables(el);
        if (focusables.length > 0) focusables[0].focus();
      }
    };

    window.closeModal = function(id) {
      // Bloquear cierre del modal de reasignación si hay petición activa en vuelo
      if (id === 'modal-reassign-venue' && modalSaveInProgress) return;
      if (id === 'modal-promotion' && promoSaveInProgress) return;
      if (id === 'modal-event' && modalEventSaveInProgress) return;
      if (id === 'modal-venue' && modalVenueSaveInProgress) return;
      if (id === 'modal-recurrence' && modalRecurrenceSaveInProgress) return;
      if (id === 'modal-exception' && modalExceptionSaveInProgress) return;
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
      const target = lastActiveElementBeforeModal;
      if (target && typeof target.focus === 'function' && document.body.contains(target)) {
        target.focus();
      } else {
        // Destino lógico si el disparador desapareció
        const fallback = document.getElementById('btn-hamburger') || document.querySelector('.admin-sidebar .sidebar-nav-item.active');
        if (fallback) fallback.focus();
      }
    };

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
