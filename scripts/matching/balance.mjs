/**
 * Balance pass B8 (docs/BALANCE.md).
 *   node scripts/matching/balance.mjs            report only (.qa/balance.json + stdout)
 *   node scripts/matching/balance.mjs --write    also writes docs/BALANCE.md
 * Runs the TypeScript harness through Vite's module runner, exactly like
 * scripts/matching/run.mjs, so the domain code is the one the app runs.
 */
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { module } = await runnerImport("/scripts/matching/balance.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
await module.main({ root, write: process.argv.includes("--write") });
