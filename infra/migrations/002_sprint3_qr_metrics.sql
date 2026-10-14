-- VayaPlan — Migración 002: Soporte para escaneos QR en event_metrics y local contingencia
-- Permite registrar métricas de tipo 'qr_scan' sin requerir un event_id obligatorio

-- 1. Modificar columna event_id en event_metrics para permitir valores NULL
ALTER TABLE event_metrics ALTER COLUMN event_id DROP NOT NULL;

-- 2. Índice adicional para optimizar consultas de métricas agregadas por tipo y fecha
CREATE INDEX IF NOT EXISTS idx_event_metrics_type_time
ON event_metrics (metric_type, occurred_at);

-- 3. Índice para rastrear escaneos QR en el campo metadata
CREATE INDEX IF NOT EXISTS idx_event_metrics_metadata_qr
ON event_metrics USING gin (metadata)
WHERE metric_type = 'qr_scan';

-- 4. Local temporal/contingencia para borradores recibidos por WhatsApp sin local asignado
INSERT INTO venues (
    id,
    city_id,
    name,
    slug,
    address,
    is_active,
    created_at,
    updated_at
)
VALUES (
    9999,
    1,
    'Local por verificar (Borrador WhatsApp)',
    'local-por-verificar-borrador',
    'Palencia (Pendiente de validación)',
    true,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    address = EXCLUDED.address,
    is_active = true,
    updated_at = now();

SELECT setval('venues_id_seq', (SELECT GREATEST(MAX(id), 2) FROM venues));
