-- VayaPlan — Migración 020: Atribución y Procedencia de Imágenes en Eventos (events)
-- Añade columnas para trazabilidad, créditos de autoría y enlaces de procedencia de imágenes en eventos.
-- Columnas añadidas:
--   - image_source_url TEXT NULL: URL de la ficha oficial o página de procedencia de la imagen
--   - image_source_title VARCHAR(150) NULL: Nombre descriptivo de la fuente (ej. "web del Teatro Principal de Palencia")
--   - image_author VARCHAR(150) NULL: Nombre del fotógrafo o autor si consta en la fuente
--   - image_license VARCHAR(50) NULL: Licencia formal si aplica (ej. "CC BY-SA 4.0")
--   - image_license_url TEXT NULL: Enlace a los términos de la licencia
--
-- NOTA OPERATIVA DE CONCURRENCIA Y BLOQUEOS:
-- ALTER TABLE requiere bloqueo ACCESS EXCLUSIVE sobre la tabla 'events'. Al ser columnas NULL sin DEFAULT,
-- Postgres 11+ actualiza solo el catálogo de metadatos sin reescribir la tabla (<20ms).
-- Sin embargo, si existe contención concurrente o transacciones largas abiertas:
--   - lock_timeout = 5s abortará la espera antes de degradar el servicio.
--   - statement_timeout = 15s previene bloqueos residuales prolongados.
-- Si la migración falla por timeout: DETENERSE INMEDIATAMENTE. No reintentar en bucle sin autorización.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Añadir columnas de atribución y procedencia de imagen a la tabla events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS image_source_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS image_source_title VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS image_author VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS image_license VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS image_license_url TEXT NULL;

COMMIT;
