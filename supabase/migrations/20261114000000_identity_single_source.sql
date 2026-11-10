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
  ADD COLUMN IF NOT EXISTS enneagram_code TEXT,
  ADD COLUMN IF NOT EXISTS eclosionado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revelacion_vista BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_estado_identidad_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_estado_identidad_check
  CHECK (estado_identidad IN ('huevo', 'eclosionado'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_enneagram_code_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_enneagram_code_format
  CHECK (enneagram_code IS NULL OR enneagram_code ~ '^[1-9](w[1-9])?$');

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
    alias_completo = alias,
    -- La lectura amable del eneagrama se deriva del color guardado, no del
    -- perfil: `ennea-4-w5` → "4w5" y `ennea-4` → "4w5" con el ala del anillo;
    -- `ennea-neblina` (sin tipo) deja el código NULL = "en exploración".
    enneagram_code = CASE
      WHEN color_id ~ '^ennea-[1-9](-w[1-9])?$' THEN translate(substring(color_id from 7), '-', '')
    END
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
    enneagram_code = NULL,
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
    AND NEW.enneagram_code IS NULL
    AND NEW.eclosionado_en IS NULL;

  IF NOT v_is_full_reset AND (
       NEW.animal_id      IS DISTINCT FROM OLD.animal_id
    OR NEW.color_id       IS DISTINCT FROM OLD.color_id
    OR NEW.alias          IS DISTINCT FROM OLD.alias
    OR NEW.alias_animal   IS DISTINCT FROM OLD.alias_animal
    OR NEW.alias_color    IS DISTINCT FROM OLD.alias_color
    OR NEW.alias_sufijo   IS DISTINCT FROM OLD.alias_sufijo
    OR NEW.alias_completo IS DISTINCT FROM OLD.alias_completo
    OR NEW.enneagram_code IS DISTINCT FROM OLD.enneagram_code
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
                  alias_sufijo, alias_completo, enneagram_code, estado_identidad, eclosionado_en
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
  p_enneagram_code TEXT,
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
  IF p_enneagram_code IS NOT NULL AND p_enneagram_code !~ '^[1-9](w[1-9])?$' THEN
    RAISE EXCEPTION 'enneagram readout "%" is outside the type/wing format', p_enneagram_code
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
    enneagram_code = p_enneagram_code,
    narrative = p_narrative,
    avatar_mark = p_avatar_mark,
    color_asignado_en = COALESCE(color_asignado_en, now()),
    eclosionado_en = now()
  WHERE user_id = p_user_id
  RETURNING public.profiles.alias_completo INTO v_alias;

  RETURN v_alias;
END;
$$;

-- La revelación sólo se muestra una vez por persona: la primera escritura a
-- `true` devuelve true; las siguientes, false.
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

-- ─── 6. submit_quiz_result deja de calcular identidad y eclosiona en su
-- ─     propia transacción (un solo round trip, nunca dos estados visibles).
DROP FUNCTION IF EXISTS public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN
);

CREATE OR REPLACE FUNCTION public.submit_quiz_result(
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
  -- `p_alias` is now ignored; the three parts below are the only way in, and
  -- they are written exactly once, by `hatch_profile_identity`.
  p_preserve_color BOOLEAN DEFAULT false,
  p_alias_animal TEXT DEFAULT NULL,
  p_alias_color TEXT DEFAULT NULL,
  p_alias_sufijo TEXT DEFAULT NULL,
  p_enneagram_code TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
  v_alias TEXT;
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

  SELECT estado_identidad INTO v_estado
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
    -- `avatar_mark` is deliberately absent: it belongs to the frozen sprite and
    -- the only function allowed to write it is `hatch_profile_identity`. An
    -- optional module that rescores the same person must not move the emblem.
    completed_modules = COALESCE(p_completed_modules, '{}'),
    quiz_completed_at = now()
  WHERE user_id = p_user_id;

  -- Eclosionar dentro de la misma transacción: si alguien más ya la/eclosionó
  -- `hatch_profile_identity` devuelve la identidad guardada sin tocarla.
  IF v_estado = 'huevo'
     AND p_animal_id IS NOT NULL AND p_color_id IS NOT NULL
     AND p_alias_animal IS NOT NULL AND p_alias_color IS NOT NULL AND p_alias_sufijo IS NOT NULL THEN
    v_alias := public.hatch_profile_identity(
      p_user_id, p_animal_id, p_color_id,
      p_alias_animal, p_alias_color, p_alias_sufijo,
      p_alias_animal || ' ' || p_alias_color || ' · ' || p_alias_sufijo,
      p_enneagram_code, p_narrative, p_avatar_mark
    );
  ELSE
    SELECT alias_completo INTO v_alias FROM public.profiles WHERE user_id = p_user_id;
  END IF;

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
    enneagram_code = NULL,
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

-- ─── 6b. Rutas de lectura: todo sale del registro guardado, nunca del cálculo.
--
-- `get_user_matches` only says WHO matched and HOW MUCH. The name columns it
-- used to return (`other_alias`, `other_animal`, `other_color`) are gone: the
-- application reads the counterpart's stored identity with `findCounterparts`,
-- so a match row can never disagree with the profile screen about a name.
--
-- Quitando columnas se cambia el tipo de fila, y Postgres no deja modificar el
-- retorno de una función existente (`42P13`): hay que dropear y recrear. El
-- `GRANT` del §7 devuelve el permiso, porque DROP se lleva los otorgados.
DROP FUNCTION IF EXISTS public.get_user_matches(UUID);

CREATE OR REPLACE FUNCTION public.get_user_matches(p_user_id UUID)
RETURNS TABLE (
  track TEXT,
  other_user UUID,
  similarity DOUBLE PRECISION,
  badges JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();

  RETURN QUERY
  SELECT
    m.track,
    p.user_id,
    m.similarity,
    m.badges
  FROM public.matches AS m
  JOIN public.profiles AS p
    ON p.user_id = CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END
  WHERE (m.user_a = p_user_id OR m.user_b = p_user_id)
    AND p.estado_identidad = 'eclosionado'
  ORDER BY m.track, m.similarity DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(p_search TEXT, p_user UUID, p_limit INTEGER, p_offset INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pattern TEXT := '%' || replace(replace(replace(COALESCE(p_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  PERFORM private.assert_service_role();
  SELECT count(*) INTO v_total FROM public.profiles AS p
  WHERE (p_user IS NULL OR p.user_id = p_user)
    AND (COALESCE(p_search, '') = '' OR COALESCE(p.alias_completo, '') ILIKE v_pattern);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created DESC), '[]'::JSONB) INTO v_rows FROM (
    SELECT p.created_at AS created, jsonb_build_object(
      'id', p.user_id,
      -- `identity` is the stored record, projected and never assembled: the
      -- console shows exactly these columns and cannot invent a name. The
      -- catalogue's `diminutivo_es`/`nombre` are not agreed with the animal's
      -- gender, so falling back to them is how "ballena azul profundo" was
      -- born; a legacy row shows nulls until the fase 6 backfill freezes it.
      'identity', jsonb_build_object(
        'estadoIdentidad', p.estado_identidad,
        'aliasCompleto', p.alias_completo,
        'aliasAnimal', p.alias_animal,
        'aliasColor', p.alias_color,
        'aliasSufijo', p.alias_sufijo,
        'animalId', p.animal_id,
        'colorId', p.color_id,
        'colorHex', c.hex,
        'mbtiCode', p.mbti_code,
        'enneagramCode', p.enneagram_code,
        'mark', p.avatar_mark,
        'revelacionVista', p.revelacion_vista
      ),
      'createdAt', p.created_at,
      'quizCompletedAt', p.quiz_completed_at,
      'paused', p.paused_at IS NOT NULL,
      'adult', p.adult_confirmed_at IS NOT NULL,
      'modules', cardinality(p.completed_modules),
      'isAdmin', EXISTS (SELECT 1 FROM public.user_roles AS r WHERE r.user_id = p.user_id AND r.role = 'admin'::public.app_role),
      'hasChatPin', EXISTS (SELECT 1 FROM public.chat_pins AS k WHERE k.user_id = p.user_id),
      'romanceMatches', (SELECT count(*) FROM public.matches AS m WHERE m.track = 'romance' AND p.user_id IN (m.user_a, m.user_b)),
      'amistadMatches', (SELECT count(*) FROM public.matches AS m WHERE m.track = 'amistad' AND p.user_id IN (m.user_a, m.user_b)),
      'conversations', (SELECT count(*) FROM public.conversations AS v WHERE p.user_id IN (v.user_a, v.user_b)),
      'reportsReceived', (SELECT count(*) FROM public.chat_reports AS x WHERE x.reported = p.user_id)
    ) AS row_data
    FROM public.profiles AS p
    LEFT JOIN public.colors AS c ON c.id = p.color_id
    WHERE (p_user IS NULL OR p.user_id = p_user)
      AND (COALESCE(p_search, '') = '' OR COALESCE(p.alias_completo, '') ILIKE v_pattern)
    ORDER BY p.created_at DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  ) AS page;

  RETURN jsonb_build_object('total', v_total, 'users', v_rows);
END;
$$;

-- Métricas: agregan sobre el registro guardado. Un huevo no tiene animal ni
-- color, así que se cuenta aparte (`huevos`) y queda fuera de las dos listas.
-- Las etiquetas usan la forma de catálogo (`diminutivo_es`, `nombre`) porque
-- `alias_color` está concordado con el género del animal y repartiría un mismo
-- color en dos filas ("rojo" y "roja"); el agrupamiento va por id guardado.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard(
  p_romance_threshold DOUBLE PRECISION,
  p_amistad_threshold DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'romanceThreshold', p_romance_threshold,
    'amistadThreshold', p_amistad_threshold,
    'totalProfiles',
      (SELECT count(*) FROM public.profiles WHERE quiz_completed_at IS NOT NULL AND paused_at IS NULL),
    'huevos', (SELECT count(*) FROM public.profiles WHERE estado_identidad = 'huevo'),
    'romanceMatches', (SELECT count(*) FROM public.matches WHERE track = 'romance'),
    'amistadMatches', (SELECT count(*) FROM public.matches WHERE track = 'amistad'),
    'usersWithRomanceMatch', (
      SELECT count(*) FROM (
        SELECT user_a FROM public.matches WHERE track = 'romance'
        UNION SELECT user_b FROM public.matches WHERE track = 'romance'
      ) AS u
    ),
    'usersWithAmistadMatch', (
      SELECT count(*) FROM (
        SELECT user_a FROM public.matches WHERE track = 'amistad'
        UNION SELECT user_b FROM public.matches WHERE track = 'amistad'
      ) AS u
    ),
    'topAnimals', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', t.id, 'name', t.name, 'count', t.total)
        ORDER BY t.total DESC, t.name
      )
      FROM (
        SELECT p.animal_id AS id, a.diminutivo_es AS name, count(*) AS total
        FROM public.profiles AS p
        JOIN public.animals AS a ON a.id = p.animal_id
        WHERE p.estado_identidad = 'eclosionado' AND p.animal_id IS NOT NULL
        GROUP BY p.animal_id, a.diminutivo_es
        ORDER BY total DESC, name
        LIMIT 10
      ) AS t
    ), '[]'),
    'topColors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', t.id, 'name', t.name, 'count', t.total)
        ORDER BY t.total DESC, t.name
      )
      FROM (
        SELECT p.color_id AS id, c.nombre AS name, count(*) AS total
        FROM public.profiles AS p
        JOIN public.colors AS c ON c.id = p.color_id
        WHERE p.estado_identidad = 'eclosionado' AND p.color_id IS NOT NULL
        GROUP BY p.color_id, c.nombre
        ORDER BY total DESC, name
        LIMIT 10
      ) AS t
    ), '[]'),
    'mbtiDistribution', COALESCE((
      SELECT jsonb_object_agg(s.code, s.total)
      FROM (
        SELECT mbti_code AS code, count(*) AS total
        FROM public.profiles
        WHERE quiz_completed_at IS NOT NULL AND mbti_code IS NOT NULL
        GROUP BY mbti_code
      ) AS s
    ), '{}')
  );
END;
$$;

-- Moderación: las partes se nombran con el alias guardado, nunca con el viejo.
CREATE OR REPLACE FUNCTION public.admin_list_reports(p_status TEXT, p_limit INTEGER, p_offset INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  PERFORM private.assert_service_role();
  SELECT count(*) INTO v_total FROM public.chat_reports WHERE p_status IS NULL OR status = p_status;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY created DESC), '[]'::JSONB) INTO v_rows FROM (
    SELECT r.created_at AS created, jsonb_build_object(
      'id', r.id,
      'reporterAlias', rp.alias_completo,
      'reportedId', r.reported,
      'reportedAlias', rd.alias_completo,
      'track', r.track,
      'reason', r.reason,
      'status', r.status,
      'snapshot', r.snapshot,
      'createdAt', r.created_at,
      'reviewedAt', r.reviewed_at
    ) AS row_data
    FROM public.chat_reports AS r
    LEFT JOIN public.profiles AS rp ON rp.user_id = r.reporter
    LEFT JOIN public.profiles AS rd ON rd.user_id = r.reported
    WHERE p_status IS NULL OR r.status = p_status
    ORDER BY r.created_at DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  ) AS page;
  RETURN jsonb_build_object('total', v_total, 'reports', v_rows);
END;
$$;

-- El texto de las notificaciones lee el alias guardado (regla de oro).
CREATE OR REPLACE FUNCTION public.notify_matches(p_user_id UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity TEXT;
  v_estado TEXT;
  v_romance integer;
  v_amistad integer;
  v_romance_hash TEXT;
  v_amistad_hash TEXT;
  v_last_romance_hash TEXT;
  v_last_romance_count integer;
  v_last_amistad_hash TEXT;
  v_last_amistad_count integer;
  v_last_any_type TEXT;
  v_count integer := 0;
BEGIN
  PERFORM private.assert_service_role();

  -- El texto de la notificación usa el nombre guardado, tal como lo ve la
  -- propia persona en todas las pantallas. Un huevo no recibe avisos de
  -- matches, porque todavía no existe con quién coincidir.
  SELECT COALESCE(p.alias_completo, p.alias), p.estado_identidad
    INTO v_identity, v_estado
  FROM public.profiles AS p
  WHERE p.user_id = p_user_id AND p.eliminado_en IS NULL;
  IF NOT FOUND OR v_estado = 'huevo' OR v_identity IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    count(*) FILTER (WHERE m.track = 'romance'),
    count(*) FILTER (WHERE m.track = 'amistad'),
    md5(string_agg(
      (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text,
      ',' ORDER BY (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text
    ) FILTER (WHERE m.track = 'romance')),
    md5(string_agg(
      (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text,
      ',' ORDER BY (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text
    ) FILTER (WHERE m.track = 'amistad'))
  INTO v_romance, v_amistad, v_romance_hash, v_amistad_hash
  FROM public.matches AS m
  WHERE m.user_a = p_user_id OR m.user_b = p_user_id;

  SELECT
    n.metadata ->> 'match_set_hash',
    (n.metadata ->> 'match_count')::integer
  INTO v_last_romance_hash, v_last_romance_count
  FROM public.notifications AS n
  WHERE n.user_id = p_user_id AND n.type = 'match_romance'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  SELECT
    n.metadata ->> 'match_set_hash',
    (n.metadata ->> 'match_count')::integer
  INTO v_last_amistad_hash, v_last_amistad_count
  FROM public.notifications AS n
  WHERE n.user_id = p_user_id AND n.type = 'match_amistad'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  SELECT type INTO v_last_any_type
  FROM public.notifications
  WHERE user_id = p_user_id AND type IN ('match_romance', 'match_amistad', 'no_match')
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_romance > 0 THEN
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'no_match';

    IF v_last_romance_hash IS DISTINCT FROM v_romance_hash
       AND (v_last_romance_hash IS NOT NULL OR v_last_romance_count IS DISTINCT FROM v_romance) THEN
      DELETE FROM public.notifications
      WHERE user_id = p_user_id AND read = false AND type = 'match_romance';

      INSERT INTO public.notifications (user_id, type, title, body, metadata)
      VALUES (p_user_id, 'match_romance', 'El universo conspiró a tu favor',
        CASE WHEN v_romance = 1
          THEN 'Tu energía de ' || v_identity
               || ' encontró una resonancia especial en el campus. Hay alguien con quien la química fluye de forma única.'
          ELSE 'Tienes a ' || v_romance || ' seres extraordinarios en el campus con los que podrías tener una química increíble. Tu energía de '
               || v_identity || ' resonó con cada unx de ellxs.'
        END,
        jsonb_build_object('match_count', v_romance, 'track', 'romance', 'match_set_hash', v_romance_hash));
      v_count := v_count + 1;
    END IF;
  ELSE
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'match_romance';
  END IF;

  IF v_amistad > 0 THEN
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'no_match';

    IF v_last_amistad_hash IS DISTINCT FROM v_amistad_hash
       AND (v_last_amistad_hash IS NOT NULL OR v_last_amistad_count IS DISTINCT FROM v_amistad) THEN
      DELETE FROM public.notifications
      WHERE user_id = p_user_id AND read = false AND type = 'match_amistad';

      INSERT INTO public.notifications (user_id, type, title, body, metadata)
      VALUES (p_user_id, 'match_amistad',
        CASE WHEN v_amistad = 1 THEN 'Tu vibra resonó con alguien' ELSE 'Tu vibra resonó con el campus' END,
        CASE WHEN v_amistad = 1
          THEN 'Tu energía de ' || v_identity
               || ' encontró una conexión de amistad genuina en el campus. Hay alguien cuyo espíritu complementa el tuyo.'
          ELSE 'Tu energía de ' || v_identity || ' resonó con ' || v_amistad
               || ' personas del campus. Hay amistades esperando florecer — sus personalidades y gustos se complementan de forma hermosa.'
        END,
        jsonb_build_object('match_count', v_amistad, 'track', 'amistad', 'match_set_hash', v_amistad_hash));
      v_count := v_count + 1;
    END IF;
  ELSE
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'match_amistad';
  END IF;

  IF v_romance = 0 AND v_amistad = 0 AND v_last_any_type IS DISTINCT FROM 'no_match' THEN
    -- Mismo texto que `NO_MATCH_MESSAGE` en domain/messages/notification-copy.ts:
    -- la copia del motor de mensajes es la única, también dentro del SQL.
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (p_user_id, 'no_match', 'Tu momento llegará',
      'aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor <3');
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

-- ─── 6c. Un aviso nuevo: "tu nombre ya quedó fijo" ──────────────────────────
-- La fase 6 reescribe las identidades heredadas una sola vez. La persona tiene
-- que enterarse de dos cosas: cuál es su nombre ahora y que ya no se mueve.
-- El tipo `identity` existe sólo para eso; nadie más lo emite.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('match_romance', 'match_amistad', 'no_match', 'welcome', 'chat', 'identity'));

-- Un solo aviso de identidad por persona: reejecutar la fase 6 no lo duplica.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_identity_unique_idx
  ON public.notifications (user_id) WHERE type = 'identity';

-- ─── 7. Permisos ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION
  public.submit_quiz_result(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN, TEXT, TEXT, TEXT, TEXT),
  public.hatch_profile_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.mark_identity_revealed(UUID),
  public.admin_reset_quiz(UUID),
  public.get_user_matches(UUID),
  public.notify_matches(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.submit_quiz_result(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN, TEXT, TEXT, TEXT, TEXT),
  public.hatch_profile_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.mark_identity_revealed(UUID),
  public.admin_reset_quiz(UUID),
  public.get_user_matches(UUID),
  public.notify_matches(UUID)
TO service_role;

COMMIT;
