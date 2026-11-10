/**
 * `npm run verify:invariants` — corre la suite curada de invariantes (I1–I10,
 * S1–S4) y escribe la evidencia en .qa/invariants.json.
 *
 *   node scripts/verify/run-invariants.mjs
 *
 * Tres pasos, todos obligatorios: las pruebas que cada invariante cita, el
 * escaneo de secretos (I8, que es un script y no un archivo vitest) y la sonda
 * de independencia de orden del pool. Sale con código distinto de cero si
 * cualquiera falla; un invariante sin archivo que lo vigile también falla,
 * porque scripts/verify/invariants.test.ts entra en la corrida.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { module } = await runnerImport("/scripts/verify/invariants.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});

const files = [...module.suiteFiles(), "scripts/verify/invariants.test.ts"];
const qaDir = resolve(root, ".qa");
mkdirSync(qaDir, { recursive: true });
const reportPath = resolve(qaDir, "invariants-tests.json");

function run(label, command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  const elapsedMs = Math.round(performance.now() - started);
  if (result.error) {
    console.error(`[invariantes] ✗ ${label}: ${result.error.message}`);
    return { label, status: "error", exitCode: null, elapsedMs, detail: result.error.message };
  }
  const ok = result.status === 0;
  console.log(`[invariantes] ${ok ? "✓" : "✗"} ${label} (${elapsedMs} ms)`);
  return { label, status: ok ? "passed" : "failed", exitCode: result.status, elapsedMs };
}

const node = process.execPath;
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");

const steps = [
  run(
    "pruebas de los invariantes",
    node,
    [vitest, "run", ...files, "--reporter=dot", "--reporter=json", `--outputFile.json=${reportPath}`],
  ),
  run("I8 · secretos", node, ["--no-warnings", resolve(root, module.SECRETS_SCRIPT)]),
  run("independencia de orden del pool", node, ["--no-warnings", resolve(root, "scripts/verify-pool.mts"), "--simulate"]),
];

/** Qué invariantes quedaron realmente cubiertos por archivos en verde. */
const rootDir = root.replace(/\\/g, "/").replace(/\/+$/, "");
const green = new Set();
let tests = { total: 0, passed: 0, failed: 0 };
try {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  tests = { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests };
  for (const file of report.testResults) {
    if (file.status === "passed") green.add(file.name.replace(/\\/g, "/").slice(rootDir.length + 1));
  }
} catch {
  steps[0] = { ...steps[0], status: "error", detail: "vitest no escribió el reporte JSON" };
}

const invariants = module.INVARIANT_SUITE.map((check) => ({
  id: check.id,
  rule: check.rule,
  files: check.files,
  status: check.files.every((file) => green.has(file)) ? "passed" : "failed",
}));
invariants.push({
  id: "I8",
  rule: "Ningún secreto entra al repositorio ni a los registros del crawler",
  files: [module.SECRETS_SCRIPT],
  status: steps[1].status === "passed" ? "passed" : "failed",
});
invariants.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

const failed = invariants.filter((entry) => entry.status !== "passed").map((entry) => entry.id);
const ok = steps.every((step) => step.status === "passed") && failed.length === 0;

writeFileSync(
  resolve(qaDir, "invariants.json"),
  `${JSON.stringify({ ok, generatedAt: new Date().toISOString(), tests, steps, invariants, failed }, null, 2)}\n`,
);

console.log(`\n[invariantes] ${invariants.length - failed.length}/${invariants.length} invariantes · ${tests.passed}/${tests.total} pruebas`);
if (!ok) {
  console.error(`[invariantes] ✗ FALLA: ${failed.join(", ") || steps.filter((s) => s.status !== "passed").map((s) => s.label).join(", ")}`);
  console.error("[invariantes] evidencia en .qa/invariants.json");
  process.exit(1);
}
console.log("[invariantes] evidencia en .qa/invariants.json");