-- 019_event_image_decisions.sql
-- Migración 019: Tabla dedicada para persistencia, auditoría e idempotencia
-- de decisiones editoriales sobre propuestas de imágenes.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

BEGIN;

CREATE TABLE IF NOT EXISTS event_image_decisions (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  candidate_key VARCHAR(255) NOT NULL,
  candidate_url TEXT NOT NULL,
  action VARCHAR(30) NOT NULL,
  operator_email VARCHAR(100) NOT NULL,
  notes TEXT,
  idempotency_key VARCHAR(100),
  payload_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT chk_image_decision_action CHECK (
    action IN ('adopt', 'keep_current', 'discard', 'request_search')
  )
);

-- Índice determinista para recuperar la decisión activa más reciente por evento y candidata
CREATE INDEX IF NOT EXISTS idx_event_image_decisions_lookup
  ON event_image_decisions (event_id, candidate_key, id DESC);

-- Índice general para auditar el historial completo de un evento
CREATE INDEX IF NOT EXISTS idx_event_image_decisions_event_history
  ON event_image_decisions (event_id, id DESC);

-- Índice único parcial para garantizar idempotencia por operación
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_image_decisions_idempotency
  ON event_image_decisions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE event_image_decisions IS
  'Historial y auditoría de decisiones editoriales sobre propuestas de imágenes de eventos.';
COMMENT ON COLUMN event_image_decisions.candidate_key IS
  'Identidad canónica y estable de la candidata (clave R2 o slug versionado, independiente de parámetros temporales).';
COMMENT ON COLUMN event_image_decisions.idempotency_key IS
  'Identificador único de la operación cliente para reintentos idempotentes seguros.';
COMMENT ON COLUMN event_image_decisions.payload_hash IS
  'Hash SHA-256 del contenido de la decisión para rechazar reintentos con la misma clave pero contenido divergente.';

COMMIT;
