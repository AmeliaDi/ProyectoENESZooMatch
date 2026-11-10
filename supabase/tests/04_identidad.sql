-- ============================================================================
-- S2 y la regla de oro de la identidad: se calcula una vez, se congela y ya no
-- se toca. Cubre lo que el motor de matching asume por debajo:
--   * `hatch_profile_identity` es idempotente (re-eclosionar no cambia el nombre)
--   * el trigger rechaza cualquier escritura directa de identidad congelada
--   * una persona de baja lógica deja de aparecer en los matches del otro
-- La parte de «ningún huevo elegible se queda sin eclosionar» con datos reales
-- la mide scripts/verify-pool.mts sobre la base viva (0 huevos atascados).
-- ============================================================================
BEGIN;

SELECT plan(14);

-- Catálogo mínimo para el fixture: no se toman los 103 animales reales.
INSERT INTO public.animals (id, nombre_fuente, diminutivo_es, categoria_fauna)
  VALUES ('qa-ajolote', 'Ajolote', 'ajolote', 'anfibio'),
         ('qa-lince', 'Lince', 'lince', 'mamifero');
INSERT INTO public.colors (id, nombre, hex, textura, temperatura)
  VALUES ('qa-rojo', 'rojo', '#FF0000', 'mate', 'calido');

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.profiles (user_id, matricula_hash) VALUES
  ('11111111-1111-4111-8111-111111111111', repeat(md5('qa-1'), 2)),
  ('22222222-2222-4222-8222-222222222222', repeat(md5('qa-2'), 2));

SET request.jwt.claims = '{"role":"service_role"}';
SET request.jwt.claim.role = 'service_role';

SELECT lives_ok(
  $$SELECT public.hatch_profile_identity(
    '11111111-1111-4111-8111-111111111111', 'qa-ajolote', 'qa-rojo',
    'ajolote', 'rosa', 'BCDF', 'ajolote rosa · BCDF', '4w5', 'narrativa de prueba', 'sp')$$,
  'un huevo eclosiona');
SELECT lives_ok(
  $$SELECT public.hatch_profile_identity(
    '22222222-2222-4222-8222-222222222222', 'qa-ajolote', 'qa-rojo',
    'ajolote', 'rosa', 'GHJK', 'ajolote rosa · GHJK', NULL, 'narrativa de prueba', NULL)$$,
  'la segunda persona eclosiona con su propio sufijo');

SELECT is((SELECT alias_completo FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-111111111111'),
  'ajolote rosa · BCDF', 'la identidad guardada es exactamente la que se pidió');
SELECT is((SELECT estado_identidad FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-111111111111'),
  'eclosionado', 'el estado pasa de huevo a eclosionado');
SELECT is((SELECT (eclosionado_en IS NOT NULL)::int FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-111111111111'),
  1, 'la marca de congelación queda escrita');

-- Re-eclosionar con OTRO sufijo: la identidad vieja gana. Es la garantía de que
-- un reintento o un despliegue repetido no le cambia el nombre a nadie.
SELECT is((SELECT public.hatch_profile_identity(
    '11111111-1111-4111-8111-111111111111', 'qa-ajolote', 'qa-rojo',
    'ajolote', 'rosa', 'LMNP', 'ajolote rosa · LMNP', '5w6', 'otra narrativa', 'so')),
  'ajolote rosa · BCDF', 're-eclosionar devuelve el nombre original, no el nuevo');
SELECT is((SELECT alias_sufijo FROM public.profiles WHERE user_id = '11111111-1111-4111-8111-111111111111'),
  'BCDF', 'el sufijo guardado no cambió');

SELECT throws_ok(
  $$UPDATE public.profiles SET animal_id = 'qa-lince' WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  '22023', 'el trigger rechaza cualquier escritura directa de identidad congelada');
-- Reescribir el MISMO valor no es un cambio: el trigger compara NEW contra OLD
-- columna por columna, así que un UPDATE cosmético (un reintento del servidor,
-- por ejemplo) no puede romper la regla de oro ni tampoco debe lanzar error.
SELECT lives_ok(
  $$UPDATE public.profiles SET animal_id = 'qa-ajolote' WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'reescribir el valor ya guardado no lanza: el trigger solo mira valores distintos');
SELECT throws_ok(
  $$SELECT public.hatch_profile_identity(
    '22222222-2222-4222-8222-222222222222', 'qa-ajolote', 'qa-rojo',
    'ajolote', 'rosa', '1234', 'ajolote rosa · 1234', NULL, 'x', NULL)$$,
  '22023', 'el sufijo tiene que ser consonantes: un formato inválido no eclosiona');
SELECT throws_ok(
  $$SELECT public.hatch_profile_identity(
    '22222222-2222-4222-8222-222222222222', 'qa-inexistente', 'qa-rojo',
    'ajolote', 'rosa', 'QRST', 'ajolote rosa · QRST', NULL, 'x', NULL)$$,
  '22023', 'un animal fuera del catálogo no eclosiona');

INSERT INTO public.matches (track, user_a, user_b, similarity)
  VALUES ('romance', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 0.91);
SELECT is((SELECT count(*)::int FROM public.get_user_matches('11111111-1111-4111-8111-111111111111')),
  1, 'antes de la baja, la pareja aparece');

UPDATE public.profiles SET eliminado_en = now() WHERE user_id = '22222222-2222-4222-8222-222222222222';
SELECT is_empty($$SELECT 1 FROM public.get_user_matches('11111111-1111-4111-8111-111111111111')$$,
  'S2/baja lógica: quien se fue desaparece de la lista del otro');
SELECT is((SELECT count(*)::int FROM public.profiles
    WHERE quiz_completed_at IS NOT NULL AND estado_identidad = 'huevo' AND eliminado_en IS NULL),
  0, 'ningún perfil completado del fixture se quedó en huevo');

SELECT * FROM finish();
ROLLBACK;