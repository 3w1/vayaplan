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
        <div class="toolbar">
          <div class="filter-group">
            <select id="event-filter-status" onchange="loadAdminEvents()">
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
                <th>Evento / Local</th>
                <th>Fecha / Hora</th>
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

    async function loadAdminEvents() {
      const tbody = document.getElementById('events-tbody');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>';

      const status = document.getElementById('event-filter-status').value;
      const date = document.getElementById('event-filter-date').value;

      let url = '/api/v1/admin/events?';
      if (status) url += 'status=' + encodeURIComponent(status) + '&';
      if (date) url += 'date=' + encodeURIComponent(date) + '&';

      try {
        const res = await apiFetch(url);
        const data = await res.json();
        const events = data.events || [];

        // Conteo de tentativos para badge
        const tentativeCount = events.filter(e => e.status === 'tentative').length;
        const badgeTentative = document.getElementById('badge-tentative');
        if (tentativeCount > 0) {
          badgeTentative.innerText = tentativeCount;
          badgeTentative.style.display = 'inline-block';
        } else {
          badgeTentative.style.display = 'none';
        }

        if (events.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No se encontraron eventos con los filtros seleccionados.</td></tr>';
          return;
        }

        tbody.innerHTML = events.map(e => \`
          <tr>
            <td><span class="status-pill status-\${e.status}">\${e.status}</span></td>
            <td>
              <strong>\${escapeHtml(e.title)}</strong><br>
              <small style="color:#94a3b8;">📍 \${escapeHtml(e.venue_name)}</small>
            </td>
            <td>
              <span>\${e.editorial_date}</span><br>
              <small style="color:var(--accent-blue);">⏰ \${e.start_time.slice(11, 16)}</small>
            </td>
            <td>\${e.is_free ? '<span style="color:var(--emerald)">Gratis</span>' : (e.price_cents/100).toFixed(2).replace('.', ',') + ' €'}</td>
            <td><small>\${escapeHtml(e.source_type || 'manual')}</small></td>
            <td>
              <div class="action-group">
                \${e.status === 'tentative' ? \`
                  <button class="btn-act btn-publish" onclick="publishEvent(\${e.id})">✓ Publicar</button>
                  <button class="btn-act" onclick="markDuplicate(\${e.id})">⧉ Duplicado</button>
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
        \`).join('');
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar eventos.</td></tr>';
      }
    }

    window.publishEvent = async function(id) {
      if (!confirm('¿Confirmar publicación del evento? Pasará a ser visible en la agenda pública.')) return;
      await apiFetch(\`/api/v1/admin/events/\${id}/publish\`, { method: 'POST' });
      loadAdminEvents();
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
