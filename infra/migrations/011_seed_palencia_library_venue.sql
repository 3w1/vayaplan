-- VayaPlan — Migración 011: Alta censal controlada de la Biblioteca Pública de Palencia
-- Fecha: 2026-10-20
-- Motivo: Habilitar conector JCyL del piloto de ampliación de agenda para ingesta defensiva a borradores.
-- Referencia: Autorización editorial expresa de Fase 2 (PR #23 / feat/agenda-expansion-pilot).
--
-- NOTA DE SEGURIDAD OPERATIVA:
-- - Inserción única y acotada exclusivamente a la Biblioteca Pública de Palencia.
-- - No da de alta otros recintos (Lecrác, Pabellón Marta Domínguez o Nueva Balastera permanecen sin censar).
-- - Idempotente: Si el slug ya existe para Palencia, no realiza ninguna modificación ni actualización (DO NOTHING).
-- - No altera venues existentes, secuencias manuales fijas, eventos ni festivales.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

INSERT INTO venues (
  city_id,
  name,
  slug,
  address,
  latitude,
  longitude,
  category,
  zone,
  is_active,
  created_at,
  updated_at
)
SELECT
  c.id,
  'Biblioteca Pública de Palencia',
  'biblioteca-publica-de-palencia',
  'C/ Eduardo Dato, 4, 34005 Palencia',
  42.01339959,
  -4.53478396,
  'cultura',
  'Centro',
  true,
  now(),
  now()
FROM cities c
WHERE c.slug = 'palencia'
ON CONFLICT (city_id, slug) DO NOTHING;

COMMIT;
