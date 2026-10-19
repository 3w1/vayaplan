-- VayaPlan — Migración 010: Piloto de Ampliación de Agenda (DDL v2.0 Consolidado)
-- 1. Soporte temporal explícito: start_time NULLable para eventos con hora pendiente, fecha tentativa o exposiciones
-- 2. Soporte para exposiciones: end_date y schedule_text para periodos de visita continuados (time_status = 'continuous')
-- 3. Soporte para festivales y ciclos: tabla festivals y tabla de relación N:M event_festivals (única fuente de verdad)
--
-- NOTA DE SEGURIDAD OPERATIVA:
-- Este script es aditivo y compatible hacia atrás. Todos los eventos existentes conservan
-- time_status = 'confirmed', end_date = NULL.
-- La asociación a festivales se gestiona exclusivamente mediante event_festivals (sin duplicar festival_id en events).
-- Ejecutar exclusivamente en el entorno local o de pruebas autorizado.

SET statement_timeout = '15s';
SET lock_timeout = '5s';

BEGIN;

-- 1. Creación de la tabla festivals (agrupación editorial de ciclos y festivales)
CREATE TABLE IF NOT EXISTS festivals (
  id SERIAL PRIMARY KEY,
  city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  edition VARCHAR(100) NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  official_url TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_id, slug),
  CONSTRAINT chk_festivals_dates CHECK (end_date >= start_date)
);

COMMENT ON TABLE festivals IS 'Festivales, ciclos y jornadas culturales que agrupan actividades individuales';
COMMENT ON COLUMN festivals.name IS 'Nombre institucional del festival o ciclo';
COMMENT ON COLUMN festivals.edition IS 'Edición específica (ej. XIII Edición, 2026)';
COMMENT ON COLUMN festivals.start_date IS 'Fecha de inicio general del festival';
COMMENT ON COLUMN festivals.end_date IS 'Fecha de clausura del festival';

-- 2. Permisividad de start_time NULL en events (para horario pendiente, exposiciones y fechas tentativas)
ALTER TABLE events ALTER COLUMN start_time DROP NOT NULL;

-- 3. Adición idempotente de columnas en events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS time_status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS end_date DATE NULL,
  ADD COLUMN IF NOT EXISTS schedule_text VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS approximate_schedule VARCHAR(100) NULL;

-- Si existiera festival_id de versiones preliminares en desarrollo local, retirarlo
ALTER TABLE events DROP COLUMN IF EXISTS festival_id;

-- 4. Restricciones de integridad de negocio
DO $$
BEGIN
  -- Validar valores de time_status: confirmed, pending_time, tentative_date, continuous
  ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_time_status_values;
  ALTER TABLE events
    ADD CONSTRAINT chk_events_time_status_values
    CHECK (time_status IN ('confirmed', 'pending_time', 'tentative_date', 'continuous'));

  -- Validar consistencia entre time_status y start_time:
  -- - confirmed: start_time obligatorio no nulo.
  -- - pending_time, tentative_date, continuous: start_time estrictamente NULL.
  ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_events_time_consistency;
  ALTER TABLE events
    ADD CONSTRAINT chk_events_time_consistency
    CHECK (
      (time_status = 'confirmed' AND start_time IS NOT NULL) OR
      (time_status IN ('pending_time', 'tentative_date', 'continuous') AND start_time IS NULL)
    );

  -- Validar que fechas tentativas no se publiquen en la agenda pública
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_tentative_date_publication'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT chk_events_tentative_date_publication
      CHECK (time_status != 'tentative_date' OR status != 'published');
  END IF;

  -- Validar consistencia de end_date respecto a editorial_date
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_end_date_consistency'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT chk_events_end_date_consistency
      CHECK (end_date IS NULL OR end_date >= editorial_date);
  END IF;
END $$;

-- 5. Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_events_date_range 
  ON events (city_id, editorial_date, end_date, status);

CREATE INDEX IF NOT EXISTS idx_events_time_status
  ON events (city_id, editorial_date, time_status)
  WHERE time_status != 'confirmed';

COMMENT ON COLUMN events.time_status IS 'Estado del señalamiento temporal: confirmed, pending_time, tentative_date o continuous';
COMMENT ON COLUMN events.end_date IS 'Fecha de clausura para exposiciones o muestras temporales de varios días';
COMMENT ON COLUMN events.schedule_text IS 'Horario textual publicado para exposiciones (ej. Mar a vie de 08:00 a 18:00 h)';
COMMENT ON COLUMN events.approximate_schedule IS 'Nota informativa orientativa para borradores no fijados (ej. Fin de semana)';

-- 6. Tabla de relación N:M para pertenencia a ciclos o festivales (ÚNICA FUENTE DE VERDAD)
CREATE TABLE IF NOT EXISTS event_festivals (
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  festival_id INT NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, festival_id)
);

CREATE INDEX IF NOT EXISTS idx_event_festivals_festival 
  ON event_festivals (festival_id);

COMMENT ON TABLE event_festivals IS 'Asociación múltiple entre eventos y ciclos o festivales (soporte de pertenencia a varios programas)';

COMMIT;
