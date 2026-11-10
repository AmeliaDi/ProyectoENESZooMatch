-- ============================================================================
-- Contrato de esquema: lo que la app y docs/DB_ESQUEMA.md dan por hecho.
-- pgTAP. Corre con `supabase test db` o con `npm run db:test` (PGlite + shim).
-- ============================================================================
BEGIN;

SELECT plan(23);

SELECT has_table('public', 'profiles');
SELECT has_table('public', 'matches');
SELECT has_table('public', 'conversations');
SELECT has_table('public', 'conversation_messages');
SELECT has_table('public', 'notifications');
SELECT has_table('private', 'pool_state');

SELECT col_is_pk('public', 'profiles', 'user_id');
SELECT col_is_pk('public', 'matches', 'user_a');
SELECT has_column('public', 'profiles', 'matricula_hash');
SELECT has_column('public', 'profiles', 'eliminado_en');
SELECT has_column('public', 'profiles', 'params_version');
SELECT has_index('public', 'matches', 'matches_user_b_idx');
SELECT has_trigger('public', 'profiles', 'profiles_identity_immutable');

-- Simetría estructural: el par se guarda una sola vez, en orden canónico.
SELECT throws_ok(
  $$INSERT INTO public.matches (track, user_a, user_b, similarity)
    VALUES ('romance', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 0.5)$$,
  '23514', 'matches rechaza user_a > user_b');
SELECT throws_ok(
  $$INSERT INTO public.matches (track, user_a, user_b, similarity)
    VALUES ('romance', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 0.5)$$,
  '23514', 'matches rechaza el auto-match');
SELECT throws_ok(
  $$INSERT INTO public.matches (track, user_a, user_b, similarity)
    VALUES ('romance', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 0)$$,
  '23514', 'matches rechaza similitud 0 (el CHECK es > 0, no >= 0)');
SELECT throws_ok(
  $$INSERT INTO public.matches (track, user_a, user_b, similarity)
    VALUES ('romance', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 1.5)$$,
  '23514', 'matches rechaza similitud fuera de (0, 1]');
SELECT throws_ok(
  $$INSERT INTO public.matches (track, user_a, user_b, similarity)
    VALUES ('otro', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 0.5)$$,
  '23514', 'matches solo admite los tracks romance y amistad');

SELECT throws_ok(
  $$INSERT INTO public.notifications (user_id, type, title, body)
    VALUES ('11111111-1111-4111-8111-111111111111', 'afinidad_afinada', 'x', 'y')$$,
  '23514', 'notifications.type es un CHECK cerrado; un tipo nuevo necesita migración');

-- RLS: toda tabla pública la tiene activa. Sin política = deny-all deliberado,
-- alcanzable solo por service_role o por un RPC SECURITY DEFINER.
SELECT is(
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
  0, 'ninguna tabla pública queda sin RLS');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public'),
  4, 'las cuatro políticas públicas son las del catálogo (animals, colors, quiz_items, user_roles)');
SELECT is_empty(
  $$SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('profiles', 'matches', 'notifications', 'conversations')$$,
  'profiles, matches, notifications y conversations no tienen política: son deny-all');
-- `SET search_path = ''` queda guardado como `search_path=""`; dos funciones le
-- agregan TimeZone=UTC, así que se busca el elemento y no el arreglo completo.
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND NOT ('search_path=""' = ANY (COALESCE(p.proconfig, '{}')))),
  0, 'toda función pública SECURITY DEFINER fija search_path vacío');

SELECT * FROM finish();
ROLLBACK;