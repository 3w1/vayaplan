BEGIN;

-- 1. Protección estricta: abortar si no se ejecuta contra vayaplan_test
DO $$
BEGIN
  IF current_database() != 'vayaplan_test' THEN
    RAISE EXCEPTION 'Abortado: este script está restringido exclusivamente a vayaplan_test. Base actual: %', current_database();
  END IF;
END $$;

-- 2. Garantizar columnas auxiliares en la tabla venues si no existen
ALTER TABLE venues ADD COLUMN IF NOT EXISTS zone VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS website_url TEXT;

-- 3. Venue provisional para ingestas no asignadas (preservando nombre y slug existentes)
INSERT INTO venues (id, city_id, name, slug, address, zone, category, is_active)
VALUES (
  9999,
  1,
  'Local por verificar (Borrador WhatsApp)',
  'local-por-verificar-borrador',
  'Palencia (Pendiente de validación)',
  'otros',
  'general',
  true
)
ON CONFLICT (id) DO UPDATE SET
  zone = COALESCE(venues.zone, EXCLUDED.zone),
  category = COALESCE(venues.category, EXCLUDED.category);

-- 4. Ajustar secuencia asociada a venues.id garantizando no retroceder
SELECT setval(
  pg_get_serial_sequence('venues', 'id'),
  GREATEST(
    (SELECT COALESCE(MAX(id), 0) FROM venues),
    (SELECT last_value FROM public.venues_id_seq),
    9999
  ),
  true
);

-- 5. Censo de locales de Palencia (city_id = 1 explícito)
INSERT INTO venues (
  city_id, name, slug, address, zone, category,
  latitude, longitude, phone, website_url, is_active
)
VALUES
  -- ZONA DEL SEMINARIO
  (1, 'El Gatonegro', 'el-gatonegro', 'C. San Marcos, 34001 Palencia', 'seminario', 'bar_musical', 42.0090434, -4.5354689, '+34 979 69 41 26', NULL, true),
  (1, 'Sky Bar Palencia', 'sky-bar-palencia', 'C. Cardenal Almaraz, 4, 34003 Palencia', 'seminario', 'disco_bar', 42.0089302, -4.5353740, '+34 603 26 03 86', NULL, true),
  (1, 'La Belle Époque', 'la-belle-epoque', 'Callejón del Seminario, 34001 Palencia', 'seminario', 'disco_bar', 42.0089500, -4.5354000, NULL, NULL, true),
  (1, 'Manhattan copas palencia', 'manhattan-copas-palencia', 'C. Cardenal Almaraz, 6, 34002 Palencia', 'seminario', 'disco_bar', 42.0088458, -4.5354367, '+34 603 26 03 86', NULL, true),
  (1, 'Rapa Nui', 'rapa-nui', 'Callejón del Seminario / Cardenal Almaraz, 34001 Palencia', 'seminario', 'disco_bar', 42.0087800, -4.5353500, NULL, NULL, true),
  (1, 'Bar-Cafetería Seminario 6', 'seminario-6', 'C. Seminario, 6, 34001 Palencia', 'seminario', 'bar', 42.0087000, -4.5355500, NULL, NULL, true),
  (1, 'Bar Malibú', 'bar-malibu', 'C. Mayor Antigua, 49, 34005 Palencia', 'seminario', 'bar', 42.0087459, -4.5356497, '+34 979 69 36 78', 'https://www.facebook.com/malibupalencia', true),

  -- ZONA CENTRO / LA PUEBLA
  (1, 'Bar Universonoro', 'universonoro', 'C. San Juan de Dios, 3, 34002 Palencia', 'centro_puebla', 'sala_conciertos', 42.0085587, -4.5295375, '+34 979 10 02 07', 'https://universonoro.com/', true),
  (1, 'El Último Trasgo', 'el-ultimo-trasgo', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'bar', 42.0090000, -4.5294000, NULL, NULL, true),
  (1, 'Bar La Malhablada', 'bar-la-malhablada', 'C. de la Mujer Palentina, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0088390, -4.5301012, NULL, NULL, true),
  (1, 'Bar Antro', 'bar-antro', 'C. de la Mujer Palentina, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0087229, -4.5300696, NULL, NULL, true),
  (1, 'Chatea', 'chatea', 'C. de la Mujer Palentina, 3, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0086930, -4.5300760, NULL, NULL, true),
  (1, 'El Lúpulo Dorado', 'el-lupulo-dorado', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'bar', 42.0088000, -4.5298000, NULL, NULL, true),
  (1, 'Bar Auténtico', 'bar-autentico', 'C. Alfonso VIII, 1, 34002 Palencia', 'centro_puebla', 'bar', 42.0083726, -4.5295360, NULL, NULL, true),
  (1, 'Gastrobar Bocados', 'gastrobar-bocados', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'bar', 42.0084000, -4.5293000, NULL, NULL, true),
  (1, 'La Gomila', 'la-gomila', 'C. San Juan de Dios, 34002 Palencia', 'centro_puebla', 'pub', 42.0086477, -4.5294960, NULL, NULL, true),
  (1, 'Bar Agora', 'bar-agora', 'C. Alfonso VIII, 1, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0082139, -4.5293719, '+34 979 72 46 66', 'https://es-la.facebook.com/Agora-Palencia-1704363213143529/', true),
  (1, 'Bar Salvaje', 'bar-salvaje', 'C. Alfonso VIII, 10, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0079342, -4.5291496, '+34 979 12 78 10', 'https://www.facebook.com/Salvaje-Palencia-108954890715533/', true),
  (1, 'LIOH Palencia', 'lioh-palencia', 'C. Alfonso VIII, 3, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0080707, -4.5292345, NULL, 'https://www.instagram.com/lioh_palencia', true),
  (1, 'Cantina Tarner', 'cantina-tarner', 'C. Alfonso VIII, 34002 Palencia', 'centro_puebla', 'bar', 42.0081000, -4.5292000, NULL, NULL, true),
  (1, 'Bar Picapiedra', 'bar-picapiedra', 'C. Alfonso VIII, 2, 34002 Palencia', 'centro_puebla', 'bar', 42.0082926, -4.5296636, NULL, NULL, true),
  (1, 'ZAMBRA SPORT BAR', 'zambra-sport-bar', 'C. Estrada, 5, 34002 Palencia', 'centro_puebla', 'bar', 42.0077028, -4.5295294, '+34 979 10 03 23', NULL, true),
  (1, 'Bar Sabana', 'bar-sabana', 'C. Estrada, 1, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0076268, -4.5296214, '+34 979 72 49 32', NULL, true),
  (1, 'Bar La Cripta', 'bar-la-cripta', 'C. Mariano Prieto, 1, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0074354, -4.5297239, '+34 979 71 07 71', NULL, true),
  (1, 'Bar Mondo Lirondo', 'bar-mondo-lirondo', 'C. Mariano Prieto, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0072607, -4.5296161, NULL, 'https://www.facebook.com/Mondo-Lirondo-Palencia-245725919600318/', true),
  (1, 'Lounge Tribeca', 'lounge-tribeca', 'C. Estrada, 3, 34002 Palencia', 'centro_puebla', 'bar', 42.0077204, -4.5295498, NULL, NULL, true),
  (1, 'Bar Novecento', 'bar-novecento', 'C. Estrada, 8, 34002 Palencia', 'centro_puebla', 'bar', 42.0077425, -4.5290630, '+34 647 67 23 40', NULL, true),
  (1, 'Bar Adrián', 'bar-adrian', 'C. Estrada, 9, 34002 Palencia', 'centro_puebla', 'bar', 42.0079379, -4.5289857, '+34 979 10 29 99', NULL, true),
  (1, 'Discoteca Quasar', 'discoteca-quasar', 'C. Rizarzuela, 18, 34002 Palencia', 'centro_puebla', 'discoteca', 42.0078587, -4.5274216, '+34 663 48 70 78', 'https://quasarpalencia.com/', true),
  (1, 'SUGAR DISCO BAR', 'sugar-disco-bar', 'C. Casañé, 1A, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0074294, -4.5287600, NULL, NULL, true),
  (1, 'Diad''s DISCO BAR', 'diads-disco-bar', 'C. Rizarzuela, 5, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0073705, -4.5288998, NULL, NULL, true),
  (1, 'Jade Stone Bar', 'jade-stone-bar', 'C. Rizarzuela, 4, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0071906, -4.5288045, '+34 657 34 67 70', 'https://www.instagram.com/jade.stone04', true),
  (1, 'Pub Pharaon Premium Bar', 'pub-pharaon', 'C. Mariano Prieto, 1, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0073049, -4.5296251, '+34 643 87 75 01', 'https://www.facebook.com/pharaon.palencia', true),
  (1, 'El Bosque Palencia', 'el-bosque-palencia', 'C. Mariano Prieto, 2, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0070321, -4.5296801, NULL, 'https://www.instagram.com/elbosquepalencia', true),
  (1, 'Bar La Época', 'bar-la-epoca', 'C. la Bondad, 3, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0068805, -4.5297299, '+34 979 72 06 76', 'https://clickturismo.es/epoca/', true),
  (1, 'LinaMorganFreeman', 'linamorganfreeman', 'C. Rizarzuela, 8, 34002 Palencia', 'centro_puebla', 'bar_musical', 42.0075149, -4.5282344, NULL, NULL, true),
  (1, 'Dana Bar Terraza', 'dana-bar-terraza', 'C. Rizarzuela, 20, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0079346, -4.5269791, NULL, 'https://www.facebook.com/dana.palencia.7', true),
  (1, 'La Condesa', 'la-condesa', 'C. Don Sancho, 4, 34001 Palencia', 'centro_puebla', 'bar_musical', 42.0096532, -4.5322365, NULL, NULL, true),
  (1, 'Portal Café y Copas', 'portal-cafe-copas', 'C. Colón, 35, 34002 Palencia', 'centro_puebla', 'disco_bar', 42.0072364, -4.5307650, NULL, 'https://es-es.facebook.com/ElPortalPalencia/', true),
  (1, 'Gastropub Y un Cuerno 2.1', 'gastropub-un-cuerno', 'C. Becerro de Bengoa, 4, 34001 Palencia', 'centro_puebla', 'bar_musical', 42.0085857, -4.5321836, '+34 645 10 10 10', 'https://m.facebook.com/uncuerno/', true),
  (1, 'Discoctelería 38', 'discocteleria-38', 'C. Mayor Principal, 30, 34001 Palencia', 'centro_puebla', 'discoteca', 42.0113933, -4.5339147, '+34 979 74 52 82', NULL, true),
  (1, 'Bar Moreno', 'bar-moreno', 'C. la Puebla, 10, 34002 Palencia', 'centro_puebla', 'bar', 42.0081136, -4.5285847, '+34 979 20 91 07', NULL, true),
  (1, 'Pub y Copas Valentín', 'pub-valentin', 'C. José Zorrilla, 1, 34001 Palencia', 'centro_puebla', 'disco_bar', 42.0108300, -4.5311278, '+34 629 14 26 70', NULL, true),

  -- ZONA DEL SALÓN
  (1, 'P21 Pub', 'p21-pub', 'P.º del Salón, 31, 34002 Palencia', 'salon', 'disco_bar', 42.0075242, -4.5269502, '+34 979 72 61 43', 'https://p21pub.es/', true),
  (1, 'PUB ORIGEN PALENCIA', 'pub-origen-palencia', 'P.º del Salón, 31, 34002 Palencia', 'salon', 'disco_bar', 42.0074426, -4.5271160, NULL, NULL, true),
  (1, 'Pub Lemon', 'pub-lemon', 'P.º del Salón, 13, 34002 Palencia', 'salon', 'disco_bar', 42.0067402, -4.5287362, '+34 979 10 66 66', 'http://www.lemonthebar.com/', true),
  (1, 'Central Park terraza lounge bar', 'central-park-palencia', 'P.º del Salón, 9, 34002 Palencia', 'salon', 'bar_musical', 42.0064637, -4.5296100, NULL, NULL, true),
  (1, 'Támesis Pub', 'tamesis-pub', 'Av. Manuel Rivera, 5, 34002 Palencia', 'salon', 'pub', 42.0091706, -4.5279473, '+34 979 73 02 46', NULL, true),
  (1, 'Café Bar Oxford', 'cafe-bar-oxford', 'Av. Modesto Lafuente, 13, 34002 Palencia', 'salon', 'pub', 42.0059362, -4.5261151, '+34 979 07 01 43', 'http://www.cafebaroxford.es/', true),

  -- SALAS INDEPENDIENTES Y RECINTOS CULTURALES
  (1, 'Pub Sala Jet Set', 'sala-jet-set', 'C. Panaderas, 12, 34001 Palencia', 'otros', 'sala_conciertos', 42.0069678, -4.5329809, '+34 979 10 94 14', NULL, true),
  (1, 'Sala Infinity', 'sala-infinity', 'C. Extremadura, 5, 34004 Palencia', 'otros', 'sala_conciertos', 42.0066032, -4.5190811, NULL, NULL, true),
  (1, 'Open Karaoke & disco', 'open-karaoke-disco', 'C. Antonio Maura, 34005 Palencia', 'otros', 'discoteca', 42.0126787, -4.5347139, '+34 674 32 73 77', NULL, true),
  (1, 'Teatro Principal de Palencia', 'teatro-principal', 'C. Burgos, 3, 34001 Palencia', 'otros', 'teatro', 42.0098000, -4.5312000, '+34 979 71 82 00', 'https://teatroprincipaldepalencia.es/', true),
  (1, 'Cines Ortega', 'cines-ortega', 'C. Colón, 2, 34002 Palencia', 'otros', 'cine', 42.0089000, -4.5298000, '+34 979 74 24 55', 'https://cinesortega.com/', true),
  (1, 'Cine Avenida', 'cine-avenida', 'Av. Valladolid, 35, 34004 Palencia', 'otros', 'cine', 41.9996000, -4.5248000, '+34 979 72 20 62', 'https://cinespalencia.com/', true)

ON CONFLICT (city_id, slug) DO UPDATE SET
  address = COALESCE(venues.address, EXCLUDED.address),
  zone = COALESCE(venues.zone, EXCLUDED.zone),
  category = COALESCE(venues.category, EXCLUDED.category),
  latitude = COALESCE(venues.latitude, EXCLUDED.latitude),
  longitude = COALESCE(venues.longitude, EXCLUDED.longitude),
  phone = COALESCE(venues.phone, EXCLUDED.phone),
  website_url = COALESCE(venues.website_url, EXCLUDED.website_url),
  is_active = venues.is_active;

-- Sincronizar secuencia asociada a venues.id con el valor máximo real de la tabla
SELECT setval(
  pg_get_serial_sequence('venues', 'id'),
  (SELECT GREATEST(COALESCE(MAX(id), 0), 9999) FROM venues),
  true
);

COMMIT;
