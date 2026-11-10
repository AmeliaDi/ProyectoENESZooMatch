/**
 * `npm run db:drift` — el esquema vivo contra la línea base documentada.
 *
 *   node --no-warnings scripts/db/drift.mjs            → falla si hay diferencia
 *   node --no-warnings scripts/db/drift.mjs --accept   → regenera la línea base
 *
 * La línea base es supabase/schema-snapshot.json, generada por `npm run
 * db:schema`. Se ignoran los conteos de filas (cambian con el uso, no con el
 * esquema) y la fecha de generación. Todo lo demás —tablas, columnas, defaults,
 * constraints, funciones, ACL, triggers, políticas, índices, extensiones,
 * publicaciones— cuenta como diferencia y bloquea hasta que una persona la
 * documente. Entra en el canario periódico.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { fetchCatalog } from "./catalog.mjs";
import { credentials, failed, finish, passed, root, skipped } from "./lib.mjs";

const SNAPSHOT = resolve(root, "supabase/schema-snapshot.json");
const VOLATILE = new Set(["rowCounts", "unavailable"]);

/** Identidad estable de cada objeto, para que el diff diga QUÉ cambió. */
const KEY = {
  schemas: (r) => r.name,
  tables: (r) => `${r.schema}.${r.name}`,
  columns: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  primaryKeys: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  foreignKeys: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  checks: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  views: (r) => `${r.schema}.${r.name}`,
  functions: (r) => `${r.schema}.${r.name}(${r.args})`,
  functionGrants: (r) => `${r.schema}.${r.name}.${r.grantee}.${r.privilege_type}`,
  triggers: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  policies: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  indexes: (r) => `${r.schema}.${r.table_name}.${r.name}`,
  tableGrants: (r) => `${r.schema}.${r.name}.${r.grantee}.${r.privilege_type}`,
  extensions: (r) => `${r.schema}.${r.name}`,
  publications: (r) => r.name,
  cronJobs: (r) => String(r.jobid),
  buckets: (r) => r.id,
};

function normalize(catalog) {
  const out = {};
  for (const [section, rows] of Object.entries(catalog)) {
    if (VOLATILE.has(section) || !Array.isArray(rows)) continue;
    const key = KEY[section];
    // Postgres no garantiza el orden de los `aclitem[]`; sin esto, una relectura
    // podría reportar un cambio que no existe.
    const sorted = rows.map((row) => ("acl" in row ? { ...row, acl: String(row.acl).split(" | ").map((p) => p.trim()).sort().join(" | ") } : row));
    out[section] = key ? Object.fromEntries(sorted.map((row) => [key(row), row])) : sorted;
  }
  return out;
}

function diff(before, after) {
  const changes = [];
  for (const section of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const a = before[section] ?? {};
    const b = after[section] ?? {};
    for (const id of Object.keys(b)) {
      if (!(id in a)) changes.push({ section, id, kind: "añadido" });
      else if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) changes.push({ section, id, kind: "modificado", before: a[id], after: b[id] });
    }
    for (const id of Object.keys(a)) if (!(id in b)) changes.push({ section, id, kind: "eliminado" });
  }
  return changes;
}

if (process.argv.includes("--accept")) {
  const run = spawnSync(process.execPath, ["--no-warnings", resolve(root, "scripts/db/catalog.mjs"), "--render"], { cwd: root, stdio: "inherit" });
  process.exit(run.status ?? 1);
}

if (!credentials()) finish("db-drift", skipped("sin credenciales de lectura: no se puede comparar el esquema vivo"));
if (!existsSync(SNAPSHOT)) {
  finish("db-drift", failed("falta supabase/schema-snapshot.json: genera la línea base con `npm run db:schema` y revísala antes de commitearla"));
}

let live;
try {
  live = await fetchCatalog();
} catch (error) {
  finish("db-drift", failed(error instanceof Error ? error.message : String(error)));
}

const baseline = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const changes = diff(normalize(baseline.catalog), normalize(live));

if (changes.length === 0) {
  const despues = normalize(live);
  finish("db-drift", passed({
    baselineAt: baseline.generatedAt,
    // «objetos» es la suma de filas de catálogo comparadas, no el número de
    // secciones: decir 17 objetos cuando son 17 secciones exagera la cobertura.
    secciones: Object.keys(despues).length,
    objetos: Object.values(despues).reduce((total, filas) => total + Object.keys(filas).length, 0),
    changes: [],
  }));
}

finish(
  "db-drift",
  failed(`${changes.length} diferencia(s) sin documentar entre el esquema vivo y supabase/schema-snapshot.json`, {
    baselineAt: baseline.generatedAt,
    changes: changes.map(({ section, id, kind }) => ({ section, id, kind })),
    findings: changes.map((c) => `${c.kind}: ${c.section} · ${c.id}`),
    howToAccept: "revisa la diferencia, y si es esperada corre `npm run db:drift -- --accept` y commitea el snapshot junto con la migración que la causó",
  }),
);