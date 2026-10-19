-- VayaPlan — Migración 009: Soporte para variantes de imagen en eventos (DDL v1.0)
-- Añade columnas image_thumb_url e image_original_url a events
-- NOTA OPERATIVA: Expansión de esquema con adquisición de bloqueo exclusivo (ACCESS EXCLUSIVE).
-- Requiere lock_timeout y statement_timeout explícitos para no encolar transacciones indefinidamente.
-- Si lock_timeout (5s) expira antes de adquirir el bloqueo de tabla, PostgreSQL aborta e informa inmediatamente.
--
-- POLÍTICA DE ROLLBACK DE DESPLIEGUE:
-- El rollback ordinario de despliegue restaura exclusivamente las imágenes anteriores de API y Web.
-- Las columnas nuevas (image_thumb_url, image_original_url) se conservan intactas en PostgreSQL,
-- ya que son NULLables y compatibles hacia atrás con las versiones anteriores del software.
-- NO ejecutar DROP COLUMN durante un rollback de despliegue.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Incorporación idempotente de columnas de variantes a events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS image_thumb_url TEXT,
  ADD COLUMN IF NOT EXISTS image_original_url TEXT;

COMMENT ON COLUMN events.image_thumb_url IS 'URL de miniatura WebP optimizada (máx. 240x240 px) para listados y agendas';
COMMENT ON COLUMN events.image_original_url IS 'Ruta o referencia interna al archivo original preservado de forma privada';

COMMIT;
