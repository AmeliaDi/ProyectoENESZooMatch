/**
 * Exports a complete JSON snapshot of all ZooMatch tables in `auth`, `public`,
 * and `private` to an out-of-git backup directory (`.backups/<label>`).
 *
 * Usage:
 *   node --no-warnings scripts/db-backup.mts --out .backups/pre-fase1
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TABLES = [
  { schema: "auth", name: "users", orderBy: "id" },
  { schema: "public", name: "profiles", orderBy: "user_id" },
  { schema: "public", name: "quiz_responses", orderBy: "user_id, item_id" },
  { schema: "public", name: "matches", orderBy: "user_a, user_b, track" },
  { schema: "public", name: "notifications", orderBy: "id" },
  { schema: "public", name: "chat_pins", orderBy: "user_id" },
  { schema: "public", name: "chat_security_events", orderBy: "id" },
  { schema: "public", name: "chat_interests", orderBy: "from_user, to_user, track" },
  { schema: "public", name: "conversations", orderBy: "id" },
  { schema: "public", name: "conversation_rounds", orderBy: "conversation_id, idx" },
  { schema: "public", name: "conversation_answers", orderBy: "conversation_id, round, author" },
  { schema: "public", name: "conversation_messages", orderBy: "id" },
  { schema: "public", name: "conversation_reactions", orderBy: "conversation_id, target_kind, target_key, author" },
  { schema: "public", name: "chat_feedback_daily", orderBy: "day, track" },
  { schema: "public", name: "chat_blocks", orderBy: "blocker, blocked" },
  { schema: "public", name: "chat_closures", orderBy: "user_a, user_b, track" },
  { schema: "public", name: "chat_reports", orderBy: "id" },
  { schema: "public", name: "chat_report_audit", orderBy: "id" },
  { schema: "public", name: "admin_credentials", orderBy: "user_id" },
  { schema: "public", name: "admin_audit", orderBy: "id" },
  { schema: "private", name: "access_guard", orderBy: "kind, bucket" },
] as const;

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
    throw new Error(`Backup query failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as unknown[];
}

async function main(): Promise<void> {
  const outIdx = process.argv.indexOf("--out");
  const outArg = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(process.cwd(), outArg ?? `.backups/snapshot-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const { projectRef, token } = readEnv();
  const manifest: {
    createdAt: string;
    projectRef: string;
    tables: Array<{ table: string; count: number; sha256: string }>;
  } = {
    createdAt: new Date().toISOString(),
    projectRef,
    tables: [],
  };

  for (const t of TABLES) {
    const fullName = `${t.schema}.${t.name}`;
    const rows = await querySql(
      projectRef,
      token,
      `SELECT row_to_json(r) AS row FROM (SELECT * FROM ${fullName}) r;`,
    );
    const unwrapped = rows.map((entry) => (entry as { row: unknown }).row);
    const content = JSON.stringify(unwrapped, null, 2) + "\n";
    const sha256 = createHash("sha256").update(content).digest("hex");
    writeFileSync(resolve(outDir, `${fullName}.json`), content, "utf8");
    manifest.tables.push({ table: fullName, count: unwrapped.length, sha256 });
  }

  writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Backup written to ${outDir}`);
  for (const entry of manifest.tables) {
    console.log(`  ${entry.table.padEnd(34)} rows=${String(entry.count).padStart(6)} sha256=${entry.sha256.slice(0, 12)}…`);
  }
}

await main();
