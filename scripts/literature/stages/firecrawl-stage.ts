/**
 * Stage 2 (paid): license/instrument pages and open-access full-text
 * extraction with Firecrawl. Every page is untrusted data: injection-looking
 * text is logged as an anomaly and never acted on. Only hashes, short quotes
 * and extracted fields are stored; full text stays in the git-ignored cache.
 */
import { BudgetExceeded, CreditsExhausted, type FirecrawlClient } from "../clients/firecrawl.ts";
import { estimateSearchCost } from "../lib/budget.ts";
import type { CrawlerConfig } from "../lib/config.ts";
import { logAnomaly, markTask, type LiteratureDb } from "../lib/db.ts";
import {
  comparePasses,
  EXTRACTION_PROMPTS,
  extractionJsonSchema,
  normalizeExtraction,
  quoteFoundInSource,
} from "../lib/extraction.ts";
import { sha256 } from "../lib/http.ts";
import { detectInjection } from "../lib/injection.ts";
import type { LiteratureRecord } from "../lib/records.ts";
import type { RobotsGate } from "../lib/robots-cache.ts";
import type { Seeds } from "../lib/seeds.ts";
import { licenseQuotes, selectExtractionTargets, type ExtractionTarget } from "../lib/select.ts";
import { insertQuote, storeAgreement, storeExtraction, upsertPage } from "../lib/store.ts";

export interface StageContext {
  readonly db: LiteratureDb;
  readonly config: CrawlerConfig;
  readonly firecrawl: FirecrawlClient;
  readonly robots: RobotsGate;
  readonly runId: string;
  readonly dryRun: boolean;
}

export interface PlannedCall {
  readonly kind: "license_page" | "license_search" | "extraction";
  readonly url: string;
  readonly estimate: number;
  readonly status: string;
}

function flagInjection(ctx: StageContext, url: string, text: string): number {
  const findings = detectInjection(text);
  for (const f of findings) logAnomaly(ctx.db, ctx.runId, url, `prompt_injection:${f.pattern}`, f.snippet);
  return findings.length;
}

async function licensePage(ctx: StageContext, url: string, topic: string, keywords: RegExp): Promise<PlannedCall> {
  const key = `license:${url}`;
  const estimate = ctx.firecrawl.estimateScrape({ url });
  const allowed = await ctx.robots.allowed(url);
  if (!allowed) {
    upsertPage(ctx.db, { url, recordId: null, kind: "license", status: null, title: null, sha: null, robotsAllowed: false, note: "bloqueado por robots.txt o lista de bloqueo" });
    return { kind: "license_page", url, estimate: 0, status: "robots.txt lo impide" };
  }
  const result = await ctx.firecrawl.scrape({ url });
  if (ctx.dryRun) return { kind: "license_page", url, estimate, status: "estimado" };
  const anomalies = flagInjection(ctx, url, result.markdown);
  const quotes = licenseQuotes(result.markdown, keywords, ctx.config.compliance.maxQuoteChars, ctx.config.compliance.maxQuotesPerPage);
  for (const quote of quotes) insertQuote(ctx.db, url, topic, quote);
  upsertPage(ctx.db, {
    url, recordId: null, kind: "license", status: result.pageStatus, title: result.title,
    sha: result.markdown ? sha256(result.markdown) : null, robotsAllowed: true,
    note: `${quotes.length} citas; ${anomalies} anomalías`,
  });
  markTask(ctx.db, key, ctx.runId, result.pageStatus !== null && result.pageStatus < 400 ? "done" : "failed");
  return { kind: "license_page", url, estimate: result.creditsUsed, status: `HTTP ${result.pageStatus ?? result.status}, ${quotes.length} citas` };
}

async function extractTarget(ctx: StageContext, target: ExtractionTarget): Promise<PlannedCall> {
  const pdfPages = target.pdf ? ctx.config.firecrawl.pdfMaxPages : 0;
  const schema = extractionJsonSchema();
  const passes = [
    { pass: "a" as const, prompt: EXTRACTION_PROMPTS.a },
    { pass: "b" as const, prompt: EXTRACTION_PROMPTS.b },
  ];
  const estimate = passes.reduce((sum, p) => sum + ctx.firecrawl.estimateScrape({ url: target.url, json: { schema, prompt: p.prompt }, pdfPages }), 0);
  if (!(await ctx.robots.allowed(target.url))) {
    upsertPage(ctx.db, { url: target.url, recordId: target.recordId, kind: "fulltext", status: null, title: null, sha: null, robotsAllowed: false, note: "bloqueado por robots.txt" });
    return { kind: "extraction", url: target.url, estimate: 0, status: "robots.txt lo impide" };
  }
  if (ctx.dryRun) {
    for (const p of passes) await ctx.firecrawl.scrape({ url: target.url, json: { schema, prompt: p.prompt }, pdfPages });
    return { kind: "extraction", url: target.url, estimate, status: "estimado" };
  }
  // Resuming replays finished tasks from the on-disk cache at 0 credits, so
  // provenance checks can be recomputed without paying again.
  const key = `extract:${target.recordId}`;

  let spent = 0;
  let source = "";
  const results = [];
  for (const p of passes) {
    const r = await ctx.firecrawl.scrape({ url: target.url, json: { schema, prompt: p.prompt }, pdfPages });
    spent += r.creditsUsed;
    if (r.pageStatus !== null && r.pageStatus >= 400) {
      upsertPage(ctx.db, { url: target.url, recordId: target.recordId, kind: "fulltext", status: r.pageStatus, title: r.title, sha: null, robotsAllowed: true, note: "la página respondió con error" });
      markTask(ctx.db, key, ctx.runId, "failed");
      return { kind: "extraction", url: target.url, estimate: spent, status: `HTTP ${r.pageStatus}` };
    }
    if (!source) source = r.markdown;
    flagInjection(ctx, target.url, r.markdown);
    results.push({ pass: p.pass, extraction: normalizeExtraction(r.json, ctx.config.compliance.maxQuoteChars), markdown: r.markdown });
  }
  const corpus = results.map((r) => r.markdown).join("\n");
  for (const r of results) storeExtraction(ctx.db, target.recordId, target.url, r.pass, r.extraction, (q) => quoteFoundInSource(q, corpus));
  const [a, b] = results;
  if (a && b) {
    storeAgreement(ctx.db, target.recordId, target.url, comparePasses(a.extraction, b.extraction, ctx.config.extraction.numericFields, ctx.config.extraction.numericTolerance));
  }
  upsertPage(ctx.db, { url: target.url, recordId: target.recordId, kind: "fulltext", status: 200, title: null, sha: sha256(source), robotsAllowed: true, note: "extracción en dos pasadas" });
  markTask(ctx.db, key, ctx.runId, "done");
  return { kind: "extraction", url: target.url, estimate: spent, status: spent === 0 ? "extraído (2 pasadas, desde caché)" : "extraído (2 pasadas)" };
}

export async function runFirecrawlStage(ctx: StageContext, seeds: Seeds, records: readonly LiteratureRecord[]): Promise<{ calls: PlannedCall[]; stoppedBy: string | null }> {
  const calls: PlannedCall[] = [];
  const keywords = new RegExp(seeds.licenseKeywords, "i");
  try {
    for (const page of seeds.licensePages.slice(0, ctx.config.firecrawl.maxLicensePages)) {
      calls.push(await licensePage(ctx, page.url, page.topic, keywords));
    }
    for (const search of seeds.licenseSearches) {
      const hits = await ctx.firecrawl.search(search.query, search.includeDomains);
      const estimate = estimateSearchCost(ctx.config.firecrawl.costs, ctx.config.firecrawl.searchLimit);
      calls.push({ kind: "license_search", url: search.query, estimate, status: ctx.dryRun ? "estimado (+1 página)" : `${hits.length} resultados` });
      if (ctx.dryRun) calls.push({ kind: "license_page", url: `(primer resultado de: ${search.query})`, estimate: ctx.firecrawl.estimateScrape({ url: "" }), status: "estimado" });
      const first = hits.find((h) => !ctx.robots.isBlockedHost(h.url));
      if (first) calls.push(await licensePage(ctx, first.url, search.topic, keywords));
    }
    const pattern = new RegExp(ctx.config.extraction.relationalPattern, "i");
    for (const target of selectExtractionTargets(records, pattern, ctx.config.firecrawl.maxExtractionTargets)) {
      calls.push(await extractTarget(ctx, target));
    }
  } catch (error) {
    if (error instanceof BudgetExceeded || error instanceof CreditsExhausted) return { calls, stoppedBy: error.message };
    throw error;
  }
  return { calls, stoppedBy: null };
}
