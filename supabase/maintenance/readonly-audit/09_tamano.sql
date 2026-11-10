-- 09 · Tamaño y salud física: dónde está el peso y si las estadísticas están vivas.
--
-- Solo lectura sobre `pg_catalog` y `pg_stat_user_tables`.
--
-- Dos razones para medir esto aparte de los presupuestos de `npm run db:perf`:
-- el planner solo decide bien con estadísticas frescas (una tabla nunca
-- ANALYZEda puede dar planes catastróficos aunque la consulta sea buena), y un
-- índice que falta se ve aquí antes de verlo en un reporte de lentitud. Los
-- números son bytes redondeados: no exponen ninguna fila.

select chequeo, valor::text, esperado
from (
  values
    ('tamano total de la base',
      (select pg_size_pretty(pg_database_size(current_database())))::text, 'informativo'),
    ('tamano de public + private (datos)',
      (select pg_size_pretty(sum(pg_relation_size(c.oid)))
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private'))::text, 'informativo'),
    ('tamano de public + private (indices)',
      (select pg_size_pretty(sum(pg_indexes_size(c.oid)))
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private'))::text, 'informativo'),
    ('las 5 tablas mas grandes',
      (select string_agg(x, ' | ' order by bytes desc) from (
         select n.nspname || '.' || c.relname || '=' || pg_size_pretty(pg_total_relation_size(c.oid)) as x,
                pg_total_relation_size(c.oid) as bytes
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'r' and n.nspname in ('public','private')
         order by bytes desc limit 5) as s)::text, 'informativo'),
    ('indices en total',
      (select count(*) from pg_indexes where schemaname in ('public','private'))::text, 'informativo'),
    ('tablas sin clave primaria',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private')
         and not exists (select 1 from pg_constraint k
                         where k.conrelid = c.oid and k.contype = 'p'))::text, 'informativo'),
    ('tablas sin ningun indice',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private')
         and pg_indexes_size(c.oid) = 0)::text, '0'),
    ('tablas con una sola columna indexada y mas de 1000 filas',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public','private') and c.reltuples > 1000
         and (select count(distinct i.indexname) from pg_indexes i
              where i.schemaname = n.nspname and i.tablename = c.relname) <= 1)::text, 'informativo'),
    ('filas muertas acumuladas',
      (select coalesce(sum(n_dead_tup), 0) from pg_stat_user_tables
       where schemaname in ('public','private'))::text, 'informativo'),
    ('las 5 tablas con mas filas muertas',
      (select string_agg(x, ' | ' order by muertas desc) from (
         select relname || '=' || n_dead_tup as x, n_dead_tup as muertas
         from pg_stat_user_tables where schemaname in ('public','private')
         order by n_dead_tup desc limit 5) as s)::text, 'informativo'),
    ('tablas nunca analizadas ni barridas',
      (select count(*) from pg_stat_user_tables t
       where t.schemaname in ('public','private')
         and t.last_analyze is null and t.last_autoanalyze is null
         and t.last_vacuum is null and t.last_autovacuum is null)::text, 'informativo'),
    ('dias desde el ANALYZE mas viejo (tablas propias)',
      (select round(max(extract(epoch from (now() - greatest(t.last_analyze, t.last_autoanalyze)))) / 86400.0, 1)
       from pg_stat_user_tables t
       where t.schemaname in ('public','private')
         and coalesce(t.last_analyze, t.last_autoanalyze) is not null)::text, 'informativo'),
    ('secuencias propias',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'S' and n.nspname in ('public','private'))::text, 'informativo'),
    ('vistas propias',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'v' and n.nspname in ('public','private'))::text, 'informativo'),
    ('funciones de esquema privado (live_pairs y compañia)',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private')::text, 'informativo')
) as t(chequeo, valor, esperado)
order by chequeo;
