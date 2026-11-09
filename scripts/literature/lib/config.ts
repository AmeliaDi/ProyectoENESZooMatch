import { readFileSync } from "node:fs";

import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

export const crawlerConfigSchema = z.object({
  version: z.string().min(1),
  userAgent: z.string().min(10),
  contactEmail: z.string().email(),
  paths: z.object({
    database: z.string().min(1),
    cacheDir: z.string().min(1),
    logDir: z.string().min(1),
    reviewQueue: z.string().min(1),
    recordsExport: z.string().min(1),
    report: z.string().min(1),
    evidenceDoc: z.string().min(1),
    seeds: z.string().min(1),
    /** Resolution verdict per cited DOI, produced by `scripts/literature/handles.mts` (ADR-049). */
    doiChecks: z.string().min(1),
  }),
  budget: z
    .object({ globalCredits: positiveInt, perRunCredits: positiveInt })
    .refine((b) => b.perRunCredits <= b.globalCredits, {
      message: "perRunCredits no puede superar globalCredits",
    }),
  http: z.object({
    timeoutMs: positiveInt,
    maxRetries: nonNegativeInt,
    backoffBaseMs: positiveInt,
    backoffMaxMs: positiveInt,
  }),
  rateLimits: z.record(z.string(), z.union([nonNegativeInt, z.string()])),
  firecrawl: z.object({
    baseUrl: z.string().url(),
    docsCheckedOn: z.string(),
    costs: z.object({
      scrapePage: positiveInt,
      jsonFormat: positiveInt,
      pdfPage: positiveInt,
      searchPer10Results: positiveInt,
    }),
    pdfMaxPages: positiveInt,
    searchLimit: positiveInt,
    maxExtractionTargets: nonNegativeInt,
    maxLicensePages: nonNegativeInt,
    storeInCache: z.boolean(),
  }),
  compliance: z.object({
    respectRobotsTxt: z.literal(true),
    robotsAgents: z.array(z.string().min(1)).min(1),
    blockedHosts: z.array(z.string().min(1)),
    stopOnStatus: z.array(positiveInt),
    maxQuoteChars: positiveInt,
    maxQuotesPerPage: positiveInt,
  }),
  extraction: z.object({
    relationalPattern: z.string().min(1),
    numericFields: z.array(z.string().min(1)).min(1),
    numericTolerance: z.number().nonnegative(),
  }),
});

export type CrawlerConfig = z.infer<typeof crawlerConfigSchema>;

export function parseCrawlerConfig(raw: unknown): CrawlerConfig {
  return crawlerConfigSchema.parse(raw);
}

export function loadCrawlerConfig(path = "data/literature/crawler-config.json"): CrawlerConfig {
  return parseCrawlerConfig(JSON.parse(readFileSync(path, "utf8")));
}

/** Minimum interval in ms between two requests to `source`. */
export function rateLimitFor(config: CrawlerConfig, source: string): number {
  const value = config.rateLimits[source];
  return typeof value === "number" ? value : 1000;
}
