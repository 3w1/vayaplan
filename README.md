# VayaPlan — Guía Técnica y Operativa (Semana 1)

VayaPlan es una plataforma de ocio hiperlocal diseñada para resolver sin fricción el problema de *"¿qué se hace hoy en la ciudad?"*, comenzando con el piloto en **Palencia**.

Este repositorio implementa la arquitectura técnica **v1.1** y el modelo de datos **v1.1** definidos en la documentación (`docs/04-architecture.md` y `docs/02-data-model.md`).

---

## 1. Estructura del Monorepo

```text
vayaplan/
├── apps/
│   ├── api/            # API REST construida con Bun + Hono y PostgreSQL nativo
│   └── web/            # Esqueleto web / PWA mínimo (Bun + Hono)
├── packages/
│   ├── db/             # Conexión nativa a PostgreSQL 16 con pool (sin ORM)
│   ├── shared/         # Utilidades comunes (fechas, etiquetas editoriales, mapas)
│   └── types/          # Tipos e interfaces TypeScript del dominio y contratos
├── infra/
│   ├── docker-compose.yml   # Contenedores para db (PostgreSQL 16), api y web
│   ├── migrations/          # 001_initial_schema.sql (DDL completo v1.1)
│   ├── nginx/               # Plantilla de proxy inverso y SSL para el host
│   ├── seed.sql             # Datos iniciales para Palencia
│   └── .env.example         # Ejemplo de variables de entorno para Docker
├── docs/               # Documentación técnica, modelo de datos y sprints
├── ops/                # Datos operativos iniciales (CSV de locales y eventos)
├── .env.example        # Plantilla raíz de variables de entorno
└── README.md
```

---

## 2. Requisitos Previos

- **Docker** y **Docker Compose** instalados en el sistema.
- **Nginx** en el host para gestión de SSL y enrutamiento (Caddy no se utiliza).
- **Bun** (opcional para desarrollo local fuera de Docker).

---

## 3. Puesta en Marcha Rápida

### Paso 1: Configurar variables de entorno

Copia el archivo de ejemplo a `.env` en la raíz del proyecto y ajusta la contraseña de la base de datos:

```bash
cp .env.example .env
```

Asegúrate de definir al menos:
```env
POSTGRES_USER=vayaplan_user
POSTGRES_PASSWORD=tu-clave-segura
DATABASE_URL=postgresql://vayaplan_user:tu-clave-segura@db:5432/vayaplan
```

### Paso 2: Instalar dependencias en el host (opcional / desarrollo)

```bash
bun install
```

### Paso 3: Levantar contenedores Docker

Levanta la base de datos PostgreSQL 16 y la API en segundo plano:

```bash
docker compose -f infra/docker-compose.yml up -d db api
```

Para levantar todos los servicios (incluyendo el esqueleto web):

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Paso 4: Ejecutar migraciones iniciales

Aplica el DDL exhaustivo (`001_initial_schema.sql`):

```bash
docker exec -i vayaplan_postgres psql \
  -U "${POSTGRES_USER:-vayaplan_user}" \
  -d vayaplan \
  < infra/migrations/001_initial_schema.sql
```

### Paso 5: Cargar datos iniciales (Seed)

Inserta Palencia, dos locales de prueba, eventos futuros, recurrencia y lugar de cine:

```bash
docker exec -i vayaplan_postgres psql \
  -U "${POSTGRES_USER:-vayaplan_user}" \
  -d vayaplan \
  < infra/seed.sql
```

---

## 4. Verificación de la API

La API se expone estrictamente en `127.0.0.1:4000`:

### Comprobar estado de la API
```bash
curl -s http://127.0.0.1:4000/api/health | jq .
```
Respuesta esperada:
```json
{
  "status": "ok"
}
```

### Comprobar conexión real a PostgreSQL
```bash
curl -s http://127.0.0.1:4000/api/health/db | jq .
```
Respuesta esperada:
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-10-14T...",
  "database": "vayaplan"
}
```

### Consultar agenda de eventos para Palencia
```bash
# Eventos para fecha específica
curl -s "http://127.0.0.1:4000/api/v1/cities/palencia/events?date=2026-10-17" | jq .

# Eventos para la fecha actual
curl -s "http://127.0.0.1:4000/api/v1/cities/palencia/events" | jq .
```

---

## 5. Gestión y Comandos Útiles

### Ver logs en tiempo real
```bash
docker compose -f infra/docker-compose.yml logs -f api
docker compose -f infra/docker-compose.yml logs -f db
```

### Reiniciar un servicio
```bash
docker compose -f infra/docker-compose.yml restart api
```

### Parar los servicios
```bash
docker compose -f infra/docker-compose.yml down
```

---

## 6. Flujo Git y Control de Versiones

```bash
# Crear o cambiar a la rama de sprint
git checkout -b feature/sprint-1

# Comprobar estado
git status

# Añadir cambios (verificar que .env nunca se añade)
git add .

# Confirmar cambios
git commit -m "feat(sprint-1): infraestructura inicial, esquema postgres ddl v1.1 y api bun+hono"

# Enviar al repositorio remoto
git push -u origin feature/sprint-1
```
