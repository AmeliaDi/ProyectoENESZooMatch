-- 08 · Superficie de permisos: lo que la API puede tocar, medido en el catálogo.
--
-- Solo lectura sobre `pg_catalog`: ningún renglón lee datos de personas.
--
-- La postura del proyecto es deny-all: `animals`, `colors` y `quiz_items` se leen
-- con política pública, `user_roles` con política propia, y las otras 27 tablas
-- quedan inaccesibles desde la API porque no hay política que las abra. Ese
-- silencio es un diseño, no un descuido, así que conviene medirlo en vez de
-- suponerlo: "24 tablas con RLS y cero políticas" es el número esperado.
--
-- Los renglones que no pueden fallar son los que convierten el diseño en hecho:
-- que ninguna tabla sin RLS sea legible desde la API, que `private` no tenga
-- USAGE para ningún rol de API, que ninguna función sea ejecutable por `anon` y
-- que todo SECURITY DEFINER fije su `search_path` (si no lo fija, quien pueda
-- crear objetos en un esquema del path puede ejecutar código ajeno con los
-- privilegios del dueño de la función).

select chequeo, valor::text, esperado
from (
  values
    ('tablas en public/private',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private'))::text, 'informativo'),
    ('tablas sin RLS habilitado (esperado: access_guard y pool_state)',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private')
         and c.relrowsecurity = false)::text, 'informativo'),
    ('tablas con RLS y cero politicas (deny-all)',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private') and c.relrowsecurity = true
         and not exists (select 1 from pg_policies p
                         where p.schemaname = n.nspname and p.tablename = c.relname))::text, 'informativo'),
    ('politicas definidas',
      (select count(*) from pg_policies p
       where p.schemaname in ('public','private'))::text, 'informativo'),
    ('tablas sin RLS legibles desde la API',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private') and c.relrowsecurity = false
         and (has_table_privilege('anon', c.oid, 'SELECT')
              or has_table_privilege('authenticated', c.oid, 'SELECT')))::text, '0'),
    ('tablas con RLS forzada (también aplica al dueño)',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private')
         and c.relforcerowsecurity = true)::text, 'informativo'),
    ('funciones propias ejecutables por anon',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private')
         and p.prorettype <> 'pg_catalog.trigger'::regtype
         and has_function_privilege('anon', p.oid, 'EXECUTE'))::text, '0'),
    ('funciones propias con ACL por defecto (ejecutables por cualquiera)',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.proacl is null)::text, '0'),
    ('funciones en private alcanzables desde la API',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
              or has_function_privilege('anon', p.oid, 'EXECUTE')))::text, '0'),
    ('USAGE de private concedido a roles de API o a PUBLIC',
      (select count(*) from pg_namespace n, aclexplode(n.nspacl) a
       where n.nspname = 'private'
         and a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid, 0)
         and a.privilege_type = 'USAGE')::text, '0'),
    ('el rol de API puede usar el esquema private',
      (select case when has_schema_privilege('authenticated', 'private', 'USAGE')
                   then 'si' else 'no' end)::text, 'no'),
    ('SECURITY DEFINER sin search_path fijado',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prosecdef = true
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg
                         where cfg like 'search_path=%'))::text, '0'),
    ('SECURITY DEFINER totales',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prosecdef = true)::text, 'informativo'),
    ('service_role sin BYPASSRLS',
      (select count(*) from pg_roles where rolname = 'service_role' and rolbypassrls = false)::text, '0'),
    ('anon o authenticated con BYPASSRLS',
      (select count(*) from pg_roles where rolname in ('anon','authenticated') and rolbypassrls = true)::text, '0'),
    ('tablas del esquema storage',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'storage' and c.relkind = 'r')::text, 'informativo'),
    ('tablas suscritas a una publicacion de realtime',
      (select count(*) from pg_publication_tables)::text, 'informativo'),
    ('extensiones instaladas',
      (select count(*) from pg_extension)::text, 'informativo'),
    ('pg_stat_statements instalado',
      (select case when exists (select 1 from pg_extension where extname = 'pg_stat_statements')
                   then 'si' else 'no' end)::text, 'informativo'),
    ('triggers propios',
      (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public','private') and t.tgisinternal = false)::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
