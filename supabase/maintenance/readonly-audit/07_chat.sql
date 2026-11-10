-- 07 · Chat: turnos, rondas y candados, incluyendo lo que las CHECKs NO VALID perdonan.
--
-- Solo lectura, solo conteos. Nunca se imprime un mensaje, una respuesta ni un PIN.
--
-- Hay tres CHECKs que hoy no validan nada:
--   conversation_rounds_three_questions_check    (idx 0..2)
--   conversation_answers_three_questions_check   (round 0..2)
--   conversation_reactions_three_questions_check (idx 0..2)
-- Están declaradas NOT VALID porque la conversación antigua llegó a tener más de
-- tres preguntas antes de recortar el rompehielos, y
-- `20261111000000_fase4_chat_three_rounds.sql:31` eligió conservarlo todo:
-- «keeping any historical round >= 3 intact without data loss».
--
-- Una CHECK NOT VALID sí revisa las filas NUEVAS, así que el límite de 3
-- preguntas lo defiende la base desde la migración en adelante y lo que mide
-- este renglón es únicamente el histórico deliberado. Medido en producción el
-- 2026-11-10: 67 rondas, 119 respuestas y 49 reacciones con índice fuera del
-- límite, con idx máximo 18/18/17 en 15 conversaciones. Por eso estos tres
-- renglones miden en vez de asfixiar: `VALIDATE CONSTRAINT` fallaría con esos
-- mismos números (ver DB-09 en docs/QA_DB.md), y volverlos a esperar 0 exigiría
-- borrar histórico, que es justo lo que la migración se negó a hacer.
--
-- El bloque de PIN mide candados rotos o huérfanos, sin mirar nunca el hash.

select chequeo, valor::text, esperado
from (
  values
    ('last_actor que no es participante',
      (select count(*) from public.conversations c
       where c.last_actor is not null and c.last_actor <> all (array[c.user_a, c.user_b]))::text, '0'),
    ('paused_by que no es participante',
      (select count(*) from public.conversations c
       where c.paused_by is not null and c.paused_by <> all (array[c.user_a, c.user_b]))::text, '0'),
    ('reacciones con emoji vacio o de mas de 16 caracteres',
      (select count(*) from public.conversation_reactions
       where char_length(coalesce(emoji, '')) < 1 or char_length(emoji) > 16)::text, '0'),
    ('reportes con status fuera de abierto/revisado/cerrado',
      (select count(*) from public.chat_reports
       where status <> all (array['abierto','revisado','cerrado']))::text, '0'),
    ('rondas con idx mayor que 2 (historico conservado a proposito)',
      (select count(*) from public.conversation_rounds where idx > 2)::text, 'informativo'),
    ('respuestas con round mayor que 2 (historico conservado a proposito)',
      (select count(*) from public.conversation_answers where round > 2)::text, 'informativo'),
    ('reacciones con idx mayor que 2 (historico conservado a proposito)',
      (select count(*) from public.conversation_reactions where idx > 2)::text, 'informativo'),
    ('indice maximo fuera del limite (rondas|respuestas|reacciones)',
      (select (select coalesce(max(idx), 0) from public.conversation_rounds where idx > 2) || '|' ||
              (select coalesce(max(round), 0) from public.conversation_answers where round > 2) || '|' ||
              (select coalesce(max(idx), 0) from public.conversation_reactions where idx > 2))::text, 'informativo'),
    ('rondas fuera de 0..59',
      (select count(*) from public.conversation_rounds where idx < 0 or idx > 59)::text, '0'),
    ('rondas con prompt y texto propio a la vez',
      (select count(*) from public.conversation_rounds
       where prompt_id is not null and custom_text is not null)::text, '0'),
    ('rondas sin prompt ni texto propio',
      (select count(*) from public.conversation_rounds
       where prompt_id is null and custom_text is null)::text, '0'),
    ('prompt_id fuera de ^[par][0-9]{3}$',
      (select count(*) from public.conversation_rounds
       where prompt_id is not null and prompt_id !~ '^[par][0-9]{3}$')::text, '0'),
    ('custom_text de mas de 1600 caracteres',
      (select count(*) from public.conversation_rounds
       where char_length(coalesce(custom_text, '')) > 1600)::text, '0'),
    ('respuestas aprobadas con texto',
      (select count(*) from public.conversation_answers
       where passed = true and char_length(body) > 0)::text, '0'),
    ('respuestas rechazadas sin texto',
      (select count(*) from public.conversation_answers
       where passed = false and coalesce(body, '') = '')::text, '0'),
    ('conversaciones con las 3 rondas cerradas y libre sin abrir',
      (select count(*) from public.conversations c
       where c.free_ready_a = false and c.free_ready_b = false
         and (select count(*) from public.conversation_rounds r where r.conversation_id = c.id) >= 3)::text, 'informativo'),
    ('conversaciones libres sin ninguna ronda',
      (select count(*) from public.conversations c
       where (c.free_ready_a or c.free_ready_b)
         and not exists (select 1 from public.conversation_rounds r where r.conversation_id = c.id))::text, 'informativo'),
    ('conversaciones en pausa',
      (select count(*) from public.conversations where paused_by is not null)::text, 'informativo'),
    ('intereses reciprocos que no llegaron a conversacion',
      (select count(*) from public.chat_interests i
       where i.declined_at is null
         and exists (select 1 from public.chat_interests r
                     where r.from_user = i.to_user and r.to_user = i.from_user and r.track = i.track)
         and not exists (select 1 from public.conversations c
                         where c.track = i.track and i.from_user = any (array[c.user_a, c.user_b])
                                              and i.to_user = any (array[c.user_a, c.user_b])))::text, 'informativo'),
    ('intereses contigo mismo',
      (select count(*) from public.chat_interests where from_user = to_user)::text, '0'),
    ('cierres de conversacion invertidos',
      (select count(*) from public.chat_closures where user_a >= user_b)::text, '0'),
    ('pines con pin_hash ausente o corto',
      (select count(*) from public.chat_pins where char_length(coalesce(pin_hash, '')) < 16)::text, '0'),
    ('pines con salt ausente o corto',
      (select count(*) from public.chat_pins where char_length(coalesce(salt, '')) < 8)::text, '0'),
    ('pines con kdf_params que no es un object JSON',
      (select count(*) from public.chat_pins where jsonb_typeof(kdf_params) not in ('object'))::text, '0'),
    ('pines bloqueados en este momento',
      (select count(*) from public.chat_pins where locked_until is not null and locked_until > now())::text, 'informativo'),
    ('pines con intentos fallidos acumulados',
      (select count(*) from public.chat_pins where failed_attempts > 0)::text, 'informativo'),
    ('pines con recuperacion solicitada abierta',
      (select count(*) from public.chat_pins where recovery_requested_at is not null)::text, 'informativo'),
    ('pines sin perfil',
      (select count(*) from public.chat_pins k
       where not exists (select 1 from public.profiles p where p.user_id = k.user_id))::text, '0'),
    ('credenciales de administracion (filas)',
      (select count(*) from public.admin_credentials)::text, 'informativo'),
    ('credenciales de administracion sin pin_hash',
      (select count(*) from public.admin_credentials where char_length(coalesce(pin_hash, '')) < 16)::text, '0'),
    ('eventos de seguridad por tipo',
      (select string_agg(x, ' | ' order by x) from (
         select kind || '=' || count(*) as x from public.chat_security_events group by kind) as s)::text, 'informativo'),
    ('reportes abiertos',
      (select count(*) from public.chat_reports where status = 'abierto')::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
