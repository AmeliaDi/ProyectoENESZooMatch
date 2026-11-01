import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type LiteratureDb = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  mode TEXT NOT NULL,
  estimated_credits INTEGER NOT NULL DEFAULT 0,
  spent_credits INTEGER NOT NULL DEFAULT 0,
  credits_before INTEGER,
  credits_after INTEGER,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  url TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  status INTEGER,
  credits REAL NOT NULL DEFAULT 0,
  from_cache INTEGER NOT NULL DEFAULT 0,
  content_sha256 TEXT,
  called_at TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS calls_run ON calls(run_id);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  doi TEXT,
  title TEXT,
  authors TEXT,
  year INTEGER,
  venue TEXT,
  record_type TEXT NOT NULL,
  seed_origin TEXT NOT NULL,
  topic TEXT,
  is_oa INTEGER,
  oa_url TEXT,
  oa_license TEXT,
  pmcid TEXT,
  s2_id TEXT,
  openalex_id TEXT,
  citations INTEGER,
  abstract_available INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'pendiente_humana',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  url TEXT PRIMARY KEY,
  record_id TEXT,
  kind TEXT NOT NULL,
  status INTEGER,
  title TEXT,
  content_sha256 TEXT,
  robots_allowed INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_url TEXT NOT NULL,
  topic TEXT NOT NULL,
  quote TEXT NOT NULL,
  verification TEXT NOT NULL DEFAULT 'pendiente_humana',
  UNIQUE(page_url, quote)
);
CREATE TABLE IF NOT EXISTS extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  pass TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT,
  quote TEXT,
  location TEXT,
  quote_in_source INTEGER NOT NULL,
  agreement TEXT,
  verification TEXT NOT NULL DEFAULT 'pendiente_humana',
  extracted_at TEXT NOT NULL,
  UNIQUE(record_id, source_url, pass, field)
);
CREATE TABLE IF NOT EXISTS anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  detected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function openDb(path: string): LiteratureDb {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

export function totalSpentCredits(db: LiteratureDb): number {
  const row = db.prepare("SELECT COALESCE(SUM(credits), 0) AS total FROM calls WHERE source = 'firecrawl'").get();
  return Number(row?.["total"] ?? 0);
}

export function taskDone(db: LiteratureDb, key: string): boolean {
  const row = db.prepare("SELECT status FROM tasks WHERE key = ?").get(key);
  return row?.["status"] === "done";
}

export function markTask(db: LiteratureDb, key: string, runId: string, status: "done" | "failed"): void {
  db.prepare(
    "INSERT INTO tasks(key, run_id, status, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET run_id = excluded.run_id, status = excluded.status, updated_at = excluded.updated_at",
  ).run(key, runId, status, new Date().toISOString());
}

export function logAnomaly(db: LiteratureDb, runId: string, url: string, kind: string, detail: string): void {
  db.prepare("INSERT INTO anomalies(run_id, url, kind, detail, detected_at) VALUES (?, ?, ?, ?, ?)").run(
    runId, url, kind, detail.slice(0, 500), new Date().toISOString(),
  );
}
