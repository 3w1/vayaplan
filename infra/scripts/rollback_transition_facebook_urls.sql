-- VayaPlan — Script de Reversión DML: Rollback de Transición de Facebook URLs
-- Generado a partir del estado previo registrado en el respaldo oficial:
-- venues_backup_full_pre_migration_008_20261018_110600.sql (SHA-256: 47940882a8ca5e61393878fe2d4e3180200c9cbe957fb70c1cc4b3722caa2ef9)
--
-- REQUISITOS OPERATIVOS:
-- - statement_timeout: 15s, lock_timeout: 5s.
-- - Restaura website_url desde el backup solo para filas afectadas por la transición.
-- - Pone facebook_url = NULL en esas filas.
-- - Preserva y restaura updated_at histórico mediante gestión controlada de trg_venues_updated_at.
-- - Protege webs propias: verifica que no toca locales con web propia no-Facebook.
-- - Idempotente y verificable.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. PRECONDICIONES
DO $$
DECLARE
  v_tgenabled "char";
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'facebook_url'
  ) THEN
    RAISE NOTICE 'Rollback omitido: La columna facebook_url no existe en la tabla venues.';
  END IF;

  SELECT tgenabled INTO v_tgenabled
  FROM pg_trigger
  WHERE tgname = 'trg_venues_updated_at' AND tgrelid = 'venues'::regclass;

  IF v_tgenabled IS NULL THEN
    RAISE EXCEPTION 'Rollback abortado: No se encontró el trigger trg_venues_updated_at en la tabla venues.';
  ELSIF v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'Rollback abortado: El estado inicial de trg_venues_updated_at no es habilitado (tgenabled = %).', v_tgenabled;
  END IF;
END $$;

-- 2. DESACTIVAR TRIGGER PARA PRESERVAR TIMESTAMP HISTÓRICO
ALTER TABLE venues DISABLE TRIGGER trg_venues_updated_at;

-- 3. TABLA TEMPORAL CON EL ESTADO PREVIO EXACTO EXTRAÍDO DEL BACKUP
CREATE TEMP TABLE tmp_venues_facebook_rollback (
  id INT PRIMARY KEY,
  previous_website_url TEXT NOT NULL,
  previous_updated_at TIMESTAMPTZ NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_venues_facebook_rollback (id, previous_website_url, previous_updated_at)
VALUES
  (10008, 'https://www.facebook.com/malibupalencia', '2026-10-16 09:15:33.468765+00'),
  (10018, 'https://es-la.facebook.com/Agora-Palencia-1704363213143529/', '2026-10-16 09:15:33.468765+00'),
  (10019, 'https://www.facebook.com/Salvaje-Palencia-108954890715533/', '2026-10-16 09:15:33.468765+00'),
  (10026, 'https://www.facebook.com/Mondo-Lirondo-Palencia-245725919600318/', '2026-10-16 09:15:33.468765+00'),
  (10034, 'https://www.facebook.com/pharaon.palencia', '2026-10-16 09:15:33.468765+00'),
  (10038, 'https://www.facebook.com/dana.palencia.7', '2026-10-16 09:15:33.468765+00'),
  (10040, 'https://es-es.facebook.com/ElPortalPalencia/', '2026-10-16 09:15:33.468765+00'),
  (10041, 'https://www.facebook.com/uncuerno/', '2026-10-17 23:28:32.531813+00');

-- 4. REVERSIÓN SEGURA:
-- Restaura website_url con la URL original del backup únicamente si website_url está vacía (o ya tiene la URL)
-- y facebook_url está poblada.
-- Restaura updated_at original.
-- Limpia facebook_url a NULL.
-- Si un local tiene una web propia legítima (no coincidente con Facebook), NO se modifica.
UPDATE venues v
SET website_url = t.previous_website_url,
    facebook_url = NULL,
    updated_at = t.previous_updated_at
FROM tmp_venues_facebook_rollback t
WHERE v.id = t.id
  AND (v.website_url IS NULL OR v.website_url ~* 'facebook\.com')
  AND v.facebook_url IS NOT NULL;

-- 5. REACTIVAR TRIGGER
ALTER TABLE venues ENABLE TRIGGER trg_venues_updated_at;

-- 6. VERIFICACIÓN POST-REVERSIÓN
DO $$
DECLARE
  v_still_active_fb INT;
  v_missing_restore INT;
BEGIN
  -- Comprobar que en las filas objetivo facebook_url quedó a NULL
  SELECT COUNT(*) INTO v_still_active_fb
  FROM venues v
  JOIN tmp_venues_facebook_rollback t ON v.id = t.id
  WHERE v.facebook_url IS NOT NULL;

  IF v_still_active_fb > 0 THEN
    RAISE EXCEPTION 'Rollback fallido: % local(es) aún conservan facebook_url poblado tras la reversión.', v_still_active_fb;
  END IF;

  -- Comprobar que las filas objetivo recuperaron su website_url
  SELECT COUNT(*) INTO v_missing_restore
  FROM venues v
  JOIN tmp_venues_facebook_rollback t ON v.id = t.id
  WHERE v.website_url IS NULL;

  IF v_missing_restore > 0 THEN
    RAISE EXCEPTION 'Rollback fallido: % local(es) quedaron con website_url NULL tras la reversión.', v_missing_restore;
  END IF;
END $$;

COMMIT;
