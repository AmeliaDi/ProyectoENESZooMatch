-- ============================================================
-- ZooMatch v2: Explainability support
-- Migration: 202610240001_matches_v2_explainability.sql
-- ============================================================
-- ADDITIVE / behaviour-preserving. The public.get_my_matches_v2() RPC is
-- recreated to ALSO return the matched user's id (`other_user`). The result
-- API needs this id to look up each matched user's vectors + dimension scores
-- (via the service-role client) so it can build the affective explanation
-- produced by src/lib/explainability.ts.
--
-- The existing columns, ordering, and RLS posture are unchanged; only one new
-- output column is added. Because a function's RETURN signature cannot be
-- altered in place, the function is dropped and recreated.

BEGIN;

-- Recreate with the additional `other_user` column.
DROP FUNCTION IF EXISTS public.get_my_matches_v2();

CREATE OR REPLACE FUNCTION public.get_my_matches_v2()
RETURNS TABLE(
  track TEXT,
  other_user UUID,
  other_alias TEXT,
  other_animal TEXT,
  other_color TEXT,
  similarity DOUBLE PRECISION,
  badges JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    m.track,
    CASE WHEN m.user_a = v_uid THEN m.user_b ELSE m.user_a END AS other_user,
    p.alias AS other_alias,
    COALESCE(a.diminutivo_es, '') AS other_animal,
    COALESCE(c.nombre, '') AS other_color,
    m.similarity,
    m.badges
  FROM public.matches_v2 m
  JOIN public.profiles_v2 p ON p.user_id = CASE WHEN m.user_a = v_uid THEN m.user_b ELSE m.user_a END
  LEFT JOIN public.animals a ON a.id = p.animal_id
  LEFT JOIN public.colors c ON c.id = p.color_id
  WHERE m.user_a = v_uid OR m.user_b = v_uid
  ORDER BY m.track, m.similarity DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches_v2 TO authenticated;

COMMIT;
