# Procedimiento Operativo: Persistencia y Revisión de Imágenes de Biblioteca Pública (event_image_decisions)

Este documento detalla la secuencia operativa paso a paso para desplegar en producción la migración DDL `019_event_image_decisions.sql` y el código asociado de backend (`api`) y frontend (`web`). Permite la persistencia estricta, auditoría e idempotencia de decisiones editoriales (`adopt`, `keep_current`, `discard`, `request_search`) sobre las imágenes propuestas para los eventos de la Biblioteca Pública del Estado en Palencia.

---

## 1. Alcance, Precondiciones y Salvaguardas

### 1.1 Alcance
- Aplicar la migración DDL `infra/migrations/019_event_image_decisions.sql` sobre la base de datos PostgreSQL de producción.
- Crear la tabla dedicada `event_image_decisions` con clave primaria autoincremental `id SERIAL PRIMARY KEY`, restricciones de acción y tres índices:
  1. `idx_event_image_decisions_lookup (event_id, candidate_key, id DESC)`: resolución determinista de la última decisión activa.
  2. `idx_event_image_decisions_event_history (event_id, id DESC)`: consulta del historial completo de un evento.
  3. `idx_event_image_decisions_idempotency (idempotency_key)` WHERE `idempotency_key IS NOT NULL`: unicidad parcial para reintentos cliente seguros.
- Desplegar las imágenes actualizadas de `api` y `web`.
- Exclusión deliberada: **No se incluye ningún backfill automático de datos ni reconciliación retrospectiva** dentro de la migración. Las decisiones previas continuarán resolviéndose progresivamente en el flujo editorial.

### 1.2 Configuración Real de Base de Datos
- **Configuración de entorno**: Se extrae de `infra/.env` y `infra/docker-compose.yml`.
- **Usuario real**: El usuario de base de datos configurado es `${POSTGRES_USER:-vayaplan_user}` (no asumir que existe un rol `postgres` utilizable ni conexiones sin credenciales).
- **Base de datos**: `${POSTGRES_DB:-vayaplan}`.
- **Sin credenciales en texto plano**: Toda llamada a `psql` o `pg_dump` debe utilizar las variables de entorno o la conexión segura dentro de la red del contenedor `vayaplan_postgres`.

### 1.3 Salvaguardas de Concurrencia y Timeouts
- **Aborto estricto**: Usar siempre `psql -v ON_ERROR_STOP=1`. Cualquier error aborta inmediatamente la ejecución con código distinto de 0.
- **Timeouts transaccionales en SQL**:
  - `SET lock_timeout = '5s'`: Si la adquisición del lock DDL compite con transacciones concurrentes, PostgreSQL aborta en 5 segundos.
  - `SET statement_timeout = '30s'`: Previene sentencias bloqueantes residuales.
- **Aclaración sobre timeouts**: Los timeouts **no eliminan ni previenen los bloqueos de concurrencia** de PostgreSQL. Su única función es defensiva: fuerzan un aborto con fallo inmediato si la transacción espera más de 5 segundos, impidiendo que una cola de consultas se acumule y degrade el servicio.
- **Punto de parada**: Si la migración falla por timeout o error, **DETENERSE INMEDIATAMENTE**. No ejecutar bucles de reintento automático ni elevar los timeouts sin autorización técnica expresa.

---

## 2. Secuencia Operativa de Despliegue

El orden estricto de ejecución en producción es:
$$\text{Respaldo} \longrightarrow \text{Preservación de Imágenes} \longrightarrow \text{Migración DDL} \longrightarrow \text{Despliegue API} \longrightarrow \text{Despliegue Web} \longrightarrow \text{Verificación}$$

### Fase 1: Respaldo Pre-migración y Salvaguarda de Datos
Los respaldos deben conservarse exclusivamente en un directorio seguro del host, fuera de rutas públicas accesibles vía web, fuera del árbol del repositorio Git y fuera de directorios temporales volátiles (como `/tmp`).

1. **Definir directorio de respaldo persistente y seguro**:
   ```bash
   BACKUP_DIR="/root/backups"
   mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
   BACKUP_FILE="${BACKUP_DIR}/backup_pre_migration019_$(date +%Y%m%d_%H%M%S).dump"
   ```

2. **Generar respaldo lógico con pg_dump usando el usuario real**:
   ```bash
   # Cargar variables de infraestructura si es necesario
   set -a && source infra/.env && set +a

   docker exec -i vayaplan_postgres pg_dump \
     -U "${POSTGRES_USER:-vayaplan_user}" \
     -d "${POSTGRES_DB:-vayaplan}" \
     -Fc > "$BACKUP_FILE"
   ```

3. **Verificar integridad del archivo de respaldo**:
   ```bash
   test -s "$BACKUP_FILE" || { echo "ERROR: Respaldo fallido o archivo vacío"; exit 1; }
   sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
   cat "${BACKUP_FILE}.sha256"
   ```

### Fase 2: Preservación Dinámica de Imágenes en Ejecución (API y Web)
Antes de construir o reemplazar contenedores, se registran dinámicamente las imágenes actualmente en ejecución para garantizar un rollback inmediato sin depender de tags fijos u obsoletos:

```bash
PRE_API_IMAGE=$(docker inspect vayaplan_api --format '{{.Image}}')
PRE_WEB_IMAGE=$(docker inspect vayaplan_web --format '{{.Image}}')
ROLLBACK_TAG=$(date +%Y%m%d_%H%M%S)

docker tag "${PRE_API_IMAGE}" "vayaplan_api_pre_bib_hotfix_${ROLLBACK_TAG}:latest"
docker tag "${PRE_WEB_IMAGE}" "vayaplan_web_pre_bib_hotfix_${ROLLBACK_TAG}:latest"

echo "Imágenes preservadas con tag: ${ROLLBACK_TAG}"
```

### Fase 3: Aplicación de la Migración DDL (019)
1. **Ejecutar el script SQL de migración transaccional con parada estricta ante errores**:
   ```bash
   docker exec -i vayaplan_postgres psql \
     -U "${POSTGRES_USER:-vayaplan_user}" \
     -d "${POSTGRES_DB:-vayaplan}" \
     -v ON_ERROR_STOP=1 \
     < infra/migrations/019_event_image_decisions.sql
   ```

2. **Verificar la creación de la tabla y sus índices**:
   ```bash
   docker exec -i vayaplan_postgres psql \
     -U "${POSTGRES_USER:-vayaplan_user}" \
     -d "${POSTGRES_DB:-vayaplan}" \
     -c "\d event_image_decisions"
   ```

3. **Confirmar ausencia de reconciliaciones o inserciones automáticas**:
   ```bash
   docker exec -i vayaplan_postgres psql \
     -U "${POSTGRES_USER:-vayaplan_user}" \
     -d "${POSTGRES_DB:-vayaplan}" \
     -c "SELECT count(*) AS total_decisions FROM event_image_decisions;"
   ```
   *Debe responder `0` filas.*

### Fase 4: Despliegue del Servicio API
1. **Construir y recrear el contenedor de la API de forma acotada**:
   ```bash
   docker compose -f infra/docker-compose.yml --env-file infra/.env build api
   docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --no-deps --no-build api
   ```

2. **Verificar salud del backend**:
   ```bash
   curl -fsS http://127.0.0.1:4000/api/health || { echo "ERROR: API no saludable"; exit 1; }
   ```

### Fase 5: Despliegue del Servicio Web
1. **Construir y recrear el contenedor Web de forma acotada**:
   ```bash
   docker compose -f infra/docker-compose.yml --env-file infra/.env build web
   docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --no-deps --no-build web
   ```

2. **Verificar disponibilidad del panel editorial**:
   ```bash
   curl -fsS -I http://127.0.0.1:3030/admin || { echo "ERROR: Web /admin no responde"; exit 1; }
   ```

### Fase 6: Verificación Funcional Integral
1. Acceder a `https://vayaplan.com/admin` e iniciar sesión.
2. Comprobar la pestaña **"Imágenes Biblioteca Pública"**:
   - Pestaña **Pendientes**: Muestra el total de propuestas pendientes con sus distintivos informativos (`⚪ Misma imagen (pendiente de confirmación)` para imágenes idénticas sin decisión humana previa).
   - Pestaña **Resueltos**: Lista los eventos con decisiones registradas y sus contadores desagregados.
3. Probar la adopción o mantenimiento de una propuesta y validar que la tarjeta se retira inmediatamente de "Pendientes" y persiste en "Resueltos" sin reaparecer tras recargar la página.

---

## 3. Plan de Contingencia y Rollback

### Escenario A: Rollback de Aplicación (Nivel 1 — Recomendado y No Destructivo)
- **Situación**: Se detecta una anomalía en el frontend o la API tras el despliegue del código.
- **Procedimiento**: Revertir los contenedores `api` y `web` a las imágenes previamente preservadas, **conservando intacta la tabla `event_image_decisions` y los datos ya registrados**:
  ```bash
  # Restaurar tags originales
  docker tag "vayaplan_api_pre_bib_hotfix_${ROLLBACK_TAG}:latest" infra-api:latest
  docker tag "vayaplan_web_pre_bib_hotfix_${ROLLBACK_TAG}:latest" infra-web:latest

  # Recrear contenedores con las imágenes anteriores
  docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --no-deps --no-build api web

  # Verificar estado de los servicios
  docker compose -f infra/docker-compose.yml --env-file infra/.env ps
  ```
- **ADVERTENCIA FUNCIONAL CRÍTICA**:
  La versión anterior del código de `api` y `web` no lee la tabla `event_image_decisions`. En consecuencia, aunque el rollback de aplicación restablece la estabilidad del servicio, **reintroduce el defecto original**: las tarjetas de propuestas de la Biblioteca Pública no se marcarán como resueltas y reaparecerán continuamente en la bandeja de "Pendientes".

### Escenario B: Reversión DDL Destructiva (Nivel 2 — Último Recurso con Autorización Expresa)
- **Situación**: Decisión formal de desmantelamiento de la migración 019.
- **ADVERTENCIA**: El script `rollback_019_event_image_decisions.sql` ejecuta `DROP TABLE IF EXISTS event_image_decisions;`. Esta operación destruye de forma irremediable todo el historial de auditoría y decisiones editoriales sobre imágenes registradas por los operadores.
- **Requisitos de Ejecución**:
  1. Autorización técnica expresa.
  2. Respaldo previo verificado en `${BACKUP_DIR}`.
- **Comando de reversión**:
  ```bash
  docker exec -i vayaplan_postgres psql \
    -U "${POSTGRES_USER:-vayaplan_user}" \
    -d "${POSTGRES_DB:-vayaplan}" \
    -v ON_ERROR_STOP=1 \
    < infra/migrations/rollback_019_event_image_decisions.sql
  ```
