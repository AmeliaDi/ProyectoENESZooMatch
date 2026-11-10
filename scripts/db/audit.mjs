/**
 * `npm run db:audit` — corre las consultas numeradas de solo lectura de
 * `supabase/maintenance/readonly-audit/` y dicta veredicto renglón por renglón
 * (Fase 2 del prompt de QA de base de datos).
 *
 *   node scripts/db/audit.mjs                 producción si hay credenciales, si no, local
 *   node scripts/db/audit.mjs --local         fuerza la base local desechable
 *   node scripts/db/audit.mjs --only=02,07    solo esos archivos
 *   node scripts/db/audit.mjs --strict        falla en vez de plegarse a local sin credenciales
 *
 * Por qué las dos rutas:
 *  - Producción: se ejecuta con la API de manejo de Supabase, que aquí se usa
 *    solo para lectura aggregate y de catálogo. `assertReadOnly` rechaza
 *    cualquier verbo de escritura antes de salir de la máquina, así que un
 *    archivo mal editado no puede escribir ni por accidente.
 *  - Local: PGlite aplica las migraciones, el seed del catálogo y la población
 *    sintética declarada en `data/db-perf.json`. Sirve para dos cosas distintas:
 *    comprobar que cada SQL compila y responde cuando no hay credenciales, y
 *    verificar los invariantes contra datos que sí podemos fabricar a voluntad.
 *
 * Un renglón con `esperado = 'informativo'` nunca falla: mide. Cualquier otro
 * valor es una aserción literal sobre el texto devuelto, típicamente `'0'`.
 *
 * Sin credenciales y sin `--local`, el reporte dice qué origen usó. No se inventa
 * ninguna cifra: lo que no se pudo consultar simplemente no aparece.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runnerImport } from "vite";

import { assertReadOnly, credentials, failed, finish, passed, queryReadOnly, root, skipped, sqlBody } from "./lib.mjs";
import { BASE_MIGRATION, SEED_FILE, migrationFiles, migrationPath, openLocal } from "./local-pg.mjs";
import { seedPopulation } from "./seed-population.mjs";

const AUDIT_DIR = resolve(root, "supabase/maintenance/readonly-audit");
const INFO = "informativo";

const argOnly = process.argv.find((a) => a.startsWith("--only="));
const only = argOnly
  ? argOnly.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : null;
const forceLocal = process.argv.includes("--local");
const strict = process.argv.includes("--strict");

/** Un archivo, una sentencia: la API de manejo devuelve solo el último conjunto. */
function validarArchivo(nombre, sql) {
  assertReadOnly(sql);
  const sentencias = sqlBody(sql).split(";").map((s) => s.trim()).filter(Boolean);
  if (sentencias.length !== 1) {
    return `«${nombre}» tiene ${sentencias.length} sentencias; la API de manejo devuelve solo la última, así que debe tener exactamente una`;
  }
  if (!/^select\b|^with\b/i.test(sentencias[0])) return `«${nombre}» no empieza por SELECT o WITH`;
  return null;
}

const text = (value) =>
  value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);

const campo = (row, nombre) =>
  row[nombre] ?? row[nombre[0].toUpperCase() + nombre.slice(1)] ?? Object.entries(row).find(([k]) => k.toLowerCase() === nombre)?.[1];

function verdicto(rows, nombre) {
  if (rows.length === 0) return [{ chequeo: "(sin renglones)", valor: "", esperado: "", estado: "MAL", motivo: `${nombre} no devolvió filas` }];
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  for (const needed of ["chequeo", "valor", "esperado"]) {
    if (!keys.includes(needed)) {
      return [{ chequeo: "(forma)", valor: "", esperado: "", estado: "MAL", motivo: `${nombre} no devuelve chequeo/valor/esperado, sino ${keys.join(", ")}` }];
    }
  }
  return rows.map((row) => {
    const esperado = text(campo(row, "esperado"));
    const valor = text(campo(row, "valor"));
    const chequeo = text(campo(row, "chequeo"));
    if (esperado === INFO) return { chequeo, valor, esperado, estado: "info" };
    return { chequeo, valor, esperado, estado: valor === esperado ? "ok" : "VIOLACIÓN" };
  });
}

// ─── Colección y guardia de archivos ─────────────────────────────────────────

if (!existsSync(AUDIT_DIR)) finish("db-audit", failed(`no existe ${AUDIT_DIR}`));
const archivos = readdirSync(AUDIT_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => !only || only.some((o) => f.startsWith(o) || f.replace(/\.sql$/, "") === o));

if (archivos.length === 0) finish("db-audit", failed(`ningún archivo de auditoría coincide con --only=${only.join(",")}`));

for (const nombre of archivos) {
  const error = validarArchivo(nombre, readFileSync(resolve(AUDIT_DIR, nombre), "utf8"));
  if (error) finish("db-audit", failed(error));
}

// ─── Origen de los datos ─────────────────────────────────────────────────────

const creds = credentials();
let origen;
let ejecutar;
let cerrar = async () => {};

if (!forceLocal && creds) {
  origen = `producción (proyecto ${creds.ref}, solo lectura aggregate y de catálogo)`;
  ejecutar = async (sql) => {
    const res = await queryReadOnly(sql);
    return Array.isArray(res) ? res : (res?.rows ?? []);
  };
} else if (strict && !creds) {
  finish("db-audit", skipped("sin credenciales de Supabase y --strict exige producir el número de producción"));
} else {
  origen = forceLocal
    ? "base local desechable (PGlite + población sintética declarada en data/db-perf.json)"
    : "base local desechable: sin credenciales de producción la auditoría se corre contra PGlite";
  const handle = await openLocal();
  const files = migrationFiles();
  if (files[0] !== BASE_MIGRATION) {
    finish("db-audit", failed(`la primera migración debe ser ${BASE_MIGRATION}, no ${files[0]}`));
  }
  for (const file of files) {
    const r = await handle.apply(migrationPath(file));
    if (!r.ok) finish("db-audit", failed(`${file}: ${r.error}`));
  }
  const seed = await handle.apply(SEED_FILE);
  if (!seed.ok) finish("db-audit", failed(`${SEED_FILE}: ${seed.error}`));

  const { module: configModule } = await runnerImport("/src/config/db-perf.ts", {
    configFile: false,
    root,
    resolve: { alias: { "@": `${root}/src` } },
    logLevel: "error",
  });
  await seedPopulation(handle.db, configModule.DB_PERF.poblacion);
  // Las consultas de catálogo miden estadísticas; sin ANALYZE el planner local
  // decide distinto de producción y los planes de los EXPLAIN no serían Comparable.
  await handle.db.exec("ANALYZE;");
  ejecutar = async (sql) => (await handle.db.query(sql)).rows;
  cerrar = async () => handle.close();
}

console.log(`[db-audit] origen: ${origen}`);

// ─── Corrida ─────────────────────────────────────────────────────────────────

const resultados = [];
const violaciones = [];
const errores = [];

for (const nombre of archivos) {
  const sql = readFileSync(resolve(AUDIT_DIR, nombre), "utf8");
  let rows;
  try {
    rows = await ejecutar(sql);
  } catch (error) {
    const motivo = String(error?.message ?? error).split("\n")[0];
    errores.push(`${nombre}: ${motivo}`);
    console.log(`\n✗ ${nombre} — ${motivo}`);
    continue;
  }
  const renglones = verdicto(rows, nombre);
  resultados.push({ archivo: nombre, renglones });
  console.log(`\n── ${nombre}`);
  for (const r of renglones) {
    const mark = r.estado === "ok" ? "✓" : r.estado === "info" ? "·" : "✗";
    const nota = r.esperado === INFO || r.esperado === "" ? "" : `  (esperado ${r.esperado})`;
    const muestra = r.valor === "" ? "(vacío: ningún renglón coincide)" : r.valor;
    console.log(`  ${mark} ${r.chequeo} = ${muestra}${nota}`);
    if (r.estado !== "ok" && r.estado !== "info") {
      violaciones.push(`${nombre} · ${r.chequeo} = ${r.valor}${r.motivo ? ` — ${r.motivo}` : ` (esperado ${r.esperado})`}`);
    }
  }
}

await cerrar();

const extra = { origen, archivos, resultados };
if (errores.length > 0) {
  finish("db-audit", failed(`${errores.length} archivo(s) no pudieron consultarse`, { ...extra, errores }));
}
if (violaciones.length > 0) {
  finish("db-audit", failed(`${violaciones.length} renglón(es) fuera de lo esperado`, { ...extra, violaciones }));
}

finish(
  "db-audit",
  passed({
    ...extra,
    renglones: resultados.reduce((n, r) => n + r.renglones.length, 0),
    informativos: resultados.reduce((n, r) => n + r.renglones.filter((x) => x.estado === "info").length, 0),
  }),
);
