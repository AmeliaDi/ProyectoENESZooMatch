-- Pares protegidos: las parejas con conversación abierta, en agregado.
--
-- NO está en `supabase/maintenance/readonly-audit/` a propósito: esa carpeta la
-- recorre `npm run db:audit` renglón por renglón y exige una forma fija. Esta
-- consulta es un insumo puntual de la compuerta `conservacion`
-- (`data/rollout-gates.json`), no un chequeo permanente.
--
-- Solo lectura, solo conteos y un digest. Está prohibido exportar filas de
-- producción, así que el conjunto se verifica por su huella y no por su
-- contenido: `md5` sobre `(track, user_a, user_b)` ordenado cambia si cambia el
-- conjunto, y no revela una sola identidad.
--
-- Para volver a correr la compuerta con el conjunto REAL (M-02 paso 4) hacen
-- falta dos cosas que este archivo no puede dar: el digest, para saber que el
-- conjunto local es el mismo, y la lista misma, que solo puede salir de una
-- sesión con acceso de lectura completo en el SQL Editor de Supabase. Aquí se
-- corre con una muestra sembrada porque el acceso disponible es de agregados.

select chequeo, valor::text, esperado
from (
  values
    ('pares protegidos en matches (con conversacion abierta)',
      (select count(*) from public.matches m
       where exists (select 1 from public.conversations c
                     where c.track = m.track and c.user_a = m.user_a and c.user_b = m.user_b))::text, 'informativo'),
    ('pares protegidos por track',
      (select string_agg(x, ' | ' order by x) from (
         select m.track || '=' || count(*) as x
         from public.matches m
         where exists (select 1 from public.conversations c
                       where c.track = m.track and c.user_a = m.user_a and c.user_b = m.user_b)
         group by m.track) as s)::text, 'informativo'),
    ('pares protegidos con al menos un mensaje escrito',
      (select count(*) from public.matches m
       where exists (select 1 from public.conversations c
                     join public.conversation_messages msg on msg.conversation_id = c.id
                     where c.track = m.track and c.user_a = m.user_a and c.user_b = m.user_b))::text, 'informativo'),
    ('digest del conjunto (track|user_a|user_b ordenado, md5)',
      (select md5(string_agg(m.track || '|' || m.user_a || '|' || m.user_b, ',' order by m.track, m.user_a, m.user_b))
       from public.matches m
       where exists (select 1 from public.conversations c
                     where c.track = m.track and c.user_a = m.user_a and c.user_b = m.user_b))::text, 'informativo'),
    ('conversaciones abiertas cuyo par ya no esta en matches (DB-19)',
      (select count(*) from public.conversations c
       where not exists (select 1 from public.matches m
                         where m.track = c.track and m.user_a = c.user_a and m.user_b = c.user_b))::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
