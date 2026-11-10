-- 10 · Privacidad e inclusión: los consentimientos, lo que se conserva y lo que se filtró.
--
-- Solo lectura, solo conteos. Esta carpeta es la única que puede mencionar texto
-- ajeno, y aun así nunca lo imprime: los detectores de fuga responden cuántos,
-- jamás cuáles. Está prohibido exportar mensajes, respuestas, matrículas, hashes
-- o PINs, así que los renglones de fuga devuelven un conteo y nada más.
--
-- El renglón que no puede fallar es el primero: una persona que declaró no ser
-- mayor de edad no puede tener activo el track romántico, que es el que abre el
-- contenido +18. Es un consentimiento, no una preferencia.
--
-- `shared_layers` y `completed_modules` se revisan con un mapa explícito de capa
-- a módulo. La capa `afecto` queda fuera a propósito: no proviene de un quiz con
-- nombre propio, así que no tiene módulo que la respalde y exigirlo sería un
-- falso positivo.
--
-- Comparar las dos columnas NO puede esperar 0, y la medición lo demuestra:
-- `completed_modules` lo escribe solo el guardado completo del quiz
-- (`20261114000000_identity_single_source.sql:392`, `COALESCE(p_completed_modules,
-- '{}')`), así que 81 de las 179 personas con quiz completado tienen el arreglo
-- vacío y aun así comparten capas medidas. De 2026-11-10: los 3 perfiles que
-- marcaba el renglón tienen TODOS la medición detrás (2 con `mbti_code`, 1 con
-- `enneagram_code`); es el libro el que está desactualizado, no el consentimiento.
-- Lo que sí se puede exigir es la forma fuerte, capa por capa, donde la base
-- tiene una columna dedicada: compartir `mbti` sin `mbti_code` es una filtración
-- real y hoy es 0. El `eneagrama` no: `ennea-neblina` deja el código NULL a
-- propósito («en exploración», `20261114000000_identity_single_source.sql:64`)
-- y 4 personas lo comparten así, que es el diseño funcionando.

select chequeo, valor::text, esperado
from (
  values
    ('consentimiento con mayor_de_edad=false y romance activo',
      (select count(*) from public.quiz_picante_consent
       where mayor_de_edad = false and track_romance_activo = true)::text, '0'),
    ('consentimiento sin fecha',
      (select count(*) from public.quiz_picante_consent where consentimiento_en is null)::text, '0'),
    ('consentimiento de persona inexistente',
      (select count(*) from public.quiz_picante_consent c
       where not exists (select 1 from public.profiles p where p.user_id = c.persona_id))::text, '0'),
    ('filas de consentimiento',
      (select count(*) from public.quiz_picante_consent)::text, 'informativo'),
    ('perfil con adult_confirmed_at y sin fila de consentimiento',
      (select count(*) from public.profiles p
       where p.adult_confirmed_at is not null
         and not exists (select 1 from public.quiz_picante_consent c where c.persona_id = p.user_id))::text, 'informativo'),
    ('perfil con consentimiento y sin adult_confirmed_at',
      (select count(*) from public.quiz_picante_consent c
       where exists (select 1 from public.profiles p
                     where p.user_id = c.persona_id and p.adult_confirmed_at is null))::text, 'informativo'),
    ('capas compartidas sin modulo que las respalde (libro desactualizado, no filtracion)',
      (select count(*) from public.profiles
       where ('hexaco' = any (shared_layers) and not ('hexaco_facetas' = any (completed_modules)))
          or ('big_five' = any (shared_layers) and not ('puente_big_five' = any (completed_modules)))
          or ('estilo' = any (shared_layers) and not ('estilo_vida' = any (completed_modules)))
          or ('valores' = any (shared_layers) and not ('valores' = any (completed_modules)))
          or ('relacional' = any (shared_layers) and not ('relacional' = any (completed_modules)))
          or ('mbti' = any (shared_layers) and not ('mbti' = any (completed_modules)))
          or ('eneagrama' = any (shared_layers) and not ('eneagrama' = any (completed_modules))))::text, 'informativo'),
    ('perfiles con quiz completado y completed_modules vacio',
      (select count(*) from public.profiles
       where eliminado_en is null and quiz_completed_at is not null
         and cardinality(completed_modules) = 0)::text, 'informativo'),
    ('comparte mbti sin mbti_code',
      (select count(*) from public.profiles
       where eliminado_en is null and 'mbti' = any (shared_layers) and mbti_code is null)::text, '0'),
    ('comparte eneagrama sin codigo (ennea-neblina = en exploracion)',
      (select count(*) from public.profiles
       where eliminado_en is null and 'eneagrama' = any (shared_layers) and enneagram_code is null)::text, 'informativo'),
    ('mensajes con algo que parece un hash de 64 hex',
      (select count(*) from public.conversation_messages where body ~ '[0-9a-f]{64}')::text, '0'),
    ('avisos con algo que parece un hash de 64 hex',
      (select count(*) from public.notifications
       where body ~ '[0-9a-f]{64}' or title ~ '[0-9a-f]{64}')::text, '0'),
    ('mensajes con algo que parece un correo',
      (select count(*) from public.conversation_messages
       where body ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')::text, 'informativo'),
    ('rondas con texto propio que parece un correo',
      (select count(*) from public.conversation_rounds
       where custom_text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')::text, 'informativo'),
    ('respuestas de quiz de personas dadas de baja',
      (select count(*) from public.quiz_responses r
       where exists (select 1 from public.profiles p
                     where p.user_id = r.user_id and p.eliminado_en is not null))::text, 'informativo'),
    ('mensajes de conversaciones con una parte dada de baja',
      (select count(*) from public.conversation_messages msg
       where exists (select 1 from public.conversations c
                     join public.profiles p on p.user_id = any (array[c.user_a, c.user_b])
                     where c.id = msg.conversation_id and p.eliminado_en is not null))::text, 'informativo'),
    ('pines de PIN de personas dadas de baja',
      (select count(*) from public.chat_pins k
       where exists (select 1 from public.profiles p
                     where p.user_id = k.user_id and p.eliminado_en is not null))::text, 'informativo'),
    ('avisos de personas dadas de baja',
      (select count(*) from public.notifications n
       where exists (select 1 from public.profiles p
                     where p.user_id = n.user_id and p.eliminado_en is not null))::text, 'informativo'),
    ('reportes que guardan snapshot de mensajes',
      (select count(*) from public.chat_reports where snapshot is not null)::text, 'informativo'),
    ('auditoria de administracion en 30 dias',
      (select count(*) from public.admin_audit where created_at > now() - interval '30 days')::text, 'informativo'),
    ('cuentas de auth (el correo nunca se selecciona)',
      (select count(*) from auth.users)::text, 'informativo'),
    ('perfiles sin matricula_hash',
      (select count(*) from public.profiles where matricula_hash is null)::text, '0'),
    ('roles de administracion asignados',
      (select count(*) from public.user_roles)::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
