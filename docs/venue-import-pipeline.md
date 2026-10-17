# Pipeline de Importación de Establecimientos (Apify → VayaPlan)

Este pipeline permite procesar archivos JSON descargados desde Apify (Google Maps Scraper), validarlos, normalizarlos, deduplicarlos, contrastarlos contra el censo de locales y persistir las altas aprobadas de forma atómica e idempotente.

---

## 1. Instalación Previa de la Migración

El pipeline requiere las tablas de correspondencia y auditoría de la migración `infra/migrations/006_venue_import_pipeline.sql`:
- `venue_import_batches`: registro de lotes aplicados/revertidos, hashes y snapshots.
- `venue_external_ids`: correspondencia `(provider, external_id) -> venue_id` con restricción única `UNIQUE(provider, external_id)`.

Para aplicar la migración en un entorno de pruebas autorizado:
```bash
docker exec -i vayaplan_postgres psql -U vayaplan_user -d <nombre_bd_test> < infra/migrations/006_venue_import_pipeline.sql
```
> **Nota de seguridad:** La migración no altera columnas ni contratos existentes de la tabla `venues`. No ejecutar en producción sin autorización explícita.

---

## 2. Variables de Conexión y Precedencia

Para prevenir cualquier conexión accidental a bases de datos productivas, el CLI no posee conexión ni base de datos por defecto.

Precedencia de configuración:
1. Parámetro de línea de comandos: `--db-url <url>`
2. Variable de entorno específica: `VENUE_IMPORT_DATABASE_URL`

Si ambos faltan:
- `prepare`: opera en modo sin conexión (clasificando candidatos no contrastados como `PENDIENTE_COMPARACION`).
- `apply` y `rollback`: rechazan la ejecución de forma inmediata antes de crear conexiones o pools.

Todas las URLs de conexión son redactadas automáticamente (`postgresql://usuario:***@host:puerto/bd`) en logs y mensajes de salida.

---

## 3. Flujo de Trabajo y Comandos

### A. Preparación (`prepare`)
Lee el archivo JSON bruto, deduplica por `placeId`, absorbe versiones parciales conservando la más rica, contrasta con el censo de la base de datos (si se proporciona conexión) y genera el manifiesto de revisión:

```bash
bun run apps/api/src/scripts/venue-import.ts prepare \
  --input ruta/al/dataset.json \
  --city palencia \
  --output-dir docs/import-review \
  --db-url postgresql://usuario:clave@host:5432/bd_sintetica
```

Genera en el directorio de salida:
- `manifest.json`: Manifiesto estructurado para revisión y aprobación.
- `manifest.csv`: Exportación tabular para revisión humana.
- `manifest.md`: Resumen ejecutivo y conteos de clasificación.

### B. Revisión y Aprobación del Manifiesto
Por defecto, todos los candidatos se generan con `approved: false`.
- **Regla estricta:** Solo se pueden aprobar candidatos clasificados como `POSIBLE_ALTA`.
- Estados no importables: `FUERA_DE_AMBITO`, `REVISAR_COINCIDENCIA`, `DATOS_INSUFICIENTES`, `PENDIENTE_COMPARACION` y `YA_EXISTENTE`. Si un operador marca `approved: true` en cualquiera de ellos, `apply` abortará el lote completo.

Para aprobar candidatos, editar el archivo `manifest.json` y marcar `"approved": true` únicamente en los registros `POSIBLE_ALTA` validados.

### C. Simulación (`dry-run`)
Antes de persistir cambios, ejecutar `apply` sin el flag `--apply`. Valida restricciones, dependencias y simula la transacción sin escribir:

```bash
bun run apps/api/src/scripts/venue-import.ts apply \
  --manifest docs/import-review/manifest.json \
  --db-url postgresql://usuario:clave@host:5432/bd_sintetica
```

### D. Aplicación Definitiva (`apply --apply`)
Aplica atómicamente el lote aprobado dentro de una única transacción:
1. Adquiere bloqueo consultivo transaccional por ciudad (`pg_try_advisory_xact_lock`), impidiendo carreras entre lotes distintos.
2. Revalida que el hash del archivo no haya sido importado previamente (`status = 'applied'`).
3. Revalida contra la BD que ningún `placeId`, `slug` o nombre colisione con el censo.
4. Inserta registros en `venues`, asigna correspondencias en `venue_external_ids` y registra el lote en `venue_import_batches`.

```bash
bun run apps/api/src/scripts/venue-import.ts apply \
  --manifest docs/import-review/manifest.json \
  --apply \
  --db-url postgresql://usuario:clave@host:5432/bd_sintetica
```

### E. Reversión Segura (`rollback`)
Permite deshacer un lote aplicado de forma transaccional y limpia:
- Por defecto ejecuta simulación (`dry-run`).
- Con `--rollback`, comprueba que ningún local del lote tenga dependencias posteriores (`events`, `promotions`, `recurrences`, `places`) ni haya sido modificado manualmente tras la importación.
- Si existen dependencias, bloquea el borrado (`BLOCKED`) sin recurrir a `CASCADE` ni desactivación silenciosa.

```bash
# Simulación de rollback
bun run apps/api/src/scripts/venue-import.ts rollback \
  --batch-uuid <uuid-del-lote> \
  --db-url postgresql://usuario:clave@host:5432/bd_sintetica

# Ejecución de rollback
bun run apps/api/src/scripts/venue-import.ts rollback \
  --batch-uuid <uuid-del-lote> \
  --rollback \
  --reason "Reversión autorizada" \
  --db-url postgresql://usuario:clave@host:5432/bd_sintetica
```

---

## 4. Tratamiento de Teléfono y Privacidad de WhatsApp

- Los teléfonos obtenidos de Google Maps alimentan exclusivamente el campo de contacto general `venues.phone`.
- El campo `venues.whatsapp_contact` se fija estrictamente a `NULL` para todas las nuevas altas.
- El pipeline no asume que un teléfono fijo o móvil admita mensajería WhatsApp ni genera enlaces públicos de contacto.

---

## 5. Limitaciones de Clasificación

- **Identificación geográfica:** La asignación de zona es heurística; si la dirección no encaja claramente en los sectores centrales conocidos, se asigna `otros` o `null`.
- **Categorías Google:** Mapea directamente a las categorías soportadas por VayaPlan (`bar`, `discoteca`, `pub`, `teatro`, `cine`). Categorías generales de restaurante o no hosteleras se asignan a `general`.
- **Ambigüedades intralote:** Negocios que comparten número/portal físico o presentan marcas idénticas en la misma calle se marcan como `REVISAR_COINCIDENCIA` y requieren validación humana antes de autorizar su alta.

---

## 6. Prohibición de Publicar Datos Sensibles

- Queda estrictamente prohibido versionar en Git archivos JSON de datasets brutos, manifiestos generados (`manifest.json`, `manifest.csv`) o cualquier reporte que contenga números de teléfono reales o identificadores personales.
- Los archivos en `docs/import-review/` y datasets en `docs/dataset_*.json` son entregables locales de auditoría operativa y deben permanecer fuera del control de versiones.

---

## 7. Ejecución de la Suite de Pruebas

Para ejecutar la suite de integración (21 escenarios, 69 aserciones sintéticas):

```bash
VENUE_IMPORT_TEST_DB_URL=postgresql://usuario:clave@host:5432/bd_sintetica \
bun run apps/api/src/services/venue-import/venue-import.test.ts
```

> **Requisitos y alcance:**
> - Requiere conexión explícita a una base de datos sintética dedicada.
> - La comprobación de nombre (`test` o `synthetic` en el path de la URL) es una salvaguarda adicional preventiva frente a errores accidentales, no una garantía absoluta de aislamiento de red.
> - La suite ejecuta inserciones sintéticas, pruebas de colisión, asociación de eventos temporales y reversiones transaccionales, limpiando exclusivamente los registros de prueba generados sin modificar el censo preexistente.
