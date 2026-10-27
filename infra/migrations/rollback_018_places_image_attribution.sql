-- VayaPlan — Reversión Migración 018: Atribución Fotográfica en Lugares Permanentes (places)
-- ADVERTENCIA CRÍTICA:
-- La ejecución de este script elimina las columnas de atribución y DESTRUYE
-- permanentemente los metadatos de autoría y licencias almacenados en places.
-- NO ejecutar automáticamente ni como paso de reintento transitorio.
-- Requiere respaldo previo (pg_dump) y aprobación expresa antes de aplicarse en producción.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Eliminar restricción CHECK
ALTER TABLE places
  DROP CONSTRAINT IF EXISTS chk_places_image_attribution;

-- 2. Eliminar columnas de atribución
ALTER TABLE places
  DROP COLUMN IF EXISTS image_author,
  DROP COLUMN IF EXISTS image_source_url,
  DROP COLUMN IF EXISTS image_license,
  DROP COLUMN IF EXISTS image_license_url,
  DROP COLUMN IF EXISTS image_modifications;

COMMIT;
