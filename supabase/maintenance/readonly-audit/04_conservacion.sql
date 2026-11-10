-- 04 · Conservación: ninguna relación existente se pierde al recalcular.
--
-- Solo lectura, solo conteos.
--
-- El primer renglón es la compuerta de rollout del prompt maestro: «cero pares
-- perdidos que tengan una conversación abierta». Una conversación es la prueba
-- de que dos personas se eligieron de verdad, así que si `matches` deja de
-- contener su par, el recálculo borró una relación viva aunque el resto del
-- esquema esté impecable.
--
-- Hoy mide y no asfixia, y hay que decir por qué. La regla está escrita para el
-- MOMENTO DE ACTIVAR un motor (`data/rollout-gates.json` → `conservacion.max_perdida`,
-- `src/domain/matching/rollout.ts`), pero el camino ordinario no pasa por ahí:
-- `replace_matches` abre con `DELETE FROM public.matches WHERE true`
-- (`20261108000000_fase1_idempotency_and_soft_delete.sql:52`) y `admin_reset_quiz`
-- borra todo lo de una persona (`20261116000000_identity_drop_legacy.sql:250`)
-- sin insertar nada a cambio. Ninguna de las dos protege las parejas con
-- conversación abierta, y como ninguna FK apunta a `matches` (DB_ESQUEMA.md §
-- «Conservación de conversaciones»), la conversación sobrevive a su par.
-- Medido en producción el 2026-11-10: 71 conversaciones sin par vigente (41 con
-- mensajes, 5 de ellas abiertas DESPUÉS del último recálculo registrado en
-- `admin_audit`, 2026-11-08 22:49 UTC), todas con ambas partes vivas y ninguna
-- pausada. Registrado como DB-19 en docs/QA_DB.md.
--
-- Estos dos renglones vuelven a esperar '0' cuando el recálculo ordinario
-- conserve las parejas con conversación abierta — no antes, y nunca borrando las
-- conversaciones para que cuadren.
--
-- El resto cubre el grafo chat→mensajes→rondas→respuestas→reacciones: las FK de
-- `supabase/migrations` sostienen varias de estas aristas, pero las que no tienen
-- FK (autor dentro de la conversación, unicidad de `client_key`, correspondencia
-- de índices) solo se defendían hasta ahora con código de aplicación.

select chequeo, valor::text, esperado
from (
  values
    ('conversaciones sin par vigente en matches',
      (select count(*) from public.conversations c
       where not exists (select 1 from public.matches m
                         where m.track = c.track and m.user_a = c.user_a and m.user_b = c.user_b))::text, 'informativo'),
    ('conversaciones abiertas desde el ultimo recálculo sin par vigente',
      (select count(*) from public.conversations c
       where c.created_at > (select coalesce(max(created_at), to_timestamp(0))
                             from public.admin_audit where action = 'recompute')
         and not exists (select 1 from public.matches m
                         where m.track = c.track and m.user_a = c.user_a and m.user_b = c.user_b))::text, 'informativo'),
    ('conversacion invertida (user_a >= user_b)',
      (select count(*) from public.conversations where user_a >= user_b)::text, '0'),
    ('conversacion contigo mismo',
      (select count(*) from public.conversations where user_a = user_b)::text, '0'),
    ('conversacion track fuera de romance/amistad',
      (select count(*) from public.conversations where track <> all (array['romance','amistad']))::text, '0'),
    ('conversacion con endpoints inexistentes',
      (select count(*) from public.conversations c
       where not exists (select 1 from public.profiles p where p.user_id = c.user_a)
          or not exists (select 1 from public.profiles p where p.user_id = c.user_b))::text, '0'),
    ('conversaciones duplicadas por (a, b, track)',
      (select count(*) from (
         select user_a, user_b, track from public.conversations
         group by user_a, user_b, track having count(*) > 1) as d)::text, '0'),
    ('mensajes de conversacion inexistente',
      (select count(*) from public.conversation_messages msg
       where not exists (select 1 from public.conversations c where c.id = msg.conversation_id))::text, '0'),
    ('mensajes cuyo autor no participa en la conversacion',
      (select count(*) from public.conversation_messages msg
       where not exists (select 1 from public.conversations c
                         where c.id = msg.conversation_id and msg.author = any (array[c.user_a, c.user_b])))::text, '0'),
    ('mensajes con client_key repetido en la misma conversacion',
      (select count(*) from (
         select conversation_id, client_key from public.conversation_messages
         where client_key is not null
         group by conversation_id, client_key having count(*) > 1) as d)::text, '0'),
    ('mensajes con client_key repetido entre conversaciones',
      (select count(*) from (
         select client_key from public.conversation_messages
         where client_key is not null
         group by client_key having count(distinct conversation_id) > 1) as d)::text, 'informativo'),
    ('rondas de conversacion inexistente',
      (select count(*) from public.conversation_rounds r
       where not exists (select 1 from public.conversations c where c.id = r.conversation_id))::text, '0'),
    ('rondas cuyo asker no participa',
      (select count(*) from public.conversation_rounds r
       where not exists (select 1 from public.conversations c
                         where c.id = r.conversation_id and r.asker = any (array[c.user_a, c.user_b])))::text, '0'),
    ('rondas duplicadas por (conversacion, idx)',
      (select count(*) from (
         select conversation_id, idx from public.conversation_rounds
         group by conversation_id, idx having count(*) > 1) as d)::text, '0'),
    ('respuestas de conversacion inexistente',
      (select count(*) from public.conversation_answers a
       where not exists (select 1 from public.conversations c where c.id = a.conversation_id))::text, '0'),
    ('respuestas cuyo autor no participa',
      (select count(*) from public.conversation_answers a
       where not exists (select 1 from public.conversations c
                         where c.id = a.conversation_id and a.author = any (array[c.user_a, c.user_b])))::text, '0'),
    ('respuestas sin ronda correspondiente',
      (select count(*) from public.conversation_answers a
       where not exists (select 1 from public.conversation_rounds r
                         where r.conversation_id = a.conversation_id and r.idx = a.round))::text, '0'),
    ('respuestas duplicadas por (conversacion, ronda, autor)',
      (select count(*) from (
         select conversation_id, round, author from public.conversation_answers
         group by conversation_id, round, author having count(*) > 1) as d)::text, '0'),
    ('reacciones cuyo autor no participa',
      (select count(*) from public.conversation_reactions x
       where not exists (select 1 from public.conversations c
                         where c.id = x.conversation_id and x.author = any (array[c.user_a, c.user_b])))::text, '0'),
    ('reacciones sin ronda correspondiente',
      (select count(*) from public.conversation_reactions x
       where not exists (select 1 from public.conversation_rounds r
                         where r.conversation_id = x.conversation_id and r.idx = x.idx))::text, '0'),
    ('reacciones duplicadas por (conversacion, idx, autor)',
      (select count(*) from (
         select conversation_id, idx, author from public.conversation_reactions
         group by conversation_id, idx, author having count(*) > 1) as d)::text, '0'),
    ('notificaciones sin perfil destino',
      (select count(*) from public.notifications n
       where not exists (select 1 from public.profiles p where p.user_id = n.user_id))::text, '0'),
    ('intereses con emisor o receptor inexistente',
      (select count(*) from public.chat_interests i
       where not exists (select 1 from public.profiles p where p.user_id = i.from_user)
          or not exists (select 1 from public.profiles p where p.user_id = i.to_user))::text, '0'),
    ('pines de PIN sin perfil',
      (select count(*) from public.chat_pins k
       where not exists (select 1 from public.profiles p where p.user_id = k.user_id))::text, '0'),
    ('cierres de conversacion con extremos inexistentes',
      (select count(*) from public.chat_closures x
       where not exists (select 1 from public.profiles p where p.user_id = x.user_a)
          or not exists (select 1 from public.profiles p where p.user_id = x.user_b))::text, '0'),
    ('bloqueos contigo mismo',
      (select count(*) from public.chat_blocks b where b.blocker = b.blocked)::text, '0'),
    ('conversaciones cuyo par esta pausado o dado de baja',
      (select count(*) from public.conversations c
       where exists (select 1 from public.profiles p
                     where p.user_id in (c.user_a, c.user_b)
                       and (p.paused_at is not null or p.eliminado_en is not null)))::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
