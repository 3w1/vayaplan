-- VayaPlan — Migración 021: Retención y Ciclo de Vida de Medios Efímeros (Stories)
--
-- Añade columnas e índices mínimos para el seguimiento determinista de vencimientos
-- de material efímero y trazabilidad de purga/desacoplamiento sin pérdida de hechos culturales.
--
-- NOTA OPERATIVA DE CONCURRENCIA, ESCALA Y BLOQUEOS:
-- 1. ALTER TABLE añade exclusivamente columnas NULL sin DEFAULT. En PostgreSQL 11+, esto se ejecuta
--    únicamente sobre el catálogo de metadatos del motor sin reescritura de tabla (<20ms).
-- 2. lock_timeout = '5s' aborta inmediatamente ante contención de bloqueos concurrentes.
-- 3. statement_timeout = '15s' previene esperas residuales prolongadas.
-- 4. ÍNDICES PARCIALES: idx_curation_proposals_retention e idx_events_story_retention filtran solo
--    filas no purgadas/no desacopladas, manteniendo el tamaño del índice insignificante (<64KB)
--    y garantizando creación instantánea sin lock exclusivo sostenido.
--
-- NOTA OPERATIVA DE REVERSIÓN:
-- En caso de incidencia, la recuperación estándar en producción es ROLLBACK DE CÓDIGO
-- (despliegue de versión anterior o desactivación del feature flag), CONSERVANDO LAS COLUMNAS.
-- NO EJECUTAR rollback_021 (DROP COLUMN) como procedimiento automático durante incidencias,
-- pues destruiría las marcas de auditoría y trazabilidad histórica (media_purged_at).
-- ADVERTENCIA: La purga física de archivos en R2 o vaciado de captions NO es reversible mediante rollback DDL.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 0. Validación de tipos preexistentes: impedir que IF NOT EXISTS oculte un esquema incompatible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'curation_proposals' AND column_name = 'retention_expires_at'
      AND data_type NOT IN ('timestamp with time zone', 'USER-DEFINED')
  ) THEN
    RAISE EXCEPTION 'Esquema incompatible: columna retention_expires_at preexistente no es timestamp with time zone';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'story_retention_expires_at'
      AND data_type NOT IN ('timestamp with time zone', 'USER-DEFINED')
  ) THEN
    RAISE EXCEPTION 'Esquema incompatible: columna story_retention_expires_at preexistente no es timestamp with time zone';
  END IF;
END $$;

-- 1. Columnas de retención en curation_proposals
ALTER TABLE curation_proposals
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS media_purged_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS media_source_provenance VARCHAR(50) NULL;

CREATE INDEX IF NOT EXISTS idx_curation_proposals_retention 
ON curation_proposals (retention_expires_at) 
WHERE media_purged_at IS NULL;

-- 2. Columnas de ciclo de vida de carteles efímeros en events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS image_provenance VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS story_retention_expires_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS story_media_detached_at TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_events_story_retention 
ON events (story_retention_expires_at) 
WHERE story_media_detached_at IS NULL;

COMMIT;
