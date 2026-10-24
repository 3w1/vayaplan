-- VayaPlan — Rollback 017: Reversión de Estado de Precio y Soporte de Eventos Continuos
-- Fecha: 2026-10-24
-- Reversión limpia de columnas, índices y constraints de price_status y eventos continuos.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Eliminar índices creados en migración 017
DROP INDEX IF EXISTS idx_curation_proposals_price_status;
DROP INDEX IF EXISTS idx_events_price_status;

-- 2. Restaurar constraints en curation_proposals
ALTER TABLE curation_proposals DROP CONSTRAINT IF EXISTS chk_proposals_price_status;
ALTER TABLE curation_proposals DROP CONSTRAINT IF EXISTS chk_proposals_classification;
ALTER TABLE curation_proposals ADD CONSTRAINT chk_proposals_classification CHECK (
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

-- 3. Eliminar columnas añadidas a curation_proposals
ALTER TABLE curation_proposals
  DROP COLUMN IF EXISTS proposed_end_time,
  DROP COLUMN IF EXISTS proposed_end_date,
  DROP COLUMN IF EXISTS price_checked_at,
  DROP COLUMN IF EXISTS price_source,
  DROP COLUMN IF EXISTS price_note,
  DROP COLUMN IF EXISTS price_status;

-- 4. Restaurar constraints y columnas en events
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_price_status;
ALTER TABLE events
  DROP COLUMN IF EXISTS price_checked_at,
  DROP COLUMN IF EXISTS price_source,
  DROP COLUMN IF EXISTS price_note,
  DROP COLUMN IF EXISTS price_status;

-- 5. Restaurar price_cents NOT NULL con default 0 si aplica
UPDATE events SET price_cents = 0 WHERE price_cents IS NULL;
ALTER TABLE events ALTER COLUMN price_cents SET DEFAULT 0;
ALTER TABLE events ALTER COLUMN price_cents SET NOT NULL;

COMMIT;
