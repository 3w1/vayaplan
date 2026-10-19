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
git checkout -b feature/sprint-3

# Comprobar estado
git status

# Añadir cambios (verificar que .env nunca se añade)
git add .

# Confirmar cambios
git commit -m "feat(sprint-3): panel de curacion, webhook whatsapp y codigos qr"

# Enviar al repositorio remoto
git push -u origin main
```

---

## 7. Sprint 3 — Panel de Curación, WhatsApp Business y Códigos QR

### 7.1 Acceso al Panel de Curación Administrativo
- **URL**: `https://vayaplan.com/admin` (o en local `http://127.0.0.1:3030/admin`)
- **Email por defecto**: `admin@vayaplan.com`
- **Contraseña por defecto**: `vayaplan2026!`
- **Funcionalidades**:
  - Listado de eventos con filtrado rápido por estado (destacando borradores `tentative`).
  - Acciones en un clic: Publicar borrador, marcar duplicado, cancelar evento y archivar.
  - CRUD completo para **Locales (Venues)**, **Recurrencias semanales**, **Excepciones por fecha**, **Lugares permanentes (Places)** y **Códigos QR**.
  - Visualización del reporte de métricas y conversiones por evento.

### 7.2 Configuración del Webhook de WhatsApp en Meta for Developers
1. Acceder al panel de Meta for Developers (`https://developers.facebook.com/apps/`).
2. Seleccionar la aplicación de WhatsApp Business y navegar a **WhatsApp > Configuración > Configuración del Webhook**.
3. Configurar los siguientes parámetros:
   - **URL de devolución de llamada (Callback URL)**: `https://vayaplan.com/api/v1/webhooks/whatsapp`
   - **Token de verificación (Verify Token)**: El valor configurado en `WHATSAPP_WEBHOOK_SECRET` (por defecto: `vayaplan_whatsapp_verify_token_2026`).
4. Pulsar en **Verificar y Guardar**.
5. En la sección **Campos del Webhook**, suscribirse al evento **`messages`**.
6. **Protocolo de Ingesta**:
   - Cada mensaje o imagen recibido en el número corporativo de WhatsApp crea de forma inmediata y automática un evento borrador en estado `tentative` asociado al local correspondiente o al local de contingencia (`#9999 Local por verificar`).
   - **Regla estricta**: Ningún evento recibido por WhatsApp se publica automáticamente sin revisión humana. El curador debe acceder a `/admin` y pulsar **Publicar** tras validar los datos.

### 7.3 Códigos QR de Alojamientos (Captación Turística)
- **URL pública de escaneo**: `https://vayaplan.com/qr/:qrCode` (ej: `https://vayaplan.com/qr/hotel-san-antolin`)
- **Comportamiento**:
  - Registra de forma anónima una métrica de tipo `qr_scan` en `event_metrics` asociada al alojamiento emisor.
  - Redirige mediante código 302 a `https://vayaplan.com/?origin=qr_hotel`.
  - La interfaz administrativa en `/admin` permite descargar directamente la tarjeta vectorial SVG (`/api/v1/admin/qr-sources/:id/svg?format=card`) lista para imprimir y colocar en recepción.

---

## 8. Piloto de Ampliación de Agenda y Conector JCyL (`feat/agenda-expansion-pilot`)

### 8.1 Sincronización e Ingesta JCyL
- **CLI Oficial:** `scripts/jcyl-sync-cli.ts` (es la **única CLI vigente documentada**).
- **Endpoint consumido:** `https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records`.
- **Filtro OData:** `where=nombre_localidad='Palencia'&order_by=fecha_inicio asc&limit=50`.
- **Comportamiento Dry-Run:** El modo dry-run retorna antes de cualquier acceso a base de datos. No ejecuta INSERT, UPDATE, BEGIN ni ROLLBACK.
- **Ejecución local en dry-run:**
  ```bash
  bun run scripts/jcyl-sync-cli.ts
  ```

### 8.2 Censo de Recintos y Separación de Entornos
- **Recintos censados en producción (`vayaplan`):**
  - `ID 1`: Bar Universonoro
  - `ID 2`: Teatro Principal de Palencia
- **Recintos no censados en producción:**
  - *Biblioteca Pública de Palencia*, *Centro Cultural Lecrác*, *Pabellón Municipal de Deportes «Marta Domínguez»* y *Estadio Municipal Nueva Balastera* **no están censados en producción** (pendientes de alta autorizada). No se deben asumir ni proponer IDs productivos para ellos.
- **IDs de fixtures de pruebas visuales:**
  - Los identificadores `1` (Teatro), `2` (Biblioteca), `3` (Lecrác) y `10` (Pabellón) corresponden exclusivamente al mock estático de captura en `scratch/capture_admin_flow.ts`.

### 8.3 Evento 8 en Producción
- **Origen:** El evento 8 (`Festival Jazz`, `venue_id = 2`, `status = 'outdated'`) en la base de datos `vayaplan` de producción es una prueba del usuario para cargar y visualizar un cartel, con título relacionado con jazz.
- **Tratamiento:** Permanece inalterado y pendiente de decisión editorial sobre su retirada, sin reconciliarse con funciones reales de festival ni desdoblarse en conciertos.

### 8.4 Identificadores de Registro JCyL
- **Villamuriel de Cerrato (Rechazado por municipio):** `1285645015428`.
- **Biblioteca Pública (Aceptado):** `1285184301373`.
- **`1285645015421`:** Fixture sintética y errata de redacción en informes previos (no usar en ejemplos reales).


