#!/usr/bin/env node
// Applies the base migration and seed to a remote Supabase project through the
// Management API (no psql or Supabase CLI needed), then reloads PostgREST.
//
// Requires in .env.local (never committed):
//   SUPABASE_ACCESS_TOKEN=sbp_...   (Account → Access Tokens)
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
//
// Usage: npm run db:apply             → migration + seed on an EMPTY public schema
//        npm run db:apply -- --status  → table row counts only
// The base migration is not idempotent; on a populated schema the script
// stops instead of guessing. Reset the project first (deletes all data).
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const FILES = ["supabase/migrations/00000000000000_base.sql", "supabase/seed.sql"];

function readEnv() {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const get = (name) =>
    process.env[name] ?? text.match(new RegExp(`^${name}\\s*=\\s*(\\S+)`, "m"))?.[1];
  const url = get("NEXT_PUBLIC_SUPABASE_URL") ?? get("SUPABASE_URL");
  const token = get("SUPABASE_ACCESS_TOKEN");
  const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!token || !ref) {
    console.error("Falta SUPABASE_ACCESS_TOKEN o NEXT_PUBLIC_SUPABASE_URL en .env.local");
    process.exit(1);
  }
  return { token, ref };
}

const { token, ref } = readEnv();

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

const STATUS_SQL = `
  select table_name,
    (xpath('/row/c/text()', query_to_xml(
      format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int as rows
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by 1`;

const existing = await query(STATUS_SQL);
if (!process.argv.includes("--status") && existing.length > 0) {
  console.error(
    `El esquema public ya tiene ${existing.length} tablas; no se aplicó nada. ` +
      "Para reiniciar, borra el esquema desde el panel de Supabase y vuelve a correrlo.",
  );
  console.table(existing);
  process.exit(1);
}

if (!process.argv.includes("--status")) {
  for (const file of FILES) {
    await query(readFileSync(file, "utf8"));
    console.log(`aplicado ${file}`);
  }
  await query("notify pgrst, 'reload schema'");
}
console.table(await query(STATUS_SQL));
