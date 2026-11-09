-- ─── B9 / ADR-052: el perfil lleva la versión de la matemática que lo midió ─
--
-- `public.quiz_responses` guarda cada respuesta cruda y `public.profiles` guarda
-- `latent_profile`, así que re-estimar a alguien no cuesta una sola pregunta
-- nueva. Lo que sí es un error silencioso es mezclar en un mismo `pairScore`
-- perfiles medidos bajo bancos o modelos de medición distintos. Por eso cada
-- guardado de puntaje sella `params_version`.
--
-- Semántica de los valores:
--   * `params_version IS NULL`  → perfil anterior al sello. Se recalcula sobre
--     sus respuestas guardadas (T1) y SIGUE EN EL POOL: nunca se excluye a
--     nadie por no haber afinado.
--   * `params_version = <sello>` → medido bajo la matemática vigente.
--
-- El sello lo escribe la aplicación (`src/infrastructure/math-stamp.server.ts`),
-- nunca se estima en SQL: es un hash de la mitad de medición (banco + GRM +
-- covarianza latente), no de los pesos. Un cambio de pesos o de umbral es T1 y
-- se refleja en el banner del perfil, no en esta columna.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS params_version TEXT,
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.params_version IS
  'Sello de la medición (banco + modelo de medición) con la que se calculó latent_profile; NULL = anterior al sello.';
COMMENT ON COLUMN public.profiles.scored_at IS
  'Última vez que se recalculó y guardó el puntaje de este perfil.';

-- El arnés de migración pregunta «quién está obsoleto» sin escanear la tabla.
CREATE INDEX IF NOT EXISTS profiles_params_version_idx
  ON public.profiles (params_version)
  WHERE quiz_completed_at IS NOT NULL;

-- ─── submit_quiz_result: 17 argumentos → 18 (p_params_version) ──────────────

DROP FUNCTION IF EXISTS public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT
);

DROP FUNCTION IF EXISTS public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT
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
  p_latent_profile JSONB,
  p_avatar_mark TEXT,
  p_completed_modules TEXT[],
  p_alias_animal TEXT DEFAULT NULL,
  p_alias_color TEXT DEFAULT NULL,
  p_alias_sufijo TEXT DEFAULT NULL,
  p_enneagram_code TEXT DEFAULT NULL,
  p_params_version TEXT DEFAULT NULL
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
    avatar_mark = CASE WHEN v_estado = 'eclosionado' THEN p_avatar_mark ELSE public.profiles.avatar_mark END,
    completed_modules = COALESCE(p_completed_modules, '{}'),
    quiz_completed_at = now(),
    scored_at = now(),
    params_version = p_params_version
  WHERE user_id = p_user_id;

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

REVOKE ALL ON FUNCTION public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
