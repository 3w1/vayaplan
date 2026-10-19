-- VayaPlan — Rollback de Migración 010: Reversión del Piloto de Ampliación de Agenda
--
-- ADVERTENCIA DE SEGURIDAD OPERATIVA:
-- Este script revierte las columnas e índices añadidos por la migración 010.
-- Antes de reintroducir start_time NOT NULL, verifica que no existan eventos publicados sin hora.
-- Ejecutar exclusivamente en el entorno local o de pruebas autorizado.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Precondición defensiva: verificar que no queden eventos publicados con start_time NULL
DO $$
DECLARE
  v_null_start_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_start_count
  FROM events
  WHERE start_time IS NULL AND status = 'published';

  IF v_null_start_count > 0 THEN
    RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos publicados con start_time NULL. Reasigna o despublica antes de restaurar NOT NULL.', v_null_start_count;
  END IF;
END $$;

-- 2. Eliminar índices asociados
DROP INDEX IF EXISTS idx_events_time_status;
DROP INDEX IF EXISTS idx_events_festival;
DROP INDEX IF EXISTS idx_events_date_range;

-- 3. Eliminar restricciones de integridad
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_end_date_consistency;
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_time_consistency;
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_time_status_values;
ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_festival;

-- 4. Eliminar columnas añadidas a events
ALTER TABLE events
  DROP COLUMN IF EXISTS festival_id,
  DROP COLUMN IF EXISTS approximate_schedule,
  DROP COLUMN IF EXISTS schedule_text,
  DROP COLUMN IF EXISTS end_date,
  DROP COLUMN IF EXISTS time_status;

-- 5. Eliminar tablas de relación y festivales
DROP TABLE IF EXISTS event_festivals;
DROP TABLE IF EXISTS festivals;

-- 6. Restaurar restricción NOT NULL en start_time si no hay nulos en toda la tabla
DO $$
DECLARE
  v_any_null_count INT;
BEGIN
  SELECT COUNT(*) INTO v_any_null_count
  FROM events
  WHERE start_time IS NULL;

  IF v_any_null_count = 0 THEN
    ALTER TABLE events ALTER COLUMN start_time SET NOT NULL;
  ELSE
    RAISE NOTICE 'Advertencia: Se omitió ALTER COLUMN start_time SET NOT NULL porque existen % filas en borrador con start_time NULL.', v_any_null_count;
  END IF;
END $$;

COMMIT;
