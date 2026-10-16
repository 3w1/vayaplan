BEGIN;

-- 1. Timeouts acotados y protección de concurrencia
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Bloqueo exclusivo contra escrituras concurrentes (permite lecturas concurrentes)
LOCK TABLE venues IN SHARE ROW EXCLUSIVE MODE;

-- 2. Guardas de seguridad y verificación de entorno autorizado
DO $$
DECLARE
  v_allowed BOOLEAN := false;
  v_city_id INT;
  v_9999_slug VARCHAR;
  v_9999_city INT;
  v_seq_name TEXT;
  v_seq_last_val BIGINT;
  v_max_id BIGINT;
BEGIN
  -- A. Autorización de base de datos
  IF current_database() = 'vayaplan' THEN
    IF current_setting('vayaplan.confirm_production_seed', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Abortado: ejecución en producción (vayaplan) bloqueada. Requiere confirmación explícita previa: SET vayaplan.confirm_production_seed = ''true'';';
    END IF;
    v_allowed := true;
  ELSE
    IF current_database() = 'vayaplan_test' THEN
      v_allowed := true;
    ELSIF current_database() LIKE 'vayaplan_rehearsal%' OR current_database() LIKE 'vayaplan_ensayo%' THEN
      v_allowed := true;
    ELSIF current_setting('vayaplan.allow_census_seed', true) = 'true' THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Abortado: base de datos actual "%" no autorizada para el censo. Para bases de ensayo use prefijo "vayaplan_rehearsal_" o configure: SET vayaplan.allow_census_seed = ''true'';', current_database();
  END IF;

  -- B. Verificación de existencia e identidad de la ciudad de Palencia
  SELECT id INTO v_city_id FROM cities WHERE slug = 'palencia';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abortado: la ciudad con slug "palencia" no existe en la tabla cities.';
  END IF;

  -- C. Verificación de identidad previa del venue provisional 9999 si ya existe
  SELECT slug, city_id INTO v_9999_slug, v_9999_city FROM venues WHERE id = 9999;
  IF FOUND THEN
    IF v_9999_slug != 'local-por-verificar-borrador' OR v_9999_city != v_city_id THEN
      RAISE EXCEPTION 'Abortado: el ID 9999 ya está asignado a otro venue (slug=%, city_id=%)', v_9999_slug, v_9999_city;
    END IF;
  END IF;
END $$;

-- 3. Inserción o actualización del venue provisional 9999
INSERT INTO venues (id, city_id, name, slug, address, zone, category, is_active)
SELECT
  9999,
  c.id,
  'Local por verificar (Borrador WhatsApp)',
  'local-por-verificar-borrador',
  'Palencia (Pendiente de validación)',
  'otros',
  'general',
  true
FROM cities c
WHERE c.slug = 'palencia'
ON CONFLICT (id) DO UPDATE SET
  zone = COALESCE(venues.zone, EXCLUDED.zone),
  category = COALESCE(venues.category, EXCLUDED.category);

-- 4. Ajuste 1 de secuencia: resolver dinámicamente y garantizar no retroceder
DO $$
DECLARE
  v_seq_name TEXT;
  v_seq_last_val BIGINT;
  v_max_id BIGINT;
BEGIN
  v_seq_name := pg_get_serial_sequence('venues', 'id');
  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'No se encontró la secuencia serial asociada a venues.id';
  END IF;

  SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM venues;

  SELECT COALESCE(last_value, 1) INTO v_seq_last_val
  FROM pg_sequences
  WHERE schemaname || '.' || sequencename = v_seq_name
     OR sequencename = v_seq_name;

  -- Garantizar que la secuencia sea al menos MAX(id) y al menos last_value, sin retroceder jamás
  PERFORM setval(v_seq_name, GREATEST(v_seq_last_val, v_max_id), true);
END $$;

-- 5. Censo de locales de Palencia (resolviendo dinámicamente city_id de Palencia)
WITH target_city AS (
  SELECT id FROM cities WHERE slug = 'palencia' LIMIT 1
)
INSERT INTO venues (
  city_id, name, slug, address, zone, category,
  latitude, longitude, phone, website_url, is_active
)
SELECT
  target_city.id, v.name, v.slug, v.address, v.zone, v.category,
  v.latitude, v.longitude, v.phone, v.website_url, v.is_active
FROM target_city,
(VALUES
  -- ZONA DEL SEMINARIO
  ('El Gatonegro', 'el-gatonegro', 'C. San Marcos, 34001 Palencia', 'seminario', 'bar_musical', 42.0090434, -4.5354689, '+34 979 69 41 26', NULL::text, true),
  ('Sky Bar Palencia', 'sky-bar-palencia', 'C. Cardenal Almaraz, 4, 34003 Palencia', 'seminario', 'disco_bar', 42.0089302, -4.5353740, '+34 603 26 03 86', NULL::text, true),
  ('La Belle Époque', 'la-belle-epoque', 'Callejón del Seminario, 34001 Palencia', 'seminario', 'disco_bar', 42.0089500, -4.5354000, NULL::text, NULL::text, true),
  ('Manhattan copas palencia', 'manhattan-copas-palencia', 'C. Cardenal Almaraz, 6, 34002 Palencia', 'seminario', 'disco_bar', 42.0088458, -4.5354367, '+34 603 26 03 86', NULL::text, true),
  ('Rapa Nui', 'rapa-nui', 'Callejón del Seminario / Cardenal Almaraz, 34001 Palencia', 'seminario', 'disco_bar', 42.0087800, -4.5353500, NULL::text, NULL::text, true),
  ('Bar-Cafetería Seminario 6', 'seminario-6', 'C. Seminario, 6, 34001 Palencia', 'seminario', 'bar', 42.0087000, -4.5355500, NULL::text, NULL::text, true),
  ('Bar Malibú', 'bar-malibu', 'C. Mayor Antigua, 49, 34005 Palencia', 'seminario', 'bar', 42.0087459, -4.5356497, '+34 979 69 36 78', 'https://www.facebook.com/malibupalencia', true),

  -- ZONA CENTRO / LA PUEBLA
  ('Bar Universonoro', 'universonoro', 'C. San Juan de Dios, 3, 34002 Palencia', 'centro_puebla', 'sala_conciertos', 42.0085587, -4.5295375, '+34 979 10 02 07', 'https://universonoro.com/', true),
  ('El Último Trasgo', 'el-ultimo-trasgo', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'bar', 42.0090000, -4.5294000, NULL::text, NULL::text, true),
  ('Bar La Malhablada', 'bar-la-malhablada', 'C. de la Mujer Palentina, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0088390, -4.5301012, NULL::text, NULL::text, true),
  ('Bar Antro', 'bar-antro', 'C. de la Mujer Palentina, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0087229, -4.5300696, NULL::text, NULL::text, true),
  ('Chatea', 'chatea', 'C. de la Mujer Palentina, 3, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0086930, -4.5300760, NULL::text, NULL::text, true),
  ('El Lúpulo Dorado', 'el-lupulo-dorado', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'bar', 42.0088000, -4.5298000, NULL::text, NULL::text, true),
  ('Bar Auténtico', 'bar-autentico', 'C. Alfonso VIII, 1, 34002 Palencia', 'centro_puebla', 'bar', 42.0083726, -4.5295360, NULL::text, NULL::text, true),
  ('Gastrobar Bocados', 'gastrobar-bocados', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'bar', 42.0084000, -4.5293000, NULL::text, NULL::text, true),
  ('La Gomila', 'la-gomila', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'pub', 42.0086477, -4.5294960, NULL::text, NULL::text, true),
  ('Bar Agora', 'bar-agora', 'C. Alfonso VIII, 1, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0082139, -4.5293719, '+34 979 72 46 66', 'https://es-la.facebook.com/Agora-Palencia-1704363213143529/', true),
  ('Bar Salvaje', 'bar-salvaje', 'C. Alfonso VIII, 10, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0079342, -4.5291496, '+34 979 12 78 10', 'https://www.facebook.com/Salvaje-Palencia-108954890715533/', true),
  ('LIOH Palencia', 'lioh-palencia', 'C. Alfonso VIII, 3, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0080707, -4.5292345, NULL::text, 'https://www.instagram.com/lioh_palencia', true),
  ('Cantina Tarner', 'cantina-tarner', 'C. Alfonso VIII, 34002 Palencia', 'centro_puebla', 'bar', 42.0081000, -4.5292000, NULL::text, NULL::text, true),
  ('Bar Picapiedra', 'bar-picapiedra', 'C. Alfonso VIII, 2, 34002 Palencia', 'centro_puebla', 'bar', 42.0082926, -4.5296636, NULL::text, NULL::text, true),
  ('ZAMBRA SPORT BAR', 'zambra-sport-bar', 'C. Estrada, 5, 34002 Palencia', 'centro_puebla', 'bar', 42.0077028, -4.5295294, '+34 979 10 03 23', NULL::text, true),
  ('Bar Sabana', 'bar-sabana', 'C. Estrada, 1, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0076268, -4.5296214, '+34 979 72 49 32', NULL::text, true),
  ('Bar La Cripta', 'bar-la-cripta', 'C. Mariano Prieto, 1, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0074354, -4.5297239, '+34 979 71 07 71', NULL::text, true),
  ('Bar Mondo Lirondo', 'bar-mondo-lirondo', 'C. Mariano Prieto, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0072607, -4.5296161, NULL::text, 'https://www.facebook.com/Mondo-Lirondo-Palencia-245725919600318/', true),
  ('Lounge Tribeca', 'lounge-tribeca', 'C. Estrada, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0077204, -4.5295498, NULL::text, NULL::text, true),
  ('Bar Novecento', 'bar-novecento', 'C. Estrada, 8, 34002 Palencia', 'centro_puebla', 'bar', 42.0077425, -4.5290630, '+34 647 67 23 40', NULL::text, true),
  ('Bar Adrián', 'bar-adrian', 'C. Estrada, 9, 34002 Palencia', 'centro_puebla', 'bar', 42.0079379, -4.5289857, '+34 979 10 29 99', NULL::text, true),
  ('Discoteca Quasar', 'discoteca-quasar', 'C. Rizarzuela, 18, 34002 Palencia', 'centro_puebla', 'discoteca', 42.0078587, -4.5274216, '+34 663 48 70 78', 'https://quasarpalencia.com/', true),
  ('SUGAR DISCO BAR', 'sugar-disco-bar', 'C. Casañé, 1A, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0074294, -4.5287600, NULL::text, NULL::text, true),
  ('Diad''s DISCO BAR', 'diads-disco-bar', 'C. Rizarzuela, 5, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0073705, -4.5288998, NULL::text, NULL::text, true),
  ('Jade Stone Bar', 'jade-stone-bar', 'C. Rizarzuela, 4, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0071906, -4.5288045, '+34 657 34 67 70', 'https://www.instagram.com/jade.stone04', true),
  ('Pub Pharaon Premium Bar', 'pub-pharaon', 'C. Mariano Prieto, 1, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0073049, -4.5296251, '+34 643 87 75 01', 'https://www.facebook.com/pharaon.palencia', true),
  ('El Bosque Palencia', 'el-bosque-palencia', 'C. Mariano Prieto, 2, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0070321, -4.5296801, NULL::text, 'https://www.instagram.com/elbosquepalencia', true),
  ('Bar La Época', 'bar-la-epoca', 'C. la Bondad, 3, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0068805, -4.5297299, '+34 979 72 06 76', 'https://clickturismo.es/epoca/', true),
  ('LinaMorganFreeman', 'linamorganfreeman', 'C. Rizarzuela, 8, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0075149, -4.5282344, NULL::text, NULL::text, true),
  ('Dana Bar Terraza', 'dana-bar-terraza', 'C. Rizarzuela, 20, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0079346, -4.5269791, NULL::text, 'https://www.facebook.com/dana.palencia.7', true),
  ('La Condesa', 'la-condesa', 'C. Don Sancho, 4, 34001 Palencia', 'centro_puebla', 'bar_musical', 42.0096532, -4.5322365, NULL::text, NULL::text, true),
  ('Portal Café y Copas', 'portal-cafe-copas', 'C. Colón, 35, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0072364, -4.5307650, NULL::text, 'https://es-es.facebook.com/ElPortalPalencia/', true),
  ('Gastropub Y un Cuerno 2.1', 'gastropub-un-cuerno', 'C. Becerro de Bengoa, 4, 34001 Palencia', 'centro_puebla', 'bar_musical', 42.0085857, -4.5321836, '+34 645 10 10 10', 'https://m.facebook.com/uncuerno/', true),
  ('Discoctelería 38', 'discocteleria-38', 'C. Mayor Principal, 30, 34001 Palencia', 'centro_puebla', 'discoteca', 42.0113933, -4.5339147, '+34 979 74 52 82', NULL::text, true),
  ('Bar Moreno', 'bar-moreno', 'C. la Puebla, 10, 34002 Palencia', 'centro_puebla', 'bar', 42.0081136, -4.5285847, '+34 979 20 91 07', NULL::text, true),
  ('Pub y Copas Valentín', 'pub-valentin', 'C. José Zorrilla, 1, 34001 Palencia', 'centro_puebla', 'disco_bar', 42.0108300, -4.5311278, '+34 629 14 26 70', NULL::text, true),

  -- ZONA DEL SALÓN
  ('P21 Pub', 'p21-pub', 'P.º del Salón, 31, 34002 Palencia', 'salon', 'disco_bar', 42.0075242, -4.5269502, '+34 979 72 61 43', 'https://p21pub.es/', true),
  ('PUB ORIGEN PALENCIA', 'pub-origen-palencia', 'P.º del Salón, 31, 34002 Palencia', 'salon', 'disco_bar', 42.0074426, -4.5271160, NULL::text, NULL::text, true),
  ('Pub Lemon', 'pub-lemon', 'P.º del Salón, 13, 34002 Palencia', 'salon', 'disco_bar', 42.0067402, -4.5287362, '+34 979 10 66 66', 'http://www.lemonthebar.com/', true),
  ('Central Park terraza lounge bar', 'central-park-palencia', 'P.º del Salón, 9, 34002 Palencia', 'salon', 'bar_musical', 42.0064637, -4.5296100, NULL::text, NULL::text, true),
  ('Támesis Pub', 'tamesis-pub', 'Av. Manuel Rivera, 5, 34002 Palencia', 'salon', 'pub', 42.0091706, -4.5279473, '+34 979 73 02 46', NULL::text, true),
  ('Café Bar Oxford', 'cafe-bar-oxford', 'Av. Modesto Lafuente, 13, 34002 Palencia', 'salon', 'pub', 42.0059362, -4.5261151, '+34 979 07 01 43', 'http://www.cafebaroxford.es/', true),

  -- SALAS INDEPENDIENTES Y RECINTOS CULTURALES
  ('Pub Sala Jet Set', 'sala-jet-set', 'C. Panaderas, 12, 34001 Palencia', 'otros', 'sala_conciertos', 42.0069678, -4.5329809, '+34 979 10 94 14', NULL::text, true),
  ('Sala Infinity', 'sala-infinity', 'C. Extremadura, 5, 34004 Palencia', 'otros', 'sala_conciertos', 42.0066032, -4.5190811, NULL::text, NULL::text, true),
  ('Open Karaoke & disco', 'open-karaoke-disco', 'C. Antonio Maura, 34005 Palencia', 'otros', 'discoteca', 42.0126787, -4.5347139, '+34 674 32 73 77', NULL::text, true),
  ('Teatro Principal de Palencia', 'teatro-principal', 'C. Burgos, 3, 34001 Palencia', 'otros', 'teatro', 42.0098000, -4.5312000, '+34 979 71 82 00', 'https://teatroprincipaldepalencia.es/', true),
  ('Cines Ortega', 'cines-ortega', 'C. Colón, 2, 34002 Palencia', 'otros', 'cine', 42.0089000, -4.5298000, '+34 979 74 24 55', 'https://cinesortega.com/', true),
  ('Cine Avenida', 'cine-avenida', 'Av. Valladolid, 35, 34004 Palencia', 'otros', 'cine', 41.9996000, -4.5248000, '+34 979 72 20 62', 'https://cinespalencia.com/', true)
) AS v(name, slug, address, zone, category, latitude, longitude, phone, website_url, is_active)
ON CONFLICT (city_id, slug) DO UPDATE SET
  address = COALESCE(venues.address, EXCLUDED.address),
  zone = COALESCE(venues.zone, EXCLUDED.zone),
  category = COALESCE(venues.category, EXCLUDED.category),
  latitude = COALESCE(venues.latitude, EXCLUDED.latitude),
  longitude = COALESCE(venues.longitude, EXCLUDED.longitude),
  phone = COALESCE(venues.phone, EXCLUDED.phone),
  website_url = COALESCE(venues.website_url, EXCLUDED.website_url),
  is_active = venues.is_active;

-- 6. Ajuste 2 de secuencia: sincronizar tras inserciones sin retroceder jamás
DO $$
DECLARE
  v_seq_name TEXT;
  v_seq_last_val BIGINT;
  v_max_id BIGINT;
BEGIN
  v_seq_name := pg_get_serial_sequence('venues', 'id');
  IF v_seq_name IS NULL THEN
    RAISE EXCEPTION 'No se encontró la secuencia serial asociada a venues.id';
  END IF;

  SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM venues;

  SELECT COALESCE(last_value, 1) INTO v_seq_last_val
  FROM pg_sequences
  WHERE schemaname || '.' || sequencename = v_seq_name
     OR sequencename = v_seq_name;

  -- NUNCA retroceder respecto a v_seq_last_val ni v_max_id
  PERFORM setval(v_seq_name, GREATEST(v_seq_last_val, v_max_id), true);
END $$;

COMMIT;
