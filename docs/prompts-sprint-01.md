# Prompt — Sprint 1: Fundamentos técnicos

**Proyecto:** VayaPlan  
**Sprint:** Semana 1 — Fundamentos  
**Contexto obligatorio:** `04-architecture.md` v1.1, `02-data-model.md` v1.1, `05-sprint-backlog.md`  
**Objetivo:** generar en local el andamiaje del monorepo, la base de datos y una API mínima operativa, para subirlo después por Git al VPS.

---

## Recomendación de flujo

Trabajar en **local con Antigravity** y sincronizar mediante **Git**.

Motivos:

- Evitas editar código de producción directamente por SSH.
- Puedes revisar diffs antes de desplegar.
- Puedes revertir errores con un commit anterior.
- El VPS solo recibe código probado.
- Mantienes el repositorio como fuente única de verdad.

Flujo:

```text
Antigravity en local
        │
        ▼
Commit en rama feature/sprint-1
        │
        ▼
Push a GitHub privado
        │
        ▼
Pull en VPS: ~/vayaplan
        │
        ▼
docker compose up -d
```

---

## Prompt para Antigravity

```text
Actúa como desarrollador backend senior. Vamos a ejecutar las tareas de la Semana 1 definidas en 05-sprint-backlog.md para VayaPlan.

Restricciones técnicas obligatorias:
- Sigue estrictamente la arquitectura de 04-architecture.md v1.1: monorepo, Bun + Hono, PostgreSQL 16 y Docker Compose.
- No incluyas Caddy. Nginx ya existe en el host del VPS y gestiona SSL y proxy inverso.
- La API debe exponerse únicamente en 127.0.0.1:4000.
- La web debe exponerse únicamente en 127.0.0.1:3030.
- Implementa el DDL exacto de 02-data-model.md v1.1 en PostgreSQL, incluyendo:
  - uq_promotions_city_editorial_date
  - session_hash en event_metrics
  - google_maps_url en venues y places
  - índices de agenda, deduplicación y métricas
- No añadas ORM, colas, Redis, autenticación compleja, pagos, ticketing ni funcionalidades fuera del Sprint 1.
- Usa TypeScript, código modular y variables de entorno. No incluyas secretos reales.
- Si detectas una inconsistencia entre documentos, detente e indícala antes de modificar el esquema.

Entregables requeridos:

1. Estructura modular del monorepo:
   - apps/api
   - apps/web
   - infra
   - packages/db
   - packages/shared
   - packages/types
   - docs
   - ops

2. infra/docker-compose.yml funcional y alineado con producción:
   - db: postgres:16-alpine, red interna, volumen persistente.
   - api: Bun + Hono, expuesta en 127.0.0.1:4000.
   - web: Astro o Next.js, expuesta en 127.0.0.1:3030.
   - Sin Caddy.
   - Red Docker interna para comunicación entre servicios.

3. Migración SQL reproducible:
   - infra/migrations/001_initial_schema.sql
   - Debe contener todas las tablas, foreign keys, índices y restricciones del DDL de 02-data-model.md v1.1.

4. Script de datos iniciales:
   - infra/seed.sql
   - Inserta la ciudad Palencia con slug palencia y timezone Europe/Madrid.
   - Inserta dos venues de prueba en Palencia con dirección, coordenadas y google_maps_url.
   - Inserta dos eventos futuros publicados con editorial_date correcta.
   - Inserta una recurrencia semanal de prueba.
   - Inserta un place de prueba con categoría cine.
   - Debe poder ejecutarse de forma segura en una base de datos vacía.

5. Código de apps/api con Bun + Hono:
   - Conexión a PostgreSQL.
   - Middleware de logs estructurados.
   - Manejo centralizado de errores.
   - GET /api/health
   - GET /api/health/db
   - GET /api/v1/cities/:citySlug/events
   - El endpoint de eventos debe devolver eventos published para la fecha solicitada, ordenados por start_time.
   - Debe incluir venue, precio, acciones, verificación y promotion cuando exista.
   - Debe respetar el contrato JSON de 02-data-model.md v1.1.

6. Archivo .env.example con todas las variables necesarias.

7. README técnico breve con:
   - Comandos para instalar dependencias.
   - Comandos para levantar Docker.
   - Comandos para aplicar migraciones.
   - Comando para ejecutar seed.sql.
   - Comandos para comprobar health checks.
   - Comandos para parar y reiniciar servicios.

Criterios de aceptación:
- docker compose -f infra/docker-compose.yml up -d db api levanta PostgreSQL y API sin errores.
- La migración crea todas las tablas e índices definidos.
- seed.sql inserta los datos mínimos sin duplicados.
- GET /api/health responde { "status": "ok" }.
- GET /api/health/db comprueba la conexión real a PostgreSQL.
- GET /api/v1/cities/palencia/events devuelve JSON válido.
- El índice uq_promotions_city_editorial_date impide dos promociones activas por ciudad y editorial_date.
- No se genera frontend funcional en este sprint; apps/web puede contener únicamente el esqueleto mínimo.
```

---

## Comandos de despliegue en VPS

### 1. Preparar directorio

```bash
mkdir -p ~/vayaplan
cd ~/vayaplan
```

Si usas Git:

```bash
git clone git@github.com:tu-usuario/vayaplan.git .
```

### 2. Configurar entorno

```bash
cp infra/.env.example .env
nano .env
```

Define al menos:

```env
POSTGRES_USER=vayaplan_user
POSTGRES_PASSWORD=clave-segura
DATABASE_URL=postgresql://vayaplan_user:clave-segura@db:5432/vayaplan
```

### 3. Levantar base de datos y API

```bash
docker compose -f infra/docker-compose.yml up -d db api
```

### 4. Aplicar migraciones y seed

```bash
docker exec -i vayaplan_postgres psql \
  -U vayaplan_user \
  -d vayaplan \
  < infra/migrations/001_initial_schema.sql

docker exec -i vayaplan_postgres psql \
  -U vayaplan_user \
  -d vayaplan \
  < infra/seed.sql
```

### 5. Verificar API

```bash
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:4000/api/health/db
curl http://127.0.0.1:4000/api/v1/cities/palencia/events
```

### 6. Verificar dominio público

```bash
curl -I https://vayaplan.com/api/health
```

El resultado esperado es:

```json
{
  "status": "ok"
}
```

---

## Checklist antes de pasar al Sprint 2

- [ ] Repositorio Git privado creado.
- [ ] Código generado en local y revisado.
- [ ] `.env` no está en Git.
- [ ] Migraciones ejecutadas sin errores.
- [ ] Seed ejecutado correctamente.
- [ ] API responde en `127.0.0.1:4000`.
- [ ] Nginx enruta `/api/` correctamente.
- [ ] `https://vayaplan.com/api/health` devuelve `status: ok`.
- [ ] `GET /api/v1/cities/palencia/events` devuelve JSON válido.
- [ ] No hay Caddy en Docker.
- [ ] No hay secretos reales en el repositorio.
