# Procedimiento Operativo: Soporte de Atribución y Procedencia de Imágenes en Eventos (events)

Este documento detalla la secuencia operativa paso a paso para desplegar en producción el soporte de créditos, autoría y procedencia de imágenes en la tabla `events`, permitiendo mostrar enlaces y atribuciones legales en la web pública (detalle de evento y visor de cartel completo).

---

## 1. Alcance, Precondiciones y Salvaguardas

### 1.1 Alcance
- Aplicar la migración DDL `infra/migrations/020_events_image_attribution.sql` sobre PostgreSQL.
- Instalar 5 columnas opcionales en `events`: `image_source_url`, `image_source_title`, `image_author`, `image_license`, `image_license_url`.
- Desplegar las versiones actualizadas de `api` y `web` con soporte de serialización y renderizado accesible.
- Habilitar la visibilidad de procedencia:
  - Sin autor: `"Imagen: web del Teatro Principal de Palencia"` enlazada a la ficha oficial concreta del espectáculo.
  - Con autor: `"Foto: [autor]. Fuente: Teatro Principal de Palencia."` enlazada a la fuente oficial.

### 1.2 Salvaguardas de Concurrencia y Timeouts
- **Sin credenciales en texto plano**: Toda invocación de `psql` debe usar variables de entorno del sistema (`PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`) o `$DATABASE_URL`.
- **Aborto estricto**: Usar siempre `psql -v ON_ERROR_STOP=1`.
- **Bloqueo `ACCESS EXCLUSIVE`**: La adición de columnas NULL sin valor por defecto (`DEFAULT`) en PostgreSQL 11+ actualiza exclusivamente los catálogos del sistema sin reescribir la tabla física (`events`). La duración esperada es menor a 20 ms.
- **Timeouts obligatorios**:
  - `SET lock_timeout = '5s'`: Si existe contención por lecturas o transacciones bloqueantes, PostgreSQL aborta en 5 segundos sin encolar peticiones indefinidamente.
  - `SET statement_timeout = '15s'`: Previene bloqueos residuales prolongados.
- **Punto de parada por timeout**: Si la migración falla por timeout, **DETENERSE INMEDIATAMENTE**. No ejecutar bucles de reintento a ciegas ni incrementar los timeouts sin autorización técnica expresa.

---

## 2. Secuencia Operativa de Despliegue

### Fase 1: Respaldo Pre-migración y Verificación
1. **Definir archivo de backup**:
   ```bash
   BACKUP_FILE="backups/backup_events_pre_migration020_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Generar respaldo lógico de la tabla `events`**:
   ```bash
   pg_dump -Fc -f "$BACKUP_FILE" -t events
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
   psql -v ON_ERROR_STOP=1 -f infra/migrations/020_events_image_attribution.sql
   ```
2. **Verificar la instalación de columnas**:
   ```sql
   SELECT column_name, data_type, character_maximum_length, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'events'
     AND column_name IN (
       'image_source_url', 'image_source_title', 'image_author',
       'image_license', 'image_license_url'
     )
   ORDER BY column_name;
   ```
3. **Comprobar la integridad de los eventos existentes**:
   ```sql
   -- Ningún evento existente debe sufrir alteraciones en título, fecha, hora ni estado
   SELECT id, title, editorial_date, status, image_url, image_source_url
   FROM events
   WHERE id IN (96, 97, 98, 99, 100, 101, 102, 103)
   ORDER BY id;
   ```

### Fase 3: Despliegue de Código (API y Web)
1. Desplegar los contenedores actualizados de `api` y `web`.
2. Verificar salud (`healthcheck`):
   ```bash
   curl -fsS http://localhost:4000/health || echo "API no saludable"
   curl -fsS -I http://localhost:3030/ || echo "Web no responde"
   ```

### Fase 4: Asignación de Metadatos de Procedencia a los Eventos del Teatro Principal
Una vez aplicada la migración y desplegado el código, actualizar los 8 eventos con sus datos de procedencia:
```sql
UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/el-paraiso-de-los-negros-29-10',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 96;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/urban-simphony',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 97;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/festival-internacional-de-guitarra-roberto-fabbri-y-fabio-macera',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 98;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/festival-internacional-de-guitarra-trio-1-y-carles-pons',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 99;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/festival-internacional-de-guitarra-christian-lavernier-y-dilene-ferraz',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 100;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/flamenc-oh-',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 101;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/concierto-banda-municipal-20-dic-26',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 102;

UPDATE events SET 
  image_source_url = 'https://teatroprincipaldepalencia.es/es/productos/descripcion/jirafa',
  image_source_title = 'web del Teatro Principal de Palencia'
WHERE id = 103;
```

---

## 3. Plan de Contingencia y Rollback

Si surge cualquier anomalía durante el despliegue:

### 3.1 Rollback de Código
Revertir los contenedores `api` y `web` a la versión previa inmutable. Gracias a las salvaguardas de fallback graceful (`hasEventAttributionColumns`), el código anterior tolera tanto la presencia como la ausencia de las nuevas columnas.

### 3.2 Rollback de Migración DDL
Ejecutar el script de rollback idempotente:
```bash
psql -v ON_ERROR_STOP=1 -f infra/migrations/rollback_020_events_image_attribution.sql
```

Verificar la eliminación de columnas:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name IN (
    'image_source_url', 'image_source_title', 'image_author',
    'image_license', 'image_license_url'
  );
```
La consulta debe devolver 0 filas.
