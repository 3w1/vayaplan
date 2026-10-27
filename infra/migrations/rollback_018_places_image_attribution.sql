-- VayaPlan — Reversión Migración 018: Atribución Fotográfica en Lugares Permanentes (places)
-- ADVERTENCIA CRÍTICA:
-- Este script es de uso exclusivo en entornos locales, desarrollo o pruebas DDL.
-- En producción, el rollback destructivo (DROP COLUMN) DESTRUYE de forma permanente
-- los metadatos de autoría y licencias almacenados y NO ESTÁ AUTORIZADO sin respaldo y aprobación expresa.
--
-- ESCENARIOS OPERATIVOS DE CONTINGENCIA / ROLLBACK:
--
-- Escenario A (Rollback de aplicación antes de publicar imágenes con atribución):
--   Si se requiere revertir el código de la aplicación (API / Web) a una versión anterior
--   y la migración ya se aplicó en la base de datos, NO es necesario ejecutar este script SQL.
--   Las columnas en places son NULL y el código anterior simplemente ignora las nuevas columnas
--   sin generar errores en queries existentes.
--
-- Escenario B (Incidencia después de haber publicado una imagen con atribución):
--   Si la aplicación sufre una regresión pero ya existe en base de datos una imagen cuya licencia
--   exige atribución legal pública:
--   NUNCA revertir la aplicación dejando la imagen publicada sin mostrar sus créditos, ya que violaría
--   los términos legales de la licencia (ej. CC BY 4.0).
--   En su lugar:
--     1. Retirar inmediatamente la imagen del lugar mediante UPDATE places SET image_url = NULL WHERE id = <id>;
--        o desactivar temporalmente el lugar (is_active = false) de las superficies públicas.
--     2. Purgar las cachés CDN de la API y de las páginas públicas afectadas.
--     3. Los metadatos de atribución pueden conservarse para cuando se restablezca el servicio.
--
-- Si tras análisis de emergencia se decide revertir el esquema DDL completamente (destructivo):
--   - lock_timeout = 5s abortará si hay transacciones concurrentes sobre 'places'.
--   - statement_timeout = 15s previene bloqueos residuales prolongados.
--   - Si falla por timeout: DETENERSE. No reintentar a ciegas ni forzar bloqueos.

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
