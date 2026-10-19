-- VayaPlan — Actualización Defensiva de Coordenadas y URL: Teatro Principal de Palencia (id = 2)
-- Procedencia: Coordenadas aportadas por el usuario desde Google Maps
-- Coordenadas de origen: latitude = 42.009943379937624, longitude = -4.530717758954763
-- Coordenadas redondeadas a precisión de esquema numeric(10,8) / numeric(11,8):
--   latitude  = 42.00994338
--   longitude = -4.53071776
-- URL de búsqueda por coordenadas: https://www.google.com/maps/search/?api=1&query=42.00994338,-4.53071776
-- Efecto colateral documentado: el trigger trg_venues_updated_at actualizará automáticamente updated_at a now().

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

BEGIN;

-- 1. BLOQUEO PESIMISTA DEL REGISTRO ID = 2
SELECT id, city_id, name, slug, address, latitude, longitude, google_maps_url, is_active, updated_at
FROM venues
WHERE id = 2
FOR UPDATE;

-- 2. REVALIDACIÓN DEFENSIVA DE PRECONDICIONES
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT id, city_id, name, slug, address, latitude, longitude, google_maps_url, is_active
  INTO v_rec
  FROM venues
  WHERE id = 2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Precondición fallida: no existe el local con id = 2';
  END IF;

  IF v_rec.city_id <> 1 THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: city_id esperado 1, encontrado %', v_rec.city_id;
  END IF;

  IF v_rec.name <> 'Teatro Principal de Palencia' THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: name esperado "Teatro Principal de Palencia", encontrado "%"', v_rec.name;
  END IF;

  IF v_rec.slug <> 'teatro-principal' THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: slug esperado "teatro-principal", encontrado "%"', v_rec.slug;
  END IF;

  IF v_rec.address <> 'Calle de Burgos, 3, 34001 Palencia' THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: address esperado "Calle de Burgos, 3, 34001 Palencia", encontrado "%"', v_rec.address;
  END IF;

  IF v_rec.latitude <> 42.00940000 THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: latitude esperada 42.00940000, encontrada %', v_rec.latitude;
  END IF;

  IF v_rec.longitude <> -4.52980000 THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: longitude esperada -4.52980000, encontrada %', v_rec.longitude;
  END IF;

  IF v_rec.google_maps_url <> 'https://maps.google.com/?cid=98765432109876543210' THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: google_maps_url esperado "https://maps.google.com/?cid=98765432109876543210", encontrado "%"', v_rec.google_maps_url;
  END IF;

  IF v_rec.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Precondición fallida en id = 2: is_active esperado true';
  END IF;
END $$;

-- 3. ACTUALIZACIÓN ACOTADA EXIGIENDO EXACTAMENTE 1 FILA
UPDATE venues
SET latitude = 42.00994338,
    longitude = -4.53071776,
    google_maps_url = 'https://www.google.com/maps/search/?api=1&query=42.00994338,-4.53071776'
WHERE id = 2
  AND latitude = 42.00940000
  AND longitude = -4.52980000
  AND google_maps_url = 'https://maps.google.com/?cid=98765432109876543210'
RETURNING id, name, slug, address, latitude, longitude, google_maps_url, updated_at;

-- 4. VERIFICACIÓN ATÓMICA PRE-COMMIT
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT id, latitude, longitude, google_maps_url
  INTO v_rec
  FROM venues
  WHERE id = 2;

  IF v_rec.latitude <> 42.00994338 THEN
    RAISE EXCEPTION 'Verificación pre-commit fallida: latitude no es 42.00994338 (obtenido %)', v_rec.latitude;
  END IF;

  IF v_rec.longitude <> -4.53071776 THEN
    RAISE EXCEPTION 'Verificación pre-commit fallida: longitude no es -4.53071776 (obtenido %)', v_rec.longitude;
  END IF;

  IF v_rec.google_maps_url <> 'https://www.google.com/maps/search/?api=1&query=42.00994338,-4.53071776' THEN
    RAISE EXCEPTION 'Verificación pre-commit fallida: google_maps_url no coincide con el valor esperado';
  END IF;
END $$;

COMMIT;
