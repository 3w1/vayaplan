-- VayaPlan — Script de Transición DML: Migración de URLs de Facebook a facebook_url (v1.0)
-- ORDEN OPERATIVO: Requiere autorización previa para su ejecución en producción.
-- Debe ejecutarse tras la aplicación de la migración DDL 008 (columna facebook_url).
-- Traslada URLs de Facebook alojadas históricamente en website_url hacia la columna dedicada facebook_url.
-- Establece website_url = NULL exclusivamente en los registros afectados.
-- Preserva intactas las webs propias, números de teléfono, WhatsApp y updated_at.
--
-- REQUISITOS OPERATIVOS Y DE SEGURIDAD:
-- - Bloqueos: lock_timeout acotado a 5s, statement_timeout a 15s.
-- - Afectación nominal: Desactiva y reactiva trg_venues_updated_at dentro de la transacción.
-- - Idempotencia: Si ya se ejecutó o no hay URLs de Facebook en website_url, el script no modifica nada.
-- - Verificación atómica: Comprueba antes de COMMIT que no quedan URLs de Facebook en website_url.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. PRECONDICIONES ESTRICTAS:
-- a) Verificar existencia de la columna facebook_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'facebook_url'
  ) THEN
    RAISE EXCEPTION 'Transición DML abortada: La columna "facebook_url" no existe en la tabla venues. Aplique primero la migración 008.';
  END IF;
END $$;

-- b) Verificar existencia y estado habilitado de trg_venues_updated_at
DO $$
DECLARE
  v_tgenabled "char";
BEGIN
  SELECT tgenabled INTO v_tgenabled
  FROM pg_trigger
  WHERE tgname = 'trg_venues_updated_at' AND tgrelid = 'venues'::regclass;

  IF v_tgenabled IS NULL THEN
    RAISE EXCEPTION 'Transición DML abortada: No se encontró el trigger trg_venues_updated_at en la tabla venues.';
  ELSIF v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'Transición DML abortada: El estado inicial de trg_venues_updated_at no es habilitado (tgenabled = %).', v_tgenabled;
  END IF;
END $$;

-- 2. TRANSICIÓN DML CONTROLADA
-- Desactivar temporalmente el trigger para preservar el timestamp histórico de updated_at
ALTER TABLE venues DISABLE TRIGGER trg_venues_updated_at;

-- Trasladar URLs de Facebook: normalizar cualquier subdominio (m., es-la., es-es., etc.) o apex domain a www.facebook.com y asignar website_url = NULL
UPDATE venues
SET facebook_url = REGEXP_REPLACE(website_url, '^https?://([a-zA-Z0-9-]+\.)*facebook\.com/', 'https://www.facebook.com/'),
    website_url = NULL
WHERE website_url ~* '^(https?://)?([a-zA-Z0-9-]+\.)*facebook\.com(/|$)';

-- Restaurar el trigger a su estado habilitado original
ALTER TABLE venues ENABLE TRIGGER trg_venues_updated_at;

-- 3. VERIFICACIÓN POST-TRANSICIÓN ANTES DEL COMMIT
DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM venues
  WHERE website_url ~* '^(https?://)?([a-zA-Z0-9-]+\.)*facebook\.com(/|$)';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Transición DML fallida: Aún quedan % local(es) con URL de Facebook en website_url.', v_remaining;
  END IF;
END $$;

COMMIT;
