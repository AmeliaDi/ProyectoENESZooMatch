-- 02 · Identidad: que el alias diga la verdad y el huevo esté roto o intacto.
--
-- Solo lectura, solo conteos. Corrérsela en el SQL Editor o con `npm run db:audit`
-- (`-- --local` la ejecuta contra la base local con población sintética).
--
-- `profiles_identity_shape`, `profiles_alias_completo_format`,
-- `profiles_completed_vectors` y las demás CHECKs ya impiden escribir estas
-- anomalías, así que la mayoría de los renglones valen 0 por construcción. Ahí
-- su función es detectar otra cosa: que una migración futura quite o reemplace
-- el CHECK sin que nadie se dé cuenta. Un renglón distinto de 0 en una CHECK
-- vigente significa «la restricción ya no está», no «entró basura».
--
-- Los conteos nunca revelan una matrícula ni un alias: solo cuántos hay.
--
-- Alcance de los renglones «eclosionado sin …»: igual que
-- `profiles_identity_shape`, solo cuentas VIVAS (`eliminado_en is null`). Una
-- baja lógica conserva la identidad que tuvo mientras existió y el CHECK no la
-- revisa; exigírsela al conteo sin ese filtro marcaba de anomalia lo que es
-- simple historial. Medido en producción: 1 fila `eclosionado` sin
-- `alias_sufijo` y 1 sin `eclosionado_en`, y las dos son bajas lógicas
-- (`db:audit` 2026-11-10, 0 vivas).

select chequeo, valor::text, esperado
from (
  values
    ('estado_identidad fuera del vocabulario',
      (select count(*) from public.profiles
       where estado_identidad is distinct from 'huevo' and estado_identidad is distinct from 'eclosionado')::text, '0'),
    ('eclosionado sin animal_id',
      (select count(*) from public.profiles
       where estado_identidad = 'eclosionado' and eliminado_en is null and animal_id is null)::text, '0'),
    ('eclosionado sin color_id',
      (select count(*) from public.profiles
       where estado_identidad = 'eclosionado' and eliminado_en is null and color_id is null)::text, '0'),
    ('eclosionado sin alias_completo',
      (select count(*) from public.profiles
       where estado_identidad = 'eclosionado' and eliminado_en is null and alias_completo is null)::text, '0'),
    ('eclosionado sin alias_sufijo',
      (select count(*) from public.profiles
       where estado_identidad = 'eclosionado' and eliminado_en is null and alias_sufijo is null)::text, '0'),
    ('eclosionado sin eclosionado_en',
      (select count(*) from public.profiles
       where estado_identidad = 'eclosionado' and eliminado_en is null and eclosionado_en is null)::text, '0'),
    ('huevo con identidad parcial',
      (select count(*) from public.profiles
       where estado_identidad = 'huevo' and eliminado_en is null
         and (animal_id is not null or color_id is not null or alias_completo is not null
              or alias_animal is not null or alias_color is not null or alias_sufijo is not null
              or enneagram_code is not null or eclosionado_en is not null))::text, '0'),
    -- Espejo exacto de `profiles_identity_shape`, incluido el caso degenerado de
    -- estado nulo, que el CHECK respondería con NULL y por lo tanto perdonaría.
    ('filas que violan la forma de identidad',
      (select count(*) from public.profiles as p
       where p.eliminado_en is null
         and not case p.estado_identidad
                   when 'huevo' then (p.animal_id is null and p.color_id is null
                                      and p.alias_completo is null and p.alias_animal is null
                                      and p.alias_color is null and p.alias_sufijo is null
                                      and p.enneagram_code is null and p.eclosionado_en is null)
                   else (p.animal_id is not null and p.color_id is not null
                         and p.alias_completo is not null and p.alias_animal is not null
                         and p.alias_color is not null and p.alias_sufijo is not null
                         and p.eclosionado_en is not null)
                 end)::text, '0'),
    ('alias_completo no coincide con sus partes',
      (select count(*) from public.profiles
       where eliminado_en is null and estado_identidad = 'eclosionado'
         and alias_completo is distinct from
             (alias_animal || ' ' || alias_color || ' · ' || alias_sufijo))::text, '0'),
    ('alias_sufijo fuera de las 4 letras sin vocales',
      (select count(*) from public.profiles
       where alias_sufijo is not null and alias_sufijo !~ '^[BCDFGHJKLMNPQRSTVWXYZ]{4}$')::text, '0'),
    ('alias_animal o alias_color fuera de formato',
      (select count(*) from public.profiles
       where (alias_animal is not null and alias_animal !~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$')
          or (alias_color is not null and alias_color !~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$'))::text, '0'),
    ('alias_completo compartido por 2+ cuentas activas',
      (select count(*) from (
         select alias_completo from public.profiles
         where eliminado_en is null and alias_completo is not null
         group by alias_completo having count(*) > 1) as d)::text, '0'),
    ('matricula_hash compartida por 2+ perfiles',
      (select count(*) from (
         select matricula_hash from public.profiles
         group by matricula_hash having count(*) > 1) as d)::text, '0'),
    ('matricula_hash fuera de 64 hex minúsculas',
      (select count(*) from public.profiles
       where matricula_hash !~ '^[0-9a-f]{64}$')::text, '0'),
    ('quiz completo con romance_vector de otra dimensión',
      (select count(*) from public.profiles
       where quiz_completed_at is not null and cardinality(romance_vector) <> 26)::text, '0'),
    ('quiz completo con amistad_vector de otra dimensión',
      (select count(*) from public.profiles
       where quiz_completed_at is not null and cardinality(amistad_vector) <> 16)::text, '0'),
    ('mbti_code fuera de formato',
      (select count(*) from public.profiles
       where mbti_code is not null and mbti_code !~ '^[IE][NS][TF][JP]$')::text, '0'),
    ('enneagram_code fuera de formato',
      (select count(*) from public.profiles
       where enneagram_code is not null and enneagram_code !~ '^[1-9](w[1-9])?$')::text, '0'),
    ('completed_modules con módulo desconocido',
      (select count(*) from public.profiles
       where not (completed_modules <@ array['hexaco_facetas','puente_big_five','valores','actitudes',
                                             'intereses','estilo_vida','relacional','mbti','eneagrama','subtipo']))::text, '0'),
    ('shared_layers con capa desconocida',
      (select count(*) from public.profiles
       where not (shared_layers <@ array['hexaco','big_five','mbti','eneagrama','valores',
                                         'relacional','afecto','estilo']))::text, '0'),
    ('avatar_mark fuera de sp/so/sx',
      (select count(*) from public.profiles
       where avatar_mark is not null
         and avatar_mark <> all (array['sp','so','sx']))::text, '0'),
    ('inclusive_mode fuera del vocabulario',
      (select count(*) from public.profiles
       where inclusive_mode <> all (array['femenino','masculino','neutro_e','neutro_universal']))::text, '0'),
    ('latent_profile nulo',
      (select count(*) from public.profiles where latent_profile is null)::text, 'informativo'),
    ('latent_profile que no es un object JSON',
      (select count(*) from public.profiles
       where jsonb_typeof(latent_profile) not in ('object'))::text, '0'),
    ('eclosionado sin quiz completado',
      (select count(*) from public.profiles
       where estado_identidad = 'eclosionado' and quiz_completed_at is null)::text, '0'),
    -- «Primero el quiz y luego el huevo» NO es una regla de la base: la escribe
    -- `src/application/hatch.ts` (`quiz.not_completed` en las líneas 80, 131, 160
    -- y 185) y el RPC `hatch_profile_identity` no la repite. Además
    -- `quiz_completed_at` es la ÚLTIMA completitud, no la primera:
    -- `20261114000000_identity_single_source.sql:393` la escribe con `now()` en
    -- cada guardado, incluida la re-toma mínima, y
    -- `20261116000000_identity_drop_legacy.sql:222` la devuelve a NULL. Una
    -- re-toma días después deja `eclosionado_en < quiz_completed_at` sin que
    -- nadie haya roto nada. Medido en producción: 43 casos, todos vivos, todos
    -- de cuentas posteriores al gate, brecha media 1.1 días y máxima 3.5; ninguno
    -- bajo un minuto, que sería la firma de un backfill. Por eso mide, no asfixia.
    ('eclosionado antes de su última completitud del quiz',
      (select count(*) from public.profiles
       where eclosionado_en is not null and quiz_completed_at is not null
         and eclosionado_en < quiz_completed_at)::text, 'informativo'),
    ('bajas logicas que conservan alias visible',
      (select count(*) from public.profiles
       where eliminado_en is not null and alias_completo is not null)::text, 'informativo'),
    ('cuentas de auth sin perfil',
      (select count(*) from auth.users u
       where not exists (select 1 from public.profiles p where p.user_id = u.id))::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
