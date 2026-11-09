/**
 * Retake-plan harness CLI (data/retake-plans.json).
 *   node scripts/matching/retake-plans.mjs
 *   node scripts/matching/retake-plans.mjs --write
 * Run it whenever `data/microtest.json` changes: the plans compare the bank in
 * the tree against every bank version still in git history, so the app never
 * has to read a deleted file.
 */
import { fileURLToPath } from "node:url";

import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

const { module } = await runnerImport("/scripts/matching/retake-plans.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
module.main({ root, write: process.argv.includes("--write") });
