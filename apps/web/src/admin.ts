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
      --bg-dark: #090d16;
      --bg-card: #131b2e;
      --bg-card-hover: #18223a;
      --border: #222f4c;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --accent-blue: #38bdf8;
      --emerald: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --radius: 10px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Barra Superior */
    header {
      background: rgba(19, 27, 46, 0.95);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 0.875rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-title {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      color: #ffffff;
    }

    .brand-badge {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      background: #1e3a8a;
      color: #38bdf8;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid #2563eb;
    }

    .user-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .user-email {
      font-size: 0.8125rem;
      color: var(--text-muted);
      display: none;
    }
    @media (min-width: 640px) { .user-email { display: inline; } }

    .btn-sm {
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }

    .btn-logout {
      background: #1e293b;
      color: #cbd5e1;
      border-color: var(--border);
    }
    .btn-logout:hover { background: #334155; }

    /* Contenedor Principal */
    main {
      flex: 1;
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 1.25rem 1rem 4rem 1rem;
    }

    /* Pestañas de Navegación */
    .nav-tabs {
      display: flex;
      gap: 0.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .nav-tabs::-webkit-scrollbar { display: none; }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: #ffffff; background: #162035; }
    .tab-btn.active {
      color: #ffffff;
      background: var(--primary);
    }

    .badge-count {
      background: #ef4444;
      color: #ffffff;
      font-size: 0.6875rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
    }

    /* Barra de herramientas / Filtros */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    select, input, textarea {
      background: #162035;
      border: 1px solid var(--border);
      color: #ffffff;
      padding: 0.45rem 0.75rem;
      border-radius: 6px;
      font-size: 0.875rem;
    }
    select:focus, input:focus, textarea:focus {
      outline: none;
      border-color: var(--accent-blue);
    }

    .btn-primary {
      background: var(--primary);
      color: #ffffff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: background 0.15s ease;
    }
    .btn-primary:hover { background: var(--primary-hover); }

    /* Tablas / Listados */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }

    th {
      background: #0f172a;
      padding: 0.75rem 1rem;
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      font-size: 0.6875rem;
      letter-spacing: 0.05em;
    }

    td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #1a243c;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #18223a; }

    /* Estados visuales */
    .status-pill {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .status-tentative { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid #f59e0b; }
    .status-published { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid #10b981; }
    .status-cancelled { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444; }
    .status-outdated { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid #64748b; }
    .status-archived { background: #1e293b; color: #94a3b8; }
    .status-duplicate { background: #3b0764; color: #d8b4fe; border: 1px solid #a855f7; }

    .action-group {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    .btn-act {
      background: #1e293b;
      border: 1px solid var(--border);
      color: #cbd5e1;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.1s ease;
    }
    .btn-act:hover { background: #334155; color: #ffffff; }
    .btn-publish { background: #065f46; color: #6ee7b7; border-color: #047857; }
    .btn-publish:hover { background: #047857; color: #ffffff; }
    .btn-cancel { background: #7f1d1d; color: #fca5a5; border-color: #991b1b; }
    .btn-cancel:hover { background: #991b1b; color: #ffffff; }
    .btn-metrics { background: #1e3a8a; color: #93c5fd; border-color: #2563eb; }

    /* Modales */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-overlay.active { display: flex; }

    .modal-card {
      background: #111827;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      padding: 1.5rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .modal-header h3 { font-size: 1.15rem; color: #ffffff; }
    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.25rem;
      cursor: pointer;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 640px) {
      .form-grid.two-cols { grid-template-columns: 1fr 1fr; }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .form-group label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }

    /* Pantalla de Login */
    .login-container {
      max-width: 400px;
      margin: 6rem auto 0 auto;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 2rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .login-title {
      font-size: 1.35rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }
    .login-desc {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-bottom: 1.5rem;
    }
    .alert-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 0.65rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      margin-bottom: 1rem;
      display: none;
    }

    /* Métricas Grid */
    .metrics-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 640px) {
      .metrics-stats { grid-template-columns: repeat(4, 1fr); }
    }
    .metric-box {
      background: #162035;
      padding: 0.875rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      text-align: center;
    }
    .metric-value {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--accent-blue);
    }
    .metric-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* Subfiltros y Curación */
    .curation-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.875rem;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 0.25rem;
    }
    .curation-tabs::-webkit-scrollbar { display: none; }
    .curation-tab-btn {
      background: #162035;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.8125rem;
      font-weight: 600;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .curation-tab-btn:hover { background: #1e293b; color: #ffffff; }
    .curation-tab-btn.active {
      background: #2563eb;
      color: #ffffff;
      border-color: #3b82f6;
    }
    .badge-unverified {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid #f59e0b;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .btn-reassign {
      background: #1e3a8a;
      color: #93c5fd;
      border-color: #2563eb;
    }
    .btn-reassign:hover { background: #2563eb; color: #ffffff; }
    .venue-badge {
      font-size: 0.6875rem;
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid var(--border);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .badge-tag {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
    }
    .collision-box {
      margin-top: 0.5rem;
      padding: 0.625rem 0.75rem;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      font-size: 0.8125rem;
    }
    .collision-title {
      font-weight: 700;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #fecaca;
    }
    .collision-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-top: 0.35rem;
    }
    .btn-publish-force {
      background: #065f46;
      color: #6ee7b7;
      border-color: #047857;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      border: 1px solid #047857;
    }
    .btn-publish-force:hover { background: #047857; color: #ffffff; }
    .venue-list-item {
      padding: 0.65rem 0.875rem;
      border-bottom: 1px solid #1a243c;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      transition: background 0.12s ease;
    }
    .venue-list-item:hover { background: #18223a; }
    .venue-list-item.selected {
      background: #1e3a8a;
      border-left: 3px solid #38bdf8;
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

  <!-- Vista 2: Panel de Administración Principal -->
  <div id="dashboard-view" style="display: none; flex-direction: column; min-height: 100vh;">
    <header>
      <div class="brand-group">
        <span class="brand-title">VayaPlan</span>
        <span class="brand-badge">Panel Curación</span>
      </div>
      <div class="user-actions">
        <span class="user-email" id="current-user-email">admin@vayaplan.com</span>
        <a href="/" target="_blank" class="btn-sm" style="color:var(--accent-blue); text-decoration:none;">Ver Web ↗</a>
        <button class="btn-sm btn-logout" onclick="handleLogout()">Salir</button>
      </div>
    </header>

    <main>
      <!-- Pestañas de Secciones -->
      <nav class="nav-tabs">
        <button class="tab-btn active" onclick="switchSection('events')">
          📅 Eventos <span id="badge-tentative" class="badge-count" style="display:none;">0</span>
        </button>
        <button class="tab-btn" onclick="switchSection('venues')">📍 Locales (Venues)</button>
        <button class="tab-btn" onclick="switchSection('recurrences')">↻ Recurrencias</button>
        <button class="tab-btn" onclick="switchSection('places')">★ Planes Permanentes</button>
        <button class="tab-btn" onclick="switchSection('qr')">📱 Códigos QR</button>
      </nav>

      <!-- SECCIÓN 1: EVENTOS -->
      <section id="section-events">
        <!-- Subfiltros Rápidos de Curación -->
        <div class="curation-tabs">
          <button id="subfilter-all" class="curation-tab-btn active" onclick="setCurationSubfilter('all')">
            Todos los eventos
          </button>
          <button id="subfilter-tentative-all" class="curation-tab-btn" onclick="setCurationSubfilter('tentative_all')">
            📝 Borradores (Todos) <span id="curation-badge-all" class="badge-count" style="display:none; background:#3b82f6;">0</span>
          </button>
          <button id="subfilter-unassigned" class="curation-tab-btn" onclick="setCurationSubfilter('tentative_unassigned')">
            ⚠️ Locales por verificar (9999) <span id="curation-badge-unassigned" class="badge-count" style="display:none; background:#f59e0b;">0</span>
          </button>
          <button id="subfilter-collisions" class="curation-tab-btn" onclick="setCurationSubfilter('tentative_collisions')">
            💥 Posibles colisiones <span id="curation-badge-collisions" class="badge-count" style="display:none; background:#ef4444;">0</span>
          </button>
        </div>

        <div class="toolbar">
          <div class="filter-group">
            <select id="event-filter-status" onchange="onManualStatusFilterChange()">
              <option value="">Todos los estados</option>
              <option value="tentative">Borradores Tentativos (WhatsApp/Web)</option>
              <option value="published">Publicados</option>
              <option value="cancelled">Cancelados</option>
              <option value="outdated">Caducados (Outdated)</option>
              <option value="archived">Archivados</option>
              <option value="duplicate">Duplicados</option>
            </select>
            <input type="date" id="event-filter-date" onchange="loadAdminEvents()">
          </div>
          <button class="btn-primary" onclick="openNewEventModal()">+ Nuevo Evento</button>
        </div>

        <div class="table-container">
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
              <tr><td colspan="6" style="text-align:center;">Cargando eventos...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- SECCIÓN 2: LOCALES (VENUES) -->
      <section id="section-venues" style="display:none;">
        <div class="toolbar">
          <h3>Locales Censados en Palencia</h3>
          <button class="btn-primary" onclick="openNewVenueModal()">+ Nuevo Local</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Dirección</th>
                <th>WhatsApp</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="venues-tbody">
              <tr><td colspan="6" style="text-align:center;">Cargando locales...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- SECCIÓN 3: RECURRENCIAS -->
      <section id="section-recurrences" style="display:none;">
        <div class="toolbar">
          <h3>Planes Semanales Periódicos</h3>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-primary" onclick="openNewRecurrenceModal()">+ Nueva Recurrencia</button>
          </div>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Día</th>
                <th>Título / Local</th>
                <th>Horario</th>
                <th>Precio</th>
                <th>Excepciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="recurrences-tbody">
              <tr><td colspan="6" style="text-align:center;">Cargando recurrencias...</td></tr>
            </tbody>
          </table>
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

  <!-- MODAL: CREAR / EDITAR EVENTO -->
  <div id="modal-event" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-event-title">Nuevo Evento</h3>
        <button class="modal-close" onclick="closeModal('modal-event')">✕</button>
      </div>
      <form id="form-event" onsubmit="saveEvent(event)">
        <input type="hidden" id="ev-id">
        <div class="form-grid">
          <div class="form-group">
            <label>Título del evento *</label>
            <input type="text" id="ev-title" required placeholder="Ej: Concierto acústico">
          </div>
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Local (Venue) *</label>
            <select id="ev-venue-id" required></select>
          </div>
          <div class="form-group">
            <label>Categoría *</label>
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
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Fecha y hora de inicio *</label>
            <input type="datetime-local" id="ev-start-time" required>
          </div>
          <div class="form-group">
            <label>Fecha editorial (YYYY-MM-DD) *</label>
            <input type="date" id="ev-editorial-date" required>
          </div>
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Precio en céntimos (0 = gratis)</label>
            <input type="number" id="ev-price-cents" value="0" min="0">
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select id="ev-status">
              <option value="published">Publicado</option>
              <option value="tentative">Borrador Tentativo</option>
              <option value="cancelled">Cancelado</option>
              <option value="archived">Archivado</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Descripción / Cartel texto</label>
          <textarea id="ev-description" rows="3" placeholder="Detalles de la actuación..."></textarea>
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>URL de entradas / reserva</label>
            <input type="url" id="ev-source-url" placeholder="https://...">
          </div>
          <div class="form-group">
            <label>URL de imagen / cartel</label>
            <input type="url" id="ev-image-url" placeholder="https://...">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-event')">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar Evento</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: MÉTRICAS DE EVENTO -->
  <div id="modal-metrics" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-metrics-title">Métricas de Conversión</h3>
        <button class="modal-close" onclick="closeModal('modal-metrics')">✕</button>
      </div>
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
      <div style="background:#162035; padding:0.875rem; border-radius:8px; border:1px solid var(--border); margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; font-size:0.875rem;">
          <span>Sesiones Únicas Anónimas:</span>
          <strong id="m-sessions" style="color:var(--emerald)">0</strong>
        </div>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Canal</th><th>Acción</th><th>Total</th></tr>
          </thead>
          <tbody id="metrics-breakdown-tbody"></tbody>
        </table>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-primary" onclick="closeModal('modal-metrics')">Cerrar</button>
      </div>
    </div>
  </div>

  <!-- MODAL: REASIGNACIÓN RÁPIDA DE LOCAL -->
  <div id="modal-reassign-venue" class="modal-overlay">
    <div class="modal-card" style="max-width: 650px;">
      <div class="modal-header">
        <h3 id="modal-reassign-title">Asignar Local del Censo</h3>
        <button class="modal-close" onclick="closeModal('modal-reassign-venue')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="reassign-event-id">
        <div id="reassign-event-info" style="background:#162035; padding:0.75rem 1rem; border-radius:8px; border:1px solid var(--border); margin-bottom:1rem; font-size:0.875rem;">
        </div>

        <div class="form-grid two-cols" style="margin-bottom:0.75rem;">
          <div class="form-group">
            <label>Buscar local por nombre (normalizado)</label>
            <input type="text" id="reassign-search" placeholder="Ej: Teatro Principal, Bar Alaska..." oninput="filterReassignVenues()">
          </div>
          <div class="form-group">
            <label>Filtrar por Zona</label>
            <select id="reassign-filter-zone" onchange="filterReassignVenues()">
              <option value="">Todas las zonas</option>
              <option value="seminario">Seminario</option>
              <option value="centro_puebla">Centro / Puebla</option>
              <option value="salon">El Salón</option>
              <option value="otros">Otros recintos</option>
            </select>
          </div>
        </div>
        <div class="form-grid two-cols" style="margin-bottom:1rem;">
          <div class="form-group">
            <label>Filtrar por Categoría</label>
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
          <div class="form-group" style="display:flex; align-items:flex-end;">
            <button type="button" class="btn-sm" style="background:#1e3a8a; color:#93c5fd; border:1px solid #2563eb; width:100%; height:38px;" onclick="openNewVenueFromReassign()">+ Crear Nuevo Local</button>
          </div>
        </div>

        <div style="font-size:0.8125rem; color:var(--text-muted); margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
          <span>Selecciona un local del censo:</span>
          <span id="reassign-results-count">56 locales disponibles</span>
        </div>

        <div id="reassign-venues-list" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; background: #0b1120;">
        </div>

        <div id="reassign-selected-preview" style="display:none; margin-top:1rem; padding:0.875rem; background:#0f2942; border:1px solid #38bdf8; border-radius:8px;">
          <div style="font-size:0.75rem; text-transform:uppercase; color:#38bdf8; font-weight:700;">Local Seleccionado para Asignar:</div>
          <div id="reassign-preview-name" style="font-size:1rem; font-weight:700; color:#ffffff; margin-top:0.25rem;"></div>
          <div id="reassign-preview-address" style="font-size:0.8125rem; color:#cbd5e1; margin-top:0.25rem;"></div>
          <div id="reassign-preview-meta" style="font-size:0.75rem; color:#94a3b8; margin-top:0.25rem;"></div>
        </div>
        <input type="hidden" id="reassign-selected-id">
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.75rem; color:#94a3b8;">⚠️ Asigna el local sin publicar automáticamente.</span>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-reassign-venue')">Cancelar</button>
          <button type="button" id="btn-save-reassign" class="btn-primary" disabled onclick="saveReassignVenue()">Guardar Asignación</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: NUEVO LOCAL (VENUE) -->
  <div id="modal-venue" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3 id="modal-venue-title">Nuevo Local</h3>
        <button class="modal-close" onclick="closeModal('modal-venue')">✕</button>
      </div>
      <form id="form-venue" onsubmit="saveVenue(event)">
        <input type="hidden" id="venue-id">
        <div class="form-group">
          <label>Nombre del local *</label>
          <input type="text" id="venue-name" required placeholder="Ej: Bar Central">
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Dirección</label>
          <input type="text" id="venue-address" placeholder="Calle Mayor 12, Palencia">
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>WhatsApp de contacto</label>
            <input type="text" id="venue-whatsapp" placeholder="+34600112233">
          </div>
          <div class="form-group">
            <label>Instagram (@usuario)</label>
            <input type="text" id="venue-instagram" placeholder="barcentral">
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Enlace Google Maps</label>
          <input type="url" id="venue-maps-url" placeholder="https://maps.google.com/?cid=...">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-venue')">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar Local</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: NUEVA RECURRENCIA -->
  <div id="modal-recurrence" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Nueva Recurrencia Semanal</h3>
        <button class="modal-close" onclick="closeModal('modal-recurrence')">✕</button>
      </div>
      <form onsubmit="saveRecurrence(event)">
        <div class="form-group">
          <label>Título de la actividad *</label>
          <input type="text" id="rec-title" required placeholder="Ej: Tardeo Indie">
        </div>
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Local *</label>
            <select id="rec-venue-id" required></select>
          </div>
          <div class="form-group">
            <label>Día de la semana *</label>
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
        <div class="form-grid two-cols" style="margin-top:1rem;">
          <div class="form-group">
            <label>Hora de inicio *</label>
            <input type="time" id="rec-start-time" required value="18:00">
          </div>
          <div class="form-group">
            <label>Hora de fin</label>
            <input type="time" id="rec-end-time" value="22:00">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-recurrence')">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar Recurrencia</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EXCEPCIÓN DE RECURRENCIA -->
  <div id="modal-exception" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Excepción Puntual de Recurrencia</h3>
        <button class="modal-close" onclick="closeModal('modal-exception')">✕</button>
      </div>
      <form onsubmit="saveException(event)">
        <input type="hidden" id="exc-rec-id">
        <div class="form-group">
          <label>Fecha de la excepción (YYYY-MM-DD) *</label>
          <input type="date" id="exc-date" required>
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>Motivo</label>
          <input type="text" id="exc-reason" required value="Cancelación puntual por festivo">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-sm btn-logout" onclick="closeModal('modal-exception')">Cancelar</button>
          <button type="submit" class="btn-primary">Registrar Excepción</button>
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

  <script>
    // ==============================================================================
    // Estado y Helpers del Panel de Curación
    // ==============================================================================
    let cachedVenues = [];
    let currentLoadedEvents = [];
    let curationSubfilter = 'all';
    let reassignSelectedVenueId = null;

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
          document.getElementById('current-user-email').innerText = data.user.email;
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
        document.getElementById('current-user-email').innerText = data.user.email;
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
      loadAdminEvents();
    }

    // ==============================================================================
    // Cambio de Pestañas
    // ==============================================================================
    window.switchSection = function(section) {
      const sections = ['events', 'venues', 'recurrences', 'places', 'qr'];
      sections.forEach(s => {
        const el = document.getElementById('section-' + s);
        if (el) el.style.display = s === section ? 'block' : 'none';
      });

      document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', sections[idx] === section);
      });

      if (section === 'events') loadAdminEvents();
      if (section === 'venues') loadAdminVenues();
      if (section === 'recurrences') loadAdminRecurrences();
      if (section === 'places') loadAdminPlaces();
      if (section === 'qr') loadAdminQr();
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
      const buttons = [
        { id: 'subfilter-all', key: 'all' },
        { id: 'subfilter-tentative-all', key: 'tentative_all' },
        { id: 'subfilter-unassigned', key: 'tentative_unassigned' },
        { id: 'subfilter-collisions', key: 'tentative_collisions' },
      ];

      buttons.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) el.classList.toggle('active', b.key === filter);
      });

      const statusSelect = document.getElementById('event-filter-status');
      if (filter === 'all') {
        statusSelect.value = '';
      } else {
        statusSelect.value = 'tentative';
      }
      loadAdminEvents();
    };

    window.onManualStatusFilterChange = function() {
      const val = document.getElementById('event-filter-status').value;
      if (val === 'tentative') {
        curationSubfilter = 'tentative_all';
      } else {
        curationSubfilter = 'all';
      }
      const buttons = [
        { id: 'subfilter-all', key: 'all' },
        { id: 'subfilter-tentative-all', key: 'tentative_all' },
        { id: 'subfilter-unassigned', key: 'tentative_unassigned' },
        { id: 'subfilter-collisions', key: 'tentative_collisions' },
      ];
      buttons.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) el.classList.toggle('active', b.key === curationSubfilter);
      });
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

        const badgeTentative = document.getElementById('badge-tentative');
        if (badgeTentative) {
          badgeTentative.innerText = totalTentative;
          badgeTentative.style.display = totalTentative > 0 ? 'inline-block' : 'none';
        }

        const bAll = document.getElementById('curation-badge-all');
        if (bAll) {
          bAll.innerText = totalTentative;
          bAll.style.display = totalTentative > 0 ? 'inline-block' : 'none';
        }

        const bUnassigned = document.getElementById('curation-badge-unassigned');
        if (bUnassigned) {
          bUnassigned.innerText = totalUnassigned;
          bUnassigned.style.display = totalUnassigned > 0 ? 'inline-block' : 'none';
        }

        const bCollisions = document.getElementById('curation-badge-collisions');
        if (bCollisions) {
          bCollisions.innerText = totalCollisions;
          bCollisions.style.display = totalCollisions > 0 ? 'inline-block' : 'none';
        }
      } catch {}
    }

    async function loadAdminEvents() {
      const tbody = document.getElementById('events-tbody');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>';

      const status = document.getElementById('event-filter-status').value;
      const date = document.getElementById('event-filter-date').value;

      let url = '/api/v1/admin/events?';
      if (status) url += 'status=' + encodeURIComponent(status) + '&';
      if (date) url += 'date=' + encodeURIComponent(date) + '&';

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

        if (events.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No se encontraron eventos con los filtros seleccionados.</td></tr>';
          return;
        }

        tbody.innerHTML = events.map(e => {
          const isTentative = e.status === 'tentative';
          const isUnassigned = e.venue_id === 9999;
          const hasCollision = Boolean(e.collision_alert);

          return \`
            <tr id="event-row-\${e.id}">
              <td><span class="status-pill status-\${e.status}">\${e.status}</span></td>
              <td>
                <div style="font-weight:700; font-size:0.9375rem; color:#ffffff;">\${escapeHtml(e.title)}</div>
                <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.25rem;">
                  <span class="badge-tag">\${formatCategory(e.category)}</span>
                </div>
                \${isUnassigned ? \`
                  <div style="margin-top:0.4rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    <span class="badge-unverified">⚠️ Local por verificar</span>
                    <button class="btn-sm btn-reassign" onclick="openReassignModal(\${e.id})">🏢 Asignar Local</button>
                  </div>
                \` : \`
                  <div style="margin-top:0.4rem; display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; font-size:0.8125rem;">
                    <span>📍 <strong>\${escapeHtml(e.venue_name)}</strong></span>
                    <span class="venue-badge">Zona: \${escapeHtml(e.venue_zone || 'otros')}</span>
                    <span class="venue-badge">Cat: \${escapeHtml(e.venue_category || 'general')}</span>
                    <button class="btn-act" style="padding:0.15rem 0.4rem; font-size:0.6875rem;" onclick="openReassignModal(\${e.id})" title="Reasignar local">✏️ Cambiar</button>
                  </div>
                \`}
                \${hasCollision ? \`
                  <div class="collision-box">
                    <div class="collision-title">
                      ⚠️ <strong>Posible colisión con:</strong> \${escapeHtml(e.collision_alert.colliding_title)} (\${formatMadridTime(e.collision_alert.colliding_start_time)}) — Diferencia: \${e.collision_alert.diff_minutes} min
                    </div>
                    <div class="collision-actions">
                      \${!isUnassigned && isTentative ? \`
                        <button class="btn-publish-force" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar de todos modos</button>
                      \` : ''}
                      <button class="btn-act" onclick="archiveEvent(\${e.id})">📦 Descartar / Archivar</button>
                      <button class="btn-act" onclick="markDuplicate(\${e.id})">⧉ Marcar duplicado</button>
                      <button class="btn-act" onclick="editEvent(\${e.id})">✏️ Ajustar hora</button>
                    </div>
                  </div>
                \` : ''}
              </td>
              <td>
                <div>📅 <strong>\${e.editorial_date}</strong></div>
                <div style="margin-top:0.2rem;">⏰ <span style="color:var(--accent-blue); font-weight:600;">\${formatMadridTime(e.start_time)}</span> <small style="color:#94a3b8;">(Madrid)</small></div>
              </td>
              <td>\${e.is_free ? '<span style="color:var(--emerald); font-weight:700;">Gratis</span>' : (e.price_cents/100).toFixed(2).replace('.', ',') + ' €'}</td>
              <td>
                <div><small style="color:#94a3b8;">\${escapeHtml(e.source_type || 'manual')}</small></div>
                \${e.source_url ? \`<a href="\${escapeHtml(e.source_url)}" target="_blank" rel="noopener" class="link-source" style="font-size:0.75rem; color:var(--accent-blue); text-decoration:none; display:inline-block; margin-top:0.2rem;">🔗 Fuente oficial ↗</a>\` : ''}
              </td>
              <td>
                <div class="action-group">
                  \${isTentative ? \`
                    <button class="btn-act btn-publish" onclick="publishEvent(\${e.id}, \${e.venue_id})">✓ Publicar</button>
                    <button class="btn-act btn-reassign" onclick="openReassignModal(\${e.id})">🏢 Asignar</button>
                    <button class="btn-act" onclick="markDuplicate(\${e.id})">⧉ Duplicado</button>
                    <button class="btn-act" onclick="archiveEvent(\${e.id})">📦 Archivar</button>
                  \` : ''}
                  \${e.status === 'published' ? \`
                    <button class="btn-act btn-cancel" onclick="cancelEvent(\${e.id})">✕ Cancelar</button>
                    <button class="btn-act" onclick="archiveEvent(\${e.id})">📦 Archivar</button>
                  \` : ''}
                  <button class="btn-act btn-metrics" onclick="viewMetrics(\${e.id})">📊</button>
                  <button class="btn-act" onclick="editEvent(\${e.id})">✏️</button>
                  <button class="btn-act" onclick="deleteEvent(\${e.id})" style="color:#f87171;">🗑️</button>
                </div>
              </td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar eventos.</td></tr>';
      }
    }

    window.publishEvent = async function(id, venueId) {
      if (venueId === 9999) {
        alert('No se puede publicar un evento con Local por verificar (venue 9999). Asigna un local del censo primero.');
        return;
      }
      if (!confirm('¿Confirmar publicación del evento? Pasará a ser visible en la agenda pública.')) return;
      try {
        const res = await apiFetch(\`/api/v1/admin/events/\${id}/publish\`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || 'Error al publicar evento.');
          return;
        }
        await loadAdminEvents();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      }
    };

    window.cancelEvent = async function(id) {
      if (!confirm('¿Marcar este evento como cancelado?')) return;
      await apiFetch(\`/api/v1/admin/events/\${id}/cancel\`, { method: 'POST' });
      loadAdminEvents();
    };

    window.archiveEvent = async function(id) {
      await apiFetch(\`/api/v1/admin/events/\${id}/archive\`, { method: 'POST' });
      loadAdminEvents();
    };

    window.markDuplicate = async function(id) {
      await apiFetch(\`/api/v1/admin/events/\${id}/duplicate\`, { method: 'POST' });
      loadAdminEvents();
    };

    window.deleteEvent = async function(id) {
      if (!confirm('¿Estás seguro de eliminar este evento definitivamente?')) return;
      await apiFetch(\`/api/v1/admin/events/\${id}\`, { method: 'DELETE' });
      loadAdminEvents();
    };

    // ==============================================================================
    // Lógica del Modal de Reasignación Rápida de Local
    // ==============================================================================
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
      reassignSelectedVenueId = null;
      document.getElementById('reassign-selected-id').value = '';
      document.getElementById('reassign-selected-preview').style.display = 'none';
      document.getElementById('btn-save-reassign').disabled = true;

      filterReassignVenues();
      openModal('modal-reassign-venue');
    };

    window.filterReassignVenues = function() {
      const query = normalizeSearchText(document.getElementById('reassign-search').value.trim());
      const zone = document.getElementById('reassign-filter-zone').value;
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
          <div class="venue-list-item \${isSelected ? 'selected' : ''}" onclick="selectReassignVenue(\${v.id})">
            <div>
              <div style="font-weight:700; color:#fff;">\${escapeHtml(v.name)}</div>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.15rem;">📍 \${escapeHtml(v.address || 'Sin dirección')}</div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:0.25rem; align-items:flex-end;">
              <span class="venue-badge">Zona: \${escapeHtml(v.zone || 'otros')}</span>
              <span class="venue-badge">Cat: \${escapeHtml(v.category || 'general')}</span>
            </div>
          </div>
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

        closeModal('modal-reassign-venue');
        await loadAdminEvents();
      } catch (err) {
        alert(err.message || 'Error al conectar con el servidor.');
      }
    };

    window.openNewVenueFromReassign = function() {
      closeModal('modal-reassign-venue');
      openNewVenueModal();
    };

    window.openNewEventModal = function() {
      document.getElementById('modal-event-title').innerText = 'Nuevo Evento';
      document.getElementById('form-event').reset();
      document.getElementById('ev-id').value = '';
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('ev-editorial-date').value = today;
      document.getElementById('ev-start-time').value = today + 'T22:00';
      openModal('modal-event');
    };

    window.editEvent = async function(id) {
      const res = await apiFetch(\`/api/v1/admin/events/\${id}\`);
      const data = await res.json();
      const ev = data.event;

      document.getElementById('modal-event-title').innerText = 'Editar Evento #' + ev.id;
      document.getElementById('ev-id').value = ev.id;
      document.getElementById('ev-title').value = ev.title;
      document.getElementById('ev-venue-id').value = ev.venue_id;
      document.getElementById('ev-category').value = ev.category;
      document.getElementById('ev-editorial-date').value = ev.editorial_date;
      document.getElementById('ev-start-time').value = ev.start_time.slice(0, 16);
      document.getElementById('ev-price-cents').value = ev.price_cents;
      document.getElementById('ev-status').value = ev.status;
      document.getElementById('ev-description').value = ev.description || '';
      document.getElementById('ev-source-url').value = ev.source_url || '';
      document.getElementById('ev-image-url').value = ev.image_url || '';

      openModal('modal-event');
    };

    window.saveEvent = async function(e) {
      e.preventDefault();
      const id = document.getElementById('ev-id').value;
      const payload = {
        title: document.getElementById('ev-title').value.trim(),
        venue_id: Number(document.getElementById('ev-venue-id').value),
        category: document.getElementById('ev-category').value,
        editorial_date: document.getElementById('ev-editorial-date').value,
        start_time: new Date(document.getElementById('ev-start-time').value).toISOString(),
        price_cents: Number(document.getElementById('ev-price-cents').value),
        status: document.getElementById('ev-status').value,
        description: document.getElementById('ev-description').value.trim() || null,
        source_url: document.getElementById('ev-source-url').value.trim() || null,
        image_url: document.getElementById('ev-image-url').value.trim() || null,
      };

      if (id) {
        await apiFetch(\`/api/v1/admin/events/\${id}\`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/v1/admin/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      closeModal('modal-event');
      loadAdminEvents();
    };

    // ==============================================================================
    // Métricas por Evento
    // ==============================================================================
    window.viewMetrics = async function(id) {
      openModal('modal-metrics');
      document.getElementById('modal-metrics-title').innerText = 'Cargando métricas...';

      try {
        const res = await apiFetch(\`/api/v1/admin/metrics/events/\${id}\`);
        const data = await res.json();
        const s = data.summary;

        document.getElementById('modal-metrics-title').innerText = 'Métricas: ' + data.event.title;
        document.getElementById('m-impressions').innerText = s.total_impressions;
        document.getElementById('m-maps').innerText = s.total_map_clicks;
        document.getElementById('m-tickets').innerText = s.total_ticket_clicks;
        document.getElementById('m-whatsapp').innerText = s.total_whatsapp_clicks;
        document.getElementById('m-sessions').innerText = s.unique_sessions;

        const breakdownTbody = document.getElementById('metrics-breakdown-tbody');
        if (data.breakdown && data.breakdown.length > 0) {
          breakdownTbody.innerHTML = data.breakdown.map(b => \`
            <tr>
              <td>\${escapeHtml(b.channel)}</td>
              <td>\${escapeHtml(b.metric_type)}</td>
              <td><strong>\${b.count}</strong></td>
            </tr>
          \`).join('');
        } else {
          breakdownTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Sin interacciones registradas aún.</td></tr>';
        }
      } catch {
        document.getElementById('modal-metrics-title').innerText = 'Error al cargar métricas';
      }
    };

    // ==============================================================================
    // Gestión de Locales (Venues)
    // ==============================================================================
    async function loadAdminVenues() {
      const tbody = document.getElementById('venues-tbody');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando locales...</td></tr>';
      try {
        const res = await apiFetch('/api/v1/admin/venues');
        const data = await res.json();
        const venues = data.venues || [];

        tbody.innerHTML = venues.map(v => \`
          <tr>
            <td>#\${v.id}</td>
            <td><strong>\${escapeHtml(v.name)}</strong></td>
            <td>\${escapeHtml(v.address || '—')}</td>
            <td>\${escapeHtml(v.whatsapp_contact || '—')}</td>
            <td><span class="status-pill status-\${v.is_active ? 'published' : 'outdated'}">\${v.is_active ? 'Activo' : 'Inactivo'}</span></td>
            <td>
              <button class="btn-act" onclick="editVenue(\${v.id})">✏️ Editar</button>
            </td>
          </tr>
        \`).join('');
      } catch {}
    }

    window.openNewVenueModal = function() {
      document.getElementById('modal-venue-title').innerText = 'Nuevo Local';
      document.getElementById('form-venue').reset();
      document.getElementById('venue-id').value = '';
      openModal('modal-venue');
    };

    window.editVenue = function(id) {
      const v = cachedVenues.find(x => x.id === id);
      if (!v) return;
      document.getElementById('modal-venue-title').innerText = 'Editar Local #' + v.id;
      document.getElementById('venue-id').value = v.id;
      document.getElementById('venue-name').value = v.name;
      document.getElementById('venue-address').value = v.address || '';
      document.getElementById('venue-whatsapp').value = v.whatsapp_contact || '';
      document.getElementById('venue-instagram').value = v.instagram_handle || '';
      document.getElementById('venue-maps-url').value = v.google_maps_url || '';
      openModal('modal-venue');
    };

    window.saveVenue = async function(e) {
      e.preventDefault();
      const id = document.getElementById('venue-id').value;
      const payload = {
        name: document.getElementById('venue-name').value.trim(),
        address: document.getElementById('venue-address').value.trim() || null,
        whatsapp_contact: document.getElementById('venue-whatsapp').value.trim() || null,
        instagram_handle: document.getElementById('venue-instagram').value.trim() || null,
        google_maps_url: document.getElementById('venue-maps-url').value.trim() || null,
      };

      if (id) {
        await apiFetch(\`/api/v1/admin/venues/\${id}\`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/v1/admin/venues', { method: 'POST', body: JSON.stringify(payload) });
      }

      closeModal('modal-venue');
      await loadVenuesCache();
      loadAdminVenues();
    };

    // ==============================================================================
    // Gestión de Recurrencias
    // ==============================================================================
    const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    async function loadAdminRecurrences() {
      const tbody = document.getElementById('recurrences-tbody');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando recurrencias...</td></tr>';
      try {
        const res = await apiFetch('/api/v1/admin/recurrences');
        const data = await res.json();
        const recs = data.recurrences || [];

        tbody.innerHTML = recs.map(r => \`
          <tr>
            <td><strong>\${DAY_NAMES[r.day_of_week] || r.day_of_week}</strong></td>
            <td>
              <strong>\${escapeHtml(r.title)}</strong><br>
              <small style="color:#94a3b8;">📍 \${escapeHtml(r.venue_name)}</small>
            </td>
            <td>\${r.start_time.slice(0, 5)} \${r.end_time ? '- ' + r.end_time.slice(0, 5) : ''}</td>
            <td>\${r.is_free ? 'Gratis' : (r.price_cents/100).toFixed(2).replace('.', ',') + ' €'}</td>
            <td><small>\${(r.exceptions && r.exceptions.length) ? r.exceptions.length + ' registrada(s)' : 'Ninguna'}</small></td>
            <td>
              <button class="btn-act" onclick="openExceptionModal(\${r.id})">+ Excepción</button>
            </td>
          </tr>
        \`).join('');
      } catch {}
    }

    window.openNewRecurrenceModal = function() {
      openModal('modal-recurrence');
    };

    window.saveRecurrence = async function(e) {
      e.preventDefault();
      const payload = {
        title: document.getElementById('rec-title').value.trim(),
        venue_id: Number(document.getElementById('rec-venue-id').value),
        day_of_week: Number(document.getElementById('rec-dow').value),
        start_time: document.getElementById('rec-start-time').value + ':00',
        end_time: document.getElementById('rec-end-time').value ? document.getElementById('rec-end-time').value + ':00' : null,
      };

      await apiFetch('/api/v1/admin/recurrences', { method: 'POST', body: JSON.stringify(payload) });
      closeModal('modal-recurrence');
      loadAdminRecurrences();
    };

    window.openExceptionModal = function(recId) {
      document.getElementById('exc-rec-id').value = recId;
      document.getElementById('exc-date').value = new Date().toISOString().split('T')[0];
      openModal('modal-exception');
    };

    window.saveException = async function(e) {
      e.preventDefault();
      const recId = document.getElementById('exc-rec-id').value;
      const payload = {
        exception_date: document.getElementById('exc-date').value,
        reason: document.getElementById('exc-reason').value.trim(),
        status: 'cancelled',
      };

      await apiFetch(\`/api/v1/admin/recurrences/\${recId}/exceptions\`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeModal('modal-exception');
      loadAdminRecurrences();
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
    // Utilidades de Modal
    // ==============================================================================
    window.openModal = function(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    };

    window.closeModal = function(id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
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
