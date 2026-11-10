-- ============================================================================
-- Contrato de RPC: todo lo que la app llama existe en `public` y service_role
-- puede ejecutarlo. Este archivo es la prueba que faltaba: hasta el 2026-11-25
-- las migraciones dejaban los 6 RPC de quizzes en `private` (PostgREST no los
-- ve) y sin GRANT para service_role en get_my_notifications/mark_notifications_read.
-- El proyecto vivo estaba parchado a mano; un `db:reset` nacía roto.
--
-- Lista espejo de src/infrastructure/supabase/shared.ts (RPC) y de los literales
-- de src/infrastructure/quiz/quiz-repository.ts. Si se agrega un RPC allá, se
-- agrega aquí: src/infrastructure/supabase/schema.test.ts mantiene el espejo.
-- ============================================================================
BEGIN;

SELECT plan(40);

SELECT has_function('public', 'submit_quiz_result');
SELECT has_function('public', 'hatch_profile_identity');
SELECT has_function('public', 'mark_identity_revealed');
SELECT has_function('public', 'get_pool_version');
SELECT has_function('public', 'replace_matches');
SELECT has_function('public', 'get_user_matches');
SELECT has_function('public', 'notify_matches');
SELECT has_function('public', 'get_admin_dashboard');
SELECT has_function('public', 'get_my_notifications');
SELECT has_function('public', 'mark_notifications_read');
SELECT has_function('public', 'express_chat_interest');
SELECT has_function('public', 'leave_conversation');
SELECT has_function('public', 'block_chat_user');
SELECT has_function('public', 'report_conversation');
SELECT has_function('public', 'record_round_feedback');
SELECT has_function('public', 'purge_chat');
SELECT has_function('public', 'apply_retention_policy');
SELECT has_function('public', 'admin_list_users');
SELECT has_function('public', 'admin_bump_counter');
SELECT has_function('public', 'admin_reset_quiz');
SELECT has_function('public', 'admin_list_reports');
SELECT has_function('public', 'admin_review_report');
SELECT has_function('public', 'quiz_coincidencias');
SELECT has_function('public', 'quiz_save_answer');
SELECT has_function('public', 'quiz_delete_answers');
SELECT has_function('public', 'quiz_mark_completed');
SELECT has_function('public', 'quiz_set_sharing');
SELECT has_function('public', 'quiz_picante_save_consent');
SELECT has_function('public', 'quiz_picante_get_consent');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0, 'service_role puede ejecutar toda función pública (la app usa el cliente admin)');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon no ejecuta ningún RPC');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') AND p.proacl IS NULL),
  0, 'ninguna función pública queda con el ACL por defecto (PUBLIC podría ejecutarla)');

SELECT is(has_function_privilege('authenticated', 'public.get_my_notifications(boolean)', 'EXECUTE'), true, 'authenticated lee sus notificaciones');
SELECT is(has_function_privilege('authenticated', 'public.mark_notifications_read(uuid[])', 'EXECUTE'), true, 'authenticated marca sus notificaciones');
SELECT is(has_function_privilege('authenticated', 'public.get_admin_dashboard(double precision,double precision)', 'EXECUTE'), true, 'authenticated puede llamar al dashboard (el filtro de admin está dentro)');
SELECT is(has_function_privilege('authenticated', 'public.get_user_matches(uuid)', 'EXECUTE'), false, 'authenticated no llama get_user_matches directamente');
SELECT is(has_function_privilege('authenticated', 'public.replace_matches(jsonb,text)', 'EXECUTE'), false, 'authenticated no publica matches');
SELECT is(has_function_privilege('authenticated', 'public.submit_quiz_result(uuid,jsonb,jsonb,double precision[],double precision[],text,jsonb,text,text,text,jsonb,text,text[],text,text,text,text,text)', 'EXECUTE'), false, 'authenticated no entrega el microtest directamente');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname LIKE 'quiz\_%'),
  0, 'ningún RPC de quizzes vive en private: PostgREST no lo expondría');

-- El dashboard sí se puede llamar, pero decide adentro: sin rol de admin ni
-- claim de service_role, rechaza. Esto es lo que hace seguro el GRANT a authenticated.
SET request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}';
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.get_admin_dashboard(0.5, 0.5)$$,
  '42501', 'get_admin_dashboard rechaza a quien no es admin aunque tenga EXECUTE');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;