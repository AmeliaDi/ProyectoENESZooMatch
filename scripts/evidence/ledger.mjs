/**
 * Evidence ledger generator (docs/EVIDENCIA.md → data/evidence-ledger.json).
 *   node scripts/evidence/ledger.mjs --write    regenerates the ledger
 *   node scripts/evidence/ledger.mjs --check    exits 1 if the file is stale
 * Read-only over the database: it touches three JSON files in `data/`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { buildLedger, serializeLedger, INDEXED_FILES, STAMPED_FILES } = (
  await runnerImport("/src/config/evidence-ledger.ts", {
    configFile: false,
    root,
    resolve: { alias: { "@": `${root}/src` } },
    logLevel: "error",
  })
).module;

const target = "data/evidence-ledger.json";
const sources = {};
for (const { archivo } of [...INDEXED_FILES, ...STAMPED_FILES]) {
  sources[archivo] = JSON.parse(readFileSync(`${root}${archivo}`, "utf8"));
}

const next = serializeLedger(buildLedger(sources));
const current = (() => {
  try {
    return readFileSync(`${root}${target}`, "utf8");
  } catch {
    return null;
  }
})();
const same = current !== null && JSON.stringify(JSON.parse(current)) === JSON.stringify(JSON.parse(next));

const ledger = JSON.parse(next);
console.log(`[ledger] ${ledger.resumen.total} entradas · ${ledger.resumen.conEv} con EV · ${ledger.resumen.sinEv} sin EV`);
for (const [archivo, meta] of Object.entries(ledger.archivos)) {
  console.log(`[ledger]   ${archivo}: ${meta.entradas}`);
}

if (process.argv.includes("--write")) {
  writeFileSync(`${root}${target}`, next, "utf8");
  console.log(`[ledger] escrito ${target}`);
} else if (!same) {
  console.error(`[ledger] ${target} está desactualizado: node scripts/evidence/ledger.mjs --write`);
  process.exitCode = 1;
} else {
  console.log(`[ledger] ${target} vigente`);
}
