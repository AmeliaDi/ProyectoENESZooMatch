/**
 * Fails (exit 1) if a secret-looking string is found.
 *   node scripts/secrets-check.mts            tracked + untracked (non-ignored) files and crawler logs
 *   node scripts/secrets-check.mts --staged   only lines added in the staged diff (pre-commit hook)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { isScannable, scanText, type SecretFinding } from "./literature/lib/secrets.ts";

const MAX_BYTES = 2_000_000;
const LOG_DIRS = ["data/literature/logs"];

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function scanStaged(): SecretFinding[] {
  const diff = git(["diff", "--cached", "--unified=0", "--no-color", "--diff-filter=ACMR"]);
  const findings: SecretFinding[] = [];
  let file = "";
  let line = 0;
  for (const row of diff.split("\n")) {
    if (row.startsWith("+++ ")) { file = row.slice(6); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row);
    if (hunk?.[1]) { line = Number(hunk[1]); continue; }
    if (row.startsWith("+") && isScannable(file)) {
      for (const f of scanText(file, row.slice(1))) findings.push({ ...f, line });
      line += 1;
    }
  }
  return findings;
}

function listLogFiles(): string[] {
  const out: string[] = [];
  for (const dir of LOG_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) out.push(join(dir, name).replace(/\\/g, "/"));
  }
  return out;
}

function scanWorkingTree(): SecretFinding[] {
  const files = new Set(
    [
      ...git(["ls-files", "-z"]).split("\0"),
      ...git(["ls-files", "-z", "--others", "--exclude-standard"]).split("\0"),
      ...listLogFiles(),
    ].filter(Boolean),
  );
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (!isScannable(file) || !existsSync(file)) continue;
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    findings.push(...scanText(file, readFileSync(file, "utf8")));
  }
  return findings;
}

const staged = process.argv.includes("--staged");
const findings = staged ? scanStaged() : scanWorkingTree();

if (findings.length > 0) {
  console.error(`secrets:check encontró ${findings.length} posible(s) secreto(s):`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.masked}`);
  console.error("Quítalos (o rótalos si ya se publicaron) antes de commitear.");
  process.exit(1);
}
console.log(`secrets:check OK (${staged ? "staged" : "árbol de trabajo + logs"})`);
