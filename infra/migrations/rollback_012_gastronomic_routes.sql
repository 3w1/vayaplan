-- VayaPlan — Rollback 012: Reversión del Modelo de Rutas Gastronómicas
-- Fecha: 2026-10-22
-- Alcance: Reversión limpia de tablas e índices del modelo de rutas gastronómicas sin afectar cities ni venues.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

DROP TABLE IF EXISTS gastronomic_route_participants CASCADE;
DROP TABLE IF EXISTS gastronomic_routes CASCADE;

COMMIT;
