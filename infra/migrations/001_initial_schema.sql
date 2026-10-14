-- VayaPlan — Migración Inicial de Esquema (DDL v1.1)
-- Base de datos: PostgreSQL 16
-- Zona horaria recomendada: Europe/Madrid

-- 1. Tabla de Ciudades
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Madrid',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla de Venues (Locales / Espacios)
CREATE TABLE IF NOT EXISTS venues (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    google_maps_url TEXT,
    instagram_handle VARCHAR(100),
    whatsapp_contact VARCHAR(30),
    website_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, slug)
);

-- 3. Tabla de Eventos
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    editorial_date DATE NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    is_free BOOLEAN NOT NULL DEFAULT true,
    image_url TEXT,
    source_type VARCHAR(30) NOT NULL,
    source_url TEXT,
    source_hash VARCHAR(128),
    dedupe_key VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'tentative',
    verified_at TIMESTAMPTZ,
    verified_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices compuestos para eventos
CREATE INDEX IF NOT EXISTS idx_events_lookup
ON events (city_id, editorial_date, status, start_time);

CREATE INDEX IF NOT EXISTS idx_events_dedupe
ON events (city_id, venue_id, editorial_date, dedupe_key);

-- 4. Tabla de Recurrencias
CREATE TABLE IF NOT EXISTS recurrences (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    day_of_week INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    price_cents INT NOT NULL DEFAULT 0,
    is_free BOOLEAN NOT NULL DEFAULT true,
    requires_booking BOOLEAN NOT NULL DEFAULT false,
    booking_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabla de Excepciones de Recurrencias
CREATE TABLE IF NOT EXISTS recurrence_exceptions (
    id SERIAL PRIMARY KEY,
    recurrence_id INT NOT NULL REFERENCES recurrences(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    modified_start_time TIME,
    modified_end_time TIME,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recurrence_id, exception_date)
);

-- 6. Tabla de Lugares Permanentes (Places)
CREATE TABLE IF NOT EXISTS places (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    venue_id INT REFERENCES venues(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    highlight_text VARCHAR(255) NOT NULL,
    description TEXT,
    opening_hours_text VARCHAR(255),
    price_text VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    google_maps_url TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, slug)
);

-- 7. Tabla de Promociones (Monetización)
CREATE TABLE IF NOT EXISTS promotions (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    editorial_date DATE NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    price_cents INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para búsqueda de promociones activas
CREATE INDEX IF NOT EXISTS idx_promotions_active
ON promotions (starts_at, ends_at, status);

-- Garantiza que solo pueda existir una promoción activa por ciudad y día editorial
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotions_city_editorial_date
ON promotions (city_id, editorial_date)
WHERE status = 'active';

-- 8. Tabla de Métricas de Eventos
CREATE TABLE IF NOT EXISTS event_metrics (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    promotion_id INT REFERENCES promotions(id) ON DELETE SET NULL,
    metric_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    session_hash VARCHAR(64),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB
);

-- Índices para cálculo y agregación de métricas
CREATE INDEX IF NOT EXISTS idx_event_metrics_event
ON event_metrics (event_id, metric_type, occurred_at);

-- Permite calcular acciones únicas por sesión anónima
CREATE INDEX IF NOT EXISTS idx_event_metrics_unique_action
ON event_metrics (event_id, metric_type, session_hash, occurred_at);

-- 9. Tabla de Fuentes QR (Alojamientos / Puntos de distribución)
CREATE TABLE IF NOT EXISTS qr_sources (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    accommodation_name VARCHAR(150) NOT NULL,
    accommodation_type VARCHAR(50),
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers para actualización automática del campo updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venues_updated_at ON venues;
CREATE TRIGGER trg_venues_updated_at
BEFORE UPDATE ON venues
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_recurrences_updated_at ON recurrences;
CREATE TRIGGER trg_recurrences_updated_at
BEFORE UPDATE ON recurrences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_places_updated_at ON places;
CREATE TRIGGER trg_places_updated_at
BEFORE UPDATE ON places
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
