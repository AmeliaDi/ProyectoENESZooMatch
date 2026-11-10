/**
 * `npm run verify:rollout` — guardia barata sobre la evidencia del modo sombra.
 *
 *   node --no-warnings scripts/verify/rollout.mjs
 *
 * No vuelve a correr los 207 400 pares: comprueba que `.qa/rollout.json` y
 * `docs/COMPARATIVA_MODELOS.md` siguen siendo ciertos. Falla si el hash de los
 * tres archivos de configuración cambió desde la corrida (evidencia vieja), si
 * falta alguna de las nueve compuertas, si `activate` no es la conjunción de
 * todas, o si el documento no refleja la decisión. Escrito para el canario
 * periódico y para `verify:all`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const HASHED = ["data/matching-config.json", "data/psychometric-params.json", "data/rollout-gates.json"];
const GATE_IDS = [
  "cobertura.romance",
  "cobertura.amistad",
  "equidad",
  "exposicion",
  "correlacion_rangos",
  "estabilidad_ruido",
  "invariantes",
  "tiempo",
  "conservacion",
];

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

const rolloutPath = resolve(root, ".qa/rollout.json");
if (!existsSync(rolloutPath)) {
  console.error("[rollout] ✗ falta .qa/rollout.json — corre `npm run matching:shadow`");
  process.exit(1);
}

const result = JSON.parse(readFileSync(rolloutPath, "utf8"));
const inputHash = createHash("sha256");
for (const file of HASHED) inputHash.update(readFileSync(resolve(root, file)));
const currentHash = inputHash.digest("hex");

check(result.inputHash === currentHash, `evidencia vieja: .qa/rollout.json se generó con otro hash de configuración. Corre \`npm run matching:shadow\`. (${String(result.inputHash).slice(0, 12)} ≠ ${currentHash.slice(0, 12)})`);

const ids = (result.decision?.gates ?? []).map((gate) => gate.id);
check(ids.length === GATE_IDS.length, `se esperaban ${GATE_IDS.length} compuertas y hay ${ids.length}`);
for (const id of GATE_IDS) check(ids.includes(id), `falta la compuerta ${id}`);

const failed = (result.decision?.gates ?? []).filter((gate) => !gate.passed).map((gate) => gate.id);
check(
  JSON.stringify([...failed].sort()) === JSON.stringify([...(result.decision?.failed ?? [])].sort()),
  "`decision.failed` no coincide con las compuertas marcadas como fallidas",
);
check(result.decision?.activate === (failed.length === 0), "`activate` no es la conjunción de todas las compuertas");
for (const gate of result.decision?.gates ?? []) {
  check(gate.passed || gate.reason.length > 0, `la compuerta ${gate.id} falla sin motivo escrito`);
}

const docPath = resolve(root, "docs/COMPARATIVA_MODELOS.md");
check(existsSync(docPath), "falta docs/COMPARATIVA_MODELOS.md");
if (existsSync(docPath)) {
  const doc = readFileSync(docPath, "utf8");
  check(doc.includes(result.decision.activate ? "ACTIVAR" : "NO ACTIVAR"), "el documento no refleja la decisión vigente");
  for (const id of failed) check(doc.includes(id), `el documento no explica el fallo de ${id}`);
  check(doc.includes("Rollback"), "el documento no trae el rollback en un comando");
  check(doc.includes(currentHash.slice(0, 16)) || doc.includes(result.inputHash.slice(0, 16)), "el documento no registra el hash de la corrida");
}

mkdirSync(resolve(root, ".qa"), { recursive: true });
const report = {
  ok: problems.length === 0,
  generatedAt: new Date().toISOString(),
  inputHash: currentHash,
  evidenceHash: result.inputHash,
  activate: result.decision?.activate ?? null,
  incumbent: result.incumbent,
  candidate: result.candidate,
  failed,
  problems,
};
writeFileSync(resolve(root, ".qa/rollout-verify.json"), `${JSON.stringify(report, null, 2)}\n`);

if (problems.length > 0) {
  console.error(`[rollout] ✗ ${problems.length} problema(s):`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}
console.log(`[rollout] ✓ evidencia vigente · ${GATE_IDS.length} compuertas · decisión: ${report.activate ? `ACTIVAR ${report.candidate}` : `NO ACTIVAR (sigue ${report.incumbent})`}`);
if (failed.length > 0) console.log(`[rollout] fallan: ${failed.join(", ")}`);