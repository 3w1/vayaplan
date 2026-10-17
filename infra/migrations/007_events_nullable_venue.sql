-- VayaPlan — Migración 007: Desacoplamiento de Venue Ficticio 9999 (DDL v1.0)
-- Permite venue_id NULL en events para borradores/pendientes de asignación
-- Garantiza que ningún evento publicado pueda carecer de local censado
-- NOTA OPERATIVA: Este archivo contiene EXCLUSIVAMENTE DDL de expansión de esquema.
-- El DML de transición de referencias 9999 -> NULL se ejecuta por separado tras el despliegue de código.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. PRECONDICIÓN ESTRICTA: Abortar si existe algún evento publicado asociado al venue 9999
DO $$
DECLARE
  v_published_9999_count INT;
BEGIN
  SELECT COUNT(*) INTO v_published_9999_count
  FROM events
  WHERE venue_id = 9999 AND status = 'published';

  IF v_published_9999_count > 0 THEN
    RAISE EXCEPTION 'Migración 007 abortada: Se encontraron % evento(s) publicado(s) asociados al venue provisional 9999. No se alteran ni despublican automáticamente.', v_published_9999_count;
  END IF;
END $$;

-- 2. Permisividad de NULL en events.venue_id
-- Conserva la clave foránea 'events_venue_id_fkey' y 'ON DELETE RESTRICT' para valores no nulos
ALTER TABLE events ALTER COLUMN venue_id DROP NOT NULL;

-- 3. Restricción de Integridad de Negocio: Prohibido publicar sin local asignado
-- Se valida que status no sea NULL para impedir elusiones de la regla
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_published_venue_not_null'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT chk_events_published_venue_not_null
      CHECK (
        status IS NOT NULL
        AND (status != 'published' OR venue_id IS NOT NULL)
      );
  END IF;
END $$;

COMMIT;
