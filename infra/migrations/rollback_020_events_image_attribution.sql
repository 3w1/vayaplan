-- VayaPlan — Rollback Migración 020: Atribución y Procedencia de Imágenes en Eventos (events)

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

ALTER TABLE events
  DROP COLUMN IF EXISTS image_source_url,
  DROP COLUMN IF EXISTS image_source_title,
  DROP COLUMN IF EXISTS image_author,
  DROP COLUMN IF EXISTS image_license,
  DROP COLUMN IF EXISTS image_license_url;

COMMIT;
