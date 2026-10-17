-- VayaPlan — Script de Transición DML: Disociación de Venue Ficticio 9999 (v1.2)
-- ORDEN OPERATIVO: Ejecutar EXCLUSIVAMENTE tras el despliegue y verificación de salud de API y Web.
-- Transiciona eventos en estados no publicados (tentative, cancelled, etc.) de venue_id = 9999 a NULL.
-- Modifica únicamente events.venue_id. NO altera IDs, estados, fechas, created_at ni updated_at.
-- NO elimina el registro del venue 9999.
--
-- REQUISITOS OPERATIVOS Y DE SEGURIDAD:
-- - Permisos: Propietario de la tabla 'events' o superusuario (requerido para ALTER TABLE ... TRIGGER).
-- - Bloqueos: ALTER TABLE toma un bloqueo ACCESS EXCLUSIVE sobre 'events' acotado por lock_timeout (5s).
-- - Alcance acotado: Afecta única y exclusivamente a 'trg_events_updated_at'. NO se emplea DISABLE TRIGGER ALL,
--   DISABLE TRIGGER USER ni session_replication_role. Claves foráneas y demás restricciones permanecen activas.
-- - Atomicidad: Precondiciones, desactivación temporal, UPDATE, reactivación y comprobaciones ocurren
--   dentro de la misma transacción (BEGIN ... COMMIT). Un fallo revierte datos y estado del trigger automáticamente.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. PRECONDICIONES ESTRICTAS:
-- a) Verificar existencia y estado inicial normal/habilitado de trg_events_updated_at
DO $$
DECLARE
  v_tgenabled "char";
BEGIN
  SELECT tgenabled INTO v_tgenabled
  FROM pg_trigger
  WHERE tgname = 'trg_events_updated_at' AND tgrelid = 'events'::regclass;

  IF v_tgenabled IS NULL THEN
    RAISE EXCEPTION 'Transición DML abortada: No se encontró el trigger trg_events_updated_at en la tabla events.';
  ELSIF v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'Transición DML abortada: El estado inicial de trg_events_updated_at no es el esperado/habilitado (tgenabled = %).', v_tgenabled;
  END IF;
END $$;

-- b) Abortar si existe algún evento publicado asociado al venue 9999
DO $$
DECLARE
  v_published_9999_count INT;
BEGIN
  SELECT COUNT(*) INTO v_published_9999_count
  FROM events
  WHERE venue_id = 9999 AND status = 'published';

  IF v_published_9999_count > 0 THEN
    RAISE EXCEPTION 'Transición DML abortada: Se encontraron % evento(s) publicado(s) asociados al venue provisional 9999. No se alteran automáticamente.', v_published_9999_count;
  END IF;
END $$;

-- 2. Transición de Referencias Históricas 9999 a NULL exclusivamente en estados permitidos
-- Desactivar únicamente el trigger nominal trg_events_updated_at para preservar el timestamp histórico de updated_at
ALTER TABLE events DISABLE TRIGGER trg_events_updated_at;

UPDATE events
SET venue_id = NULL
WHERE venue_id = 9999
  AND status IN ('tentative', 'cancelled', 'archived', 'duplicate', 'outdated');

-- Restaurar el trigger a su estado habilitado original dentro de la misma transacción
ALTER TABLE events ENABLE TRIGGER trg_events_updated_at;

-- 3. VERIFICACIONES POST-CONDICIÓN:
-- a) Confirmar que el trigger ha quedado restaurado en estado habilitado ('O')
DO $$
DECLARE
  v_tgenabled "char";
BEGIN
  SELECT tgenabled INTO v_tgenabled
  FROM pg_trigger
  WHERE tgname = 'trg_events_updated_at' AND tgrelid = 'events'::regclass;

  IF v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'Transición DML abortada: trg_events_updated_at no quedó restaurado en su estado habilitado original (tgenabled = %).', v_tgenabled;
  END IF;
END $$;

-- b) Garantizar que no quedan eventos asociados al venue 9999
DO $$
DECLARE
  v_remaining_9999_count INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining_9999_count
  FROM events
  WHERE venue_id = 9999;

  IF v_remaining_9999_count > 0 THEN
    RAISE EXCEPTION 'Transición DML abortada: Todavía constan % evento(s) asociados al venue 9999 tras el UPDATE.', v_remaining_9999_count;
  END IF;
END $$;

COMMIT;
