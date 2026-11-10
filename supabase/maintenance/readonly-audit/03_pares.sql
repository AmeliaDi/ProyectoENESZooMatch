-- 03 · Pares: que la tabla matches describa el pool que el motor cree estar escribiendo.
--
-- Solo lectura, solo conteos y agregados.
--
-- La pregunta de fondo no es «¿hay filas raras?» sino «¿el pool vivo coincide con
-- lo que el motor de matching decidió?». Un par puede ser inválido de tres modos
-- distintos y conviene separarlos: forma (está mal escrito), elegibilidad (una de
-- las dos personas ya no participa) y frescura (es de una revisión anterior del
-- pool). Los tres se miden aquí por separado.

select chequeo, valor::text, esperado
from (
  values
    ('par invertido (user_a >= user_b)',
      (select count(*) from public.matches where user_a >= user_b)::text, '0'),
    ('par contigo mismo',
      (select count(*) from public.matches where user_a = user_b)::text, '0'),
    ('similitud fuera de (0,1]',
      (select count(*) from public.matches where similarity <= 0 or similarity > 1)::text, '0'),
    ('track fuera de romance/amistad',
      (select count(*) from public.matches where track <> all (array['romance','amistad']))::text, '0'),
    ('badges que no es un array JSON',
      (select count(*) from public.matches where jsonb_typeof(badges) not in ('array'))::text, '0'),
    ('badges nulo',
      (select count(*) from public.matches where badges is null)::text, '0'),
    ('duplicados por (user_a, user_b, track)',
      (select count(*) from (
         select user_a, user_b, track from public.matches
         group by user_a, user_b, track having count(*) > 1) as d)::text, '0'),
    ('endpoint A sin perfil',
      (select count(*) from public.matches m
       where not exists (select 1 from public.profiles p where p.user_id = m.user_a))::text, '0'),
    ('endpoint B sin perfil',
      (select count(*) from public.matches m
       where not exists (select 1 from public.profiles p where p.user_id = m.user_b))::text, '0'),
    ('par con un endpoint dado de baja',
      (select count(*) from public.matches m
       where exists (select 1 from public.profiles p
                     where p.user_id in (m.user_a, m.user_b) and p.eliminado_en is not null))::text, 'informativo'),
    ('par con un endpoint en pausa',
      (select count(*) from public.matches m
       where exists (select 1 from public.profiles p
                     where p.user_id in (m.user_a, m.user_b) and p.paused_at is not null))::text, 'informativo'),
    ('par con un endpoint sin quiz completado',
      (select count(*) from public.matches m
       where exists (select 1 from public.profiles p
                     where p.user_id in (m.user_a, m.user_b) and p.quiz_completed_at is null))::text, '0'),
    ('par con un endpoint que sigue en huevo',
      (select count(*) from public.matches m
       where exists (select 1 from public.profiles p
                     where p.user_id in (m.user_a, m.user_b) and p.estado_identidad = 'huevo'))::text, '0'),
    ('computed_at nulo',
      (select count(*) from public.matches where computed_at is null)::text, '0'),
    ('computed_at en el futuro',
      (select count(*) from public.matches where computed_at > now())::text, '0'),
    ('horas desde el computed_at mas nuevo',
      (select round(extract(epoch from (now() - max(computed_at))) / 3600.0, 1) from public.matches)::text, 'informativo'),
    ('horas desde el computed_at mas viejo',
      (select round(extract(epoch from (now() - min(computed_at))) / 3600.0, 1) from public.matches)::text, 'informativo'),
    ('similitud promedio por pista',
      (select string_agg(x, ' ' order by x) from (
         select track || '=' || round(avg(similarity)::numeric, 4) as x from public.matches group by track) as s)::text, 'informativo'),
    ('pares con similitud 1 exacta',
      (select count(*) from public.matches where similarity = 1)::text, 'informativo'),
    ('activos con quiz y cero pares romance',
      (select count(*) from public.profiles p
       where p.quiz_completed_at is not null and p.paused_at is null and p.eliminado_en is null
         and not exists (select 1 from public.matches m
                         where m.track = 'romance' and p.user_id in (m.user_a, m.user_b)))::text, 'informativo'),
    ('activos con quiz y cero pares amistad',
      (select count(*) from public.profiles p
       where p.quiz_completed_at is not null and p.paused_at is null and p.eliminado_en is null
         and not exists (select 1 from public.matches m
                         where m.track = 'amistad' and p.user_id in (m.user_a, m.user_b)))::text, 'informativo'),
    ('revision del pool guardada (private.pool_state)',
      (select revision::text from private.pool_state limit 1)::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
