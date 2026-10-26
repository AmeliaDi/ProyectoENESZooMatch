-- 202610260001_table_grants_hygiene.sql
--
-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- RLS remains the row-level gate, but table-level DML (especially TRUNCATE and
-- TRIGGER) should not be reachable from the API roles at all. This migration
-- makes the v2 surface SELECT-only for API clients. All writes already go
-- through SECURITY DEFINER RPCs or the service-role client.

BEGIN;

-- Public catalogues: readable by everyone, writable only by migrations/service role.
REVOKE ALL ON TABLE public.animals, public.colors, public.quiz_items_v2
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.animals, public.colors, public.quiz_items_v2
  TO anon, authenticated;

-- Participant data: SELECT is gated by RLS (own rows / matched participant).
-- No INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER for API roles.
REVOKE ALL ON TABLE
  public.profiles_v2,
  public.quiz_responses_v2,
  public.matches_v2,
  public.notifications
  FROM anon, authenticated;
GRANT SELECT ON TABLE
  public.profiles_v2,
  public.quiz_responses_v2,
  public.matches_v2,
  public.notifications
  TO authenticated;

COMMIT;
