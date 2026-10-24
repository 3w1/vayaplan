-- Migración 015: Tabla de locks persistentes para concurrencia de ingesta de Instagram
-- Garantiza exclusión mutua distribuida entre ejecuciones manuales y cron programado con TTL de seguridad

CREATE TABLE IF NOT EXISTS instagram_ingestion_locks (
  id SERIAL PRIMARY KEY,
  lock_key VARCHAR(100) NOT NULL UNIQUE,
  locked_by VARCHAR(255) NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  released_at TIMESTAMP WITH TIME ZONE,
  execution_details JSONB
);

CREATE INDEX IF NOT EXISTS idx_instagram_locks_key ON instagram_ingestion_locks(lock_key);
CREATE INDEX IF NOT EXISTS idx_instagram_locks_expires ON instagram_ingestion_locks(expires_at) WHERE released_at IS NULL;
