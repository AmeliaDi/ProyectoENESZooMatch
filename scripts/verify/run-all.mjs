/**
 * `npm run verify:all` — la corrida completa de la fase 9.
 *
 *   node scripts/verify/run-all.mjs [--skip=db:perf,qa:chat]
 *
 * Ejecuta cada paso en orden, no se detiene en el primer fallo (queremos el
 * mapa completo) y escribe .qa/verify-all.json. Un paso que necesita una
 * herramienta o credencial que no existe aquí se reporta como OMITIDO, nunca
 * como verde: el resumen final cuenta los omitidos por separado para que una
 * corrida en verde no esconda cobertura que no se ejercitó.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const qaDir = resolve(root, ".qa");

/** Orden fijo: lo barato y local primero, lo remoto y lento al final. */
const STEPS = [
  { script: "check", evidence: null, note: "secretos + lint + tipos + pruebas + db:test" },
  { script: "data:validate", evidence: null, note: "esquemas de config y validación de datos" },
  { script: "verify:invariants", evidence: "invariants.json", note: "I1–I10 y S1–S4" },
  { script: "verify:rollout", evidence: "rollout-verify.json", note: "compuertas de activación vigentes" },
  { script: "db:migrate-test", evidence: "db-migrate-test.json", note: "migraciones sobre pila desechable" },
  { script: "db:drift", evidence: "db-drift.json", note: "esquema vivo vs línea base documentada" },
  { script: "db:audit", evidence: "db-audit.json", note: "consultas numeradas de solo lectura" },
  { script: "db:perf", evidence: "db-perf.json", note: "presupuestos de consulta" },
  { script: "db:restore-drill", evidence: "db-restore-drill.json", note: "checksums del respaldo" },
  { script: "qa:chat", evidence: null, note: "E2E de chat (omite sin CHAT_E2E_BASE)" },
];

const skipArg = process.argv.find((arg) => arg.startsWith("--skip="));
const skipped = new Set(skipArg ? skipArg.slice("--skip=".length).split(",").map((s) => s.trim()) : []);
for (const name of skipped) {
  if (!STEPS.some((step) => step.script === name)) {
    console.error(`[verify:all] ✗ paso desconocido en --skip: ${name}`);
    console.error(`[verify:all] pasos: ${STEPS.map((s) => s.script).join(", ")}`);
    process.exit(1);
  }
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("[verify:all] ✗ corre esto con `npm run verify:all` (falta npm_execpath)");
  process.exit(1);
}

mkdirSync(qaDir, { recursive: true });
const results = [];

for (const step of STEPS) {
  if (skipped.has(step.script)) {
    console.log(`\n━━━ ${step.script} · SALTADO por --skip ━━━`);
    results.push({ ...step, status: "saltado", exitCode: null, elapsedMs: 0 });
    continue;
  }
  console.log(`\n━━━ ${step.script} · ${step.note} ━━━`);
  const started = performance.now();
  const run = spawnSync(process.execPath, [npmCli, "run", step.script], {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  const elapsedMs = Math.round(performance.now() - started);
  const exitCode = run.error ? null : run.status;

  let status = exitCode === 0 ? "pasó" : "falló";
  let detail = run.error?.message ?? null;
  if (step.evidence && exitCode === 0) {
    const path = resolve(qaDir, step.evidence);
    if (existsSync(path)) {
      try {
        const evidence = JSON.parse(readFileSync(path, "utf8"));
        if (evidence.status === "skipped" || evidence.omitted === true) {
          status = "omitido";
          detail = evidence.reason ?? "sin herramienta o credencial en este entorno";
        }
      } catch {
        detail = `no se pudo leer .qa/${step.evidence}`;
      }
    }
  }
  if (run.error) status = "falló";
  results.push({ ...step, status, exitCode, elapsedMs, detail });
}

const failed = results.filter((r) => r.status === "falló");
const omitted = results.filter((r) => r.status === "omitido" || r.status === "saltado");
const ok = failed.length === 0;

writeFileSync(
  resolve(qaDir, "verify-all.json"),
  `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), results, failed: failed.map((r) => r.script), omitted: omitted.map((r) => r.script) }, null, 2)}\n`,
);

console.log("\n═══ verify:all ═══");
for (const r of results) {
  const mark = r.status === "pasó" ? "✓" : r.status === "falló" ? "✗" : "—";
  console.log(`${mark} ${r.script.padEnd(20)} ${r.status.padEnd(9)} ${(r.elapsedMs / 1000).toFixed(1)} s${r.detail ? `  · ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed.length - omitted.length} pasos en verde · ${failed.length} fallos · ${omitted.length} omitidos/saltados`);
if (omitted.length > 0) console.log("Los omitidos NO son cobertura ejercitada: ver docs/PENDIENTES_MANUALES.md.");
console.log("Evidencia en .qa/verify-all.json");
process.exit(ok ? 0 : 1);