/**
 * Shadow comparison of the matching engines (docs/COMPARATIVA_MODELOS.md).
 *   node scripts/matching/run-shadow.mjs             full pool → .qa/rollout.json + docs/COMPARATIVA_MODELOS.md
 *   node scripts/matching/run-shadow.mjs --quick     120-profile smoke run (.qa only)
 *   node scripts/matching/run-shadow.mjs --candidate=coseno
 * Runs the TypeScript through Vite's module runner so the domain code executes
 * exactly as the app runs it (same `@/` alias, no build step). Writes nothing to
 * the database and never activates an engine: activation is a manual step.
 */
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { module } = await runnerImport("/scripts/matching/shadow.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});

const candidateArg = process.argv.find((a) => a.startsWith("--candidate="));
await module.main({
  root,
  quick: process.argv.includes("--quick"),
  ...(candidateArg ? { candidate: candidateArg.slice("--candidate=".length) } : {}),
});