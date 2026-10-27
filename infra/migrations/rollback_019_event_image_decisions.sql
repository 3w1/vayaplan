-- rollback_019_event_image_decisions.sql
-- Revierte la migración 019 eliminando la tabla de decisiones de imágenes de eventos.
-- ADVERTENCIA: Esta es una operación destructiva de última instancia.
-- NO se debe ejecutar como parte del rollback normal de despliegue.
-- Requiere respaldo previo de datos (pg_dump) y autorización expresa.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

BEGIN;

DROP TABLE IF EXISTS event_image_decisions;

COMMIT;
