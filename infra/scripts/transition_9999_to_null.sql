-- VayaPlan — Script de Transición DML: Disociación de Venue Ficticio 9999 (v1.0)
-- ORDEN OPERATIVO: Ejecutar EXCLUSIVAMENTE tras el despliegue y verificación de salud de API y Web.
-- Transiciona eventos en estados no publicados (tentative, cancelled, etc.) de venue_id = 9999 a NULL.
-- Modifica únicamente events.venue_id. NO altera IDs, estados, fechas ni títulos.
-- NO elimina el registro del venue 9999.

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
    RAISE EXCEPTION 'Transición DML abortada: Se encontraron % evento(s) publicado(s) asociados al venue provisional 9999. No se alteran automáticamente.', v_published_9999_count;
  END IF;
END $$;

-- 2. Transición de Referencias Históricas 9999 a NULL exclusivamente en estados permitidos
UPDATE events
SET venue_id = NULL, updated_at = now()
WHERE venue_id = 9999
  AND status IN ('tentative', 'cancelled', 'archived', 'duplicate', 'outdated');

-- 3. Verificación Post-condición: Garantizar que no quedan eventos asociados al venue 9999
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
