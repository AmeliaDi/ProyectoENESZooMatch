-- ============================================================
-- ZooMatch — purge all participant data at the end of the event
-- ============================================================
--
-- This removes every non-admin auth user; the ON DELETE CASCADE chain removes
-- profiles, vectors, responses, matches and notifications.
--
-- SAFETY:
--   1. Export the aggregated admin CSV first (the dashboard has a CSV button).
--   2. Run this file only against the intended project.
--   3. The purge refuses to run until you explicitly confirm in the same
--      session:
--
--        SELECT set_config('zoomatch.confirm_purge', 'yes', false);
--
--      In the Supabase SQL Editor, run that SELECT as its own statement, then
--      run the block below. For psql:
--
--        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--          -c "SELECT set_config('zoomatch.confirm_purge', 'yes', false);" \
--          -f supabase/purge_event.sql
--
-- Admin accounts are preserved by excluding any user with an admin role.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_confirmed TEXT := current_setting('zoomatch.confirm_purge', true);
  v_participants INTEGER;
BEGIN
  IF v_confirmed IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'Purge refused. Run SELECT set_config(''zoomatch.confirm_purge'', ''yes'', false); first.';
  END IF;

  SELECT count(*) INTO v_participants
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'admin'
  );

  DELETE FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'admin'
  );

  RAISE NOTICE 'Purged % participant account(s); admin accounts were preserved.', v_participants;
END;
$$;

COMMIT;
