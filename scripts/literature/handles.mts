/**
 * Resolves every DOI the project cites and writes `data/literature/doi-checks.json`.
 *   node --no-warnings scripts/literature/handles.mts            # EVIDENCIA.md + las fichas
 *   node --no-warnings scripts/literature/handles.mts --cards    # solo las citas de las fichas
 *   node --no-warnings scripts/literature/handles.mts --doi 10.1177/0192513X20985862 ...
 *                                                                  # los DOI que la auditoría cazó como 404
 * No gasta créditos de Firecrawl y no toca la base de datos más que para el log
 * de llamadas (ADR-049). Sale con código 1 si alguna cita que licencia una
 * función de puntaje no resuelve, comprobada o no.
 */
import { readFileSync } from "node:fs";

import { HttpClient } from "./lib/http.ts";
import { loadCrawlerConfig } from "./lib/config.ts";
import { openDb } from "./lib/db.ts";
import { extractDois, normalizeDoi } from "./lib/records.ts";
import { loadRegistry, mergeChecks, saveRegistry, unresolvedDois } from "./lib/handles.ts";
import { resolveDois } from "./stages/handles.ts";

const argv = process.argv.slice(2);
const cardsOnly = argv.includes("--cards");
/** DOIs named on the command line are the only ones resolved: `--doi` is for checking a specific citation. */
const explicitDois: string[] = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] !== "--doi") continue;
  const raw = argv[i + 1];
  const doi = raw === undefined ? null : normalizeDoi(raw);
  if (doi === null) {
    console.error(`--doi sin valor o con un DOI mal formado: ${JSON.stringify(raw ?? "")}. Nada se consultó.`);
    process.exit(1);
  }
  explicitDois.push(doi);
  i += 1;
}
const config = loadCrawlerConfig();
const runId = `handles-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const candidates = JSON.parse(readFileSync("data/literature/layer-candidates.json", "utf8")) as {
  candidates: Array<{ evidencia: Array<{ doi: string | null }> }>;
};
const citedByCards = [...new Set(
  candidates.candidates
    .flatMap((c) => c.evidencia.map((s) => s.doi))
    .map((doi) => (doi === null ? null : normalizeDoi(doi)))
    .filter((doi): doi is string => doi !== null),
)].sort();

const evidenceDois = extractDois(readFileSync(config.paths.evidenceDoc, "utf8"));
const dois = explicitDois.length > 0
  ? [...new Set(explicitDois)].sort()
  : cardsOnly
    ? citedByCards
    : [...new Set([...evidenceDois, ...citedByCards])].sort();

const db = openDb(config.paths.database);
db.prepare("INSERT INTO runs(id, started_at, mode, status) VALUES (?, ?, 'handles', 'running')").run(runId, new Date().toISOString());
const http = new HttpClient(config, db, runId);

console.log(`Resolviendo ${dois.length} DOI contra https://doi.org/api/handles/ (0 créditos)`);
const stage = await resolveDois(http, dois);
const registry = mergeChecks(loadRegistry(config.paths.doiChecks), stage.checks);
saveRegistry(config.paths.doiChecks, registry, new Date().toISOString().slice(0, 10));
db.prepare("UPDATE runs SET finished_at = ?, status = 'ok' WHERE id = ?").run(new Date().toISOString(), runId);
db.close();

console.log(
  `Estado: ${stage.porEstado.resuelve} resuelve · ${stage.porEstado.no_resuelve} no resuelve · ` +
    `${stage.porEstado.sin_comprobar} sin comprobar (red o bloqueo)`,
);
const muertos = Object.entries(registry).filter(([, c]) => c.estado === "no_resuelve").map(([doi]) => doi);
if (muertos.length > 0) {
  console.log(`\nHANDLES QUE NO RESUELVEN (${muertos.length}):`);
  console.log(muertos.map((d) => `  ${d}`).join("\n"));
}
const deudas = unresolvedDois(citedByCards, registry);
console.log(`\n${config.paths.doiChecks} escrito.`);
if (deudas.length === 0) {
  console.log(`las ${citedByCards.length} citas de las fichas resuelven`);
} else {
  console.log(`CITAS DE FICHA SIN RESOLVER (${deudas.length}):`);
  console.log(deudas.map((d) => `  ${d.doi} — ${d.motivo}`).join("\n"));
  process.exit(1);
}
