-- VayaPlan — Migración 021: Retención y Ciclo de Vida de Medios Efímeros (Stories)
--
-- Añade columnas e índices mínimos para el seguimiento determinista de vencimientos
-- de material efímero y trazabilidad de purga/desacoplamiento sin pérdida de hechos culturales.
--
-- NOTA OPERATIVA:
-- ALTER TABLE añade columnas NULL sin DEFAULT. En PostgreSQL 11+, esto se ejecuta
-- exclusivamente sobre el catálogo de metadatos en <20ms sin reescritura de tabla.
-- lock_timeout = '5s' aborta inmediatamente ante contención de bloqueos concurrentes.
-- statement_timeout = '15s' previene esperas residuales prolongadas.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

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
