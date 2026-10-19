-- VayaPlan — Rollback de Migración 010: Reversión del Piloto de Ampliación de Agenda (v2.0)
--
-- ADVERTENCIA DE SEGURIDAD OPERATIVA:
-- Este script revierte las columnas e índices añadidos por la migración 010.
-- Antes de eliminar estructuras o reintroducir start_time NOT NULL, verifica que no se pierdan datos.
-- Si existen festivales, relaciones o eventos con start_time NULL, ABORTA la operación.
-- Ejecutar exclusivamente en el entorno local o de pruebas autorizado.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Precondiciones defensivas: verificar ausencia de datos que se perderían
DO $$
DECLARE
  v_festivals_count INT;
  v_associations_count INT;
  v_null_start_count INT;
  v_continuous_count INT;
BEGIN
  -- Comprobar si existen festivales cargados
  SELECT COUNT(*) INTO v_festivals_count FROM festivals;
  IF v_festivals_count > 0 THEN
    RAISE EXCEPTION 'Rollback 010 abortado: Existen % festivales registrados en festivals. La reversión causaría pérdida irreparable de datos.', v_festivals_count;
  END IF;

  -- Comprobar si existen relaciones cargadas
  SELECT COUNT(*) INTO v_associations_count FROM event_festivals;
  IF v_associations_count > 0 THEN
    RAISE EXCEPTION 'Rollback 010 abortado: Existen % relaciones registradas en event_festivals. La reversión causaría pérdida irreparable de datos.', v_associations_count;
  END IF;

  -- Comprobar si existen eventos con start_time NULL (horario pendiente o exposiciones)
  SELECT COUNT(*) INTO v_null_start_count FROM events WHERE start_time IS NULL;
  IF v_null_start_count > 0 THEN
    RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos con start_time NULL. Restaurar NOT NULL fallaría y causaría inconsistencia.', v_null_start_count;
  END IF;

  -- Comprobar si existen eventos con time_status no confirmed
  SELECT COUNT(*) INTO v_continuous_count FROM events WHERE time_status != 'confirmed';
  IF v_continuous_count > 0 THEN
    RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos con time_status != ''confirmed''.', v_continuous_count;
  END IF;

  -- Comprobar si existen eventos con end_date informado
  DECLARE
    v_end_date_count INT;
    v_schedule_text_count INT;
    v_approx_sched_count INT;
    v_new_cat_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_end_date_count FROM events WHERE end_date IS NOT NULL;
    IF v_end_date_count > 0 THEN
      RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos con end_date informado. La eliminación de la columna causaría pérdida de datos.', v_end_date_count;
    END IF;

    SELECT COUNT(*) INTO v_schedule_text_count FROM events WHERE schedule_text IS NOT NULL;
    IF v_schedule_text_count > 0 THEN
      RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos con schedule_text informado. La eliminación de la columna causaría pérdida de datos.', v_schedule_text_count;
    END IF;

    SELECT COUNT(*) INTO v_approx_sched_count FROM events WHERE approximate_schedule IS NOT NULL;
    IF v_approx_sched_count > 0 THEN
      RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos con approximate_schedule informado. La eliminación de la columna causaría pérdida de datos.', v_approx_sched_count;
    END IF;

    -- Comprobar categorías no representables en el esquema base (pre-010)
    SELECT COUNT(*) INTO v_new_cat_count FROM events
    WHERE category NOT IN ('musica_directo', 'dj_tardeo', 'monologo', 'cine', 'teatro', 'exposicion', 'cultura');
    IF v_new_cat_count > 0 THEN
      RAISE EXCEPTION 'Rollback 010 abortado: Existen % eventos con categorías nuevas (baloncesto, futbol, rugby, conferencia) no soportadas en el esquema base.', v_new_cat_count;
    END IF;
  END;
END $$;

-- 2. Eliminar índices asociados
DROP INDEX IF EXISTS idx_event_festivals_festival;
DROP INDEX IF EXISTS idx_events_time_status;
DROP INDEX IF EXISTS idx_events_festival;
DROP INDEX IF EXISTS idx_events_date_range;

-- 3. Eliminar restricciones de integridad
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_end_date_consistency;
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_tentative_date_publication;
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

-- 6. Restaurar restricción NOT NULL en start_time
ALTER TABLE events ALTER COLUMN start_time SET NOT NULL;

COMMIT;
