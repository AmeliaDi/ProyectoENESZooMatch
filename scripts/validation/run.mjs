/**
 * Preregistered synthetic validation CLI (docs/PREREGISTRO.md).
 *   node scripts/validation/run.mjs           full run → docs/VALIDACION_RESULTADOS.md + .qa/validation.json
 *   node scripts/validation/run.mjs --quick   120-profile smoke run (.qa only)
 * Same Vite module runner as scripts/matching/run.mjs.
 */
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { module } = await runnerImport("/scripts/validation/pipeline.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
await module.main({ root, quick: process.argv.includes("--quick") });
