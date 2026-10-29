import type { GastronomicRoutesResponseContract, PublicRouteSummary } from '@vayaplan/types';

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRouteDateRange(start?: string | null, end?: string | null, isPermanent?: boolean): string {
  if (isPermanent || (!start && !end)) {
    return 'Ruta permanente';
  }
  if (start && end) {
    if (start === end) return `Fecha: ${start}`;
    return `Del ${start} al ${end}`;
  }
  if (start) return `A partir del ${start}`;
  if (end) return `Hasta el ${end}`;
  return 'Ruta activa';
}

function formatRoutePrice(priceCents?: number | null): string {
  if (priceCents === null || priceCents === undefined || priceCents <= 0) {
    return '';
  }
  const euros = (priceCents / 100).toFixed(2).replace('.', ',');
  return `${euros} € aprox.`;
}

export function renderRoutesHtml(
  data: GastronomicRoutesResponseContract,
  canonicalUrl: string
): string {
  const city = data.city;
  const routes: PublicRouteSummary[] = data.routes || [];
  const backUrl = city.slug === 'palencia' ? '/?cat=gastronomia' : `/?city=${encodeURIComponent(city.slug)}&cat=gastronomia`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rutas Gastronómicas en ${escapeHtml(city.name)} | VayaPlan</title>
  <meta name="description" content="Descubre las rutas gastronómicas, de tapas y maridajes en ${escapeHtml(city.name)}. Locales participantes y propuestas culinarias.">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:title" content="Rutas Gastronómicas en ${escapeHtml(city.name)} — VayaPlan">
  <meta property="og:description" content="Itinerarios gastronómicos y de tapas en ${escapeHtml(city.name)}.">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <style>
    :root {
      --color-primary: #9a3412;
      --color-primary-hover: #7c2d12;
      --color-primary-soft: #ffedd5;
      --color-night: #111827;
      --color-surface: #FFFFFF;
      --color-bg: #F9FAFB;
      --color-border: #E5E7EB;
      --color-text-muted: #6B7280;
      --radius-md: 12px;
      --radius-pill: 9999px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--color-bg);
      color: var(--color-night);
      line-height: 1.5;
      padding-bottom: 3rem;
    }
    .header-bar {
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: 1rem;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .header-content {
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--color-primary);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .back-link:hover {
      text-decoration: underline;
    }
    .brand-logo {
      font-weight: 800;
      font-size: 1.15rem;
      color: var(--color-night);
    }
    .main-container {
      max-width: 720px;
      margin: 1.5rem auto;
      padding: 0 1rem;
    }
    .page-title {
      font-size: 1.65rem;
      font-weight: 800;
      color: var(--color-night);
      margin-bottom: 0.25rem;
    }
    .page-subtitle {
      color: var(--color-text-muted);
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
    }
    .routes-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .route-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .route-card:hover {
      border-color: #fdba74;
      box-shadow: 0 4px 12px rgba(154, 52, 18, 0.08);
    }
    .route-card-body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .route-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .route-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--color-night);
    }
    .route-badge {
      background: var(--color-primary-soft);
      color: var(--color-primary);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-pill);
      border: 1px solid #fed7aa;
    }
    .route-summary {
      font-size: 0.9rem;
      color: #374151;
      line-height: 1.45;
    }
    .route-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
      padding-top: 0.75rem;
      border-top: 1px solid #F3F4F6;
      font-size: 0.825rem;
      color: var(--color-text-muted);
    }
    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .empty-state {
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      padding: 2.5rem 1rem;
      text-align: center;
      color: var(--color-text-muted);
    }
  </style>
</head>
<body>
  <header class="header-bar">
    <div class="header-content">
      <a href="${escapeHtml(backUrl)}" class="back-link" aria-label="Volver a la agenda gastronómica">
        ← Volver a la agenda
      </a>
      <span class="brand-logo">VayaPlan</span>
    </div>
  </header>

  <main class="main-container">
    <h1 class="page-title">🍽️ Rutas Gastronómicas</h1>
    <p class="page-subtitle">Itinerarios culinarios, tapas y maridajes en ${escapeHtml(city.name)}</p>

    ${routes.length === 0 ? `
      <div class="empty-state">
        <h3>No hay rutas gastronómicas activas</h3>
        <p>En este momento no hay rutas gastronómicas publicadas en ${escapeHtml(city.name)}.</p>
        <p style="margin-top: 1rem;"><a href="${escapeHtml(backUrl)}" class="back-link">Consultar eventos gastronómicos en la agenda →</a></p>
      </div>
    ` : `
      <div class="routes-grid">
        ${routes.map((route) => `
          <article class="route-card" aria-label="Ruta: ${escapeHtml(route.title)}">
            <div class="route-card-body">
              <div class="route-header">
                <h2 class="route-title">${escapeHtml(route.title)}</h2>
                ${route.badge_label ? `<span class="route-badge">${escapeHtml(route.badge_label)}</span>` : ''}
              </div>
              <p class="route-summary">${escapeHtml(route.summary)}</p>
              <div class="route-meta">
                <span class="meta-item">
                  📅 ${escapeHtml(formatRouteDateRange(route.start_date, route.end_date, route.is_permanent))}
                </span>
                <span class="meta-item">
                  📍 ${route.participants_count} locales participantes
                </span>
                ${route.approximate_price_cents ? `
                  <span class="meta-item">
                    💶 ${escapeHtml(formatRoutePrice(route.approximate_price_cents))}
                  </span>
                ` : ''}
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    `}
  </main>
</body>
</html>`;
}
