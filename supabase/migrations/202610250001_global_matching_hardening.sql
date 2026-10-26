BEGIN;

CREATE OR REPLACE FUNCTION public.replace_matches_v2(
  p_matches JSONB,
  p_expected_profiles INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_profile_count INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zoomatch:matches_v2'));

  SELECT COUNT(*) INTO v_profile_count
  FROM public.profiles_v2
  WHERE quiz_completed_at IS NOT NULL;

  IF v_profile_count <> p_expected_profiles THEN
    RETURN -1;
  END IF;

  IF jsonb_typeof(COALESCE(p_matches, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Matches payload must be an array';
  END IF;

  DELETE FROM public.matches_v2 WHERE true;

  INSERT INTO public.matches_v2 (track, user_a, user_b, similarity, badges)
  SELECT match_row.track, match_row.user_a, match_row.user_b, match_row.similarity, COALESCE(match_row.badges, '[]'::jsonb)
  FROM jsonb_to_recordset(COALESCE(p_matches, '[]'::jsonb)) AS match_row(
    track TEXT,
    user_a UUID,
    user_b UUID,
    similarity DOUBLE PRECISION,
    badges JSONB
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

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

  INSERT INTO public.profiles_v2 (
    user_id, matricula_hash, alias, animal_id, color_id, narrative,
    orientacion_sexual, identidad_genero, tipo_relacion_busca,
    romance_vector, amistad_vector, dimension_scores, mbti_code, quiz_completed_at
  ) VALUES (
    p_user_id,
    (SELECT matricula_hash FROM public.profiles WHERE id = p_user_id),
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

CREATE OR REPLACE FUNCTION private.dimension_badges_v2(
  vec_a DOUBLE PRECISION[],
  vec_b DOUBLE PRECISION[],
  p_track TEXT
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_dims TEXT[] := CASE
    WHEN p_track = 'romance' THEN ARRAY[
      'personalidad_apertura','personalidad_responsabilidad','personalidad_extraversion',
      'personalidad_amabilidad','personalidad_estabilidad_emocional',
      'identidad_exclusividad','identidad_comunicacion_afectiva',
      'cultural_musica_exploracion','cultural_estetica_visual','cultural_hobbies_creativos',
      'cultural_vida_universitaria','cultural_humor',
      'intimidad_palabras_afirmacion','intimidad_tiempo_calidad','intimidad_regalos_detalle',
      'intimidad_contacto_fisico','intimidad_actos_servicio','intimidad_apertura_emocional',
      'intimidad_comunicacion_deseos','intimidad_limites_respeto',
      'valores_empatia','valores_confianza','valores_gestion_conflicto',
      'valores_igualdad_genero','valores_corresponsabilidad','valores_respeto_diversidad'
    ]
    ELSE ARRAY[
      'personalidad_apertura','personalidad_responsabilidad','personalidad_extraversion',
      'personalidad_amabilidad','personalidad_estabilidad_emocional',
      'cultural_musica_exploracion','cultural_estetica_visual','cultural_hobbies_creativos',
      'cultural_vida_universitaria','cultural_humor',
      'valores_empatia','valores_confianza','valores_gestion_conflicto',
      'valores_igualdad_genero','valores_corresponsabilidad','valores_respeto_diversidad'
    ]
  END;
  v_limit INT := CASE WHEN p_track = 'romance' THEN 5 ELSE 3 END;
  v_badges JSONB := '[]'::JSONB;
  v_affinities FLOAT[] := '{}';
  i INT;
BEGIN
  FOR i IN 1..array_length(v_dims, 1) LOOP
    v_affinities := array_append(v_affinities, 1.0 - ABS(vec_a[i] - vec_b[i]));
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object(
    'dimension', selected.dimension,
    'affinity', selected.affinity
  ) ORDER BY selected.affinity DESC, selected.idx)
  INTO v_badges
  FROM (
    SELECT
      s.idx,
      v_dims[s.idx] AS dimension,
      v_affinities[s.idx] AS affinity
    FROM generate_subscripts(v_dims, 1) AS s(idx)
    ORDER BY v_affinities[s.idx] DESC, s.idx
    LIMIT v_limit
  ) AS selected;

  RETURN COALESCE(v_badges, '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_result_v2(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_result_v2(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.compute_dual_matches(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_dual_matches(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;
COMMENT ON FUNCTION public.compute_dual_matches(UUID, DOUBLE PRECISION, DOUBLE PRECISION) IS 'deprecated';

REVOKE ALL ON FUNCTION public.notify_matches_v2(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_matches_v2(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.replace_matches_v2(JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_matches_v2(JSONB, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.get_my_matches_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_matches_v2() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_notifications(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_v2(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_v2(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

COMMIT;
