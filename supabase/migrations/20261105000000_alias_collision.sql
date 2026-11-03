-- ============================================================================
-- ZooMatch — alias collisions never block a submission (ADR-034)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
--   node scripts/db-apply.mjs --migration supabase/migrations/20261105000000_alias_collision.sql
-- The same function lives in 00000000000000_base.sql so a clean reset matches.
-- CREATE OR REPLACE keeps the existing grants (service_role only).
-- ============================================================================

BEGIN;

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
  p_completed_modules TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alias TEXT;
  v_candidate TEXT := p_alias;
  v_attempt INTEGER := 0;
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

  -- A new alias that another profile already holds gets a deterministic
  -- suffix derived from the user id, so the UNIQUE constraint never blocks
  -- a submission (ADR-034). Existing aliases are untouched.
  WHILE v_candidate IS NOT NULL
        AND v_attempt < 8
        AND EXISTS (SELECT 1 FROM public.profiles
                    WHERE alias = v_candidate AND user_id <> p_user_id) LOOP
    v_attempt := v_attempt + 1;
    v_candidate := p_alias || '-' || upper(substr(md5(p_user_id::TEXT || v_attempt::TEXT), 1, 3));
  END LOOP;

  -- The alias is fixed at first assignment (ADR-024): retakes never rename.
  UPDATE public.profiles SET
    alias = COALESCE(public.profiles.alias, v_candidate),
    animal_id = p_animal_id,
    color_id = p_color_id,
    avatar_mark = p_avatar_mark,
    narrative = p_narrative,
    orientacion_sexual = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'orientacion_sexual', '[]'))),
    identidad_genero = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'identidad_genero', '[]'))),
    tipo_relacion_busca = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'tipo_relacion_busca', '[]'))),
    romance_vector = p_romance_vector,
    amistad_vector = p_amistad_vector,
    dimension_scores = p_dimension_scores,
    mbti_code = p_mbti_code,
    latent_profile = p_latent_profile,
    completed_modules = COALESCE(p_completed_modules, '{}'),
    quiz_completed_at = now()
  WHERE user_id = p_user_id
  RETURNING public.profiles.alias INTO v_alias;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first' USING ERRCODE = 'P0002';
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

COMMIT;
