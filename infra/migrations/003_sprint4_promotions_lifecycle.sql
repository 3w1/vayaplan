-- VayaPlan — Migración 003: Ciclo de vida y reserva de promociones
-- Nota: Esta migración fue aplicada previamente en producción y se versiona
-- formalmente en el repositorio para alinear código y base de datos.
--
-- Actualiza el índice único parcial para garantizar que solo pueda existir
-- una promoción activa o programada por ciudad y fecha editorial.

BEGIN;

DO $$
DECLARE
    current_pred TEXT;
    conflict_count INT;
    conflict_record RECORD;
BEGIN
    -- 0. Comprobar si el índice ya existe con la definición esperada (idempotencia pura)
    SELECT pg_get_expr(i.indpred, i.indrelid) INTO current_pred
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'uq_promotions_city_editorial_date';

    IF current_pred IS NOT NULL AND current_pred ILIKE '%scheduled%' THEN
        RAISE NOTICE 'Migración 003: El índice uq_promotions_city_editorial_date ya cubre status IN (''active'', ''scheduled''). No se requieren cambios.';
        RETURN;
    END IF;

    -- 1. Comprobar si existen promociones en conflicto (más de una en estado 'active' o 'scheduled' para la misma ciudad y fecha)
    SELECT COUNT(*) INTO conflict_count
    FROM (
        SELECT city_id, editorial_date, COUNT(*) AS promo_count
        FROM promotions
        WHERE status IN ('active', 'scheduled')
        GROUP BY city_id, editorial_date
        HAVING COUNT(*) > 1
    ) conflicts;

    IF conflict_count > 0 THEN
        -- Obtener detalles del primer conflicto detectado para el mensaje de error
        SELECT city_id, editorial_date, COUNT(*) AS promo_count INTO conflict_record
        FROM promotions
        WHERE status IN ('active', 'scheduled')
        GROUP BY city_id, editorial_date
        HAVING COUNT(*) > 1
        LIMIT 1;

        RAISE EXCEPTION 'Migración 003 abortada: Se detectaron % conflicto(s) de escasez (ejemplo: city_id=%, editorial_date=% tiene % promociones active/scheduled). Resuelva los conflictos manualmente antes de aplicar la migración.',
            conflict_count, conflict_record.city_id, conflict_record.editorial_date, conflict_record.promo_count;
    END IF;

    -- 2. Si no hay conflictos, sustituir el índice único de forma segura
    DROP INDEX IF EXISTS uq_promotions_city_editorial_date;

    CREATE UNIQUE INDEX uq_promotions_city_editorial_date
    ON promotions (city_id, editorial_date)
    WHERE status IN ('active', 'scheduled');

    RAISE NOTICE 'Migración 003 completada con éxito: Índice uq_promotions_city_editorial_date actualizado para cubrir status IN (''active'', ''scheduled'').';
END $$;

COMMIT;
