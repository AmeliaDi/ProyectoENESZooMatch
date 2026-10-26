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
