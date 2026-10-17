# Procedimiento Operativo: Desacoplamiento de Venue Ficticio 9999 (Eventos sin Local)

Este documento detalla la secuencia operativa paso a paso para aplicar en producción el soporte de eventos sin local (`events.venue_id = NULL`), eliminando la dependencia funcional del venue provisional `9999`.

---

## 1. Precondiciones y Salvaguardas

- **Sin credenciales visibles en comandos**: Toda conexión debe utilizar variables de entorno de PostgreSQL (`PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`) o `$DATABASE_URL`, sin pasar contraseñas ni cadenas sensibles en argumentos de línea de comandos.
- **psql con aborto estricto**: Todas las invocaciones de `psql` deben incluir `-v ON_ERROR_STOP=1`.
- **Venue 9999 preservado**: El venue provisional `9999` **NO** se elimina en esta operación. Debe permanecer intacto en la base de datos hasta que el nuevo código esté activo, verificado y concluya la ventana de observación y recuperación (mínimo 48-72 horas), ya que cualquier rollback depende de la existencia de este registro para satisfacer la clave foránea `events_venue_id_fkey`.
- **Puntos de parada obligatorios**: Cada fase requiere verificación explícita antes de pasar a la siguiente.

---

## 2. Secuencia Operativa Paso a Paso

### Fase 1: Copia de Seguridad, Checksum y Verificación en BD Efímera
1. **Definir nombre exacto de backup en variable**:
   ```bash
   BACKUP_FILE="backup_pre_events_nullable_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Generar backup lógico** de las tablas afectadas:
   ```bash
   pg_dump -Fc -f "$BACKUP_FILE" \
     -t events -t venues -t promotions -t recurrences
   ```
3. **Verificar tamaño no vacío y calcular checksum**:
   ```bash
   test -s "$BACKUP_FILE" || { echo "ERROR: El archivo de backup está vacío o no existe"; exit 1; }
   sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
   cat "${BACKUP_FILE}.sha256"
   ```
4. **Verificación de restauración en base de datos efímera**:
   ```bash
   EPHEMERAL_DB="vayaplan_backup_verify_$(date +%s)"
   createdb "$EPHEMERAL_DB"
   pg_restore -d "$EPHEMERAL_DB" --clean --if-exists "$BACKUP_FILE"
   psql -d "$EPHEMERAL_DB" -v ON_ERROR_STOP=1 -c "SELECT 'events', count(*) FROM events UNION ALL SELECT 'venues', count(*) FROM venues;"
   dropdb "$EPHEMERAL_DB"
   ```
5. **Auditar eventos asociados al venue 9999**:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "SELECT id, title, status, editorial_date, start_time FROM events WHERE venue_id = 9999;"
   ```
   *Punto de parada*: Si existe algún evento con `status = 'published'`, **DETENER**. No alterar ni despublicar sin autorización expresa.

---

### Fase 2: Detención de Productores y Drenaje de Tráfico
> [!IMPORTANT]
> Consultar `pg_stat_activity` solo muestra consultas activas instantáneas; **no demuestra ausencia de tráfico entrante** ni peticiones en tránsito en el reverse proxy o capas HTTP. Es obligatorio bloquear el tráfico upstream y drenar peticiones antes de aplicar cambios DDL/DML.

1. **Bloquear endpoints de escritura en el reverse proxy / ingress**:
   - Configurar el reverse proxy (ej. Nginx / Caddy / Cloudflare) para retornar HTTP 503 o pausar tráfico hacia rutas mutadoras:
     - `POST /api/v1/webhooks/whatsapp`
     - `POST /api/v1/admin/ingest/*`
     - `POST /api/v1/admin/events*`, `PATCH /api/v1/admin/events*`, `PUT /api/v1/admin/events*`
     - `DELETE /api/v1/admin/venues*`
2. **Detener workers y temporizadores de fondo**:
   - Suspender cron jobs y tareas automáticas de ingesta cultural (`POST /api/v1/admin/ingest/cultural-agenda`).
   - Detener procesadores de cola y workers en segundo plano.
3. **Drenar peticiones en vuelo (drain window)**:
   - Esperar un período de seguridad (ej. 30 segundos) para que cualquier petición en curso finalice.
4. **Confirmar ausencia de transacciones activas en la BD**:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "SELECT pid, query_start, state, query FROM pg_stat_activity WHERE state = 'active' AND query ILIKE '%events%';"
   ```

---

### Fase 3: Aplicación de la Migración DDL (Expansión de Esquema)
1. **Ejecutar migración DDL 007**:
   ```bash
   psql -v ON_ERROR_STOP=1 -f infra/migrations/007_events_nullable_venue.sql
   ```
   *Efecto*:
   - Valida que no hay eventos published con 9999 (aborta atómicamente si existen).
   - Elimina la restricción `NOT NULL` de `events.venue_id` (conserva FK `ON DELETE RESTRICT`).
   - Añade la constraint `chk_events_published_venue_not_null`.
   - **NO altera registros existentes**. Los eventos con 9999 siguen vinculados a 9999 temporalmente.

2. **Verificar esquema post-DDL**:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "
   SELECT column_name, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'events' AND column_name = 'venue_id';
   "
   # Debe retornar: is_nullable = 'YES'

   psql -v ON_ERROR_STOP=1 -c "
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname = 'chk_events_published_venue_not_null';
   "
   # Debe confirmar la existencia de la regla de integridad de negocio
   ```

---

### Fase 4: Despliegue de Código (API y Web)
1. **Desplegar nuevas imágenes/contenedores** de `vayaplan_api` y `vayaplan_web`.
2. **Verificar salud de servicios en rutas reales comprobadas**:
   ```bash
   # API: puerto 4000
   curl -s -f http://127.0.0.1:4000/api/health
   curl -s -f http://127.0.0.1:4000/api/health/db

   # Web: puerto 3030
   curl -s -f http://127.0.0.1:3030/health
   ```
3. **Verificar interfaz administrativa**:
   - Acceder a la bandeja de curación (`/admin`).
   - Comprobar que los endpoints activos utilizan `LEFT JOIN` y están listos para recibir eventos con `venue_id = NULL`.

---

### Fase 5: Aplicación del Script DML de Transición
1. **Ejecutar script de transición**:
   ```bash
   psql -v ON_ERROR_STOP=1 -f infra/scripts/transition_9999_to_null.sql
   ```
   *Efecto*:
   - Actualiza `venue_id = NULL` en los eventos asociados a 9999 (solo estados permitidos: `tentative`, `cancelled`, `archived`, `duplicate`, `outdated`).
   - Desactiva temporalmente el trigger `trg_events_updated_at` para no alterar `updated_at`.
   - No modifica IDs, títulos, estados, `created_at` ni `updated_at`.
   - Comprueba que no quedan eventos vinculados a 9999.

2. **Verificación post-DML**:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) AS residual_9999_events FROM events WHERE venue_id = 9999;"
   # Debe retornar 0
   ```

---

### Fase 6: Reanudación y Verificación Final
1. **Reabrir endpoints en el reverse proxy / ingress** y reactivar cron jobs/workers.
2. **Verificar bandeja de curación en UI**:
   - Los eventos que estaban en 9999 deben figurar con la etiqueta neutral `⚠️ Local pendiente de asignación`.
   - El subfiltro `⚠️ Pendientes de local` debe listar correctamente estos registros.
   - Probar que intentar publicar sin asignar local responde HTTP 400 (`chk_events_published_venue_not_null` / validación de backend).
3. **Verificar agenda pública**:
   - Confirmar que ningún evento pendiente aparece en las consultas públicas.

---

## 3. Retirada Definitiva del Venue 9999 (Fuera de Esta Operación)

El venue `9999` **no se borra durante esta ventana**. Su retirada requiere:
1. Conclusión satisfactoria de la ventana de estabilidad y recuperación (mínimo 48-72 horas).
2. Verificación formal de dependencias cero:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "
   SELECT
     (SELECT COUNT(*) FROM events WHERE venue_id = 9999) AS events_count,
     (SELECT COUNT(*) FROM promotions WHERE venue_id = 9999) AS promos_count,
     (SELECT COUNT(*) FROM recurrences WHERE venue_id = 9999) AS recurrences_count,
     (SELECT COUNT(*) FROM places WHERE venue_id = 9999) AS places_count,
     (SELECT COUNT(*) FROM venue_external_ids WHERE venue_id = 9999) AS ext_ids_count,
     (SELECT COUNT(*) FROM venue_import_batches WHERE 9999 = ANY(created_venue_ids) AND status = 'applied') AS batch_count;
   "
   ```
3. Autorización explícita de la propiedad para invocar `DELETE /api/v1/admin/venues/9999` desde el panel de administración.

---

## 4. Protocolo de Recuperación / Rollback

> [!WARNING]
> Ningún procedimiento de recuperación se ejecutará sin autorización explícita de la dirección.
> Un `UPDATE` global indiscriminado sobre `events WHERE venue_id IS NULL` es peligroso porque alteraría de forma indebida nuevos eventos creados por el nuevo código.

### Caso A: Fallo durante Fase 3 (DDL)
Si la migración DDL falla o se aborta antes de desplegar código:
- La transacción `BEGIN ... COMMIT` garantiza reversión automática de cambios parciales.
- No se requiere acción adicional de datos. El código antiguo sigue funcionando normalmente con `venue_id = 9999`.

### Caso B: Fallo durante Fase 4 (Despliegue de Código)
Si los contenedores nuevos no inician correctamente:
1. Revertir contenedores a la imagen previa.
2. Como los registros aún conservan `venue_id = 9999` (el DML no se ha ejecutado), el código antiguo sigue leyendo y operando con normalidad.
3. Si se desea retirar el DDL:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "
   ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_published_venue_not_null;
   ALTER TABLE events ALTER COLUMN venue_id SET NOT NULL;
   "
   ```

### Caso C: Rollback tras Fase 5 (Post-DML) o tras Ventana Operativa
Si se requiere volver a la versión anterior tras haber ejecutado el DML o tras haber tenido tráfico con el nuevo código:

1. **Pausar productores y drenar tráfico** (repetir Fase 2).
2. **Auditar e inventariar eventos con venue_id = NULL**, distinguiendo entre eventos históricos y eventos nuevos:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "
   SELECT id, title, status, created_at, source_type
   FROM events
   WHERE venue_id IS NULL
   ORDER BY created_at ASC;
   "
   ```
3. **Tratamiento de eventos nuevos creados post-despliegue**:
   - Los eventos creados mientras el nuevo código estuvo activo pueden legítimamente tener `venue_id = NULL`.
   - Para poder re-imponer la restricción `NOT NULL`, **todos los registros con `venue_id IS NULL` deben resolverse**.
   - Con autorización expresa, asignar temporalmente el venue provisional `9999` (o descartar si son pruebas verificadas):
     ```bash
     psql -v ON_ERROR_STOP=1 -c "
     UPDATE events
     SET venue_id = 9999
     WHERE venue_id IS NULL;
     "
     ```
   - El venue `9999` **debe existir en la base de datos** para que esta asignación respete la clave foránea `events_venue_id_fkey`.
4. **Verificar que no quedan registros con `venue_id IS NULL`**:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) FROM events WHERE venue_id IS NULL;"
   # Debe retornar 0 antes de re-imponer NOT NULL
   ```
5. **Re-imponer restricciones del esquema anterior**:
   ```bash
   psql -v ON_ERROR_STOP=1 -c "
   ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_published_venue_not_null;
   ALTER TABLE events ALTER COLUMN venue_id SET NOT NULL;
   "
   ```
6. **Revertir contenedores de API y Web a la versión anterior**.
7. **Reanudar tráfico y verificar servicios**.
