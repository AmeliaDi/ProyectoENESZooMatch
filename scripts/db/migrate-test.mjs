/**
 * `npm run db:migrate-test` — el repo reproduce la base, en local y sin Docker.
 *
 * Cuatro cosas, en este orden, sobre una Postgres WASM desechable (PGlite):
 *   1. `base.sql` existe y es la primera: db:apply exige base vacía, y sin ese
 *      ancla cualquier migración podría reescribir el esquema de arriba.
 *   2. Las migraciones aplican de cero, en orden, sin error, y `seed.sql` también.
 *   3. Cada migración que SE DECLARA idempotente en su encabezado se re-aplica en
 *      su propio punto de la cadena; y toda migración con DDL destructivo tiene
 *      que declararse: el encabezado no puede ser decorativo.
 *   4. `private.assert_service_role()` existe y de verdad rechaza a `anon` — sin
 *      eso, las pruebas de RPC que corre el shim no valen nada.
 *
 * Con `supabase/schema-snapshot.json` commiteado, además compara el catálogo
 * local contra la línea base. Las diferencias de plataforma (extensiones,
 * orden físico de columnas, publicaciones, conteos de filas) se listan con su
 * motivo; cualquier otra diferencia hace fallar. Producción no se lee.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { credentials, failed, finish, passed, root } from "./lib.mjs";
import { pgArray } from "./schema-doc.mjs";
import {
  BASE_MIGRATION,
  declaresIdempotent,
  localCatalog,
  migrationFiles,
  migrationPath,
  openLocal,
  readSql,
  SEED_FILE,
} from "./local-pg.mjs";

const SNAPSHOT = resolve(root, "supabase/schema-snapshot.json");
const DESTRUCTIVE = /\bDROP\s+(TABLE|COLUMN|SCHEMA|FUNCTION|TYPE)\b/i;

/** Campos que se dejan fuera de la paridad, con el motivo. */
const DROP_FIELDS = { columns: ["ordinal_position"], schemas: ["acl"] };
const DROP_REASON = {
  "columns.ordinal_position": "el orden físico de las columnas no es contrato: depende del orden real de los ALTER y `SELECT *` va por nombre",
  "schemas.acl": "la ACL cruda nombra roles de plataforma que no existen en una base local; lo comparable es `api_usage`",
};

/** Secciones que no pueden coincidir entre una base local y un proyecto de Supabase. */
const PLATFORM_SECTIONS = {
  rowCounts: "datos de uso, no esquema: la base local arranca en cero y la semilla es catálogo.",
  extensions: "PGlite no carga las extensiones administradas por la plataforma (pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault); el repo tampoco las crea en una migración.",
  publications: "`supabase_realtime` la crea Supabase, no una migración; el chat es de polling y no la usa.",
  unavailable: "es el estado del lector remoto, no del esquema.",
};

const identity = {
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
};

/** Un `aclitem[]` en texto: el orden de los roles dentro de la ACL no es semántica. */
const sortedAcl = (acl) => String(acl ?? "").split(" | ").map((part) => part.trim()).filter(Boolean).sort().join(" | ");

function canonical(section, row) {
  const copy = { ...row };
  for (const field of DROP_FIELDS[section] ?? []) delete copy[field];
  if ("acl" in copy) copy.acl = sortedAcl(copy.acl);
  // El dueño real siempre es `postgres` en Supabase; en local depende de quién
  // ejecutó la migración, así que no es una diferencia de esquema.
  if ("owner" in copy) copy.owner = "—";
  if (section === "policies") copy.roles = pgArray(copy.roles);
  return copy;
}

/** Comparación por objeto, para que el diff diga QUÉ objeto cambió. */
function parity(baseline, local) {
  const sections = Object.keys(identity).filter((s) => Array.isArray(baseline[s]) || Array.isArray(local[s]));
  const differences = [];
  const counts = {};
  for (const section of sections) {
    const before = new Map((baseline[section] ?? []).map((r) => [identity[section](r), canonical(section, r)]));
    const after = new Map((local[section] ?? []).map((r) => [identity[section](r), canonical(section, r)]));
    counts[section] = { production: before.size, local: after.size };
    for (const [id, row] of after) {
      if (!before.has(id)) differences.push({ section, id, kind: "solo en local", detail: JSON.stringify(row).slice(0, 200) });
      else if (JSON.stringify(before.get(id)) !== JSON.stringify(row)) {
        differences.push({ section, id, kind: "definición distinta", production: JSON.stringify(before.get(id)).slice(0, 200), local: JSON.stringify(row).slice(0, 200) });
      }
    }
    for (const id of before.keys()) if (!after.has(id)) differences.push({ section, id, kind: "solo en producción" });
  }
  return { differences, counts };
}

const findings = [];
const report = { migrations: [], idempotency: [], seed: null, guard: null, parity: null, dropFields: DROP_REASON, platformExcluded: PLATFORM_SECTIONS };

const files = migrationFiles();
if (files[0] !== BASE_MIGRATION) {
  finish("db-migrate-test", failed(`la primera migración debe ser ${BASE_MIGRATION}, y es ${files[0]}: db:apply requiere una base vacía`));
}

let local = null;
const handle = await openLocal();
try {
  for (const name of files) {
    const path = migrationPath(name);
    const sql = readSql(path);
    const result = await handle.apply(path);
    report.migrations.push({ file: name, ok: result.ok, elapsedMs: result.elapsedMs, error: result.error ?? null });
    if (!result.ok) {
      findings.push(`${name}: ${result.error.split(/\r?\n/)[0]}`);
      finish("db-migrate-test", failed(`${report.migrations.length}/${files.length} aplicaron; la cadena se rompió aquí`, report));
    }

    if (DESTRUCTIVE.test(sql) && !declaresIdempotent(sql)) {
      findings.push(`${name}: tiene DROP destructivo y no declara idempotencia en su encabezado, así que db:apply --migration no puede re-ejecutarla`);
    }
    if (!declaresIdempotent(sql)) continue;
    const again = await handle.apply(path);
    report.idempotency.push({ file: name, ok: again.ok, elapsedMs: again.elapsedMs, error: again.error ?? null });
    if (!again.ok) findings.push(`${name}: se declara idempotente y falló al re-aplicarse → ${again.error.split(/\r?\n/)[0]}`);
  }

  report.seed = await handle.apply(SEED_FILE);
  if (!report.seed.ok) findings.push(`seed.sql: ${report.seed.error.split(/\r?\n/)[0]}`);

  // El guardia que habilita todas las pruebas de RPC. Se prueba por CLAIM, no
  // por `SET ROLE`: assert_service_role() lee auth.jwt()->>'role', que es lo que
  // pone el middleware de Next; el rol SQL es otra cosa. Además se exige que
  // NINGÚN rol de API pueda usar el esquema private: si algún día puede, la
  // barrida deja de ser la única puerta de las funciones internas.
  const guard = { exists: false, acceptsServiceRoleClaim: false, rejectsAnonClaim: false, privateBlockedForApiRoles: false };
  const claims = async (role) => {
    await handle.db.exec(`SET request.jwt.claims = '{"role":"${role}"}';`);
    await handle.db.exec(`SET request.jwt.claim.role = '${role}';`);
  };
  const denied = (error) => {
    const text = error instanceof Error ? error.message : String(error);
    return /42501|Unauthorized|permission denied|insufficient privileges/i.test(text) ? text.split(/\r?\n/)[0] : `ERROR INESPERADO: ${text.split(/\r?\n/)[0]}`;
  };
  try {
    guard.exists = (await handle.db.query("SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND proname = 'assert_service_role'")).rows[0].n === 1;
    await claims("anon");
    try {
      await handle.db.query("SELECT private.assert_service_role()");
      findings.push("private.assert_service_role(): una sesión con claim anon pasó sin error — todo el modelo de RPC está abierto");
    } catch (error) {
      guard.rejectsAnonClaim = /42501|Unauthorized/i.test(String(error));
      if (!guard.rejectsAnonClaim) findings.push(`private.assert_service_role(): ${denied(error)}`);
    }
    await claims("service_role");
    try {
      await handle.db.query("SELECT private.assert_service_role()");
      guard.acceptsServiceRoleClaim = true;
    } catch (error) {
      findings.push(`private.assert_service_role(): rechazó el claim service_role → ${denied(error)}`);
    }
    await claims("none");

    const usage = (await handle.db.query(
      "select rolname, has_schema_privilege(rolname, 'private', 'USAGE') as u from (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)",
    )).rows;
    guard.privateBlockedForApiRoles = usage.every((r) => r.u === false);
    for (const r of usage) if (r.u !== false) findings.push(`el rol ${r.rolname} tiene USAGE sobre private: sus funciones internas quedan alcanzables por la API`);
  } catch (error) {
    findings.push(`private.assert_service_role(): ${denied(error)}`);
  }
  report.guard = guard;

  // El catálogo se toma con la sesión limpia: information_schema puede filtrar
  // por el rol de la sesión, y el claim «none» que deja la prueba del guardia no
  // debe contaminar la comparación.
  await handle.db.exec("RESET ROLE; RESET request.jwt.claims; RESET request.jwt.claim.role;");
  local = await localCatalog(handle.db);
} finally {
  await handle.close();
}

if (!existsSync(SNAPSHOT)) {
  report.parity = { skipped: "falta supabase/schema-snapshot.json: `npm run db:schema` y commitear la línea base" };
} else {
  const baseline = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const compared = parity(baseline.catalog ?? {}, local);
  report.parity = {
    baselineAt: baseline.generatedAt,
    baselineSource: baseline.source ?? "desconocido",
    counts: compared.counts,
    differences: compared.differences,
    note: credentials() ? "línea base commiteada; producción no se leyó en esta corrida" : "sin credenciales: solo se comparó contra la línea base commiteada",
  };
  for (const d of compared.differences) {
    findings.push(`paridad · ${d.kind} · ${d.section} · ${d.id}${d.local ? ` → local ${d.local}` : ""}${d.production ? ` vs producción ${d.production}` : ""}`);
  }
}

if (findings.length > 0) {
  finish("db-migrate-test", failed(`${findings.length} problema(s) reproduciendo la base desde el repo`, { ...report, findings }));
}

finish(
  "db-migrate-test",
  passed({
    reason: `${report.migrations.length} migraciones aplicaron de cero, ${report.idempotency.length} se re-aplicaron, paridad ${report.parity?.differences?.length ?? "omitida"}`,
    guard: report.guard,
    objects: report.parity?.counts ?? null,
    ...report,
  }),
);
