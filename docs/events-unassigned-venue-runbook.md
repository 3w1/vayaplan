# Procedimiento Operativo: Desacoplamiento de Venue Ficticio 9999 (Eventos sin Local)

Este documento detalla la secuencia operativa paso a paso para aplicar en producción el soporte de eventos sin local (`events.venue_id = NULL`), eliminando la dependencia funcional del venue provisional `9999`.

---

## 1. Precondiciones y Salvaguardas

- **Sin credenciales hardcoded**: Toda conexión debe utilizar variables de entorno del entorno de ejecución (ej. `$DATABASE_URL`).
- **Venue 9999 preservado**: El venue provisional `9999` **NO** se elimina en esta operación. Debe permanecer en la base de datos hasta que el nuevo código esté activo, verificado y concluya la ventana de recuperación.
- **Puntos de parada obligatorios**: Cada fase requiere verificación explícita antes de pasar a la siguiente.

---

## 2. Secuencia Operativa Paso a Paso

### Fase 1: Copia de Seguridad y Verificación Previa
1. **Generar backup lógico** de las tablas afectadas:
   ```bash
   pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
     -t events -t venues -t promotions -t recurrences \
     -Fc -f "backup_pre_events_nullable_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Verificar integridad del backup**:
   ```bash
   pg_restore -l "backup_pre_events_nullable_*.dump" | wc -l
   ```
3. **Auditar eventos asociados al venue 9999**:
   ```sql
   SELECT id, title, status, editorial_date, start_time
   FROM events
   WHERE venue_id = 9999;
   ```
   *Punto de parada*: Si existe algún evento con `status = 'published'`, **DETENER**. No alterar ni despublicar sin autorización expresa.

---

### Fase 2: Pausa de Productores y Escritores
1. **Pausar ingestas automáticas**:
   - Detener o suspender cron/workers de ingesta cultural (`POST /api/v1/admin/ingest/cultural-agenda`).
   - Pausar temporizadores de ingesta en el orquestador de tareas.
2. **Suspender webhooks entrantes**:
   - Redirigir o pausar el tráfico hacia `/api/v1/webhooks/whatsapp` a nivel de ingress/reverse proxy (devolver HTTP 503 temporal o encolar).
3. **Comprobar ausencia de transacciones en curso**:
   ```sql
   SELECT pid, query_start, state, query
   FROM pg_stat_activity
   WHERE state = 'active' AND query LIKE '%events%';
   ```

---

### Fase 3: Aplicación de la Migración DDL (Expansión de Esquema)
1. **Ejecutar migración DDL 007**:
   ```bash
   psql "$DATABASE_URL" -f infra/migrations/007_events_nullable_venue.sql
   ```
   *Efecto*:
   - Valida que no hay eventos published con 9999 (aborta atómicamente si existen).
   - Elimina la restricción `NOT NULL` de `events.venue_id` (conserva FK `ON DELETE RESTRICT`).
   - Añade la constraint `chk_events_published_venue_not_null`.
   - **NO altera registros existentes**. Los eventos con 9999 siguen vinculados a 9999 temporalmente.

2. **Verificar esquema post-DDL**:
   ```sql
   SELECT column_name, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'events' AND column_name = 'venue_id';
   -- Debe retornar: is_nullable = 'YES'

   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname = 'chk_events_published_venue_not_null';
   -- Debe confirmar la existencia de la regla de integridad de negocio
   ```

---

### Fase 4: Despliegue de Código (API y Web)
1. **Desplegar nuevas imágenes/contenedores** de `vayaplan_api` y `vayaplan_web`.
2. **Verificar salud de servicios**:
   ```bash
   curl -s -f http://127.0.0.1:4000/health
   curl -s -f http://127.0.0.1:3000/health
   ```
3. **Verificar interfaz administrativa**:
   - Acceder a la bandeja de curación (`/admin`).
   - Comprobar que los endpoints activos utilizan `LEFT JOIN` y están listos para recibir eventos con `venue_id = NULL`.

---

### Fase 5: Aplicación del Script DML de Transición
1. **Ejecutar script de transición**:
   ```bash
   psql "$DATABASE_URL" -f infra/scripts/transition_9999_to_null.sql
   ```
   *Efecto*:
   - Actualiza `venue_id = NULL` en los eventos asociados a 9999 (solo estados permitidos: `tentative`, `cancelled`, `archived`, `duplicate`, `outdated`).
   - No modifica IDs, títulos, estados ni fechas.
   - Comprueba que no quedan eventos vinculados a 9999.

2. **Verificación post-DML**:
   ```sql
   SELECT COUNT(*) AS residual_9999_events FROM events WHERE venue_id = 9999;
   -- Debe retornar 0
   ```

---

### Fase 6: Reanudación y Verificación Final
1. **Reanudar tráfico de webhooks e ingestas programadas**.
2. **Verificar bandeja de curación en UI**:
   - Los eventos que estaban en 9999 deben figurar con la etiqueta neutral `⚠️ Local pendiente de asignación`.
   - El subfiltro `⚠️ Pendientes de local` debe listar correctamente estos registros.
   - Probar que intentar publicar sin asignar local responde HTTP 400.
3. **Verificar agenda pública**:
   - Confirmar que ningún evento pendiente aparece en las consultas públicas.

---

## 3. Retirada Definitiva del Venue 9999 (Fuera de Esta Operación)

El venue `9999` **no se borra durante esta ventana**. Su retirada requiere:
1. Conclusión satisfactoria de la ventana de estabilidad y recuperación (mínimo 48-72 horas).
2. Verificación formal de dependencias cero:
   ```sql
   SELECT
     (SELECT COUNT(*) FROM events WHERE venue_id = 9999) AS events_count,
     (SELECT COUNT(*) FROM promotions WHERE venue_id = 9999) AS promos_count,
     (SELECT COUNT(*) FROM recurrences WHERE venue_id = 9999) AS recurrences_count,
     (SELECT COUNT(*) FROM places WHERE venue_id = 9999) AS places_count,
     (SELECT COUNT(*) FROM venue_external_ids WHERE venue_id = 9999) AS ext_ids_count,
     (SELECT COUNT(*) FROM venue_import_batches WHERE 9999 = ANY(created_venue_ids) AND status = 'applied') AS batch_count;
   ```
3. Autorización explícita de la propiedad para invocar `DELETE /api/v1/admin/venues/9999` desde el panel de administración.

---

## 4. Protocolo de Recuperación / Rollback

> [!WARNING]
> Ningún procedimiento de recuperación se ejecutará sin autorización explícita de la dirección.
> Un `UPDATE` global indiscriminado sobre `events WHERE venue_id IS NULL` es peligroso porque afectaría a nuevos borradores creados tras el despliegue.

### Caso A: Fallo durante Fase 3 (DDL)
Si la migración DDL falla o se aborta antes de desplegar código:
- La transacción `BEGIN ... COMMIT` garantiza reversión automática de cambios parciales.
- No se requiere acción adicional de datos. El código antiguo sigue funcionando normalmente con `venue_id = 9999`.

### Caso B: Fallo durante Fase 4 (Despliegue de Código)
Si los contenedores nuevos no inician correctamente:
1. Revertir contenedores a la imagen previa.
2. Como los registros aún conservan `venue_id = 9999` (el DML no se ha ejecutado), el código antiguo sigue leyendo y operando con normalidad.
3. Si se desea retirar el DDL:
   ```sql
   ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_published_venue_not_null;
   ALTER TABLE events ALTER COLUMN venue_id SET NOT NULL;
   ```

### Caso C: Rollback tras Fase 5 (Post-DML)
Si se requiere volver a la versión de código previa habiendo ejecutado el DML:
1. **Auditar e inventariar eventos con local nulo**:
   ```sql
   SELECT id, title, status, created_at, source_type
   FROM events
   WHERE venue_id IS NULL;
   ```
2. **Reasignación selectiva controlada**:
   - Solo reasignar temporalmente a 9999 los eventos autorizados para la compatibilidad con el código antiguo:
     ```sql
     UPDATE events
     SET venue_id = 9999, updated_at = now()
     WHERE venue_id IS NULL AND id IN (<lista_auditada_de_ids>);
     ```
   - El venue `9999` debe existir obligatoriamente en la tabla `venues` para satisfacer la clave foránea `events_venue_id_fkey`.
3. **Verificar que no quedan registros con `venue_id IS NULL`**:
   ```sql
   SELECT COUNT(*) FROM events WHERE venue_id IS NULL;
   -- Debe retornar 0 antes de re-imponer NOT NULL
   ```
4. **Re-imponer restricciones del esquema anterior**:
   ```sql
   ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_published_venue_not_null;
   ALTER TABLE events ALTER COLUMN venue_id SET NOT NULL;
   ```
5. **Revertir contenedores de API y Web a la versión anterior**.
