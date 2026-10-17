BEGIN;

-- 1. Timeouts acotados y protección de concurrencia
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 2. Tabla de lotes de importación para trazabilidad y auditoría
CREATE TABLE IF NOT EXISTS venue_import_batches (
    id SERIAL PRIMARY KEY,
    batch_uuid VARCHAR(64) UNIQUE NOT NULL,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    source_file_name VARCHAR(255) NOT NULL,
    source_file_hash VARCHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'applied', -- 'applied', 'rolled_back'
    total_candidates INT NOT NULL DEFAULT 0,
    applied_count INT NOT NULL DEFAULT 0,
    created_venue_ids INT[] NOT NULL DEFAULT '{}',
    manifest_snapshot JSONB,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rolled_back_at TIMESTAMPTZ,
    rollback_reason TEXT
);

-- 3. Tabla de correspondencia para identificadores externos
CREATE TABLE IF NOT EXISTS venue_external_ids (
    id SERIAL PRIMARY KEY,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    provider VARCHAR(50) NOT NULL, -- e.g. 'google_maps'
    external_id VARCHAR(150) NOT NULL, -- e.g. Google placeId
    batch_id INT REFERENCES venue_import_batches(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, external_id)
);

-- Índices para búsqueda rápida e integridad referencial
CREATE INDEX IF NOT EXISTS idx_venue_external_ids_lookup
ON venue_external_ids (provider, external_id);

CREATE INDEX IF NOT EXISTS idx_venue_external_ids_venue
ON venue_external_ids (venue_id);

CREATE INDEX IF NOT EXISTS idx_venue_import_batches_hash
ON venue_import_batches (source_file_hash, status);

COMMIT;
