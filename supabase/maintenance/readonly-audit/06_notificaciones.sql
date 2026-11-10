-- 06 · Notificaciones: que la bandeja no mienta ni repita.
--
-- Solo lectura, solo conteos. Nunca se imprime el título ni el cuerpo de un aviso.
--
-- Dos cosas se ponen a prueba aquí. La primera es el vocabulario de `type`, que
-- es una CHECK vigente: si alguien lo amplía sin registrar el tipo nuevo, la
-- bandeja deja de saber cómo renderizar el aviso. La segunda es la higiene del
-- lenguaje: la purga del marcador «-x» (commit 7bf8981) se aplicó sobre las
-- copias que ya vivían en la base, y un aviso viejo mal redactado sigue
-- llegándole a quien no lo leyó. Por eso el conteo se separa en sin leer
-- (esperado 0, es una deuda viva) y leídos (informativo, historia).
--
-- Los renglones de retención miden la consecuencia de que `pg_cron` no esté
-- instalado: si hay avisos leídos de hace meses, el job de purga nunca corrió,
-- y eso es un hecho del entorno, no un bug del código.

select chequeo, valor::text, esperado
from (
  values
    ('tipo fuera del vocabulario',
      (select count(*) from public.notifications
       where type <> all (array['match_romance','match_amistad','no_match','welcome','chat','identity']))::text, '0'),
    ('titulo vacio',
      (select count(*) from public.notifications where coalesce(title, '') = '')::text, '0'),
    ('cuerpo vacio',
      (select count(*) from public.notifications where coalesce(body, '') = '')::text, '0'),
    ('metadata que no es un object JSON',
      (select count(*) from public.notifications where jsonb_typeof(metadata) not in ('object'))::text, '0'),
    ('metadata nula',
      (select count(*) from public.notifications where metadata is null)::text, 'informativo'),
    ('avisos sin leer con marcador «unx» o «lxs»',
      (select count(*) from public.notifications
       where read = false and (title ~* '(unx|unxs|lxs)' or body ~* '(unx|unxs|lxs)'))::text, '0'),
    ('avisos leidos con marcador «unx» o «lxs»',
      (select count(*) from public.notifications
       where read = true and (title ~* '(unx|unxs|lxs)' or body ~* '(unx|unxs|lxs)'))::text, 'informativo'),
    ('cualquier aviso sin leer con palabra terminada en -xs',
      (select count(*) from public.notifications
       where read = false and (title ~* '\m[a-záéíóúüñ]{3,}xs\M' or body ~* '\m[a-záéíóúüñ]{3,}xs\M'))::text, 'informativo'),
    -- Un aviso de match llega a quien tiene medición, no a quien ya abrió su
    -- identidad: el pool de recálculo se define por `quiz_completed_at`, así que
    -- un huevo con la encuesta terminada puede y debe recibir sus pares. Lo que
    -- no puede existir es un aviso de match a quien nunca completó el quiz.
    ('avisos de match a quien no tiene quiz completado',
      (select count(*) from public.notifications n
       join public.profiles p on p.user_id = n.user_id
       where n.type in ('match_romance','match_amistad') and p.quiz_completed_at is null)::text, '0'),
    ('avisos de match a quien sigue en huevo',
      (select count(*) from public.notifications n
       join public.profiles p on p.user_id = n.user_id
       where n.type in ('match_romance','match_amistad') and p.estado_identidad = 'huevo')::text, 'informativo'),
    ('avisos de match a perfil dado de baja',
      (select count(*) from public.notifications n
       join public.profiles p on p.user_id = n.user_id
       where n.type in ('match_romance','match_amistad') and p.eliminado_en is not null)::text, 'informativo'),
    ('avisos de match a perfil en pausa',
      (select count(*) from public.notifications n
       join public.profiles p on p.user_id = n.user_id
       where n.type in ('match_romance','match_amistad') and p.paused_at is not null)::text, 'informativo'),
    ('avisos totales',
      (select count(*) from public.notifications)::text, 'informativo'),
    ('avisos sin leer',
      (select count(*) from public.notifications where read = false)::text, 'informativo'),
    ('maximo de avisos sin leer en una bandeja',
      (select coalesce(max(n), 0) from (
         select count(*) as n from public.notifications where read = false group by user_id) as s)::text, 'informativo'),
    ('maximo de avisos no_match a una persona',
      (select coalesce(max(n), 0) from (
         select count(*) as n from public.notifications where type = 'no_match' group by user_id) as s)::text, 'informativo'),
    ('avisos por tipo',
      (select string_agg(x, ' | ' order by x) from (
         select type || '=' || count(*) as x from public.notifications group by type) as s)::text, 'informativo'),
    ('avisos sin leer de mas de 30 dias',
      (select count(*) from public.notifications
       where read = false and created_at < now() - interval '30 days')::text, 'informativo'),
    ('avisos leidos de mas de 90 dias',
      (select count(*) from public.notifications
       where read = true and created_at < now() - interval '90 days')::text, 'informativo'),
    ('avisos del dia mas cargado',
      (select coalesce(max(n), 0) from (
         select count(*) as n from public.notifications group by created_at::date) as s)::text, 'informativo'),
    ('destinatarios con avisos',
      (select count(distinct user_id) from public.notifications)::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
