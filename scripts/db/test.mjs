/**
 * `npm run db:test` — la suite SQL de supabase/tests/.
 *
 * Dos motores, y el reporte dice cuál corrió:
 *   supabase-cli  `supabase test db` con pgTAP de verdad (necesita CLI + Docker)
 *   pglite-shim   Postgres WASM en memoria + scripts/db/pgtap-shim.sql
 *
 * Si no hay ninguno, el paso se reporta OMITIDO con el motivo; nunca verde.
 * Antes de cualquier motor corre una autoprueba del shim: una aserción falsa
 * tiene que salir como fallo. Sin eso, un shim roto podría aprobar todo.
 *
 * Forma parte de `npm run check` y de `npm run verify:all`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { failed, finish, passed, root, skipped, which, writeReport } from "./lib.mjs";
import { migrationFiles, migrationPath, openLocal, readSql, SEED_FILE } from "./local-pg.mjs";

const TESTS_DIR = "supabase/tests";
const SHIM = "scripts/db/pgtap-shim.sql";
/** Scratch de `supabase test db`: .qa/ está gitignored y `testFiles()` no lo mira. */
const GENERATED_DIR = ".qa/sql";

function testFiles() {
  const dir = resolve(root, TESTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
}

/** Reglas de forma que valen en los dos motores. */
function lint(name, sql) {
  const problems = [];
  const body = sql.replace(/\bROLLBACK\s*;\s*$/i, "");
  const declared = [...body.matchAll(ASSERTION)].length;
  if (!/\bBEGIN\s*;/i.test(sql)) problems.push("no abre transacción");
  if (!/\bROLLBACK\s*;\s*$/i.test(sql.trim())) problems.push("no termina en ROLLBACK: dejaría datos de prueba en la base");
  if (!/SELECT\s+plan\s*\(\s*\d+\s*\)/i.test(sql)) problems.push("no declara plan(n)");
  if (!/SELECT\s+\*\s+FROM\s+finish\s*\(\s*\)/i.test(sql)) problems.push("no llama finish()");
  if (/\bCREATE\s+EXTENSION\b/i.test(sql)) problems.push("instala una extensión: eso es una migración, no una prueba");
  if (/\b[0-9]{9}\b/.test(sql.replace(/--[^\n]*/g, ""))) problems.push("contiene una matrícula de nueve dígitos: las pruebas no usan datos reales");
  const planned = Number(/SELECT\s+plan\s*\(\s*(\d+)\s*\)/i.exec(sql)?.[1] ?? 0);
  // Un plan más alto que las aserciones escritas hace que finish() reporte
  // "plan vacío" sin que nada falle: el contador se revisa aquí, en seco.
  if (planned > 0 && planned !== declared) {
    problems.push(`plan(${planned}) no coincide con ${declared} asercione(s) escrita(s)`);
  }
  return { name, planned, declared, problems };
}

/** Cuenta aserciones reales: cada SELECT de función pgTAP es una. */
const ASSERTION = /\bSELECT\s+(?:public\.)?(ok|is|isnt|has_table|has_column|col_is_pk|has_function|has_index|has_trigger|is_empty|lives_ok|throws_ok|results_eq)\s*\(/gi;

/**
 * Directiva `-- @aplicar: <ruta>`.
 *
 * Hay pruebas que necesitan una migración QUE TODAVÍA NO está en
 * `supabase/migrations/`: vive en `supabase/maintenance/pending/` porque
 * aplicarla es decisión humana (M-13) y porque `db:migrate-test` exige que el
 * repo replique producción sin diferencias. Esas pruebas aplican el DDL dentro
 * de su propia transacción y el `ROLLBACK` final se lo lleva, así que el verde
 * no depende de que la migración ya esté aplicada —y si la prueba falla, falla
 * por el mecanismo, no por el orden de aplicación.
 */
const PENDING_DIRECTIVE = /^--\s*@aplicar:\s*(\S+)\s*$/im;

/** El DDL de una migración, sin su wrapper transaccional: la transacción es la de la prueba. */
function ddlOnly(sql) {
  return sql.replace(/^\s*BEGIN\s*;/im, "").replace(/^\s*COMMIT\s*;/gim, "");
}

/** `pending` es la ruta declarada, o null; `body` es el SQL listo para ejecutar. */
function withPending(sql) {
  const declared = PENDING_DIRECTIVE.exec(sql)?.[1] ?? null;
  if (!declared) return { pending: null, body: sql };
  const ddl = ddlOnly(readSql(declared));
  return { pending: declared, body: sql.replace(/^BEGIN\s*;/m, (m) => `${m}\n${ddl}\n`) };
}

async function readResults(db) {
  const rows = (await db.query("SELECT seq, ok, description, diagnostics FROM pgtap.results ORDER BY seq")).rows;
  const plan = (await db.query("SELECT expected FROM pgtap.plan")).rows[0]?.expected ?? null;
  const assertions = rows.filter((r) => r.description !== "");
  return {
    plan,
    ran: assertions.length,
    passed: assertions.filter((r) => r.ok).length,
    failures: assertions.filter((r) => !r.ok).map((r) => ({ seq: r.seq, description: r.description, diagnostics: r.diagnostics })),
  };
}

async function runOnPglite(files) {
  const handle = await openLocal();
  const { db } = handle;
  try {
    for (const name of migrationFiles()) {
      const applied = await handle.apply(migrationPath(name));
      if (!applied.ok) throw new Error(`${name} no aplicó en la base local: ${applied.error}`);
    }
    const seed = await handle.apply(SEED_FILE);
    if (!seed.ok) throw new Error(`seed.sql no aplicó: ${seed.error}`);
    await db.exec(readSql(SHIM));
    // El shim vive en el esquema `pgtap`, no en `public`: las pruebas de ACL
    // cuentan las funciones públicas y no deben contar al propio pgTAP.
    await db.exec("SET search_path = pgtap, public;");

    // Autoprueba: si el shim no sabe reportar un fallo, la suite no vale nada.
    await db.exec("BEGIN; SELECT plan(3); SELECT ok(true, 'verdadero'); SELECT is(1, 2, 'falso a propósito'); SELECT is(1, 1, 'cierto');");
    const selfTest = await readResults(db);
    await db.exec("ROLLBACK;");
    const shimTrustworthy = selfTest.ran === 3 && selfTest.passed === 2 && selfTest.failures.length === 1;

    const results = [];
    for (const name of files) {
      const sql = readSql(`${TESTS_DIR}/${name}`);
      // El ROLLBACK final lo emite el runner DESPUÉS de leer los resultados:
      // dentro de la transacción, un ROLLBACK se llevaría también las aserciones.
      const prepared = withPending(sql.replace(/\bROLLBACK\s*;\s*$/i, ""));
      const body = prepared.body;
      const declared = [...body.matchAll(ASSERTION)].length;
      const started = Date.now();
      try {
        await db.exec(body);
        const result = await readResults(db);
        results.push({
          name,
          ok: result.failures.length === 0 && result.ran === result.plan && result.ran === declared,
          elapsedMs: Date.now() - started,
          declared,
          pending: prepared.pending,
          ...result,
        });
      } catch (error) {
        results.push({ name, ok: false, elapsedMs: Date.now() - started, declared, error: error instanceof Error ? error.message : String(error) });
      } finally {
        await db.exec("ROLLBACK;").catch(() => {});
      }
    }
    return { engine: "pglite-shim", shimTrustworthy, selfTest, results };
  } finally {
    await handle.close();
  }
}

function runOnSupabaseCli(files) {
  const cli = which("supabase");
  // Con pgTAP de verdad no hay runner propio que inyecte el DDL, así que la
  // migración pendiente se materializa en `.qa/sql/` (gitignored): el archivo
  // que recibe el CLI ya trae el `CREATE OR REPLACE` adentro, en la misma
  // transacción que su ROLLBACK.
  const paths = files.map((name) => {
    const sql = readSql(`${TESTS_DIR}/${name}`);
    const prepared = withPending(sql);
    if (!prepared.pending) return `${TESTS_DIR}/${name}`;
    mkdirSync(resolve(root, GENERATED_DIR), { recursive: true });
    const generated = `${GENERATED_DIR}/${name}`;
    writeFileSync(resolve(root, generated), prepared.body, "utf8");
    return generated;
  });
  const run = spawnSync(cli, ["test", "db", ...paths], { cwd: root, encoding: "utf8", stdio: "pipe" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const failedAssertions = [...output.matchAll(/^not ok\s+(\d+)\s*-\s*(.*)$/gm)].map((m) => ({ seq: Number(m[1]), description: m[2] }));
  return {
    engine: "supabase-cli",
    exitCode: run.status,
    results: files.map((name) => ({ name, ok: run.status === 0 })),
    failures: failedAssertions,
    output: output.slice(-4000),
  };
}

const files = testFiles();
if (files.length === 0) {
  finish("db-test", failed(`no hay pruebas SQL en ${TESTS_DIR}: la suite no puede estar vacía y verse verde`));
}

const lints = files.map((name) => lint(name, readSql(`${TESTS_DIR}/${name}`)));
const lintProblems = lints.flatMap((l) => l.problems.map((problem) => `${l.name}: ${problem}`));
const plannedTotal = lints.reduce((total, l) => total + l.planned, 0);

const cli = which("supabase");
const docker = which("docker");
let run;
if (cli && docker) run = runOnSupabaseCli(files);
else if (existsSync(resolve(root, "node_modules/@electric-sql/pglite"))) {
  try {
    run = await runOnPglite(files);
  } catch (error) {
    finish("db-test", failed(error instanceof Error ? error.message : String(error), { lintProblems }));
  }
} else {
  finish("db-test", skipped(
    `sin motor SQL: supabase=${cli ? "sí" : "no"} docker=${docker ? "sí" : "no"} pglite=no instalado. ` +
      "Instala la devDependency @electric-sql/pglite o el CLI de Supabase con Docker; no se inventa un resultado.",
    { lintProblems, plannedTotal },
  ));
}

const assertionFailures = run.results.flatMap((r) => (r.failures ?? []).map((f) => ({ file: r.name, ...f })));
const broken = run.results.filter((r) => !r.ok);
const problems = [
  ...lintProblems,
  ...(run.shimTrustworthy === false ? ["el shim de pgTAP no reportó una aserción falsa: la suite no es confiable"] : []),
  ...broken.map((r) => `${r.name}: ${r.error ?? `${r.failures?.length ?? 0} fallos, plan ${r.plan}, corrieron ${r.ran}, declaradas ${r.declared}`}`),
];

const report = {
  engine: run.engine,
  files: run.results,
  plannedTotal,
  assertions: run.results.reduce((total, r) => total + (r.ran ?? 0), 0),
  passed: run.results.reduce((total, r) => total + (r.passed ?? 0), 0),
  assertionFailures,
  shimSelfTest: run.selfTest ?? null,
  cliOutput: run.output ?? null,
  findings: problems,
};
writeReport("db-test-detail", report);

if (problems.length > 0) finish("db-test", failed(`${problems.length} problema(s) en la suite SQL (${run.engine})`, report));
finish("db-test", passed({ engine: run.engine, files: files.length, assertions: report.assertions, passed: report.passed }));