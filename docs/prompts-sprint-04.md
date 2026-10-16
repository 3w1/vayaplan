# Prompt — Sprint 4: Promociones, informes y preparación comercial

**Proyecto:** VayaPlan  
**Sprint:** Semana 4 — Promociones, informes y preparación comercial  
**Modelo:** Gemini Flash 3.8 High en Antigravity CLI  
**Contexto obligatorio:** `01-prd.md`, `02-data-model.md` v1.1, `04-architecture.md` v1.1, `05-sprint-backlog.md`, `06-gtm-playbook.md`, `prompts-sprint-04.md`  
**Estado previo:** Sprint 3 completado: panel de curación, autenticación admin, webhook WhatsApp, QR y caducidad automática funcionando.

---

## Reglas anti-síntesis

```text
- Escribe el código íntegro y completo en cada archivo: PROHIBIDO usar elipsis (...), marcadores de posición ("// resto del código aquí") o simplificaciones.
- Genera y guarda directamente cada archivo en su ruta correspondiente dentro del proyecto.
- No elimines ni rompas el backend, frontend PWA, panel admin, migraciones, seed, Docker Compose ni endpoints ya funcionales.
- Si necesitas modificar un archivo existente, muestra primero el diff propuesto y espera confirmación.
```

---

## Prompt para Antigravity CLI

```text
Actúa como desarrollador full-stack senior. Vamos a ejecutar las tareas de la Semana 4 definidas en docs/05-sprint-backlog.md para VayaPlan.

Lee primero estos documentos:
- docs/01-prd.md
- docs/02-data-model.md
- docs/04-architecture.md
- docs/05-sprint-backlog.md
- docs/06-gtm-playbook.md
- docs/prompts-sprint-04.md

Estado actual:
- Sprint 1, 2 y 3 completados y verificados.
- PostgreSQL 16, API Bun + Hono, PWA, panel admin, webhook WhatsApp, QR y caducidad automática funcionan.
- Nginx del host enruta /api/ a 127.0.0.1:4000 y / a 127.0.0.1:3030.
- No hay Caddy.
- No modifiques Nginx ni la configuración SSL existente.

Restricciones técnicas obligatorias:
- Trabaja directamente en este repositorio respetando el monorepo existente.
- Respeta Bun + Hono, TypeScript, PostgreSQL 16 y Docker Compose.
- No añadas ORM, Redis, colas complejas, frameworks frontend pesados, pasarelas de pago ni servicios externos no necesarios.
- La API sigue expuesta únicamente en 127.0.0.1:4000.
- La web sigue expuesta únicamente en 127.0.0.1:3030.
- Todas las rutas /api/v1/admin/* siguen protegidas por autenticación.
- No modifiques Nginx ni la configuración SSL sin pedírmelo antes.
- Escribe el código íntegro y completo en cada archivo: PROHIBIDO usar elipsis (...), marcadores de posición ("// resto del código aquí") o simplificaciones.
- Genera y guarda directamente cada archivo en su ruta correspondiente dentro del proyecto.
- Si necesitas modificar archivos existentes, muestra primero el diff propuesto y espera confirmación.

Entregables requeridos:

1. Gestión de promociones en apps/api:
   - GET /api/v1/admin/promotions
   - POST /api/v1/admin/promotions
   - GET /api/v1/admin/promotions/:id
   - PATCH /api/v1/admin/promotions/:id
   - POST /api/v1/admin/promotions/:id/cancel
   - POST /api/v1/admin/promotions/:id/refund
   - GET /api/v1/admin/promotions/:id/report
   - Todas protegidas por requireAdminAuth.
   - Una promoción debe referenciar event_id, venue_id, city_id, editorial_date, starts_at, ends_at, price_cents y status.
   - Respeta el índice único parcial uq_promotions_city_editorial_date.
   - Si existe otra promoción activa para la misma ciudad y editorial_date, devuelve 409 con error promotion_limit_reached.
   - Al cancelar o reembolsar, la promoción debe dejar de contar como activa.

2. Integración de promociones en la PWA:
   - En la agenda, los eventos con promoción activa deben aparecer primero dentro de su fecha editorial.
   - Deben mostrar badge visible "Promocionado".
   - Deben usar tarjeta destacada con borde diferenciado.
   - Nunca deben aparecer dos promocionados para la misma ciudad y editorial_date.
   - Los eventos recomendados editoriales y promocionados no deben mezclarse en la misma tarjeta.

3. Informe post-evento:
   - GET /api/v1/admin/promotions/:id/report debe devolver:
     - promotion_id
     - event_id
     - event_title
     - venue_name
     - editorial_date
     - starts_at
     - ends_at
     - price_cents
     - status
     - impressions
     - unique_impressions
     - map_clicks
     - unique_map_clicks
     - booking_clicks
     - ticket_clicks
     - whatsapp_clicks
     - profile_clicks
     - channel_views
     - qr_scans
     - total_actions
     - generated_at
   - Las métricas deben calcularse desde event_metrics.
   - Las acciones únicas deben usar COUNT(DISTINCT session_hash).
   - No inferir asistencia, clientes ni ventas.
   - Añadir endpoint o función para generar un informe en texto plano listo para copiar a WhatsApp.

4. Panel de curación:
   - Nueva pestaña o sección Promociones.
   - Listado de promociones con estado, evento, local, fecha editorial, precio y métricas.
   - Creación de promoción seleccionando un evento publicado.
   - Validación visual si ya existe una promoción activa para esa fecha.
   - Acciones para cancelar y reembolsar.
   - Botón para ver informe.
   - Botón para copiar informe en formato WhatsApp.

5. Semilla y datos de prueba:
   - Actualizar seed.sql o crear seed adicional para incluir:
     - Un evento futuro publicado.
     - Una promoción activa para ese evento.
     - Métricas de prueba asociadas a la promoción.
   - No debe romper la ejecución idempotente del seed existente.

6. Pruebas y verificación:
   - Comandos curl para crear promoción, listar promociones, intentar crear una segunda promoción activa el mismo día, cancelar, reembolsar y obtener informe.
   - Comandos curl para comprobar que la PWA muestra el evento promocionado primero.
   - Comandos para reconstruir contenedores.
   - Comandos para verificar que los endpoints admin siguen protegidos.

Criterios de aceptación:
- Se puede crear una promoción activa para un evento.
- No se pueden crear dos promociones activas para la misma ciudad y editorial_date.
- La PWA muestra el evento promocionado primero con badge "Promocionado".
- El informe devuelve métricas reales desde event_metrics.
- El informe distingue acciones totales y acciones únicas por session_hash.
- Cancelar o reembolsar libera el hueco de promoción activa.
- No se rompe ninguna funcionalidad previa.
- La PWA y la API siguen accesibles en https://vayaplan.com.
```

---

## Despliegue tras el Sprint 4

```bash
cd ~/vayaplan
docker compose -f infra/docker-compose.yml up -d --build
```

## Verificación básica

```bash
# Salud
curl -s http://127.0.0.1:4000/api/health
curl -s http://127.0.0.1:4000/api/health/db

# Admin sin sesión debe devolver 401
curl -i http://127.0.0.1:4000/api/v1/admin/promotions

# Web y PWA
curl -I https://vayaplan.com/
curl -I https://vayaplan.com/api/health
```

## Checklist antes de cerrar Sprint 4

- [ ] Promoción creada correctamente.
- [ ] Límite de una promoción activa por ciudad y día funciona.
- [ ] PWA muestra promocionado primero.
- [ ] Badge Promocionado visible.
- [ ] Informe devuelve métricas reales.
- [ ] Informe distingue totales y únicos.
- [ ] Cancelación y reembolso liberan el hueco.
- [ ] Panel admin permite gestionar promociones.
- [ ] Sprint 1, 2 y 3 siguen funcionando.
- [ ] Commit y push realizados.
