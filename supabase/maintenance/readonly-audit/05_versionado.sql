-- 05 · Versionado: quien respondió otra matemática, y cuántos son.
--
-- Solo lectura, solo conteos.
--
-- `profiles.params_version` es el sello de la matemática con la que se puntuó a
-- cada persona (ADR de «se actualizó la matemática»). Sin él no se puede saber a
-- quién le cambió el modelo, así que el aviso de la pantalla de perfil se vuelve
-- imposible de emitir sin molestar a quien ya está al día.
--
-- «quiz completado sin params_version» NO puede esperar 0: el propio encabezado
-- de `20261123000000_params_version_stamp_on_profiles.sql:13-14` dice que NULL
-- es «perfil anterior al sello» y que esa persona SIGUE EN EL POOL. La migración
-- no rellena la columna (solo la crea y sella desde la aplicación en el
-- guardado siguiente), así que 157 sin sello es el estado esperado el primer
-- día. Es la población del re-test mínimo, no una anomalía. Medido en producción
-- el 2026-11-10: 157 sin sello (156 vivos, 1 baja lógica) contra 22 con sello y
-- 1 única versión. Lo que sí es una aserción es el inverso: nadie puede tener
-- sello sin quiz completado, y ese renglón está más abajo como
-- `quiz incompleto con params_version`.
--
-- La población por versión es el insumo del re-test mínimo: si mañana sube la
-- versión, ese conteo es exactamente cuánta gente verá el aviso.

select chequeo, valor::text, esperado
from (
  values
    ('quiz completado sin params_version (poblacion del re-test minimo)',
      (select count(*) from public.profiles
       where quiz_completed_at is not null and params_version is null)::text, 'informativo'),
    ('quiz incompleto con params_version',
      (select count(*) from public.profiles
       where quiz_completed_at is null and params_version is not null)::text, 'informativo'),
    ('params_version distinta de nulas',
      (select count(distinct params_version) from public.profiles
       where params_version is not null)::text, 'informativo'),
    ('poblacion por params_version',
      (select string_agg(x, ' | ' order by x) from (
         select coalesce(params_version, '(sin sello)') || '=' || count(*) as x
         from public.profiles group by params_version) as s)::text, 'informativo'),
    ('params_version mas antigua por persona (dias)',
      (select round(max(extract(epoch from (now() - scored_at))) / 86400.0, 1)
       from public.profiles where scored_at is not null)::text, 'informativo'),
    ('intentos con revision nula',
      (select count(*) from public.quiz_attempts where revision is null)::text, '0'),
    ('intentos cuya revision no coincide con la del perfil',
      (select count(*) from public.quiz_attempts a
       join public.profiles p on p.user_id = a.persona_id
       where p.params_version is not null and a.revision is distinct from p.params_version)::text, 'informativo'),
    ('intentos de persona inexistente',
      (select count(*) from public.quiz_attempts a
       where not exists (select 1 from public.profiles p where p.user_id = a.persona_id))::text, '0'),
    ('intentos con completado_en en el futuro',
      (select count(*) from public.quiz_attempts where completado_en > now())::text, '0'),
    ('respuestas de persona inexistente (quiz_responses)',
      (select count(*) from public.quiz_responses r
       where not exists (select 1 from public.profiles p where p.user_id = r.user_id))::text, '0'),
    ('respuestas a item inexistente (quiz_responses)',
      (select count(*) from public.quiz_responses r
       where not exists (select 1 from public.quiz_items i where i.id = r.item_id))::text, '0'),
    ('respuestas de persona inexistente (quiz_answers)',
      (select count(*) from public.quiz_answers a
       where not exists (select 1 from public.profiles p where p.user_id = a.persona_id))::text, '0'),
    -- `quiz_answers.item_id` NO referencia a `quiz_items`: los quizzes rompehielos y
    -- picantes se declaran en `data/quizzes/*.json` (12 quizzes, 96 pares
    -- quiz_id+item_id) y no tienen tabla. Compararlos con el banco legado del
    -- microtest (197 ítems, los mismos de `data/microtest.json`) devolvía 3073 =
    -- todas las filas: un falso positivo del renglón, no un daño. Lo que la base sí
    -- puede exigir sin tabla de referencia es forma.
    ('respuestas de quiz_answers con quiz_id o item_id vacio',
      (select count(*) from public.quiz_answers
       where length(btrim(quiz_id)) = 0 or length(btrim(item_id)) = 0)::text, '0'),
    ('quiz_answers cuyo quiz_id no existe en quiz_attempts',
      (select count(distinct a.quiz_id) from public.quiz_answers a
       where not exists (select 1 from public.quiz_attempts t where t.quiz_id = a.quiz_id))::text, 'informativo'),
    ('likert_value fuera de 1..5',
      (select count(*) from public.quiz_responses
       where likert_value is not null and (likert_value < 1 or likert_value > 5))::text, '0'),
    ('respuestas con likert y opciones a la vez',
      (select count(*) from public.quiz_responses
       where likert_value is not null and selected_options is not null)::text, '0'),
    ('respuestas sin likert ni opciones',
      (select count(*) from public.quiz_responses
       where likert_value is null and selected_options is null)::text, '0'),
    ('items del banco sin ninguna respuesta',
      (select count(*) from public.quiz_items i
       where not exists (select 1 from public.quiz_responses r where r.item_id = i.id)
         and not exists (select 1 from public.quiz_answers a where a.item_id = i.id))::text, 'informativo'),
    ('personas con quiz completado y cero respuestas',
      (select count(*) from public.profiles p
       where p.quiz_completed_at is not null
         and not exists (select 1 from public.quiz_responses r where r.user_id = p.user_id))::text, 'informativo'),
    ('avisos welcome duplicados por persona',
      (select count(*) from (
         select user_id from public.notifications where type = 'welcome'
         group by user_id having count(*) > 1) as d)::text, '0'),
    ('avisos identity duplicados por persona',
      (select count(*) from (
         select user_id from public.notifications where type = 'identity'
         group by user_id having count(*) > 1) as d)::text, '0'),
    ('activos con quiz y cero avisos de bienvenida',
      (select count(*) from public.profiles p
       where p.quiz_completed_at is not null and p.eliminado_en is null
         and not exists (select 1 from public.notifications n
                         where n.user_id = p.user_id and n.type = 'welcome'))::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
