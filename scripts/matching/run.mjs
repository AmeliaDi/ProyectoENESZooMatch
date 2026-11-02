/**
 * Matching calibration + validation CLI (docs/MATCHING_RESULTADOS.md).
 *   node scripts/matching/run.mjs            report only (docs/MATCHING_RESULTADOS.md + .qa/matching.json)
 *   node scripts/matching/run.mjs --write    also writes calibrated thresholds into data/matching-config.json
 *   node scripts/matching/run.mjs --quick    120-profile smoke run (never writes)
 * Runs the TypeScript pipeline through Vite's module runner so the domain code
 * is executed exactly as the app runs it (same `@/` alias, no build step).
 */
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { module } = await runnerImport("/scripts/matching/pipeline.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
await module.main({ root, write: process.argv.includes("--write"), quick: process.argv.includes("--quick") });
