-- ==============================================================================
-- VayaPlan — Fixtures de prueba aislados para Sprint 4 (Promociones e Informes)
-- EXCLUSIVO PARA BASE DE DATOS DE PRUEBAS / INTEGRATION TESTS
-- ¡NO EJECUTAR EN PRODUCCIÓN!
-- ==============================================================================

BEGIN;

-- Limpieza previa para garantizar reejecución limpia e idempotente de fixtures
DELETE FROM event_metrics WHERE session_hash LIKE 'fixture_%';
DELETE FROM promotions WHERE editorial_date IN ('2026-10-15', '2026-10-30', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04');
DELETE FROM events WHERE dedupe_key LIKE 'palencia-test-%';

-- 1. Insertar evento de prueba si no existe (identificado por dedupe_key)
INSERT INTO events (
    city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    image_url, source_type, source_url, source_hash, dedupe_key,
    status, verified_at, verified_by, created_at, updated_at
)
SELECT 
    c.id, v.id,
    'Concierto Test Sprint 4: Banda de Prueba',
    'Evento creado exclusivamente para la batería de pruebas de promociones del Sprint 4.',
    'musica_directo',
    '2026-10-30 22:00:00+02',
    '2026-10-31 02:00:00+02',
    '2026-10-30',
    1000,
    false,
    'https://media.vayaplan.com/events/test-sprint4-promo.webp',
    'manual',
    'https://vayaplan.com/test-event',
    'test-hash-sprint4-fixtures-001',
    'palencia-test-venue-2026-10-30-banda-prueba',
    'published',
    now(),
    'Test Suite Runner',
    now(),
    now()
FROM cities c
CROSS JOIN venues v
WHERE c.slug = 'palencia' AND v.slug = 'universonoro'
  AND NOT EXISTS (
    SELECT 1 FROM events WHERE dedupe_key = 'palencia-test-venue-2026-10-30-banda-prueba'
  )
LIMIT 1;

-- 2. Insertar promoción activa de prueba para dicho evento (si no existe)
INSERT INTO promotions (
    city_id, event_id, venue_id, editorial_date, starts_at, ends_at, price_cents, status, created_at
)
SELECT 
    e.city_id, e.id, e.venue_id, e.editorial_date,
    now() - INTERVAL '1 hour',
    '2026-10-31 06:00:00+02',
    1900,
    'active',
    now()
FROM events e
WHERE e.dedupe_key = 'palencia-test-venue-2026-10-30-banda-prueba'
  AND NOT EXISTS (
    SELECT 1 FROM promotions p 
    WHERE p.event_id = e.id
  )
LIMIT 1;

-- 3. Limpiar métricas previas del evento del fixture para garantizar idempotencia
-- y evitar duplicación al repetir la ejecución del fixture
DELETE FROM event_metrics
WHERE event_id = (SELECT id FROM events WHERE dedupe_key = 'palencia-test-venue-2026-10-30-banda-prueba');

-- 4. Insertar métricas de prueba asociadas exclusivamente a la promoción del evento del fixture
-- Todas con occurred_at estrictamente dentro del intervalo starts_at <= occurred_at < ends_at
-- (2026-10-30 00:00:00+02 <= occurred_at < 2026-10-31 06:00:00+02)

-- a) Métricas atribuidas directamente a la promoción (con promotion_id y en ventana)
INSERT INTO event_metrics (event_id, promotion_id, metric_type, channel, session_hash, occurred_at)
SELECT 
    p.event_id, p.id, m.metric_type, m.channel, m.session_hash, m.occurred_at
FROM events e
INNER JOIN promotions p ON p.event_id = e.id
CROSS JOIN (
    VALUES
        ('impression', 'web', 'fixture_session_alpha', '2026-10-30 10:15:00+02'::timestamptz),
        ('impression', 'web', 'fixture_session_alpha', '2026-10-30 10:45:00+02'::timestamptz),
        ('impression', 'web', 'fixture_session_beta', '2026-10-30 12:00:00+02'::timestamptz),
        ('impression', 'web', 'fixture_session_gamma', '2026-10-30 14:30:00+02'::timestamptz),
        ('map_click', 'web', 'fixture_session_alpha', '2026-10-30 15:00:00+02'::timestamptz),
        ('map_click', 'web', 'fixture_session_beta', '2026-10-30 16:20:00+02'::timestamptz),
        ('ticket_click', 'web', 'fixture_session_alpha', '2026-10-30 17:00:00+02'::timestamptz),
        ('whatsapp_click', 'web', 'fixture_session_gamma', '2026-10-30 18:10:00+02'::timestamptz),
        ('channel_view', 'whatsapp_channel', NULL, '2026-10-30 19:00:00+02'::timestamptz)
) AS m(metric_type, channel, session_hash, occurred_at)
WHERE e.dedupe_key = 'palencia-test-venue-2026-10-30-banda-prueba';

-- b) Métricas generales del evento no atribuibles a la promoción
-- (ejemplo: escaneos QR de alojamiento sin promotion_id o tráfico orgánico)
INSERT INTO event_metrics (event_id, promotion_id, metric_type, channel, session_hash, occurred_at)
SELECT 
    p.event_id, NULL, m.metric_type, m.channel, m.session_hash, m.occurred_at
FROM events e
INNER JOIN promotions p ON p.event_id = e.id
CROSS JOIN (
    VALUES
        ('qr_scan', 'qr_hotel', 'fixture_session_hotel_guest', '2026-10-30 11:30:00+02'::timestamptz),
        ('impression', 'web', 'fixture_session_organic_visitor', '2026-10-30 09:15:00+02'::timestamptz)
) AS m(metric_type, channel, session_hash, occurred_at)
WHERE e.dedupe_key = 'palencia-test-venue-2026-10-30-banda-prueba';

-- ==============================================================================
-- 5. Casos de Prueba para Nuevas Validaciones de Seguridad (Sprint 4)
-- ==============================================================================

-- Caso 5.1: Evento borrador no publicado (tentative) con venue real
-- Propósito: Verificar que POST /api/v1/admin/promotions rechaza con HTTP 400 (invalid_event_status)
INSERT INTO events (
    city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    source_type, dedupe_key, status, created_at, updated_at
)
SELECT 
    c.id, v.id,
    'Evento Test Borrador No Publicado',
    'Evento borrador para verificar que no se pueden crear promociones si status != published.',
    'teatro',
    '2026-11-01 20:00:00+01',
    '2026-11-01 22:00:00+01',
    '2026-11-01',
    0, true,
    'manual',
    'palencia-test-event-draft-unpublished',
    'tentative',
    now(), now()
FROM cities c
CROSS JOIN venues v
WHERE c.slug = 'palencia' AND v.slug = 'teatro-principal'
  AND NOT EXISTS (
    SELECT 1 FROM events WHERE dedupe_key = 'palencia-test-event-draft-unpublished'
  )
LIMIT 1;

-- Caso 5.2: Evento con local por verificar (venue 9999)
-- Propósito: Verificar que POST /api/v1/admin/promotions rechaza con HTTP 400 (venue_not_assigned)
INSERT INTO events (
    city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    source_type, dedupe_key, status, created_at, updated_at
)
SELECT 
    c.id, v.id,
    'Evento Test con Venue 9999 Por Verificar',
    'Evento publicado pero con local provisional 9999 para verificar rechazo de promoción.',
    'cultura',
    '2026-11-02 19:00:00+01',
    '2026-11-02 21:00:00+01',
    '2026-11-02',
    0, true,
    'manual',
    'palencia-test-event-unverified-venue-9999',
    'published',
    now(), now()
FROM cities c
CROSS JOIN venues v
WHERE c.slug = 'palencia' AND (v.id = 9999 OR v.slug = 'local-por-verificar-borrador')
  AND NOT EXISTS (
    SELECT 1 FROM events WHERE dedupe_key = 'palencia-test-event-unverified-venue-9999'
  )
LIMIT 1;

-- Caso 5.3: Evento y promoción en estado 'scheduled' (caso VÁLIDO para cancel y refund)
INSERT INTO events (
    city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    source_type, dedupe_key, status, created_at, updated_at
)
SELECT 
    c.id, v.id,
    'Evento Test con Promoción Scheduled',
    'Evento con promoción programada para test de cancelación y reembolso válidos.',
    'musica_directo',
    '2026-11-03 21:00:00+01',
    '2026-11-03 23:30:00+01',
    '2026-11-03',
    1500, false,
    'manual',
    'palencia-test-event-scheduled-promo',
    'published',
    now(), now()
FROM cities c
CROSS JOIN venues v
WHERE c.slug = 'palencia' AND v.slug = 'universonoro'
  AND NOT EXISTS (
    SELECT 1 FROM events WHERE dedupe_key = 'palencia-test-event-scheduled-promo'
  )
LIMIT 1;

INSERT INTO promotions (
    city_id, event_id, venue_id, editorial_date, starts_at, ends_at, price_cents, status, created_at
)
SELECT 
    e.city_id, e.id, e.venue_id, e.editorial_date,
    '2026-11-03 00:00:00+01',
    '2026-11-04 06:00:00+01',
    1900,
    'scheduled',
    now()
FROM events e
WHERE e.dedupe_key = 'palencia-test-event-scheduled-promo'
  AND NOT EXISTS (
    SELECT 1 FROM promotions p WHERE p.event_id = e.id
  )
LIMIT 1;

-- Caso 5.4: Evento y promoción en estado 'completed' (caso INVÁLIDO para cancel y refund)
INSERT INTO events (
    city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    source_type, dedupe_key, status, created_at, updated_at
)
SELECT 
    c.id, v.id,
    'Evento Test con Promoción Completed',
    'Evento con promoción finalizada para test de rechazo de cancelación/reembolso.',
    'dj_tardeo',
    '2026-10-15 19:00:00+02',
    '2026-10-15 23:00:00+02',
    '2026-10-15',
    0, true,
    'manual',
    'palencia-test-event-completed-promo',
    'published',
    now(), now()
FROM cities c
CROSS JOIN venues v
WHERE c.slug = 'palencia' AND v.slug = 'universonoro'
  AND NOT EXISTS (
    SELECT 1 FROM events WHERE dedupe_key = 'palencia-test-event-completed-promo'
  )
LIMIT 1;

INSERT INTO promotions (
    city_id, event_id, venue_id, editorial_date, starts_at, ends_at, price_cents, status, created_at
)
SELECT 
    e.city_id, e.id, e.venue_id, e.editorial_date,
    '2026-10-15 00:00:00+02',
    '2026-10-16 06:00:00+02',
    1900,
    'completed',
    now()
FROM events e
WHERE e.dedupe_key = 'palencia-test-event-completed-promo'
  AND NOT EXISTS (
    SELECT 1 FROM promotions p WHERE p.event_id = e.id
  )
LIMIT 1;

-- Caso 5.5: Evento y promoción en estado 'cancelled' (caso INVÁLIDO para cancel redundante y refund)
INSERT INTO events (
    city_id, venue_id, title, description, category,
    start_time, end_time, editorial_date, price_cents, is_free,
    source_type, dedupe_key, status, created_at, updated_at
)
SELECT 
    c.id, v.id,
    'Evento Test con Promoción Cancelled',
    'Evento con promoción cancelada previamente para test de rechazo de cancelación redundante.',
    'musica_directo',
    '2026-11-04 20:00:00+01',
    '2026-11-04 23:00:00+01',
    '2026-11-04',
    1200, false,
    'manual',
    'palencia-test-event-cancelled-promo',
    'published',
    now(), now()
FROM cities c
CROSS JOIN venues v
WHERE c.slug = 'palencia' AND v.slug = 'teatro-principal'
  AND NOT EXISTS (
    SELECT 1 FROM events WHERE dedupe_key = 'palencia-test-event-cancelled-promo'
  )
LIMIT 1;

INSERT INTO promotions (
    city_id, event_id, venue_id, editorial_date, starts_at, ends_at, price_cents, status, created_at
)
SELECT 
    e.city_id, e.id, e.venue_id, e.editorial_date,
    '2026-11-04 00:00:00+01',
    '2026-11-05 06:00:00+01',
    1900,
    'cancelled',
    now()
FROM events e
WHERE e.dedupe_key = 'palencia-test-event-cancelled-promo'
  AND NOT EXISTS (
    SELECT 1 FROM promotions p WHERE p.event_id = e.id
  )
LIMIT 1;

COMMIT;
