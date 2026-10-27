-- VayaPlan — Migración 018: Atribución Fotográfica en Lugares Permanentes (places)
-- Añade columnas para autor, fuente original, licencia, enlace de licencia y modificaciones.
-- Añade restricción CHECK para garantizar integridad atómica:
--   - O bien no hay atribución (todas las columnas de atribución en NULL, permitiendo fotos CC0 o propias).
--   - O bien hay atribución completa: image_url no vacía, autor, fuente, licencia y url de licencia obligatorios.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Añadir columnas de atribución fotográfica a la tabla places
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS image_author VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS image_source_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS image_license VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS image_license_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS image_modifications VARCHAR(255) NULL;

-- 2. Restricción CHECK de integridad atómica de atribución
ALTER TABLE places
  DROP CONSTRAINT IF EXISTS chk_places_image_attribution;

ALTER TABLE places
  ADD CONSTRAINT chk_places_image_attribution CHECK (
    -- Caso A: Sin atribución (todas las columnas de atribución en NULL)
    (
      image_author IS NULL AND
      image_source_url IS NULL AND
      image_license IS NULL AND
      image_license_url IS NULL AND
      image_modifications IS NULL
    )
    OR
    -- Caso B: Atribución completa (image_url no vacía + autor, fuente, licencia y URL de licencia obligatorios)
    (
      image_url IS NOT NULL AND length(trim(image_url)) > 0 AND
      image_author IS NOT NULL AND length(trim(image_author)) > 0 AND
      image_source_url IS NOT NULL AND length(trim(image_source_url)) > 0 AND
      image_license IS NOT NULL AND length(trim(image_license)) > 0 AND
      image_license_url IS NOT NULL AND length(trim(image_license_url)) > 0
    )
  );

COMMIT;
