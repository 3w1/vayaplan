-- VayaPlan — Migración 008: Soporte específico para Facebook en venues (DDL v1.0)
-- Añade columna facebook_url TEXT NULL de forma idempotente y reversible
-- NOTA OPERATIVA: Este archivo contiene EXCLUSIVAMENTE DDL de expansión de esquema.
-- Reversible mediante: ALTER TABLE venues DROP COLUMN IF EXISTS facebook_url;

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Incorporación idempotente de columna facebook_url (TEXT NULL)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS facebook_url TEXT;

COMMIT;
