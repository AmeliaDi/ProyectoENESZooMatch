-- ============================================================
-- ZooMatch: canonical profile identity
-- Migration: 202610270001_canonical_profile_identity.sql
-- ============================================================
-- The application now creates the anonymous profile row in profiles_v2 when a
-- participant enters with their matrícula. The previous submit RPC copied the
-- hash from the legacy v1 `profiles` table, which is no longer written.
--
-- This migration keeps the RPC signature and behaviour, but sources the
-- matrícula hash from the canonical profiles_v2 row. It fails loudly when the
-- participant has not gone through /api/enter first.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_quiz_result_v2(
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
  p_alias TEXT
) RETURNS TABLE(alias TEXT, animal_id TEXT, color_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_matricula_hash TEXT;
BEGIN
  IF auth.jwt() ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF array_length(p_romance_vector, 1) != 26 THEN
    RAISE EXCEPTION 'Romance vector must have 26 dimensions';
  END IF;
  IF array_length(p_amistad_vector, 1) != 16 THEN
    RAISE EXCEPTION 'Friendship vector must have 16 dimensions';
  END IF;

  SELECT p.matricula_hash
  INTO v_matricula_hash
  FROM public.profiles_v2 p
  WHERE p.user_id = p_user_id;

  IF v_matricula_hash IS NULL THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first';
  END IF;

  INSERT INTO public.profiles_v2 (
    user_id, matricula_hash, alias, animal_id, color_id, narrative,
    orientacion_sexual, identidad_genero, tipo_relacion_busca,
    romance_vector, amistad_vector, dimension_scores, mbti_code, quiz_completed_at
  ) VALUES (
    p_user_id,
    v_matricula_hash,
    p_alias, p_animal_id, p_color_id, p_narrative,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_hard_filters->'orientacion_sexual')), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_hard_filters->'identidad_genero')), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_hard_filters->'tipo_relacion_busca')), '{}'),
    p_romance_vector, p_amistad_vector, p_dimension_scores, p_mbti_code, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    alias = EXCLUDED.alias,
    animal_id = EXCLUDED.animal_id,
    color_id = EXCLUDED.color_id,
    narrative = EXCLUDED.narrative,
    orientacion_sexual = EXCLUDED.orientacion_sexual,
    identidad_genero = EXCLUDED.identidad_genero,
    tipo_relacion_busca = EXCLUDED.tipo_relacion_busca,
    romance_vector = EXCLUDED.romance_vector,
    amistad_vector = EXCLUDED.amistad_vector,
    dimension_scores = EXCLUDED.dimension_scores,
    mbti_code = EXCLUDED.mbti_code,
    quiz_completed_at = now(),
    updated_at = now();

  DELETE FROM public.quiz_responses_v2 WHERE user_id = p_user_id;
  INSERT INTO public.quiz_responses_v2 (user_id, item_id, likert_value, selected_options)
  SELECT
    p_user_id,
    elem->>'itemId',
    CASE WHEN elem->>'value' IS NOT NULL THEN (elem->>'value')::SMALLINT END,
    CASE WHEN elem->'selected' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(elem->'selected')) END
  FROM jsonb_array_elements(p_answers) AS elem;

  RETURN QUERY SELECT p_alias, p_animal_id, p_color_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_result_v2(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_result_v2(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
