# Procedimiento Operativo: Soporte de Atribución Fotográfica en Lugares Permanentes (places)

Este documento detalla la secuencia operativa paso a paso para desplegar en producción el soporte de créditos y licencias fotográficas en la tabla `places`, permitiendo la reutilización conforme a la ley de fotografías protegidas por licencias como Creative Commons (ej. CC BY 4.0).

---

## 1. Alcance, Precondiciones y Salvaguardas

### 1.1 Alcance
- Aplicar la migración DDL `infra/migrations/018_places_image_attribution.sql` sobre PostgreSQL.
- Instalar 5 columnas opcionales en `places`: `image_author`, `image_source_url`, `image_license`, `image_license_url`, `image_modifications`.
- Instalar la restricción `CHECK chk_places_image_attribution` que asegura consistencia atómica: o bien todas las columnas de atribución son `NULL`, o bien `image_url`, `image_author`, `image_source_url`, `image_license` y `image_license_url` están presentes y no vacías.
- Desplegar las versiones correspondientes de `api` y `web`.

### 1.2 Salvaguardas de Concurrencia y Timeouts
- **Sin credenciales en texto plano**: Toda invocación de `psql` debe usar variables de entorno del sistema (`PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`) o `$DATABASE_URL`.
- **Aborto estricto**: Usar siempre `psql -v ON_ERROR_STOP=1`.
- **Bloqueo `ACCESS EXCLUSIVE`**: La adición de columnas y restricciones CHECK en PostgreSQL adquiere un bloqueo `ACCESS EXCLUSIVE` sobre la tabla `places`. Al tratarse de columnas `NULL` sin valores por defecto (`DEFAULT`) y una tabla con pocas filas, la adquisición y ejecución duran menos de 50 milisegundos.
- **Timeouts del proyecto**:
  - `SET lock_timeout = '5s'`: Si existe contención por lecturas o transacciones bloqueantes, PostgreSQL aborta en 5 segundos sin encolar peticiones indefinidamente.
  - `SET statement_timeout = '15s'`: Previene bloqueos residuales prolongados.
- **Punto de parada por timeout**: Si la migración falla por timeout, **DETENERSE INMEDIATAMENTE**. No ejecutar bucles de reintento a ciegas ni incrementar los timeouts sin autorización técnica expresa.

---

## 2. Secuencia Operativa de Despliegue

### Fase 1: Respaldo Pre-migración y Verificación
1. **Definir archivo de backup**:
   ```bash
   BACKUP_FILE="backup_pre_migration018_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Generar respaldo lógico de la tabla `places`**:
   ```bash
   pg_dump -Fc -f "$BACKUP_FILE" -t places
   ```
3. **Verificar que el archivo existe y no está vacío**:
   ```bash
   test -s "$BACKUP_FILE" || { echo "ERROR: Respaldo fallido"; exit 1; }
   sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
   cat "${BACKUP_FILE}.sha256"
   ```

### Fase 2: Aplicación de la Migración DDL
1. **Ejecutar el script SQL de migración**:
   ```bash
   psql -v ON_ERROR_STOP=1 -f infra/migrations/018_places_image_attribution.sql
   ```
2. **Verificar la instalación de columnas y la restricción**:
   ```sql
   -- Verificar columnas instaladas
   SELECT column_name, data_type, character_maximum_length, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'places'
     AND column_name IN (
       'image_author', 'image_source_url', 'image_license',
       'image_license_url', 'image_modifications'
     )
   ORDER BY column_name;

   -- Verificar restricción CHECK
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname = 'chk_places_image_attribution';
   ```
3. **Comprobar la integridad de los lugares existentes**:
   ```sql
   -- Ningún lugar existente debe verse alterado ni violar la restricción
   SELECT id, name, slug, image_url, image_author, image_license
   FROM places
   ORDER BY id;
   ```
   *Punto de parada*: Cine Ortega (`id = 1`) y Museo de Palencia (`id = 2`) deben conservar sus estados intactos (Cine Ortega con su imagen y atribución `NULL`; Museo de Palencia con `image_url` en `NULL`).

### Fase 3: Despliegue de Código (API y Web)
1. Desplegar los contenedores actualizados de `api` y `web`.
2. Verificar salud (`healthcheck`):
   ```bash
   curl -fsS https://api.vayaplan.com/health || echo "API no saludable"
   curl -fsS -I https://vayaplan.com/ || echo "Web no responde"
   ```
3. Validar endpoints públicos de lugares:
   ```bash
   curl -fsS https://api.vayaplan.com/api/v1/cities/palencia/places | jq .
   ```
   Debe responder 200 OK con la propiedad `image_attribution: null` en los lugares que no tienen créditos registrados.

### Fase 4: Asignación Controlada de Fotografía con Atribución (Fase Posterior Autorizada)
Cuando se disponga de la autorización para subir la imagen a Cloudflare R2 y actualizar el registro del Museo de Palencia (`places.id = 2`), ejecutar la mutación vía Admin API o mediante transacción SQL auditada:
```sql
BEGIN;

UPDATE places
SET
  venue_id = 10150,
  image_url = 'https://cdn.vayaplan.com/places/palencia-museo-de-palencia.webp',
  image_author = 'Pedro Hernando',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Palencia_-_Casa_del_Cord%C3%B3n_1.jpg',
  image_license = 'CC BY 4.0',
  image_license_url = 'https://creativecommons.org/licenses/by/4.0/',
  image_modifications = 'Conversión a formato WebP',
  updated_at = NOW()
WHERE id = 2 AND name = 'Museo de Palencia';

COMMIT;
```
Purgar la caché CDN de Cloudflare para `/api/v1/cities/palencia/places`, `/api/v1/cities/palencia/events*` y `/api/v1/cities/palencia/weekend`.

---

## 3. Plan de Contingencia y Rollback

### Escenario A: Reversión de Aplicación ANTES de Publicar Imágenes con Atribución
- **Situación**: Se detecta un fallo imprevisto en la API o el frontend tras el despliegue del código, pero todavía no se ha registrado ninguna imagen que requiera atribución (todas las columnas de atribución en `places` están en `NULL`).
- **Acción**:
  1. Revertir los contenedores de `api` y `web` a la versión operativa anterior.
  2. **NO ejecutar la reversión DDL de la base de datos**.
  3. Las nuevas columnas con valores `NULL` no interfieren con la versión anterior de la aplicación ni causan errores de sintaxis en consultas `SELECT` o `UPDATE` preexistentes.

### Escenario B: Incidencia con Imágenes con Atribución YA Publicadas
- **Situación**: Se detecta una incidencia grave tras haber publicado la imagen del Museo de Palencia con su atribución legal (ej. CC BY 4.0).
- **ADVERTENCIA LEGAL CRÍTICA**:
  NUNCA se debe revertir el frontend o la API a una versión antigua manteniendo la imagen visible sin sus créditos, ya que se incurriría en infracción de los términos de la licencia de autor (CC BY 4.0 exige atribución pública adecuada).
- **Acción Inmediata (Mitigación Legal y Funcional sin Pérdida de Datos)**:
  1. Retirar la imagen de la superficie pública preservando los metadatos o desactivando el lugar:
     ```sql
     -- Opción 1: Retirar la imagen temporalmente (la restricción CHECK exige limpiar atribución al poner imagen en null)
     UPDATE places
     SET
       image_url = NULL,
       image_author = NULL,
       image_source_url = NULL,
       image_license = NULL,
       image_license_url = NULL,
       image_modifications = NULL
     WHERE id = 2;

     -- O bien Opción 2: Ocultar temporalmente el lugar de la agenda pública
     UPDATE places SET is_active = false WHERE id = 2;
     ```
  2. Purgar las cachés CDN de las rutas públicas.
  3. Una vez retirada la imagen o el lugar de la vista pública, proceder a la reversión del código de la aplicación de forma segura.

### Escenario C: Reversión DDL Destructiva (`rollback_018_places_image_attribution.sql`)
- **ADVERTENCIA**: Este procedimiento elimina físicamente las 5 columnas y la restricción CHECK. Cualquier metadato de autoría almacenado en `places` se destruirá irremediablemente.
- **Requisitos de Ejecución**:
  - Exclusivamente para entornos de test, desarrollo o tras una decisión formal de desmantelamiento con respaldo verificado.
  - Prohibido en producción sin autorización explícita.
- **Comando**:
  ```bash
  psql -v ON_ERROR_STOP=1 -f infra/migrations/rollback_018_places_image_attribution.sql
  ```
