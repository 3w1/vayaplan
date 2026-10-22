-- VayaPlan — Migración 012: Modelo de Rutas Gastronómicas
-- Fecha: 2026-10-22
-- Alcance: Tablas de rutas gastronómicas y locales participantes con propuestas culinarias concretas.
-- Principios de producto: Selección temática sin itinerario, sin orden público de visita ni ranking.
-- display_order es de uso técnico interno para estabilidad administrativa.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Tabla de Rutas Gastronómicas
CREATE TABLE IF NOT EXISTS gastronomic_routes (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    summary VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'tapas',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    start_date DATE,
    end_date DATE,
    image_url TEXT,
    image_thumb_url TEXT,
    badge_label VARCHAR(50),
    approximate_price_cents INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_gastronomic_routes_city_slug UNIQUE (city_id, slug),
    CONSTRAINT chk_gastronomic_routes_status CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT chk_gastronomic_routes_category CHECK (category IN ('tapas', 'bravas', 'puchero', 'reposteria', 'vino', 'general')),
    CONSTRAINT chk_gastronomic_routes_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_gastronomic_routes_price CHECK (approximate_price_cents IS NULL OR approximate_price_cents >= 0)
);

COMMENT ON TABLE gastronomic_routes IS 'Selecciones editoriales curadas de locales participantes en torno a un hilo temático gastronómico';
COMMENT ON COLUMN gastronomic_routes.category IS 'Categoría temática cerrada: tapas, bravas, puchero, reposteria, vino, general';
COMMENT ON COLUMN gastronomic_routes.status IS 'Estado editorial de la ruta: draft, published, archived';
COMMENT ON COLUMN gastronomic_routes.start_date IS 'Fecha de inicio para rutas de temporada (NULL si es permanente)';
COMMENT ON COLUMN gastronomic_routes.end_date IS 'Fecha de fin para rutas de temporada (NULL si es permanente)';
COMMENT ON COLUMN gastronomic_routes.approximate_price_cents IS 'Precio medio orientativo por persona o tapa en céntimos de euro';

-- 2. Tabla de Locales Participantes
CREATE TABLE IF NOT EXISTS gastronomic_route_participants (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES gastronomic_routes(id) ON DELETE CASCADE,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    display_order INT NOT NULL DEFAULT 1,
    dish_name VARCHAR(150) NOT NULL,
    dish_description TEXT,
    dish_price_cents INT,
    dish_image_url TEXT,
    is_optional BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_route_participant_venue UNIQUE (route_id, venue_id),
    CONSTRAINT uq_route_participant_display_order UNIQUE (route_id, display_order),
    CONSTRAINT chk_route_participant_display_order CHECK (display_order > 0),
    CONSTRAINT chk_route_participant_dish_price CHECK (dish_price_cents IS NULL OR dish_price_cents >= 0)
);

COMMENT ON TABLE gastronomic_route_participants IS 'Participación de un venue en una ruta gastronómica con su propuesta culinaria concreta';
COMMENT ON COLUMN gastronomic_route_participants.display_order IS 'Orden técnico interno para predictibilidad en panel y consultas; no expuesto como orden público';
COMMENT ON COLUMN gastronomic_route_participants.dish_image_url IS 'Fotografía opcional de la tapa o propuesta concreta en esta ruta';
COMMENT ON COLUMN gastronomic_route_participants.is_optional IS 'Indica si es una recomendación especial o fuera de carta';
COMMENT ON COLUMN gastronomic_route_participants.is_active IS 'Indica si la participación concreta en esta ruta está activa';

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_gastronomic_routes_city_status 
    ON gastronomic_routes(city_id, status);

CREATE INDEX IF NOT EXISTS idx_route_participants_route_order 
    ON gastronomic_route_participants(route_id, display_order);

CREATE INDEX IF NOT EXISTS idx_route_participants_venue 
    ON gastronomic_route_participants(venue_id);

CREATE INDEX IF NOT EXISTS idx_route_participants_active 
    ON gastronomic_route_participants(route_id, is_active);

COMMIT;
