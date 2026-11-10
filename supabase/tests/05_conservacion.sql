-- ============================================================================
-- M-13 / DB-19 · Una conversación abierta no se queda sin su tarjeta.
--
-- La prueba aplica la migración PENDIENTE dentro de su propia transacción y el
-- ROLLBACK final se la lleva (ver `@aplicar` abajo y `withPending` en
-- `scripts/db/test.mjs`): así el verde no depende de que producción ya la tenga
-- aplicado. Y el rojo está medido, no afirmado: con la directiva desactivada,
-- `npm run db:test` reporta `8 fallos, plan 15, corrieron 15, declaradas 15`.
-- Fallan por la razón correcta —el `DELETE FROM public.matches WHERE true`
-- vigente borra la pareja y nadie la regresa—, así que ninguna aserción de este
-- archivo se aprueba sola.
--
-- Qué fija, dicho con datos y no con intención:
--   · la pareja con conversación que el motor ya no produce sigue publicada,
--     con la similitud, los badges y el computed_at del renglón anterior
--     (restituir no es inventar un score);
--   · la pareja SIN conversación que el motor ya no produce sí se va, y el
--     renglón que el motor sí produce se publica con el score NUEVO del motor,
--     no con el viejo: conservar protege la existencia del par, no su número;
--   · la guarda de versión de pool y la normalización del payload (orden
--     canónico, auto-match fuera, duplicado resuelto por similitud) siguen
--     exactamente como estaban.
-- ============================================================================

-- @aplicar: supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql

BEGIN;

SELECT plan(15);

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

-- Tres renglones publicados: A·B de romance CON conversación abierta, A·B de
-- amistad SIN ella (la misma pareja, otro track: la protección es por track), y
-- A·C de amistad sin conversación. Los tres se computaron en enero, y eso se
-- nota en computed_at a propósito.
INSERT INTO public.matches (track, user_a, user_b, similarity, badges, computed_at) VALUES
  ('romance', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   0.77, '[{"dimension":"valores","affinity":0.9}]'::jsonb, '2026-01-01T00:00:00+00:00'),
  ('amistad', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   0.66, '[]'::jsonb, '2026-01-01T00:00:00+00:00'),
  ('amistad', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
   0.61, '[]'::jsonb, '2026-01-01T00:00:00+00:00');

INSERT INTO public.conversations (track, user_a, user_b) VALUES
  ('romance', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- El motor nuevo solo produce B·C de amistad. A·B (con conversación) y A·C
-- (sin conversación) salen del conjunto.
SELECT is(
  (SELECT public.replace_matches('[
    {"track":"amistad","user_a":"22222222-2222-4222-8222-222222222222","user_b":"33333333-3333-4333-8333-333333333333","similarity":0.55}
  ]'::jsonb, public.get_pool_version())),
  2,
  'escribe dos renglones: el del motor más la pareja conservada');

-- 1 · la pareja protegida sigue ahí
SELECT ok(
  EXISTS (SELECT 1 FROM public.matches
          WHERE track = 'romance' AND user_a = '11111111-1111-4111-8111-111111111111'
            AND user_b = '22222222-2222-4222-8222-222222222222'),
  'la pareja con conversación abierta sigue publicada después del recálculo');

SELECT is(
  (SELECT similarity FROM public.matches
   WHERE track = 'romance' AND user_a = '11111111-1111-4111-8111-111111111111'
     AND user_b = '22222222-2222-4222-8222-222222222222'),
  0.77::float8,
  'se restituye con la similitud almacenada, no con una inventada');

SELECT is(
  (SELECT badges FROM public.matches
   WHERE track = 'romance' AND user_a = '11111111-1111-4111-8111-111111111111'
     AND user_b = '22222222-2222-4222-8222-222222222222'),
  '[{"dimension":"valores","affinity":0.9}]'::jsonb,
  'y con sus badges intactos: la tarjeta restituida dice lo mismo que decía');

SELECT is(
  (SELECT computed_at FROM public.matches
   WHERE track = 'romance' AND user_a = '11111111-1111-4111-8111-111111111111'
     AND user_b = '22222222-2222-4222-8222-222222222222'),
  '2026-01-01T00:00:00+00:00'::timestamptz,
  'conservar no finge un recálculo: conserva la marca de tiempo del renglón');

-- 2 · la que NO tiene conversación sí se va, y el track importa
SELECT is_empty(
  $$SELECT 1 FROM public.matches WHERE track = 'amistad' AND user_a = '11111111-1111-4111-8111-111111111111' AND user_b = '33333333-3333-4333-8333-333333333333'$$,
  'una pareja sin conversación que el motor ya no produce sí desaparece');

SELECT is_empty(
  $$SELECT 1 FROM public.matches WHERE track = 'amistad' AND user_a = '11111111-1111-4111-8111-111111111111' AND user_b = '22222222-2222-4222-8222-222222222222'$$,
  'la protección es por track: la misma pareja en amistad, sin conversación, sí se va');

-- 3 · la conversación es intocable y el renglón del motor usa el score nuevo
SELECT is(
  (SELECT count(*)::int FROM public.conversations),
  1,
  'la conversación sigue intacta: ninguna FK apunta a matches');

SELECT is(
  (SELECT similarity FROM public.matches
   WHERE track = 'amistad' AND user_a = '22222222-2222-4222-8222-222222222222'
     AND user_b = '33333333-3333-4333-8333-333333333333'),
  0.55::float8,
  'lo que el motor sí produce se publica con el score del motor');

-- 4 · idempotencia: reenviar el mismo conjunto no duplica ni renumera
SELECT is(
  (SELECT public.replace_matches('[
    {"track":"amistad","user_a":"22222222-2222-4222-8222-222222222222","user_b":"33333333-3333-4333-8333-333333333333","similarity":0.55}
  ]'::jsonb, public.get_pool_version())),
  2,
  'recalcular dos veces seguidas escribe los mismos dos renglones');

SELECT is(
  (SELECT count(*)::int FROM public.matches),
  2,
  'siguen dos renglones en la tabla: conservar no duplica');

-- 5 · la guarda de versión de pool sigue ganando
SELECT is(
  (SELECT public.replace_matches('[
    {"track":"romance","user_a":"11111111-1111-4111-8111-111111111111","user_b":"22222222-2222-4222-8222-222222222222","similarity":0.30}
  ]'::jsonb, 'pool-version-ajena')),
  -1,
  'con una versión de pool ajena devuelve -1 y no escribe nada');

SELECT is(
  (SELECT similarity FROM public.matches
   WHERE track = 'romance' AND user_a = '11111111-1111-4111-8111-111111111111'
     AND user_b = '22222222-2222-4222-8222-222222222222'),
  0.77::float8,
  'y el renglón conservado no se tocó ni con la guarda fallando');

-- 6 · la normalización del payload sobrevivió a la reescritura: orden canónico,
-- auto-match fuera, nulos fuera, y del duplicado gana la similitud más alta.
-- A·B SÍ está en el payload, así que su valor es el del motor (0.80), no el
-- conservado: proteger la existencia del par no es congelar su número.
SELECT lives_ok(
  $$SELECT public.replace_matches('[
    {"track":"romance","user_a":"22222222-2222-4222-8222-222222222222","user_b":"11111111-1111-4111-8111-111111111111","similarity":0.80},
    {"track":"romance","user_a":"11111111-1111-4111-8111-111111111111","user_b":"22222222-2222-4222-8222-222222222222","similarity":0.60},
    {"track":"romance","user_a":"11111111-1111-4111-8111-111111111111","user_b":"11111111-1111-4111-8111-111111111111","similarity":0.99},
    {"track":"amistad","user_a":"11111111-1111-4111-8111-111111111111","user_b":null,"similarity":0.90}
  ]'::jsonb, public.get_pool_version())$$,
  'acepta el payload sucio sin reventar');

SELECT is(
  (SELECT similarity FROM public.matches
   WHERE track = 'romance' AND user_a = '11111111-1111-4111-8111-111111111111'
     AND user_b = '22222222-2222-4222-8222-222222222222'),
  0.80::float8,
  'cuando el motor produce la pareja protegida, manda el score del motor');

SELECT * FROM finish();

ROLLBACK;
