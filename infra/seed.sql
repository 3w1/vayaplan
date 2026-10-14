-- VayaPlan — Seed inicial de prueba para Palencia
-- Idempotente: seguro para ejecutar en BD vacía o existente

-- 1. Ciudad de Palencia
INSERT INTO cities (id, name, slug, timezone, is_active, created_at)
VALUES (1, 'Palencia', 'palencia', 'Europe/Madrid', true, now())
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    timezone = EXCLUDED.timezone,
    is_active = EXCLUDED.is_active;

SELECT setval('cities_id_seq', (SELECT GREATEST(MAX(id), 1) FROM cities));

-- 2. Venues de prueba en Palencia
INSERT INTO venues (id, city_id, name, slug, address, latitude, longitude, google_maps_url, instagram_handle, whatsapp_contact, website_url, is_active, created_at, updated_at)
VALUES 
(
    1,
    1,
    'Bar Universonoro',
    'universonoro',
    'Calle San Juan de Dios, 3, 34002 Palencia',
    42.01210000,
    -4.53420000,
    'https://maps.google.com/?cid=12345678901234567890',
    'universonoro',
    '+34600112233',
    'https://universonoro.com',
    true,
    now(),
    now()
),
(
    2,
    1,
    'Teatro Principal de Palencia',
    'teatro-principal',
    'Calle de Burgos, 3, 34001 Palencia',
    42.00940000,
    -4.52980000,
    'https://maps.google.com/?cid=98765432109876543210',
    'teatroprincipalpalencia',
    '+34979706528',
    'https://teatroprincipaldepalencia.es',
    true,
    now(),
    now()
)
ON CONFLICT (city_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    google_maps_url = EXCLUDED.google_maps_url,
    instagram_handle = EXCLUDED.instagram_handle,
    whatsapp_contact = EXCLUDED.whatsapp_contact,
    website_url = EXCLUDED.website_url,
    is_active = EXCLUDED.is_active,
    updated_at = now();

SELECT setval('venues_id_seq', (SELECT GREATEST(MAX(id), 2) FROM venues));

-- 3. Eventos futuros de prueba (publicados y con editorial_date)
INSERT INTO events (
    id, city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    image_url, source_type, source_url, source_hash, dedupe_key,
    status, verified_at, verified_by, created_at, updated_at
)
VALUES
(
    1,
    1,
    1,
    'Concierto acústico: Los Invencibles',
    'Directo íntimo con versiones de pop-rock español en la sala principal.',
    'musica_directo',
    '2026-10-17 22:30:00+02',
    '2026-10-18 01:00:00+02',
    '2026-10-17',
    0,
    true,
    'https://media.vayaplan.com/events/palencia-universonoro-acustico.webp',
    'whatsapp',
    'https://wa.me/34600112233',
    'hash-test-concierto-001',
    'palencia-universonoro-2026-10-17-concierto-acustico',
    'published',
    '2026-10-15 10:12:00+02',
    'Curador Palencia',
    now(),
    now()
),
(
    2,
    1,
    2,
    'Obra de Teatro: El Viaje a Ninguna Parte',
    'Representación clásica de la compañía de teatro castellanoleonesa. Entradas numeradas en taquilla y web.',
    'teatro',
    '2026-10-18 19:30:00+02',
    '2026-10-18 21:30:00+02',
    '2026-10-18',
    1200,
    false,
    'https://media.vayaplan.com/events/palencia-teatro-el-viaje.webp',
    'web',
    'https://teatroprincipaldepalencia.es/entradas/el-viaje',
    'hash-test-teatro-002',
    'palencia-teatro-principal-2026-10-18-el-viaje',
    'published',
    '2026-10-15 11:00:00+02',
    'Curador Palencia',
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE
SET city_id = EXCLUDED.city_id,
    venue_id = EXCLUDED.venue_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    editorial_date = EXCLUDED.editorial_date,
    price_cents = EXCLUDED.price_cents,
    is_free = EXCLUDED.is_free,
    image_url = EXCLUDED.image_url,
    source_type = EXCLUDED.source_type,
    source_url = EXCLUDED.source_url,
    status = EXCLUDED.status,
    verified_at = EXCLUDED.verified_at,
    verified_by = EXCLUDED.verified_by,
    updated_at = now();

SELECT setval('events_id_seq', (SELECT GREATEST(MAX(id), 2) FROM events));

-- 4. Recurrencia semanal de prueba
-- Viernes (day_of_week = 5) en Bar Universonoro
INSERT INTO recurrences (
    id, city_id, venue_id, day_of_week, title, description,
    category, start_time, end_time, price_cents, is_free,
    requires_booking, booking_url, is_active, created_at, updated_at
)
VALUES
(
    1,
    1,
    1,
    5,
    'Sesión Tardeo DJ Universonoro',
    'Cada viernes por la tarde, selección de indie y ritmos frescos para empezar el fin de semana.',
    'dj_tardeo',
    '18:00:00',
    '22:00:00',
    0,
    true,
    false,
    NULL,
    true,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    price_cents = EXCLUDED.price_cents,
    is_free = EXCLUDED.is_free,
    is_active = EXCLUDED.is_active,
    updated_at = now();

SELECT setval('recurrences_id_seq', (SELECT GREATEST(MAX(id), 1) FROM recurrences));

-- 5. Place de prueba con categoría cine
INSERT INTO places (
    id, city_id, venue_id, name, slug, category,
    highlight_text, description, opening_hours_text, price_text,
    latitude, longitude, google_maps_url, image_url, is_active, created_at, updated_at
)
VALUES
(
    1,
    1,
    NULL,
    'Cine Ortega',
    'cine-ortega',
    'cine',
    'El cine histórico del centro de Palencia con cartelera de estreno.',
    'Salas de cine tradicionales situadas en la calle Mayor. Sesiones comerciales y ciclos culturales los fines de semana.',
    'Miércoles a Domingo de 17:00 a 22:30',
    '6,50 € (Día del espectador) / 8,00 € ordinaria',
    42.01020000,
    -4.53120000,
    'https://maps.google.com/?cid=11223344556677889900',
    'https://media.vayaplan.com/places/palencia-cine-ortega.webp',
    true,
    now(),
    now()
)
ON CONFLICT (city_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    highlight_text = EXCLUDED.highlight_text,
    description = EXCLUDED.description,
    opening_hours_text = EXCLUDED.opening_hours_text,
    price_text = EXCLUDED.price_text,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    google_maps_url = EXCLUDED.google_maps_url,
    image_url = EXCLUDED.image_url,
    is_active = EXCLUDED.is_active,
    updated_at = now();

SELECT setval('places_id_seq', (SELECT GREATEST(MAX(id), 1) FROM places));
