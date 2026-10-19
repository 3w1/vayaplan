import type { FestivalProgramResponseContract, PublicEventItem } from '@vayaplan/types';

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateHeader(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const date = new Date(year, month, day);
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const months = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      return `${days[date.getDay()]}, ${day} de ${months[month]} de ${year}`;
    }
  } catch {}
  return dateStr;
}

function formatTimeBadge(ev: PublicEventItem): string {
  if (ev.time_status === 'pending_time') {
    return '⏳ Horario por confirmar';
  }
  if (ev.time_status === 'continuous' || (ev.end_date && ev.end_date > ev.editorial_date)) {
    return ev.schedule_text ? escapeHtml(ev.schedule_text) : 'Periodo de visita';
  }
  if (ev.start_time) {
    try {
      const d = new Date(ev.start_time);
      const hours = String(d.getUTCHours() + 2).padStart(2, '0'); // CET/CEST approx or local
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${mins} h`;
    } catch {}
  }
  return 'Horario fijado';
}

export function renderFestivalHtml(
  data: FestivalProgramResponseContract,
  canonicalUrl: string
): string {
  const fest = data.festival;
  const events = data.events || [];

  // Agrupar eventos publicados cronológicamente por fecha editorial
  const eventsByDate = new Map<string, PublicEventItem[]>();
  for (const ev of events) {
    const d = ev.editorial_date;
    if (!eventsByDate.has(d)) {
      eventsByDate.set(d, []);
    }
    eventsByDate.get(d)!.push(ev);
  }

  const sortedDates = Array.from(eventsByDate.keys()).sort();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fest.name)}${fest.edition ? ` (${escapeHtml(fest.edition)})` : ''} | VayaPlan Palencia</title>
  <meta name="description" content="${escapeHtml(fest.description || `Programa completo y actividades del festival ${fest.name} en Palencia.`)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:title" content="${escapeHtml(fest.name)} — VayaPlan">
  <meta property="og:description" content="${escapeHtml(fest.description || `Programa y espectáculos de ${fest.name} en Palencia.`)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <style>
    :root {
      --color-primary: #6C3BFF;
      --color-primary-soft: #F0EBFF;
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
      background: var(--color-bg);
      color: var(--color-night);
      line-height: 1.5;
      padding-bottom: 3rem;
    }
    .header-bar {
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .back-btn {
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 700;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 1.25rem 1rem;
    }
    .festival-hero {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .festival-badge {
      display: inline-block;
      background: var(--color-primary-soft);
      color: var(--color-primary);
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.65rem;
      border-radius: var(--radius-pill);
      margin-bottom: 0.5rem;
    }
    .festival-title {
      font-size: 1.625rem;
      font-weight: 800;
      color: var(--color-night);
      line-height: 1.2;
      margin-bottom: 0.25rem;
    }
    .festival-edition {
      font-size: 1rem;
      color: var(--color-text-muted);
      font-weight: 600;
      margin-bottom: 0.75rem;
    }
    .festival-dates {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-night);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .festival-desc {
      font-size: 0.9375rem;
      color: #374151;
      margin-bottom: 1rem;
      white-space: pre-line;
    }
    .official-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-primary);
      text-decoration: underline;
    }
    .program-section-title {
      font-size: 1.25rem;
      font-weight: 800;
      margin-bottom: 1rem;
    }
    .date-group {
      margin-bottom: 1.75rem;
    }
    .date-header {
      font-size: 0.9375rem;
      font-weight: 700;
      color: var(--color-night);
      background: #EEF2F6;
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.75rem;
      display: inline-block;
    }
    .event-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 1rem;
      margin-bottom: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .event-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 3px 10px rgba(0,0,0,0.06);
    }
    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .event-time-badge {
      font-size: 0.75rem;
      font-weight: 700;
      background: #F3F4F6;
      color: #374151;
      padding: 0.2rem 0.5rem;
      border-radius: var(--radius-pill);
      white-space: nowrap;
    }
    .event-title {
      font-size: 1.0625rem;
      font-weight: 700;
      color: var(--color-night);
      line-height: 1.3;
    }
    .event-venue {
      font-size: 0.875rem;
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .event-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.25rem;
      padding-top: 0.5rem;
      border-top: 1px solid #F3F4F6;
    }
    .event-price {
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--color-night);
    }
    .btn-view-event {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--color-primary);
      text-decoration: none;
    }
    .empty-state {
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      padding: 2.5rem 1rem;
      text-align: center;
      color: var(--color-text-muted);
      font-size: 0.9375rem;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <a href="/" class="back-btn">← Volver a la agenda</a>
  </div>

  <main class="container">
    <div class="festival-hero">
      <span class="festival-badge">Festival / Ciclo</span>
      <h1 class="festival-title">${escapeHtml(fest.name)}</h1>
      ${fest.edition ? `<div class="festival-edition">${escapeHtml(fest.edition)}</div>` : ''}
      <div class="festival-dates">📅 Del ${escapeHtml(fest.start_date)} al ${escapeHtml(fest.end_date)}</div>
      ${fest.description ? `<p class="festival-desc">${escapeHtml(fest.description)}</p>` : ''}
      ${fest.official_url ? `<a href="${escapeHtml(fest.official_url)}" target="_blank" rel="noopener" class="official-link">Web oficial del ciclo ↗</a>` : ''}
    </div>

    <h2 class="program-section-title">Programa de actividades en Palencia</h2>

    ${sortedDates.length === 0 ? `
      <div class="empty-state">
        <p>No hay actividades publicadas para este ciclo en este momento.</p>
      </div>
    ` : `
      <div class="program-list">
        ${sortedDates.map((dateKey) => {
          const dayEvents = eventsByDate.get(dateKey) || [];
          return `
            <div class="date-group">
              <div class="date-header">${escapeHtml(formatDateHeader(dateKey))}</div>
              ${dayEvents.map((ev) => `
                <div class="event-card">
                  <div class="event-header">
                    <h3 class="event-title">${escapeHtml(ev.title)}</h3>
                    <span class="event-time-badge">${formatTimeBadge(ev)}</span>
                  </div>
                  <div class="event-venue">📍 ${escapeHtml(ev.venue.name)}</div>
                  <div class="event-footer">
                    <span class="event-price">🎟️ ${escapeHtml(ev.price.label)}</span>
                    <a href="/events/${ev.id}" class="btn-view-event">Ver ficha completa →</a>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>
    `}
  </main>
</body>
</html>`;
}
