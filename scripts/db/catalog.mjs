/**
 * Catálogo vivo del esquema (solo lectura, solo metadatos y conteos agregados).
 *
 *   node --no-warnings scripts/db/catalog.mjs            → .qa/db-catalog.json
 *   node --no-warnings scripts/db/catalog.mjs --render   → además escribe
 *       supabase/schema-snapshot.json (línea base de db:drift) y docs/DB_ESQUEMA.md
 *
 * `--render` es la única forma de aceptar una línea base nueva: lo hace una
 * persona después de revisar la diferencia, no un agente en silencio.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { credentials, failed, finish, passed, queryReadOnly, root, skipped } from "./lib.mjs";
import { renderSchemaDoc } from "./schema-doc.mjs";

/** Cada consulta es un SELECT de catálogo; ninguna toca filas de personas. */
export const QUERIES = {
  /**
   * Solo los dos esquemas que crea el repo. Los de plataforma (auth, storage,
   * vault, graphql, realtime, extensions) llevan roles internos de Supabase en
   * su ACL y no los reproduce ninguna base local, así que compararlos sería
   * ruido. `private` sí importa: que ningún rol de API pueda usarlo es lo que
   * mantiene sus funciones fuera de alcance.
   *
   * `api_usage` se responde con `has_schema_privilege`, no leyendo la ACL cruda:
   * una base nueva puede dar USAGE a PUBLIC por default y un proyecto real
   * enumerar los roles, y las dos cosas significan lo mismo.
   */
  schemas: `select n.nspname as name,
      coalesce(array_to_string(n.nspacl, ' | '), 'INHERITED (default)') as acl,
      string_agg(r.rolname || '=' || case when has_schema_privilege(r.rolname, n.nspname, 'USAGE') then 'U' else '-' end, ' ' order by r.rolname) as api_usage
    from pg_namespace n
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
    where n.nspname in ('public', 'private') group by 1, 2 order by 1`,
  tables: `select n.nspname as schema, c.relname as name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'private') order by 1, 2`,
  columns: `select c.table_schema as schema, c.table_name as table_name, c.column_name as name, c.data_type,
      c.is_nullable, c.column_default, c.ordinal_position
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema in ('public', 'private') and t.table_type = 'BASE TABLE'
    order by 1, 2, c.ordinal_position`,
  primaryKeys: `select n.nspname as schema, c.relname as table_name, con.conname as name, pg_get_constraintdef(con.oid) as definition
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'p' and n.nspname in ('public', 'private') order by 1, 2`,
  foreignKeys: `select n.nspname as schema, c.relname as table_name, con.conname as name,
      f.relname as references_table, pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_class f on f.oid = con.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f' and n.nspname in ('public', 'private') order by 1, 2, 3`,
  checks: `select n.nspname as schema, c.relname as table_name, con.conname as name, pg_get_constraintdef(con.oid) as definition
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname in ('public', 'private') and con.conname not like '%_not_null' order by 1, 2, 3`,
  views: `select table_schema as schema, table_name as name, view_definition as definition
    from information_schema.views where table_schema in ('public', 'private') order by 1, 2`,
  functions: `select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
      pg_get_function_result(p.oid) as returns, p.prosecdef as security_definer, l.lanname as language,
      r.rolname as owner, p.prokind as kind, coalesce(array_to_string(p.proacl, ' | '), 'PUBLIC (default)') as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    join pg_roles r on r.oid = p.proowner
    where n.nspname in ('public', 'private') and p.prokind in ('f', 'p') order by 1, 2, 3`,
  functionGrants: `select routine_schema as schema, routine_name as name, grantee, privilege_type
    from information_schema.routine_privileges where routine_schema in ('public', 'private') order by 1, 2, 3, 4`,
  triggers: `select n.nspname as schema, c.relname as table_name, t.tgname as name,
      pg_get_triggerdef(t.oid) as definition, t.tgenabled as enabled
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('public', 'private') order by 1, 2, 3`,
  policies: `select schemaname as schema, tablename as table_name, policyname as name, permissive, roles, cmd, qual, with_check
    from pg_policies where schemaname in ('public', 'private') order by 1, 2, 3`,
  indexes: `select schemaname as schema, tablename as table_name, indexname as name, indexdef as definition
    from pg_indexes where schemaname in ('public', 'private') order by 1, 2, 3`,
  tableGrants: `select table_schema as schema, table_name as name, grantee, privilege_type
    from information_schema.table_privileges
    where table_schema in ('public', 'private') and grantee in ('anon', 'authenticated', 'service_role')
    order by 1, 2, 3, 4`,
  extensions: `select e.extname as name, n.nspname as schema, e.extversion as version
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1`,
  publications: `select p.pubname as name, p.puballtables as all_tables, p.pubinsert as inserts, p.pubupdate as updates, p.pubdelete as deletes,
      coalesce(array_agg(c.relname order by c.relname) filter (where c.relname is not null), array[]::name[]) as tables
    from pg_publication p
    left join pg_publication_rel pr on pr.prpubid = p.oid
    left join pg_class c on c.oid = pr.prrelid
    group by p.pubname, p.puballtables, p.pubinsert, p.pubupdate, p.pubdelete order by 1`,
  rowCounts: `select n.nspname as schema, c.relname as name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'private') order by 1, 2`,
};

/** Opcionales: dependen de extensiones que el proyecto puede no tener. */
export const OPTIONAL_QUERIES = {
  cronJobs: `select jobid, schedule, command, nodename, database, username, active from cron.job order by jobid`,
  buckets: `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`,
};

export async function fetchCatalog() {
  const catalog = { unavailable: {} };
  for (const [key, sql] of Object.entries(QUERIES)) catalog[key] = await queryReadOnly(sql);
  for (const [key, sql] of Object.entries(OPTIONAL_QUERIES)) {
    try {
      catalog[key] = await queryReadOnly(sql);
    } catch (error) {
      catalog[key] = [];
      catalog.unavailable[key] = error instanceof Error ? error.message.slice(0, 200) : String(error);
    }
  }
  return catalog;
}

/** CLI solo al ejecutarse directo: `import { fetchCatalog }` no debe tener efectos. */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

async function main() {
  const render = process.argv.includes("--render");

  if (!credentials()) {
    finish("db-catalog", skipped("sin SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL: el catálogo vivo necesita acceso de lectura"));
  }

  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch (error) {
    finish("db-catalog", failed(error instanceof Error ? error.message : String(error)));
  }

  const counts = Object.fromEntries(Object.entries(catalog).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
  console.log("[catalog] objetos leídos:", JSON.stringify(counts));

  if (render) {
    const snapshot = { generatedAt: new Date().toISOString(), source: "live-readonly", catalog };
    writeFileSync(resolve(root, "supabase/schema-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
    writeFileSync(resolve(root, "docs/DB_ESQUEMA.md"), renderSchemaDoc(catalog, snapshot.generatedAt));
    console.log("[catalog] escritos supabase/schema-snapshot.json y docs/DB_ESQUEMA.md");
  }

  finish("db-catalog", passed({ counts, rendered: render, unavailable: catalog.unavailable }));
}

if (invokedDirectly) await main();