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
- **Procedimiento Válido de Retirada Temporal Preservando Metadatos**:
  Desactivar temporalmente el registro del lugar en la base de datos:
  ```sql
  UPDATE places
  SET
    is_active = false,
    updated_at = NOW()
  WHERE id = 2 AND name = 'Museo de Palencia';
  ```
  *(NOTA: NUNCA ejecutar `UPDATE places SET image_url = NULL` conservando la atribución, ya que violaría la restricción `chk_places_image_attribution`. Tampoco se deben borrar las columnas de créditos, pues destruiría el trabajo de catalogación y metadatos verificados).*

- **Confirmación de Exclusión en Todas las Superficies Públicas**:
  Se ha auditado el código de la API y confirmado que los tres endpoints públicos filtran estrictamente por lugares activos:
  1. `GET /api/v1/cities/:citySlug/places` (`WHERE p.city_id = $1 AND p.is_active = true`).
  2. `GET /api/v1/cities/:citySlug/events` (`WHERE p.city_id = $1 AND p.is_active = true`).
  3. `GET /api/v1/cities/:citySlug/weekend` (`WHERE p.city_id = $1 AND p.is_active = true`).
  No existen rutas públicas individuales para lugares ni renderizados estáticos desvinculados de estos endpoints. Por consiguiente, `is_active = false` garantiza al 100% la retirada inmediata del lugar de todas las superficies de la plataforma.

- **Cachés Específicas a Purgar (Prohibición de Purga Global)**:
  NUNCA ejecutar una purga global ("Purge Everything") en Cloudflare, ya que expulsaría activos estáticos y saturaría el origen. Purgar exclusivamente las URLs concretas:
  1. **Rutas de API en Cloudflare CDN**:
     - `https://api.vayaplan.com/api/v1/cities/palencia/places`
     - `https://api.vayaplan.com/api/v1/cities/palencia/events*`
     - `https://api.vayaplan.com/api/v1/cities/palencia/weekend`
  2. **Página Web Pública**:
     - `https://vayaplan.com/`
  3. **Acceso Directo al Archivo en CDN (si se requiere retirar el binario de la imagen)**:
     - Purgar la URL puntual en Cloudflare: `https://cdn.vayaplan.com/places/palencia-museo-de-palencia.webp`
     - Opcionalmente, renombrar o mover temporalmente el objeto en el bucket Cloudflare R2 si se precisa indisponibilidad inmediata absoluta.
  4. **Caché Local de Navegadores**:
     - Expira de forma autónoma conforme a los encabezados `Cache-Control` de corta duración configurados en la API.

- **Reversión Posterior de Código**:
  Una vez confirmado que el lugar inactivo ya no se sirve en las superficies públicas y purgadas las URLs afectadas, se puede proceder a la reversión del contenedor de API o Web con total seguridad jurídica y funcional.

### Escenario C: Reversión DDL Destructiva (`rollback_018_places_image_attribution.sql`)
- **ADVERTENCIA**: Este procedimiento elimina físicamente las 5 columnas y la restricción CHECK. Cualquier metadato de autoría almacenado en `places` se destruirá irremediablemente.
- **Requisitos de Ejecución**:
  - Exclusivamente para entornos de test, desarrollo o tras una decisión formal de desmantelamiento con respaldo verificado.
  - Prohibido en producción sin autorización explícita.
- **Comando**:
  ```bash
  psql -v ON_ERROR_STOP=1 -f infra/migrations/rollback_018_places_image_attribution.sql
  ```
