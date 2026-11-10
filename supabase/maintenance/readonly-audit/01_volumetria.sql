-- 01 · Volumetría: de qué tamaño es cada cosa antes de interpretar el resto.
--
-- Solo lectura. Corrérsela en el SQL Editor de Supabase, o con
-- `npm run db:audit` (que además la ejecuta contra la base local con
-- `npm run db:audit -- --local`). Ninguna consulta de esta carpeta devuelve
-- filas de personas: todo sale como conteo o agregado.
--
-- Para qué sirve: los hallazgos de las otras carpetas se leen en proporción.
-- «12 pares huérfanos» significa algo distinto sobre 200 pares que sobre 12 000,
-- y los presupuestos de `npm run db:perf` se calibran sobre otra población.

select chequeo, valor::text, esperado
from (
  values
    ('perfiles totales',        (select count(*) from public.profiles)::text, 'informativo'),
    ('perfiles con quiz',       (select count(*) from public.profiles where quiz_completed_at is not null)::text, 'informativo'),
    ('eclosionados',            (select count(*) from public.profiles where estado_identidad = 'eclosionado')::text, 'informativo'),
    ('huevos',                  (select count(*) from public.profiles where estado_identidad = 'huevo')::text, 'informativo'),
    ('pausados',                (select count(*) from public.profiles where paused_at is not null)::text, 'informativo'),
    ('bajas logicas',           (select count(*) from public.profiles where eliminado_en is not null)::text, 'informativo'),
    ('pares romance',           (select count(*) from public.matches where track = 'romance')::text, 'informativo'),
    ('pares amistad',           (select count(*) from public.matches where track = 'amistad')::text, 'informativo'),
    ('conversaciones',          (select count(*) from public.conversations)::text, 'informativo'),
    ('conversaciones con mensaje', (select count(distinct conversation_id) from public.conversation_messages)::text, 'informativo'),
    ('mensajes',                (select count(*) from public.conversation_messages)::text, 'informativo'),
    ('rondas de rompehielos',   (select count(*) from public.conversation_rounds)::text, 'informativo'),
    ('avisos',                  (select count(*) from public.notifications)::text, 'informativo'),
    ('avisos sin leer',         (select count(*) from public.notifications where read = false)::text, 'informativo'),
    ('respuestas de quiz',      (select count(*) from public.quiz_responses)::text, 'informativo'),
    ('respuestas por item',     (select count(*) from public.quiz_answers)::text, 'informativo'),
    ('intentos de quiz',        (select count(*) from public.quiz_attempts)::text, 'informativo'),
    ('pares con chat abierto',  (select count(*) from public.conversations c
                                 where exists (select 1 from public.matches m
                                               where m.track = c.track and m.user_a = c.user_a and m.user_b = c.user_b))::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
