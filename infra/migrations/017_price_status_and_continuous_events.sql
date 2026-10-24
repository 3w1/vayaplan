-- VayaPlan — Migración 017: Estado de Precio y Soporte de Eventos Continuos
-- Añade price_status ('UNKNOWN', 'FREE', 'NOT_INFORMED', 'CHECK_BOX_OFFICE', 'CONFIRMED')
-- y metadatos de precio a 'events' y 'curation_proposals'.
-- Añade proposed_end_date, proposed_end_time y la clasificación 'EVENTO_CONTINUO' a 'curation_proposals'.
-- Migración segura: los eventos existentes con price_cents = 0 se preservan como 'UNKNOWN' (nunca 'FREE' automático).

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Añadir columnas de estado de precio a la tabla events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS price_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS price_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS price_source VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ NULL;

-- Permitir NULL en price_cents para precios no informados o a consultar en taquilla
ALTER TABLE events
  ALTER COLUMN price_cents DROP NOT NULL,
  ALTER COLUMN price_cents DROP DEFAULT,
  ALTER COLUMN price_cents SET DEFAULT NULL;

-- Restricción CHECK de valores permitidos para price_status en events
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS chk_events_price_status;

ALTER TABLE events
  ADD CONSTRAINT chk_events_price_status CHECK (
    price_status IN (
      'UNKNOWN',
      'FREE',
      'NOT_INFORMED',
      'CHECK_BOX_OFFICE',
      'CONFIRMED'
    )
  );

-- 2. Añadir columnas a curation_proposals
ALTER TABLE curation_proposals
  ADD COLUMN IF NOT EXISTS price_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS price_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS price_source VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS proposed_end_date DATE NULL,
  ADD COLUMN IF NOT EXISTS proposed_end_time VARCHAR(10) NULL;

-- Restricción CHECK de valores permitidos para price_status en curation_proposals
ALTER TABLE curation_proposals
  DROP CONSTRAINT IF EXISTS chk_proposals_price_status;

ALTER TABLE curation_proposals
  ADD CONSTRAINT chk_proposals_price_status CHECK (
    price_status IN (
      'UNKNOWN',
      'FREE',
      'NOT_INFORMED',
      'CHECK_BOX_OFFICE',
      'CONFIRMED'
    )
  );

-- 3. Actualizar la restricción CHECK de clasificaciones para incluir EVENTO_CONTINUO
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
      'REQUIERE_REVISION',
      'EVENTO_CONTINUO'
    )
  );

-- 4. Migración segura de datos existentes en events
-- price_cents > 0: price_status = CONFIRMED
UPDATE events
  SET price_status = 'CONFIRMED'
  WHERE price_cents > 0;

-- price_cents = 0 o NULL: price_status = UNKNOWN (no marcar automáticamente como FREE)
UPDATE events
  SET price_status = 'UNKNOWN'
  WHERE price_cents = 0 OR price_cents IS NULL;

-- 5. Migración segura de datos existentes en curation_proposals
UPDATE curation_proposals
  SET price_status = 'CONFIRMED'
  WHERE price > 0;

UPDATE curation_proposals
  SET price_status = 'UNKNOWN'
  WHERE price = 0 OR price IS NULL;

-- 6. Índices para optimizar filtros de precio y eventos continuos
CREATE INDEX IF NOT EXISTS idx_events_price_status
  ON events (price_status);

CREATE INDEX IF NOT EXISTS idx_curation_proposals_price_status
  ON curation_proposals (price_status);

COMMIT;
