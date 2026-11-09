/**
 * Literature pipeline CLI.
 *   node scripts/literature/run.mts                 dry run (default): free APIs run, Firecrawl cost only estimated
 *   node scripts/literature/run.mts --run           real run within the credit caps in crawler-config.json
 *   node scripts/literature/run.mts --run --resume  skips Firecrawl tasks already marked done
 *   --skip-firecrawl                                 discovery + export only
 * Resume is always safe: tasks are keyed and cached; --resume only documents intent.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FirecrawlClient } from "./clients/firecrawl.ts";
import { loadCrawlerConfig } from "./lib/config.ts";
import { openDb, totalSpentCredits } from "./lib/db.ts";
import { loadEnvFile } from "./lib/env.ts";
import { HttpClient } from "./lib/http.ts";
import { RobotsGate } from "./lib/robots-cache.ts";
import { loadSeeds } from "./lib/seeds.ts";
import { discover } from "./stages/discover.ts";
import { exportOutputs } from "./stages/export.ts";
import { runFirecrawlStage } from "./stages/firecrawl-stage.ts";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--run");
const skipFirecrawl = args.has("--skip-firecrawl");

loadEnvFile(".env.local");
const config = loadCrawlerConfig();
const seeds = loadSeeds(config.paths.seeds);
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}${dryRun ? "-dry" : ""}`;

// A dry run writes to a throwaway database so it never pollutes the real log.
const dryDir = join(tmpdir(), `zoomatch-lit-${process.pid}`);
const dbPath = dryRun ? join(dryDir, "literature.db") : config.paths.database;
if (dryRun) mkdirSync(dryDir, { recursive: true });
const db = openDb(dbPath);
const realDb = dryRun ? openDb(config.paths.database) : db;
const spentBefore = totalSpentCredits(realDb);

db.prepare("INSERT INTO runs(id, started_at, mode, status) VALUES (?, ?, ?, 'running')").run(runId, new Date().toISOString(), dryRun ? "dry-run" : "run");

const http = new HttpClient(config, db, runId);
const apiKey = process.env["FIRECRAWL_API_KEY"]?.trim() || null;
if (!dryRun && !skipFirecrawl && !apiKey) {
  console.error("Falta FIRECRAWL_API_KEY en el entorno (.env.local). Nada se gastó.");
  process.exit(1);
}
const firecrawl = new FirecrawlClient(http, config, apiKey, spentBefore, dryRun);
const robots = new RobotsGate(http, config);

console.log(`Corrida ${runId} · modo ${dryRun ? "DRY-RUN (sin gastar créditos)" : "REAL"}`);
console.log(`Créditos registrados antes: ${spentBefore} / tope global ${config.budget.globalCredits}; tope por corrida ${config.budget.perRunCredits}`);

const creditsBefore = await firecrawl.remainingCredits();
const { records, log } = await discover(http, db, config, seeds, runId);
console.log(`Descubrimiento: ${records.length} registros (APIs abiertas, 0 créditos)`);
if (log.sinHandle.length > 0) {
  console.log(`Handle inexistente (doi-checks.json): ${log.sinHandle.length} semillas descartadas — ${log.sinHandle.map((d) => d.doi).join(", ")}`);
}

const stage = skipFirecrawl
  ? { calls: [], stoppedBy: "omitido (--skip-firecrawl)" }
  : await runFirecrawlStage({ db, config, firecrawl, robots, runId, dryRun }, seeds, records);
const creditsAfter = await firecrawl.remainingCredits();
const spent = firecrawl.budget.spentThisRun;

db.prepare("UPDATE runs SET finished_at = ?, estimated_credits = ?, spent_credits = ?, credits_before = ?, credits_after = ?, status = ? WHERE id = ?").run(
  new Date().toISOString(), dryRun ? spent : 0, dryRun ? 0 : spent, creditsBefore, creditsAfter, stage.stoppedBy ? "stopped" : "ok", runId,
);

const anomalies = db.prepare("SELECT kind, url, detail FROM anomalies WHERE run_id = ?").all(runId);
const report = {
  runId,
  mode: dryRun ? "dry-run" : "run",
  firecrawlApi: `v2 (docs ${config.firecrawl.docsCheckedOn})`,
  records: records.length,
  recordsByOrigin: countBy(records.map((r) => r.seedOrigin.split(":")[0] ?? r.seedOrigin)),
  recordsOpenAccess: records.filter((r) => r.isOa).length,
  namedStudies: log.named,
  citasSinHandle: log.sinHandle,
  firecrawlCalls: stage.calls,
  creditsEstimatedOrSpent: spent,
  creditsRemainingBefore: creditsBefore,
  creditsRemainingAfter: creditsAfter,
  stoppedBy: stage.stoppedBy,
  anomalies,
};

if (dryRun) {
  console.log(JSON.stringify(report, null, 2));
  db.close();
  realDb.close();
  rmSync(dryDir, { recursive: true, force: true });
} else {
  const exported = exportOutputs(db, config);
  writeFileSync(config.paths.report, `${JSON.stringify({ ...report, exported }, null, 2)}\n`);
  console.log(`Gastados ${spent} créditos. Reporte en ${config.paths.report}; cola de revisión: ${exported.reviewRows} filas.`);
  db.close();
}

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
