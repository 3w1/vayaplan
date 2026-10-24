-- VayaPlan — Migración 013: Bandeja de Curación de Propuestas (Instagram Bares)
-- Migración aditiva y no destructiva para almacenar propuestas de eventos
-- pendientes de curación humana, respetando estrictamente la integridad del catálogo.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS curation_proposals (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  proposed_date DATE NULL,
  proposed_time VARCHAR(10) NULL,
  venue_id INT NULL REFERENCES venues(id) ON DELETE SET NULL,
  category VARCHAR(50) NULL,
  price INT NULL,
  caption TEXT NULL,
  source_url TEXT NOT NULL,
  source_type VARCHAR(50) NOT NULL DEFAULT 'instagram',
  instagram_username VARCHAR(100) NULL,
  instagram_post_shortcode VARCHAR(50) NULL,
  r2_key TEXT NULL,
  image_url TEXT NOT NULL,
  image_width INT NULL,
  image_height INT NULL,
  image_content_type VARCHAR(50) NULL,
  image_size_bytes INT NULL,
  confidence VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
  dedupe_key VARCHAR(255) NULL,
  classification VARCHAR(50) NOT NULL DEFAULT 'EVENTO_POSIBLE',
  review_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  requires_manual_review BOOLEAN NOT NULL DEFAULT true,
  reviewed_by VARCHAR(100) NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_event_id INT NULL REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_proposals_review_status CHECK (
    review_status IN ('pending', 'approved_draft', 'rejected', 'archived', 'promotion')
  ),
  CONSTRAINT chk_proposals_classification CHECK (
    classification IN ('EVENTO_POSIBLE', 'PROMOCION', 'CONTENIDO_GENERAL', 'NO_RELEVANTE', 'REQUIERE_REVISION', 'PAST_EVENT')
  )
);

CREATE INDEX IF NOT EXISTS idx_curation_proposals_review_status
  ON curation_proposals (review_status, proposed_date);

CREATE INDEX IF NOT EXISTS idx_curation_proposals_venue
  ON curation_proposals (venue_id);

CREATE INDEX IF NOT EXISTS idx_curation_proposals_dedupe
  ON curation_proposals (dedupe_key);

COMMIT;
