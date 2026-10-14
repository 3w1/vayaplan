# Prompt — Sprint 3: Panel de curación, WhatsApp y QR

**Proyecto:** VayaPlan  
**Sprint:** Semana 3 — Panel de curación, WhatsApp y QR  
**Modelo:** Gemini Flash 3.8 High en Antigravity CLI  
**Contexto obligatorio:** `01-prd.md`, `02-data-model.md` v1.1, `03-ingestion-runbook.md`, `04-architecture.md` v1.1, `05-sprint-backlog.md`, `06-gtm-playbook.md`  
**Estado previo:** Sprint 2 completado: PWA, endpoints públicos de agenda, weekend, places, ficha de evento y métricas funcionando.

---

## Prompt definitivo para Antigravity CLI

```text
Actúa como desarrollador full-stack senior. Vamos a ejecutar las tareas de la Semana 3 definidas en docs/05-sprint-backlog.md para VayaPlan.

Lee primero estos documentos:
- docs/01-prd.md
- docs/02-data-model.md
- docs/03-ingestion-runbook.md
- docs/04-architecture.md
- docs/05-sprint-backlog.md
- docs/06-gtm-playbook.md
- docs/prompts-sprint-03.md

Estado actual:
- Sprint 1 y Sprint 2 completados y verificados.
- PostgreSQL 16, API Bun + Hono, PWA y contenedores Docker funcionan.
- Endpoints públicos disponibles: health, events, weekend, places, single event y metrics.
- Nginx del host enruta /api/ a 127.0.0.1:4000 y / a 127.0.0.1:3030.
- No hay Caddy. No modifiques Nginx ni la configuración SSL existente.

Restricciones técnicas obligatorias:
- Trabaja directamente en este repositorio respetando el monorepo existente.
- Respeta Bun + Hono, TypeScript, PostgreSQL 16 y Docker Compose.
- No añadas ORM, Redis, colas complejas, frameworks frontend pesados ni librerías nativas C++ como bcrypt (usa hono/jwt, hono/cookie y Bun.password / Web Crypto nativo).
- La API sigue expuesta únicamente en 127.0.0.1:4000.
- La web sigue expuesta únicamente en 127.0.0.1:3030.
- Como Nginx enruta /api/ al puerto 4000 y / al 3030, el Panel de Curación debe servirse desde apps/web en la ruta /admin, consumiendo la API mediante rutas relativas (/api/v1/admin/...).
- El panel administrativo y todos los endpoints /api/v1/admin/* deben estar protegidos por autenticación (excepto /api/v1/admin/login).
- Usa variables de entorno para secretos (ADMIN_EMAIL, ADMIN_PASSWORD_HASH, JWT_SECRET, WHATSAPP_WEBHOOK_SECRET). No incluyas secretos reales.
- Escribe el código íntegro y completo en cada archivo: PROHIBIDO usar elipsis (...), marcadores de posición ("// resto del código aquí") o simplificaciones.
- Genera y guarda directamente cada archivo en su ruta correspondiente dentro del proyecto.
- Si necesitas modificar archivos existentes, muestra primero el diff propuesto y espera confirmación.

Entregables requeridos:

1. Autenticación administrativa (apps/api):
   - POST /api/v1/admin/login (email + contraseña validada contra ADMIN_PASSWORD_HASH, rate limiting básico en memoria y emisión de sesión mediante JWT httpOnly cookie y/o Bearer token).
   - POST /api/v1/admin/logout
   - GET /api/v1/admin/me
   - Middleware de protección para todas las rutas /api/v1/admin/*.

2. Endpoints administrativos en apps/api:
   - GET /api/v1/admin/events (con filtros por status, date, venue_id)
   - POST /api/v1/admin/events
   - GET /api/v1/admin/events/:id
   - PATCH /api/v1/admin/events/:id
   - DELETE /api/v1/admin/events/:id
   - POST /api/v1/admin/events/:id/publish
   - POST /api/v1/admin/events/:id/cancel
   - POST /api/v1/admin/events/:id/archive
   - POST /api/v1/admin/events/:id/duplicate
   - POST /api/v1/admin/events/draft
   - GET /api/v1/admin/venues
   - POST /api/v1/admin/venues
   - PATCH /api/v1/admin/venues/:id
   - GET /api/v1/admin/recurrences
   - POST /api/v1/admin/recurrences
   - PATCH /api/v1/admin/recurrences/:id
   - POST /api/v1/admin/recurrences/:id/exceptions
   - GET /api/v1/admin/places
   - POST /api/v1/admin/places
   - PATCH /api/v1/admin/places/:id
   - GET /api/v1/admin/metrics/events/:id
   - GET /api/v1/admin/qr-sources
   - POST /api/v1/admin/qr-sources

3. Panel de curación en apps/web (ruta /admin):
   - Interfaz administrativa sencilla, mobile-first y protegida por login.
   - Listado de eventos con filtros por estado (destacando 'tentative'), fecha y local.
   - Formularios y acciones rápidas para crear, editar, publicar tentativos, cancelar, archivar y marcar duplicado.
   - Gestión (crear/editar) de venues, recurrencias, excepciones de recurrencia, places y códigos QR (con visualización/descarga de SVG QR).
   - Visualización de métricas básicas por evento.

4. Ingesta WhatsApp Business (apps/api):
   - GET /api/v1/webhooks/whatsapp (verificación de Meta validando hub.verify_token con WHATSAPP_WEBHOOK_SECRET y devolviendo hub.challenge).
   - POST /api/v1/webhooks/whatsapp (validación de secreto/cabecera, creación automática de borrador en events con status = 'tentative', source_type = 'whatsapp', texto recibido e imagen si existe; si el venue no existe, asociar a un venue temporal/borrador claramente marcado).
   - Nunca publicar automáticamente ningún evento recibido por WhatsApp.
   - Documentar en README.md cómo configurar el webhook en Meta Business.

5. QR de alojamientos y ajuste de esquema para qr_scan:
   - Crear migración infra/migrations/002_sprint3_qr_metrics.sql que permita registrar métricas 'qr_scan' en event_metrics sin requerir un event_id obligatorio (ALTER TABLE event_metrics ALTER COLUMN event_id DROP NOT NULL;) guardando el qr_source y código en metadata.
   - Exponer la resolución y registro de escaneo tanto en API (GET /api/v1/qr/:qrCode y GET /qr/:qrCode en puerto 4000) como en Web (GET /qr/:qrCode en puerto 3030) para que funcione directamente bajo https://vayaplan.com/qr/:qrCode a través de Nginx, registrando la métrica qr_scan y redirigiendo (302) a /?origin=qr_hotel.
   - Generación de SVG QR ligero sin dependencias pesadas.

6. Tarea programada de caducidad (apps/api):
   - Cron/worker interno ligero con setInterval dentro del contenedor API que marque periódicamente como 'outdated' los eventos publicados cuya fecha/hora ya ha pasado, emitiendo logs estructurados.

7. Pruebas y verificación:
   - Comandos para aplicar la migración 002 y reconstruir contenedores.
   - Comandos curl para probar bloqueo 401 sin sesión, login, CRUD de eventos/venues/recurrencias/places, webhook de WhatsApp y redirección QR.
```

---

## Despliegue tras el Sprint 3

```bash
cd ~/vayaplan
docker compose -f infra/docker-compose.yml up -d --build
```

## Verificación básica

```bash
# Salud
curl -s http://127.0.0.1:4000/api/health
curl -s http://127.0.0.1:4000/api/health/db

# Administración sin sesión debe devolver 401
curl -i http://127.0.0.1:4000/api/v1/admin/events

# Web y PWA
curl -I http://127.0.0.1:3030/
curl -I https://vayaplan.com/

# Panel admin
curl -I https://vayaplan.com/admin

# QR público a través de Nginx
curl -I https://vayaplan.com/qr/test-qr-code
```

## Checklist antes de cerrar Sprint 3

- [ ] Login administrativo funciona.
- [ ] Rutas admin protegidas.
- [ ] Creación, edición, publicación y cancelación de eventos funcionan.
- [ ] Venues, recurrencias, excepciones y places se gestionan.
- [ ] Webhook de WhatsApp crea borradores tentativos.
- [ ] Ningún evento de WhatsApp se publica automáticamente.
- [ ] Migración 002 permite qr_scan sin event_id obligatorio.
- [ ] QR público funciona bajo https://vayaplan.com/qr/:qrCode.
- [ ] QR registra escaneo y redirige a /?origin=qr_hotel.
- [ ] Eventos caducados pasan a outdated.
- [ ] PWA y API siguen operativas.
- [ ] Commit y push realizados.
