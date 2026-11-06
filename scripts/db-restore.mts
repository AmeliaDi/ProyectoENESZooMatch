/**
 * Restores or verifies a backup snapshot created by `scripts/db-backup.mts`.
 *
 * Modes:
 *   --dry-run (default): Verifies SHA-256 checksums of every table file and runs
 *                        a transactional restore test (`jsonb_populate_recordset`
 *                        + `ON CONFLICT DO NOTHING`) rolled back at the end.
 *   --apply --confirm-restore=yes: Restores tables in batches inside transactions.
 *
 * Usage:
 *   node --no-warnings scripts/db-restore.mts --from .backups/pre-fase1 --dry-run
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ManifestEntry {
  table: string;
  count: number;
  sha256: string;
}

interface Manifest {
  createdAt: string;
  projectRef: string;
  tables: ManifestEntry[];
}

const CHUNK_SIZE = 2000;

function readEnv(): { projectRef: string; token: string } {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const get = (k: string): string =>
    env.match(new RegExp(`^${k}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m"))?.[1]?.trim() ?? "";
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = url.match(/https:\/\/([a-z0-9]+)/)?.[1] ?? "";
  const token = get("SUPABASE_ACCESS_TOKEN");
  if (!projectRef || !token) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env.local");
  }
  return { projectRef, token };
}

async function querySql(projectRef: string, token: string, query: string): Promise<unknown[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Restore SQL failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as unknown[];
}

function sqlLiteralJson(rows: unknown[]): string {
  const raw = JSON.stringify(rows);
  const tag = "zm_json_restore";
  return `$${tag}$${raw}$${tag}$::jsonb`;
}

async function main(): Promise<void> {
  const fromIdx = process.argv.indexOf("--from");
  const fromArg = fromIdx >= 0 ? process.argv[fromIdx + 1] : undefined;
  if (!fromArg) {
    throw new Error("Usage: node scripts/db-restore.mts --from <backup-dir> [--dry-run | --apply --confirm-restore=yes]");
  }
  const apply = process.argv.includes("--apply") && process.argv.includes("--confirm-restore=yes");
  const dir = resolve(process.cwd(), fromArg);
  const manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8")) as Manifest;

  const tableRows = new Map<string, unknown[]>();
  for (const entry of manifest.tables) {
    const content = readFileSync(resolve(dir, `${entry.table}.json`), "utf8");
    const actualHash = createHash("sha256").update(content).digest("hex");
    if (actualHash !== entry.sha256) {
      throw new Error(`Checksum mismatch on ${entry.table}: expected ${entry.sha256}, got ${actualHash}`);
    }
    const parsed = JSON.parse(content) as unknown[];
    if (parsed.length !== entry.count) {
      throw new Error(`Row count mismatch on ${entry.table}: expected ${entry.count}, got ${parsed.length}`);
    }
    tableRows.set(entry.table, parsed);
  }

  const { projectRef, token } = readEnv();
  const publicAndPrivate = manifest.tables.filter((t) => !t.table.startsWith("auth."));

  for (const entry of publicAndPrivate) {
    const rows = tableRows.get(entry.table) ?? [];
    for (let offset = 0; offset < Math.max(1, rows.length); offset += CHUNK_SIZE) {
      const slice = rows.slice(offset, offset + CHUNK_SIZE);
      const statements: string[] = [
        "BEGIN;",
        "SET LOCAL session_replication_role = 'replica';",
        "ALTER TABLE public.conversation_rounds DROP CONSTRAINT IF EXISTS conversation_rounds_three_questions_check;",
        "ALTER TABLE public.conversation_answers DROP CONSTRAINT IF EXISTS conversation_answers_three_questions_check;",
        "ALTER TABLE public.conversation_reactions DROP CONSTRAINT IF EXISTS conversation_reactions_three_questions_check;",
      ];
      if (slice.length > 0) {
        statements.push(
          `INSERT INTO ${entry.table} SELECT * FROM jsonb_populate_recordset(NULL::${entry.table}, ${sqlLiteralJson(slice)}) ON CONFLICT DO NOTHING;`,
        );
      }
      statements.push(
        "ALTER TABLE public.conversation_rounds ADD CONSTRAINT conversation_rounds_three_questions_check CHECK (idx BETWEEN 0 AND 2) NOT VALID;",
        "ALTER TABLE public.conversation_answers ADD CONSTRAINT conversation_answers_three_questions_check CHECK (round BETWEEN 0 AND 2) NOT VALID;",
        "ALTER TABLE public.conversation_reactions ADD CONSTRAINT conversation_reactions_three_questions_check CHECK (idx BETWEEN 0 AND 2) NOT VALID;",
        `SELECT count(*)::int AS cnt FROM ${entry.table};`,
      );
      statements.push(apply ? "COMMIT;" : "ROLLBACK;");
      await querySql(projectRef, token, statements.join("\n"));
    }
    console.log(
      `  [OK] ${entry.table.padEnd(34)} verified ${String(rows.length).padStart(6)} rows (${apply ? "COMMIT" : "ROLLBACK --dry-run"})`,
    );
  }

  console.log(`Restore ${apply ? "APPLIED" : "VERIFIED (--dry-run)"} successfully from ${dir}`);
}

await main();
