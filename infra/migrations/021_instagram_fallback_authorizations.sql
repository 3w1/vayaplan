-- Migración 021: Registro y auditoría de autorizaciones de gasto para importador alternativo de Instagram
-- Vincula la autorización a un admin autenticado, URL canónica, shortcode, actor y presupuesto máximo.

CREATE TABLE IF NOT EXISTS instagram_fallback_authorizations (
  id SERIAL PRIMARY KEY,
  operation_id VARCHAR(64) NOT NULL UNIQUE,
  shortcode VARCHAR(100) NOT NULL,
  canonical_url TEXT NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
  max_budget_usd NUMERIC(6, 4) NOT NULL DEFAULT 0.0150,
  estimated_cost_usd NUMERIC(6, 4) NOT NULL DEFAULT 0.0090,
  reported_cost_usd NUMERIC(6, 4),
  status VARCHAR(30) NOT NULL DEFAULT 'authorized', -- authorized, running, succeeded, failed, uncertain, expired
  apify_run_id VARCHAR(100),
  failure_reason VARCHAR(100),
  failure_message TEXT,
  authorized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_fallback_shortcode ON instagram_fallback_authorizations(shortcode);
CREATE INDEX IF NOT EXISTS idx_ig_fallback_op_id ON instagram_fallback_authorizations(operation_id);
CREATE INDEX IF NOT EXISTS idx_ig_fallback_status ON instagram_fallback_authorizations(status);
