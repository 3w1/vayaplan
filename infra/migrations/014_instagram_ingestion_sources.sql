-- ==============================================================================
-- Migración 014: Configuración de Fuentes de Ingesta de Instagram
-- Tabla para registrar qué venues participan en la extracción de Instagram,
-- sus parámetros individuales y el historial del último intento de ingesta.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS instagram_ingestion_sources (
  id                       SERIAL PRIMARY KEY,
  venue_id                 INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  instagram_username       VARCHAR(100) NOT NULL,
  instagram_profile_url    TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  posts_per_run            INTEGER NOT NULL DEFAULT 5,
  include_reels            BOOLEAN NOT NULL DEFAULT true,
  last_ingested_at         TIMESTAMPTZ,
  last_run_id              TEXT,
  last_status              VARCHAR(50) DEFAULT 'never_run',
  last_error               TEXT,
  created_by               VARCHAR(100),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ingestion_venue UNIQUE (venue_id),
  CONSTRAINT uq_ingestion_username UNIQUE (instagram_username),
  CONSTRAINT chk_ingestion_posts_per_run CHECK (posts_per_run >= 1 AND posts_per_run <= 20),
  CONSTRAINT chk_ingestion_last_status CHECK (last_status IN ('never_run', 'success', 'partial', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_ingestion_sources_active ON instagram_ingestion_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_ingestion_sources_venue ON instagram_ingestion_sources(venue_id);

-- Poblar inicialmente con los 5 locales verificados del piloto (si existen en venues)
INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, instagram_profile_url, is_active, posts_per_run, include_reels, created_by)
SELECT 10019, 'salvajepalencia', 'https://www.instagram.com/salvajepalencia/', true, 5, true, 'system_pilot'
WHERE EXISTS (SELECT 1 FROM venues WHERE id = 10019)
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, instagram_profile_url, is_active, posts_per_run, include_reels, created_by)
SELECT 10011, 'lamalhabladapalencia', 'https://www.instagram.com/lamalhabladapalencia/', true, 5, true, 'system_pilot'
WHERE EXISTS (SELECT 1 FROM venues WHERE id = 10011)
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, instagram_profile_url, is_active, posts_per_run, include_reels, created_by)
SELECT 10052, 'sala.infinity', 'https://www.instagram.com/sala.infinity/', true, 5, true, 'system_pilot'
WHERE EXISTS (SELECT 1 FROM venues WHERE id = 10052)
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, instagram_profile_url, is_active, posts_per_run, include_reels, created_by)
SELECT 1, 'universonoro', 'https://www.instagram.com/universonoro/', true, 5, true, 'system_pilot'
WHERE EXISTS (SELECT 1 FROM venues WHERE id = 1)
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO instagram_ingestion_sources (venue_id, instagram_username, instagram_profile_url, is_active, posts_per_run, include_reels, created_by)
SELECT 10040, 'portal1986', 'https://www.instagram.com/portal1986/', true, 5, true, 'system_pilot'
WHERE EXISTS (SELECT 1 FROM venues WHERE id = 10040)
ON CONFLICT (venue_id) DO NOTHING;
