-- VayaPlan — Script de Reversión: Coordenadas y URL de Teatro Principal (id = 2)
-- ADVERTENCIA OPERATIVA:
-- Este script restaura los valores originales previos (lat: 42.00940000, lon: -4.52980000 y CID sintético).
-- Revertir restaura el destino incorrecto y el enlace defectuoso en "Cómo llegar".
-- Es una medida de recuperación ante contingencias, no una solución definitiva.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

BEGIN;

-- 1. BLOQUEO PESIMISTA DEL REGISTRO ID = 2
SELECT id, name, slug, latitude, longitude, google_maps_url, updated_at
FROM venues
WHERE id = 2
FOR UPDATE;

-- 2. REVALIDACIÓN DEFENSIVA: COMPROBAR QUE SIGUEN PRESENTES LOS VALORES DE LA CORRECCIÓN
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT id, name, slug, latitude, longitude, google_maps_url
  INTO v_rec
  FROM venues
  WHERE id = 2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversión fallida: no existe el local con id = 2';
  END IF;

  IF v_rec.name <> 'Teatro Principal de Palencia' OR v_rec.slug <> 'teatro-principal' THEN
    RAISE EXCEPTION 'Reversión abortada: identidad de local alterada en id = 2';
  END IF;

  IF v_rec.latitude <> 42.00994338 THEN
    RAISE EXCEPTION 'Reversión abortada: latitude esperada 42.00994338, encontrada %. Hubo cambios posteriores.', v_rec.latitude;
  END IF;

  IF v_rec.longitude <> -4.53071776 THEN
    RAISE EXCEPTION 'Reversión abortada: longitude esperada -4.53071776, encontrada %. Hubo cambios posteriores.', v_rec.longitude;
  END IF;

  IF v_rec.google_maps_url <> 'https://www.google.com/maps/search/?api=1&query=42.00994338,-4.53071776' THEN
    RAISE EXCEPTION 'Reversión abortada: google_maps_url difiere del valor de corrección. Hubo cambios posteriores.';
  END IF;
END $$;

-- 3. RESTAURACIÓN DE VALORES ORIGINALES CAPTURADOS
UPDATE venues
SET latitude = 42.00940000,
    longitude = -4.52980000,
    google_maps_url = 'https://maps.google.com/?cid=98765432109876543210'
WHERE id = 2
  AND latitude = 42.00994338
  AND longitude = -4.53071776
  AND google_maps_url = 'https://www.google.com/maps/search/?api=1&query=42.00994338,-4.53071776'
RETURNING id, name, slug, address, latitude, longitude, google_maps_url, updated_at;

-- 4. VERIFICACIÓN ATÓMICA PRE-COMMIT DE RESTAURACIÓN
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT id, latitude, longitude, google_maps_url
  INTO v_rec
  FROM venues
  WHERE id = 2;

  IF v_rec.latitude <> 42.00940000 OR v_rec.longitude <> -4.52980000 THEN
    RAISE EXCEPTION 'Verificación pre-commit de reversión fallida en coordenadas';
  END IF;

  IF v_rec.google_maps_url <> 'https://maps.google.com/?cid=98765432109876543210' THEN
    RAISE EXCEPTION 'Verificación pre-commit de reversión fallida en google_maps_url';
  END IF;
END $$;

COMMIT;
