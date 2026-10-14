import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'vayaplan-web' });
});

app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VayaPlan — Palencia</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 540px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      background-color: #38bdf8;
      color: #0f172a;
      font-weight: 700;
      font-size: 0.75rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }
    h1 {
      margin: 0 0 0.5rem 0;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.025em;
    }
    p {
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 1.5rem 0;
    }
    .status-box {
      background-color: #0f172a;
      border-radius: 0.5rem;
      padding: 1rem;
      border-left: 4px solid #10b981;
      margin-bottom: 1.5rem;
    }
    .status-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #10b981;
      margin-bottom: 0.25rem;
    }
    .status-desc {
      font-size: 0.8125rem;
      color: #cbd5e1;
      margin: 0;
    }
    .links {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    a.btn {
      display: inline-block;
      background-color: #3b82f6;
      color: #ffffff;
      text-decoration: none;
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      transition: background-color 0.2s ease;
    }
    a.btn:hover {
      background-color: #2563eb;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Piloto Palencia</span>
    <h1>VayaPlan</h1>
    <p>Agenda hiperlocal ultra-ágil para saber qué hacer en Palencia sin fricción.</p>
    
    <div class="status-box">
      <div class="status-title">Semana 1 — Fundamentos Técnicos</div>
      <p class="status-desc">Monorepo, base de datos PostgreSQL 16 y API REST en Bun + Hono desplegados y operativos.</p>
    </div>

    <div class="links">
      <a class="btn" href="/api/health">Health Check</a>
      <a class="btn" href="/api/v1/cities/palencia/events">Agenda Palencia</a>
    </div>
  </div>
</body>
</html>`;
  return c.html(html);
});

const port = Number(process.env.PORT || 3000);

console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  message: `Servidor web VayaPlan iniciando en puerto ${port}`,
  port,
}));

export default {
  port,
  fetch: app.fetch,
};
