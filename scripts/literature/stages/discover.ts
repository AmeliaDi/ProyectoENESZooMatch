/**
 * Stage 1 (free): resolve seed DOIs and named studies, run topic searches and
 * enrich every record with Crossref, OpenAlex, Unpaywall, Europe PMC and
 * Semantic Scholar. No Firecrawl credits are spent here.
 */
import { readFileSync } from "node:fs";

import {
  arxivSearch,
  crossref,
  europepmc,
  europepmcSearch,
  openalex,
  openalexSearch,
  psyarxivSearch,
  semanticScholar,
  unpaywall,
  type SearchHit,
} from "../clients/open-apis.ts";
import type { CrawlerConfig } from "../lib/config.ts";
import { markTask, taskDone, type LiteratureDb } from "../lib/db.ts";
import type { HttpClient } from "../lib/http.ts";
import { emptyRecord, extractDois, mergeRecord, recordIdForDoi, type LiteratureRecord } from "../lib/records.ts";
import type { Seeds } from "../lib/seeds.ts";
import { pickNamedMatch } from "../lib/select.ts";
import { upsertRecord } from "../lib/store.ts";

const NAMED_MIN_SCORE = 0.6;

export interface DiscoveryLog {
  readonly named: Array<{ label: string; status: string; title: string | null; doi: string | null; score: number }>;
}

async function enrich(http: HttpClient, config: CrawlerConfig, record: LiteratureRecord): Promise<LiteratureRecord> {
  if (!record.doi) return record;
  const doi = record.doi;
  let r = record;
  r = mergeRecord(r, await crossref(http, config, doi), "crossref");
  r = mergeRecord(r, await openalex(http, config, doi), "openalex");
  r = mergeRecord(r, await unpaywall(http, config, doi), "unpaywall");
  r = mergeRecord(r, await europepmc(http, doi), "europepmc");
  r = mergeRecord(r, await semanticScholar(http, doi), "semanticscholar");
  return r;
}

function fromHit(hit: SearchHit, seedOrigin: string, topic: string): LiteratureRecord {
  const id = hit.doi ? recordIdForDoi(hit.doi) : hit.id;
  const base = emptyRecord(id, seedOrigin, hit.recordType);
  return mergeRecord(base, { doi: hit.doi, title: hit.title, year: hit.year, topic, ...(hit.url ? { oaUrl: hit.url, isOa: true } : {}) }, hit.source);
}

export async function discover(
  http: HttpClient,
  db: LiteratureDb,
  config: CrawlerConfig,
  seeds: Seeds,
  runId: string,
): Promise<{ records: LiteratureRecord[]; log: DiscoveryLog }> {
  const byId = new Map<string, LiteratureRecord>();
  const add = (record: LiteratureRecord) => {
    if (byId.size >= seeds.maxRecords && !byId.has(record.id)) return;
    const existing = byId.get(record.id);
    byId.set(record.id, existing ? mergeRecord(existing, record, record.sources[0] ?? "seed") : record);
  };

  for (const doi of extractDois(readFileSync(config.paths.evidenceDoc, "utf8"))) {
    add(mergeRecord(emptyRecord(recordIdForDoi(doi), "EVIDENCIA.md", "article"), { doi }, "seed"));
  }

  const log: DiscoveryLog = { named: [] };
  for (const study of seeds.namedStudies) {
    const hits = await openalexSearch(http, config, study.query, 8);
    const match = pickNamedMatch(study.query, study.year, study.author, hits, NAMED_MIN_SCORE);
    log.named.push({ label: study.label, status: match.reason, title: match.hit?.title ?? null, doi: match.hit?.doi ?? null, score: match.score });
    if (match.hit) add(fromHit(match.hit, `investigacion:${study.label}`, study.topic));
  }

  for (const s of seeds.topicSearches) {
    for (const hit of await openalexSearch(http, config, s.query, s.limit)) add(fromHit(hit, `busqueda:${s.topic}`, s.topic));
  }
  for (const s of seeds.openAccessSearches) {
    for (const hit of await europepmcSearch(http, s.query, s.limit)) add(fromHit(hit, `busqueda_oa:${s.topic}`, s.topic));
  }
  for (const s of seeds.preprintSearches) {
    for (const hit of await psyarxivSearch(http, s.titleWord, s.limit)) add(fromHit(hit, `psyarxiv:${s.topic}`, s.topic));
  }
  for (const s of seeds.arxivSearches) {
    for (const hit of await arxivSearch(http, s.query, s.limit)) add(fromHit(hit, `arxiv:${s.topic}`, s.topic));
  }

  const records: LiteratureRecord[] = [];
  for (const record of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `enrich:${record.id}`;
    const enriched = await enrich(http, config, record);
    upsertRecord(db, enriched);
    if (!taskDone(db, key)) markTask(db, key, runId, "done");
    records.push(enriched);
  }
  return { records, log };
}
