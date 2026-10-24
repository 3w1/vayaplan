-- VayaPlan — Migración 016: Hardening de Curación de Propuestas (Instagram Bares)
-- Soporte para precio con decimales numeric(10,2), nuevas clasificaciones editoriales
-- (EVENTO_POSIBLE_SIN_HORA, CONTENIDO_VENUE, DUPLICADO_POSIBLE, SIN_MATCH) y matching defensivo con eventos publicados.
-- Migración estrictamente no destructiva y aditiva.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Modificar tipo de columna price a numeric(10,2) para permitir decimales exactos en euros (ej. 12.50)
ALTER TABLE curation_proposals
  ALTER COLUMN price TYPE numeric(10,2) USING (
    CASE 
      WHEN price IS NOT NULL THEN price::numeric(10,2)
      ELSE NULL
    END
  );

-- 2. Añadir campos para trazabilidad de matching con eventos publicados
ALTER TABLE curation_proposals
  ADD COLUMN IF NOT EXISTS matched_event_id INT NULL REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_level VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS match_reasons TEXT NULL;

-- 3. Actualizar la restricción CHECK de clasificaciones permitidas
ALTER TABLE curation_proposals
  DROP CONSTRAINT IF EXISTS chk_proposals_classification;

ALTER TABLE curation_proposals
  ADD CONSTRAINT chk_proposals_classification CHECK (
    classification IN (
      'EVENTO_POSIBLE',
      'EVENTO_POSIBLE_SIN_HORA',
      'CONTENIDO_VENUE',
      'DUPLICADO_POSIBLE',
      'SIN_MATCH',
      'PAST_EVENT',
      'PROMOCION',
      'CONTENIDO_GENERAL',
      'NO_RELEVANTE',
      'REQUIERE_REVISION'
    )
  );

-- 4. Crear índice para búsquedas por eventos coincidentes
CREATE INDEX IF NOT EXISTS idx_curation_proposals_matched_event
  ON curation_proposals (matched_event_id)
  WHERE matched_event_id IS NOT NULL;

COMMIT;
