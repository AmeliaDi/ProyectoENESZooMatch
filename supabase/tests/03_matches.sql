-- ============================================================================
-- S1 (simetría) y S3 (conservación) sobre el SQL real, no sobre una réplica.
--
-- S1: `replace_matches` normaliza el orden, deduplica y descarta auto-matches.
-- S3: ninguna FK apunta a `public.matches`, así que el borrado completo que hace
--     `replace_matches` NO puede llevarse una conversación abierta. Aquí se
--     prueba con datos: la conversación y sus mensajes sobreviven al reemplazo.
--     La compuerta de conservación del rollout (src/domain/matching/rollout.ts)
--     es la que además repone el par; esta prueba cubre la capa de abajo.
-- ============================================================================
BEGIN;

SELECT plan(13);

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');
INSERT INTO public.profiles (user_id, matricula_hash) VALUES
  ('11111111-1111-4111-8111-111111111111', repeat(md5('qa-1'), 2)),
  ('22222222-2222-4222-8222-222222222222', repeat(md5('qa-2'), 2)),
  ('33333333-3333-4333-8333-333333333333', repeat(md5('qa-3'), 2));

SET request.jwt.claims = '{"role":"service_role"}';
SET request.jwt.claim.role = 'service_role';

-- El payload trae el par repetido al revés, un auto-match y un extremo nulo.
SELECT lives_ok(
  $$SELECT public.replace_matches('[
    {"track":"romance","user_a":"22222222-2222-4222-8222-222222222222","user_b":"11111111-1111-4111-8111-111111111111","similarity":0.80},
    {"track":"romance","user_a":"11111111-1111-4111-8111-111111111111","user_b":"22222222-2222-4222-8222-222222222222","similarity":0.60},
    {"track":"romance","user_a":"11111111-1111-4111-8111-111111111111","user_b":"11111111-1111-4111-8111-111111111111","similarity":0.99},
    {"track":"amistad","user_a":"11111111-1111-4111-8111-111111111111","user_b":null,"similarity":0.90},
    {"track":"amistad","user_a":"11111111-1111-4111-8111-111111111111","user_b":"33333333-3333-4333-8333-333333333333","similarity":0.70}
  ]'::jsonb, public.get_pool_version())$$,
  'replace_matches acepta el payload sucio sin reventar');

SELECT is((SELECT count(*)::int FROM public.matches), 2, 'quedan dos pares: el duplicado, el auto-match y el nulo se descartan');
SELECT is_empty($$SELECT 1 FROM public.matches WHERE user_a >= user_b$$, 'todo par publicado está en orden canónico user_a < user_b');
SELECT is((SELECT similarity FROM public.matches WHERE track = 'romance'), 0.80::float8, 'del duplicado gana la similitud más alta, no el orden de llegada');
SELECT is((SELECT count(*)::int FROM public.matches WHERE track = 'amistad'), 1, 'el track amistad se publica independiente del de romance');

-- Una conversación abierta entre las dos personas del par romance.
INSERT INTO public.conversations (track, user_a, user_b)
  VALUES ('romance', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.conversation_messages (conversation_id, author, body)
  SELECT id, '11111111-1111-4111-8111-111111111111', 'hola' FROM public.conversations;

SELECT lives_ok(
  $$SELECT public.replace_matches('[
    {"track":"amistad","user_a":"22222222-2222-4222-8222-222222222222","user_b":"33333333-3333-4333-8333-333333333333","similarity":0.55}
  ]'::jsonb, public.get_pool_version())$$,
  'un reemplazo que no incluye el par romance se aplica igual');
SELECT is((SELECT count(*)::int FROM public.matches), 1, 'replace_matches borra el conjunto anterior: no acumula');
SELECT is((SELECT count(*)::int FROM public.conversations), 1, 'S3: la conversación abierta sobrevive al borrado de matches');
SELECT is((SELECT count(*)::int FROM public.conversation_messages), 1, 'S3: los mensajes de esa conversación también sobreviven');
SELECT is_empty(
  $$SELECT 1 FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.matches'::regclass$$,
  'ninguna FK apunta a matches: la conservación es estructural, no un cascade');

-- Guard de versión: si el pool cambió, no se publica nada.
SELECT is((SELECT public.replace_matches('[]'::jsonb, 'version-que-no-existe')), -1, 'una versión de pool distinta devuelve el sentinela -1');
SELECT is((SELECT count(*)::int FROM public.matches), 1, 'con el sentinela -1 el conjunto publicado no se toca');

SET request.jwt.claims = '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}';
SELECT throws_ok(
  $$SELECT public.replace_matches('[]'::jsonb, public.get_pool_version())$$,
  '42501', 'replace_matches exige service_role: un cliente autenticado no publica matches');

SELECT * FROM finish();
ROLLBACK;