BEGIN;

-- Ajuste acotado de timeouts para protección en producción y ensayo
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Verificación de tipos existentes e incorporación segura de columnas aditivas
DO $$
DECLARE
  v_col RECORD;
BEGIN
  -- 1. Columna zone (VARCHAR(50))
  SELECT data_type, character_maximum_length INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'zone';

  IF FOUND THEN
    IF v_col.data_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Abortado: La columna "zone" ya existe con tipo incompatible: %', v_col.data_type;
    END IF;
  ELSE
    ALTER TABLE venues ADD COLUMN zone VARCHAR(50);
  END IF;

  -- 2. Columna category (VARCHAR(50))
  SELECT data_type, character_maximum_length INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category';

  IF FOUND THEN
    IF v_col.data_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Abortado: La columna "category" ya existe con tipo incompatible: %', v_col.data_type;
    END IF;
  ELSE
    ALTER TABLE venues ADD COLUMN category VARCHAR(50);
  END IF;

  -- 3. Columna phone (VARCHAR(50))
  SELECT data_type, character_maximum_length INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'phone';

  IF FOUND THEN
    IF v_col.data_type NOT IN ('character varying', 'text') THEN
      RAISE EXCEPTION 'Abortado: La columna "phone" ya existe con tipo incompatible: %', v_col.data_type;
    END IF;
  ELSE
    ALTER TABLE venues ADD COLUMN phone VARCHAR(50);
  END IF;

  -- Nota: website_url ya está definida en el esquema base (001_initial_schema.sql)
  -- y se conserva intacta sin alteración ni recreación.
END $$;

COMMIT;
