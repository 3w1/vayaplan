-- VayaPlan — Rollback Migración 021: Retención y Ciclo de Vida de Medios Efímeros (Stories)
--
-- ATENCIÓN OPERATIVA:
-- Este script realiza DROP COLUMN y DROP INDEX. Solo debe utilizarse para desmantelar
-- ordenadamente la migración en caso de rechazo del esquema, NUNCA como respuesta de emergencia
-- a incidencias en producción (la respuesta en producción es rollback de código o flag off).
-- ADVERTENCIA: La eliminación física de archivos en R2 y vaciado de captions en BD es irreversible.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Eliminar índices parciales de retención
DROP INDEX IF EXISTS idx_curation_proposals_retention;
DROP INDEX IF EXISTS idx_events_story_retention;

-- 2. Eliminar columnas añadidas en curation_proposals
ALTER TABLE curation_proposals
  DROP COLUMN IF EXISTS retention_expires_at,
  DROP COLUMN IF EXISTS media_purged_at,
  DROP COLUMN IF EXISTS media_source_provenance;

-- 3. Eliminar columnas añadidas en events
ALTER TABLE events
  DROP COLUMN IF EXISTS image_provenance,
  DROP COLUMN IF EXISTS story_retention_expires_at,
  DROP COLUMN IF EXISTS story_media_detached_at;

COMMIT;
