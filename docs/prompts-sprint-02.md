# Prompt — Sprint 2: Frontend PWA y endpoints públicos

**Proyecto:** VayaPlan  
**Sprint:** Semana 2 — Frontend PWA y endpoints públicos  
**Modelo:** Gemini Flash 3.8 High en Antigravity CLI  
**Contexto obligatorio:** `01-prd.md`, `02-data-model.md` v1.1, `04-architecture.md` v1.1, `05-sprint-backlog.md`  
**Estado previo:** Sprint 1 completado y verificado: PostgreSQL, API Bun + Hono, health checks, endpoint de eventos, migraciones, seed y contenedores operativos.

---

## Reglas anti-síntesis

```text
- Escribe el código íntegro y completo en cada archivo: PROHIBIDO usar elipsis (...), marcadores de posición ("// resto del código aquí") o simplificaciones.
- Genera y guarda directamente cada archivo en su ruta correspondiente dentro del proyecto.
- No elimines ni rompas el backend, migraciones, seed, Docker Compose ni endpoints ya funcionales del Sprint 1.
- Si necesitas modificar un archivo existente, muestra primero el diff propuesto y espera confirmación.
```

---

## Prompt final para Antigravity CLI

```text
Actúa como desarrollador full-stack senior. Vamos a ejecutar las tareas de la Semana 2 definidas en docs/05-sprint-backlog.md para VayaPlan.

Lee primero estos documentos:
- docs/01-prd.md
- docs/02-data-model.md
- docs/04-architecture.md
- docs/05-sprint-backlog.md
- docs/prompts-sprint-02.md

Estado actual:
- El Sprint 1 ya está completado y validado.
- PostgreSQL 16, API Bun + Hono y contenedores Docker están funcionando.
- La API expone GET /api/health, GET /api/health/db y GET /api/v1/cities/:citySlug/events.
- Nginx del host enruta /api/ a 127.0.0.1:4000 y / a 127.0.0.1:3030.
- No hay Caddy.
- No modifiques Nginx ni la configuración SSL existente.

Restricciones técnicas obligatorias:
- Trabaja directamente en este repositorio respetando el monorepo existente.
- Respeta la estructura y runtime ya creados para apps/web y apps/api (Bun + Hono / TypeScript) sin introducir frameworks pesados que rompan los Dockerfiles existentes.
- La API debe seguir expuesta únicamente en 127.0.0.1:4000.
- La web debe seguir expuesta únicamente en 127.0.0.1:3030.
- En apps/web, todas las llamadas fetch a la API deben realizarse mediante rutas relativas (/api/v1/...) para aprovechar el proxy inverso de Nginx sin dependencias de dominio ni problemas de CORS.
- Implementa una PWA mobile-first, rápida, accesible y sin registro obligatorio, usando el enfoque Zero-Form UI definido en docs/01-prd.md.
- Para el registro de métricas, genera un session_hash efímero en sessionStorage del navegador (anónimo, sin cookies, conforme a RGPD).
- No añadas login, comentarios, valoraciones, pagos, ticketing, notificaciones push ni funciones fuera del alcance del MVP.
- Escribe el código íntegro y completo en cada archivo: PROHIBIDO usar elipsis (...), marcadores de posición ("// resto del código aquí") o simplificaciones.
- Genera y guarda directamente cada archivo en su ruta correspondiente dentro del proyecto.
- Si necesitas modificar archivos existentes del Sprint 1, muestra primero el diff propuesto y espera confirmación.

Entregables requeridos:

1. Endpoints públicos adicionales en apps/api:
   - GET /api/v1/cities/:citySlug/weekend?start=YYYY-MM-DD
   - GET /api/v1/cities/:citySlug/places?category=...
   - GET /api/v1/events/:id
   - POST /api/v1/metrics
   - Todos deben respetar el contrato JSON de docs/02-data-model.md v1.1.
   - POST /api/v1/metrics debe aceptar event_id, promotion_id opcional, metric_type, channel y session_hash opcional.
   - Valida metric_type contra los valores permitidos en el modelo de datos.

2. Frontend PWA en apps/web:
   - Home mobile-first con selector de ciudad Palencia.
   - Selector de fecha: Hoy, Fin de semana y selector de día/calendario.
   - Chips de intención: Ahora, Esta noche, Tardeo y Cine / Cultura.
   - Agenda del día ordenada cronológicamente.
   - Recurrencias renderizadas como "Cada [día]".
   - Places renderizados como "Siempre disponible".
   - Ficha modal o vista detallada de evento y lugar.
   - Vista de fin de semana agrupada por editorial_date.
   - Botones de conversión: Cómo llegar (Google Maps URL), Reservar, Entradas, WhatsApp y perfil/web.
   - Disparo asíncrono de POST /api/v1/metrics en cada clic relevante de conversión.
   - Resalte visual diferenciado para el evento Promocionado (borde/badge destacado).
   - Estado visual para eventos cancelados.

3. PWA Assets:
   - manifest.json válido (nombre: VayaPlan, start_url: /, display: standalone).
   - Iconos SVG/PNG básicos.
   - Service worker funcional para cacheo de assets estáticos y shell offline.
   - Meta tags Open Graph (og:title, og:image, og:description) optimizados para compartir por WhatsApp.

4. Pruebas y verificación:
   - Comandos curl para probar todos los endpoints nuevos.
   - Comandos docker compose para reconstruir y levantar los contenedores (build).
   - Comandos para comprobar la web en 127.0.0.1:3030.
   - Comandos para comprobar https://vayaplan.com y la API pública.

Criterios de aceptación:
- La home carga sin registro y muestra contenido por defecto.
- La vista Hoy muestra eventos y recurrencias del día.
- La vista Fin de semana muestra viernes, sábado y domingo agrupados.
- La ficha de evento muestra local, hora, precio, mapa y acciones.
- Los clics en mapa, reserva, entradas o WhatsApp registran la métrica en event_metrics.
- Las recurrencias aparecen como "Cada [día]" y los places como "Siempre disponible".
- No hay eventos duplicados ni eventos pasados visibles.
- La PWA responde correctamente en 127.0.0.1:3030 y a través de https://vayaplan.com.
- No se rompe ningún endpoint previo del Sprint 1.
```

---

## Despliegue tras el Sprint 2

Como se modifican frontend y backend, reconstruye los contenedores:

```bash
cd ~/vayaplan
docker compose -f infra/docker-compose.yml up -d --build
```

Verificación:

```bash
curl -s http://127.0.0.1:4000/api/health
curl -s "http://127.0.0.1:4000/api/v1/cities/palencia/events?date=2026-10-17"
curl -s "http://127.0.0.1:4000/api/v1/cities/palencia/weekend?start=2026-10-16"
curl -s "http://127.0.0.1:4000/api/v1/cities/palencia/places?category=cine"

curl -I http://127.0.0.1:3030/
curl -I https://vayaplan.com/
curl -I https://vayaplan.com/api/health
```

Prueba final en móvil real:

```text
https://vayaplan.com
```

## Checklist antes de cerrar Sprint 2

- [ ] Endpoints nuevos funcionan.
- [ ] Home muestra eventos, recurrencias y places.
- [ ] Ficha de evento funciona.
- [ ] Ficha de lugar funciona.
- [ ] Vista finde funciona.
- [ ] Calendario funciona.
- [ ] Métricas se registran con session_hash efímero.
- [ ] Las llamadas API usan rutas relativas `/api/v1/...`.
- [ ] PWA instalable.
- [ ] Open Graph correcto.
- [ ] Web accesible desde https://vayaplan.com.
- [ ] Sprint 1 sigue funcionando.
- [ ] Commit y push realizados.
