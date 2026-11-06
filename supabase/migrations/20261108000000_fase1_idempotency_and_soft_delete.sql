-- ============================================================================
-- Fase 1: Idempotent pair ordering, single welcome per user & soft-delete
-- ============================================================================
-- Compatible with existing data (non-destructive, additive):
--   1. Adds `eliminado_en` soft-delete timestamp on `public.profiles` and
--      bumps the pool revision when a completed profile is soft-deleted or
--      restored.
--   2. Adds a partial unique index `notifications_welcome_unique_idx` so a
--      user can never receive duplicate `welcome` notifications under race
--      conditions.
--   3. Hardens `public.replace_matches` so pairs are always canonicalized with
--      `LEAST(m.user_a, m.user_b)` / `GREATEST(m.user_a, m.user_b)`, self-pairs
--      are ignored, and duplicate pairs keep the highest similarity.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ;

DROP TRIGGER IF EXISTS profiles_pool_soft_deleted ON public.profiles;
CREATE TRIGGER profiles_pool_soft_deleted
  AFTER UPDATE OF eliminado_en ON public.profiles
  FOR EACH ROW
  WHEN (NEW.eliminado_en IS DISTINCT FROM OLD.eliminado_en AND NEW.quiz_completed_at IS NOT NULL)
  EXECUTE FUNCTION private.bump_pool_revision();

CREATE UNIQUE INDEX IF NOT EXISTS notifications_welcome_unique_idx
  ON public.notifications (user_id) WHERE type = 'welcome';

CREATE OR REPLACE FUNCTION public.replace_matches(p_matches JSONB, p_pool_version TEXT)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted integer;
BEGIN
  PERFORM private.assert_service_role();

  IF jsonb_typeof(p_matches) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Matches payload must be a JSON array' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zoomatch:matches'));

  IF private.pool_version() IS DISTINCT FROM p_pool_version THEN
    RETURN -1;
  END IF;

  DELETE FROM public.matches WHERE true;
  INSERT INTO public.matches (track, user_a, user_b, similarity, badges)
  SELECT DISTINCT ON (m.track, LEAST(m.user_a, m.user_b), GREATEST(m.user_a, m.user_b))
    m.track,
    LEAST(m.user_a, m.user_b),
    GREATEST(m.user_a, m.user_b),
    m.similarity,
    COALESCE(m.badges, '[]')
  FROM jsonb_to_recordset(p_matches)
    AS m(track TEXT, user_a UUID, user_b UUID, similarity DOUBLE PRECISION, badges JSONB)
  WHERE m.user_a IS NOT NULL AND m.user_b IS NOT NULL AND m.user_a <> m.user_b
  ORDER BY m.track, LEAST(m.user_a, m.user_b), GREATEST(m.user_a, m.user_b), m.similarity DESC;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMIT;

