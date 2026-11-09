/**
 * Divergence harness CLI (docs/DIVERGENCIA_RESULTADOS.md).
 *   node scripts/matching/divergence.mjs --old .qa/matching-config.prev.json
 *   node scripts/matching/divergence.mjs --old <config> --old-params <params> --write
 *   node scripts/matching/divergence.mjs --old <config> --quick
 * The previous version of the config is not bundled with the app, so it is
 * taken from git: `git show <ref>:data/matching-config.json > .qa/matching-config.prev.json`.
 */
import { fileURLToPath } from "node:url";

import { runnerImport } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

const oldPath = arg("--old");
if (!oldPath) {
  console.error("falta --old <path>: la versión anterior de data/matching-config.json");
  process.exit(2);
}

const { module } = await runnerImport("/scripts/matching/divergence.ts", {
  configFile: false,
  root,
  resolve: { alias: { "@": `${root}/src` } },
  logLevel: "error",
});
await module.main({
  root,
  write: process.argv.includes("--write"),
  quick: process.argv.includes("--quick"),
  oldPath,
  oldParamsPath: arg("--old-params"),
});
