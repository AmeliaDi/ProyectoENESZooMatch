/**
 * `npm run data:avatars`: privacy + coverage analysis of the avatar layer
 * (`--tables` prints the contrast/duplicate tables for docs/AVATARES.md).
 * Runs TypeScript through Vite's module runner (same as scripts/matching).
 */
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const entry = process.argv.includes("--tables") ? "/scripts/avatars/tables.mts" : "/scripts/avatars/privacy.mts";
const { module } = await runnerImport(entry, {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
await module.main(root);
