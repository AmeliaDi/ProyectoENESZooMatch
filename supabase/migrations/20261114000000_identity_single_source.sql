-- =============================================================================
-- Identidad única y fija: huevo → eclosión (paso 1 de 2)
--
-- Regla de oro: la identidad (animal, color, sufijo y alias) se calcula UNA
-- vez al eclosionar, se guarda aquí y nunca se recalcula. Todo lo demás lee
-- este registro.
--
-- Transaccional e idempotente. Respaldo verificado antes de aplicar:
--   node --no-warnings scripts/db-backup.mts --out .backups/pre-identidad-fija
--   node --no-warnings scripts/db-restore.mts --from .backups/pre-identidad-fija --dry-run
--
-- Paso 2 (`20261116000000_identity_drop_legacy.sql`): borra `profiles.alias`
-- cuando la app ya no lo lee.
--
-- Convención de congelación: `eclosionado_en IS NOT NULL` significa
-- "identidad canónica escrita y cerrada". Mientras sea NULL la fila es una
-- herencia del cálculo antiguo que la fase 6 todavía puede reescribir.
-- =============================================================================

BEGIN;

-- ─── 1. Columnas de identidad ────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS estado_identidad TEXT NOT NULL DEFAULT 'huevo',
  ADD COLUMN IF NOT EXISTS alias_animal TEXT,
  ADD COLUMN IF NOT EXISTS alias_color TEXT,
  ADD COLUMN IF NOT EXISTS alias_sufijo TEXT,
  ADD COLUMN IF NOT EXISTS alias_completo TEXT,
  ADD COLUMN IF NOT EXISTS eclosionado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revelacion_vista BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_estado_identidad_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_estado_identidad_check
  CHECK (estado_identidad IN ('huevo', 'eclosionado'));

-- "Test completo" sólo garantiza los vectores: la identidad vive en
-- `profiles_identity_shape`. Se suelta antes de normalizar los datos.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_completed_is_whole;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_completed_vectors;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_completed_vectors CHECK (
    quiz_completed_at IS NULL
    OR (cardinality(romance_vector) = 26 AND cardinality(amistad_vector) = 16)
  );

-- ─── 2. Normalización de los datos existentes ────────────────────────────────
-- Con núcleo completo conservan el alias visible de hoy (nadie cambia de
-- nombre durante el despliegue) y quedan pendientes de la fase 6, que
-- reescribirá la identidad canónica y la congelará.

UPDATE public.profiles
SET estado_identidad = 'eclosionado',
    alias_completo = alias
WHERE quiz_completed_at IS NOT NULL
  AND alias IS NOT NULL
  AND animal_id IS NOT NULL
  AND color_id IS NOT NULL
  AND estado_identidad = 'huevo';

-- Todo lo demás vuelve a huevo: sin núcleo completo no se calcula animal ni
-- color, y se eliminan los alias heredados inconsistentes. Las respuestas
-- parciales se conservan para que la persona pueda seguir.
UPDATE public.profiles
SET animal_id = NULL,
    color_id = NULL,
    alias = NULL,
    alias_animal = NULL,
    alias_color = NULL,
    alias_sufijo = NULL,
    alias_completo = NULL,
    eclosionado_en = NULL,
    avatar_mark = NULL,
    color_asignado_en = NULL
WHERE estado_identidad = 'huevo';

-- Ortografía de dos diminutivos del catálogo (afecta a alias ya guardados).
UPDATE public.profiles
SET alias = replace(alias, 'libelula ', 'libélula '),
    alias_completo = replace(alias_completo, 'libelula ', 'libélula '),
    alias_animal = CASE WHEN alias_animal = 'libelula' THEN 'libélula' ELSE alias_animal END
WHERE alias LIKE 'libelula %';

UPDATE public.profiles
SET alias = replace(alias, 'pinguino ', 'pinguinito '),
    alias_completo = replace(alias_completo, 'pinguino ', 'pinguinito '),
    alias_animal = CASE WHEN alias_animal = 'pinguino' THEN 'pinguinito' ELSE alias_animal END
WHERE alias LIKE 'pinguino %';

UPDATE public.animals SET diminutivo_es = 'libélula' WHERE id = 'libelula';
UPDATE public.animals SET diminutivo_es = 'pinguinito' WHERE id = 'pinguino';

-- ─── 3. Restricciones de forma (sobre datos ya normalizados) ─────────────────

-- Un huevo no tiene animal, color ni alias; una identidad eclosionada sí.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_identity_shape;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_identity_shape CHECK (
    CASE estado_identidad
      WHEN 'huevo' THEN
        animal_id IS NULL AND color_id IS NULL AND alias IS NULL
        AND alias_animal IS NULL AND alias_color IS NULL AND alias_sufijo IS NULL
        AND alias_completo IS NULL AND eclosionado_en IS NULL
      ELSE
        (animal_id IS NOT NULL AND color_id IS NOT NULL
         AND alias IS NOT NULL AND alias_completo IS NOT NULL)
        AND (
          eclosionado_en IS NULL
          OR (
            alias_completo = alias
            AND alias_animal IS NOT NULL AND alias_color IS NOT NULL AND alias_sufijo IS NOT NULL
          )
        )
    END
  );

-- Formato del alias visible: "{animal-diminutivo} {color-concordado} · XXXX"
-- (21 consonantes sin vocales, máximo 64 caracteres). Sólo se exige a la
-- identidad canónica; las heredadas se normalizan y congelan en la fase 6.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_alias_completo_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_alias_completo_format CHECK (
    eclosionado_en IS NULL OR (
      alias_completo = alias
      AND char_length(alias_completo) BETWEEN 8 AND 64
      AND alias_completo ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)* · [BCDFGHJKLMNPQRSTVWXYZ]{4}$'
      AND alias_sufijo ~ '^[BCDFGHJKLMNPQRSTVWXYZ]{4}$'
      AND alias_animal ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$'
      AND alias_color ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_alias_completo_key
  ON public.profiles (alias_completo) WHERE alias_completo IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_estado_identidad_idx
  ON public.profiles (estado_identidad);

-- ─── 4. La identidad no se edita una vez eclosionada ─────────────────────────

CREATE OR REPLACE FUNCTION private.reject_identity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_is_full_reset BOOLEAN;
BEGIN
  IF OLD.eclosionado_en IS NULL THEN
    RETURN NEW;
  END IF;

  -- Único cambio permitido: el reinicio administrativo, que devuelve la
  -- persona a huevo borrando la identidad completa.
  v_is_full_reset := NEW.estado_identidad = 'huevo'
    AND NEW.animal_id IS NULL AND NEW.color_id IS NULL
    AND NEW.alias IS NULL AND NEW.alias_completo IS NULL
    AND NEW.eclosionado_en IS NULL;

  IF NOT v_is_full_reset AND (
       NEW.animal_id      IS DISTINCT FROM OLD.animal_id
    OR NEW.color_id       IS DISTINCT FROM OLD.color_id
    OR NEW.alias          IS DISTINCT FROM OLD.alias
    OR NEW.alias_animal   IS DISTINCT FROM OLD.alias_animal
    OR NEW.alias_color    IS DISTINCT FROM OLD.alias_color
    OR NEW.alias_sufijo   IS DISTINCT FROM OLD.alias_sufijo
    OR NEW.alias_completo IS DISTINCT FROM OLD.alias_completo
    OR NEW.estado_identidad <> OLD.estado_identidad
  ) THEN
    RAISE EXCEPTION 'identity is frozen after hatching (user %)', OLD.user_id
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_identity_immutable ON public.profiles;
CREATE TRIGGER profiles_identity_immutable
  BEFORE UPDATE OF animal_id, color_id, alias, alias_animal, alias_color,
                  alias_sufijo, alias_completo, estado_identidad, eclosionado_en
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_identity_mutation();

-- Eclosionar (o volver a huevo) también mueve el pool de matches.
DROP TRIGGER IF EXISTS profiles_pool_identity ON public.profiles;
CREATE TRIGGER profiles_pool_identity
  AFTER UPDATE OF estado_identidad ON public.profiles
  FOR EACH ROW
  WHEN (NEW.estado_identidad IS DISTINCT FROM OLD.estado_identidad)
  EXECUTE FUNCTION private.bump_pool_revision();

-- ─── 5. Eclosión: escritura única, idempotente y segura ante concurrencia ───

CREATE OR REPLACE FUNCTION public.hatch_profile_identity(
  p_user_id UUID,
  p_animal_id TEXT,
  p_color_id TEXT,
  p_alias_animal TEXT,
  p_alias_color TEXT,
  p_alias_sufijo TEXT,
  p_alias_completo TEXT,
  p_narrative TEXT,
  p_avatar_mark TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alias TEXT;
  v_estado TEXT;
  v_congelado TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_service_role();

  IF p_alias_completo !~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)* · [BCDFGHJKLMNPQRSTVWXYZ]{4}$'
     OR char_length(p_alias_completo) > 64
     OR p_alias_completo IS DISTINCT FROM p_alias_animal || ' ' || p_alias_color || ' · ' || p_alias_sufijo THEN
    RAISE EXCEPTION 'alias "% · %" has an invalid format', p_alias_animal, p_alias_sufijo
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.animals WHERE id = p_animal_id)
     OR NOT EXISTS (SELECT 1 FROM public.colors WHERE id = p_color_id) THEN
    RAISE EXCEPTION 'animal % or color % is outside the catalogue', p_animal_id, p_color_id
      USING ERRCODE = '22023';
  END IF;

  -- Bloqueo de fila: ante dos envíos concurrentes gana el primero y el
  -- segundo devuelve la identidad ya guardada sin tocarla.
  SELECT estado_identidad, eclosionado_en, alias_completo
    INTO v_estado, v_congelado, v_alias
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado = 'eclosionado' AND v_congelado IS NOT NULL THEN
    RETURN v_alias;
  END IF;

  -- Colisión de alias: el índice único es la última barrera. Aquí se rechaza
  -- y el servidor reintenta con el siguiente sufijo determinista.
  IF EXISTS (SELECT 1 FROM public.profiles
             WHERE alias_completo = p_alias_completo AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'alias % is already taken', p_alias_completo USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles SET
    estado_identidad = 'eclosionado',
    animal_id = p_animal_id,
    color_id = p_color_id,
    alias = p_alias_completo,
    alias_animal = p_alias_animal,
    alias_color = p_alias_color,
    alias_sufijo = p_alias_sufijo,
    alias_completo = p_alias_completo,
    narrative = p_narrative,
    avatar_mark = p_avatar_mark,
    color_asignado_en = COALESCE(color_asignado_en, now()),
    eclosionado_en = now()
  WHERE user_id = p_user_id
  RETURNING public.profiles.alias_completo INTO v_alias;

  RETURN v_alias;
END;
$$;

-- La revelación sólo se muestra una vez por persona.
CREATE OR REPLACE FUNCTION public.mark_identity_revealed(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();
  UPDATE public.profiles SET revelacion_vista = true
  WHERE user_id = p_user_id AND revelacion_vista = false;
  RETURN FOUND;
END;
$$;

-- ─── 6. submit_quiz_result deja de escribir identidad ────────────────────────
DROP FUNCTION IF EXISTS public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN
);

CREATE FUNCTION public.submit_quiz_result(
  p_user_id UUID,
  p_answers JSONB,
  p_dimension_scores JSONB,
  p_romance_vector DOUBLE PRECISION[],
  p_amistad_vector DOUBLE PRECISION[],
  p_mbti_code TEXT,
  p_hard_filters JSONB,
  p_animal_id TEXT,
  p_color_id TEXT,
  p_narrative TEXT,
  p_alias TEXT,
  p_latent_profile JSONB,
  p_avatar_mark TEXT,
  p_completed_modules TEXT[],
  -- The legacy signature kept its positional parameters so a server still
  -- running the pre-hatch build keeps resolving during the deploy window.
  -- None of them can write animal, color or alias once identity exists.
  p_preserve_color BOOLEAN DEFAULT false,
  p_alias_animal TEXT DEFAULT NULL,
  p_alias_color TEXT DEFAULT NULL,
  p_alias_sufijo TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alias TEXT;
  v_estado TEXT;
BEGIN
  PERFORM private.assert_service_role();

  IF COALESCE(cardinality(p_romance_vector), 0) <> 26
     OR COALESCE(cardinality(p_amistad_vector), 0) <> 16 THEN
    RAISE EXCEPTION 'Vectors must have 26 (romance) and 16 (amistad) dimensions'
      USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_unit_vector(p_romance_vector) OR NOT private.is_unit_vector(p_amistad_vector) THEN
    RAISE EXCEPTION 'Vector components must lie in [0, 1]' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Answers must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_latent_profile -> 'theta') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_latent_profile -> 'se') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Latent profile must carry theta and se objects' USING ERRCODE = '22023';
  END IF;

  SELECT estado_identidad, alias_completo
    INTO v_estado, v_alias
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET
    narrative = p_narrative,
    orientacion_sexual = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'orientacion_sexual', '[]'))),
    identidad_genero = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'identidad_genero', '[]'))),
    tipo_relacion_busca = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'tipo_relacion_busca', '[]'))),
    romance_vector = p_romance_vector,
    amistad_vector = p_amistad_vector,
    dimension_scores = p_dimension_scores,
    mbti_code = p_mbti_code,
    latent_profile = p_latent_profile,
    avatar_mark = CASE WHEN v_estado = 'eclosionado' THEN p_avatar_mark ELSE public.profiles.avatar_mark END,
    completed_modules = COALESCE(p_completed_modules, '{}'),
    quiz_completed_at = now()
  WHERE user_id = p_user_id
  RETURNING public.profiles.alias INTO v_alias;

  DELETE FROM public.quiz_responses WHERE user_id = p_user_id;
  INSERT INTO public.quiz_responses (user_id, item_id, likert_value, selected_options)
  SELECT
    p_user_id,
    answer ->> 'itemId',
    (answer ->> 'value')::SMALLINT,
    CASE WHEN answer ? 'selected'
      THEN ARRAY(SELECT jsonb_array_elements_text(answer -> 'selected'))
    END
  FROM jsonb_array_elements(p_answers) AS answer;

  RETURN v_alias;
END;
$$;

-- El reinicio administrativo devuelve la persona a huevo.
CREATE OR REPLACE FUNCTION public.admin_reset_quiz(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();
  UPDATE public.profiles SET
    quiz_completed_at = NULL,
    estado_identidad = 'huevo',
    animal_id = NULL,
    color_id = NULL,
    color_asignado_en = NULL,
    avatar_mark = NULL,
    narrative = NULL,
    alias = NULL,
    alias_animal = NULL,
    alias_color = NULL,
    alias_sufijo = NULL,
    alias_completo = NULL,
    eclosionado_en = NULL,
    revelacion_vista = false,
    orientacion_sexual = '{}',
    identidad_genero = '{}',
    tipo_relacion_busca = '{}',
    romance_vector = '{}',
    amistad_vector = '{}',
    dimension_scores = '{}',
    latent_profile = '{}',
    completed_modules = '{}',
    mbti_code = NULL
  WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM public.quiz_responses WHERE user_id = p_user;
  DELETE FROM public.matches WHERE p_user IN (user_a, user_b);
  RETURN true;
END;
$$;

-- ─── 7. Permisos ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION
  public.submit_quiz_result(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN, TEXT, TEXT, TEXT),
  public.hatch_profile_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.mark_identity_revealed(UUID),
  public.admin_reset_quiz(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.submit_quiz_result(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN, TEXT, TEXT, TEXT),
  public.hatch_profile_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.mark_identity_revealed(UUID),
  public.admin_reset_quiz(UUID)
TO service_role;

COMMIT;
