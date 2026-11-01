/**
 * Firecrawl v2 over plain fetch (API v2, docs checked 2026-11-01; no SDK).
 * The key is read from the environment and only ever placed in the
 * Authorization header, which the HTTP layer never logs.
 */
import {
  checkBudget,
  estimateScrapeCost,
  estimateSearchCost,
  recordSpend,
  type BudgetState,
} from "../lib/budget.ts";
import type { CrawlerConfig } from "../lib/config.ts";
import type { HttpClient } from "../lib/http.ts";

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

export class BudgetExceeded extends Error {
  readonly reason: string;
  readonly estimate: number;

  constructor(reason: string, estimate: number) {
    super(`Presupuesto de Firecrawl: ${reason} (estimado ${estimate})`);
    this.reason = reason;
    this.estimate = estimate;
  }
}

export class CreditsExhausted extends Error {}

export interface ScrapeRequest {
  readonly url: string;
  readonly json?: { readonly schema: Record<string, unknown>; readonly prompt: string };
  readonly pdfPages?: number;
}

export interface ScrapeResult {
  readonly status: number;
  readonly pageStatus: number | null;
  readonly markdown: string;
  readonly json: unknown;
  readonly title: string | null;
  readonly creditsUsed: number;
  readonly fromCache: boolean;
}

/** Credits actually billed, from `metadata.creditsUsed` / `creditsUsed`, else the estimate. */
export function creditsFromResponse(status: number, text: string, estimate: number): number {
  if (status === 0 || status === 402 || status === 429 || status >= 500) return 0;
  try {
    const body = asObj(JSON.parse(text));
    const meta = asObj(asObj(body["data"])["metadata"]);
    const reported = meta["creditsUsed"] ?? body["creditsUsed"];
    if (typeof reported === "number" && Number.isFinite(reported)) return reported;
    return body["success"] === true ? estimate : 0;
  } catch {
    return 0;
  }
}

export class FirecrawlClient {
  private state: BudgetState;
  private readonly http: HttpClient;
  private readonly config: CrawlerConfig;
  private readonly apiKey: string | null;
  private readonly dryRun: boolean;

  constructor(http: HttpClient, config: CrawlerConfig, apiKey: string | null, spentGlobal: number, dryRun: boolean) {
    this.http = http;
    this.config = config;
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.state = {
      perRunCap: config.budget.perRunCredits,
      globalCap: config.budget.globalCredits,
      spentThisRun: 0,
      spentGlobal,
    };
  }

  get budget(): BudgetState {
    return this.state;
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) throw new Error("FIRECRAWL_API_KEY no está definida en el entorno");
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private reserve(estimate: number): void {
    const decision = checkBudget(this.state, estimate);
    if (!decision.allowed) throw new BudgetExceeded(decision.reason, estimate);
  }

  estimateScrape(request: ScrapeRequest): number {
    return estimateScrapeCost(this.config.firecrawl.costs, { json: request.json !== undefined, pdfPages: request.pdfPages ?? 0 });
  }

  async remainingCredits(): Promise<number | null> {
    if (this.dryRun || !this.apiKey) return null;
    const result = await this.http.request({
      source: "firecrawl", endpoint: "team/credit-usage", url: `${this.config.firecrawl.baseUrl}/team/credit-usage`,
      headers: this.headers(), useCache: false,
    });
    const remaining = asObj(asObj(safeParse(result.text))["data"])["remainingCredits"];
    return typeof remaining === "number" ? remaining : null;
  }

  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    const estimate = this.estimateScrape(request);
    this.reserve(estimate);
    const formats: unknown[] = ["markdown"];
    if (request.json) formats.push({ type: "json", schema: request.json.schema, prompt: request.json.prompt });
    const body: Json = {
      url: request.url,
      formats,
      onlyMainContent: true,
      storeInCache: this.config.firecrawl.storeInCache,
      blockAds: true,
      ...(request.pdfPages ? { parsers: [{ type: "pdf", mode: "fast", maxPages: request.pdfPages }] } : {}),
    };
    if (this.dryRun) {
      this.state = recordSpend(this.state, estimate);
      return { status: 0, pageStatus: null, markdown: "", json: null, title: null, creditsUsed: estimate, fromCache: false };
    }
    const result = await this.http.request({
      source: "firecrawl", endpoint: "scrape", url: `${this.config.firecrawl.baseUrl}/scrape`, method: "POST",
      body, headers: this.headers(), creditsOf: (status, text) => creditsFromResponse(status, text, estimate),
    });
    if (result.status === 402) throw new CreditsExhausted("Firecrawl respondió 402: créditos agotados");
    const credits = result.fromCache ? 0 : creditsFromResponse(result.status, result.text, estimate);
    this.state = recordSpend(this.state, credits);
    const data = asObj(asObj(safeParse(result.text))["data"]);
    const meta = asObj(data["metadata"]);
    return {
      status: result.status,
      pageStatus: typeof meta["statusCode"] === "number" ? meta["statusCode"] : null,
      markdown: typeof data["markdown"] === "string" ? data["markdown"] : "",
      json: data["json"] ?? null,
      title: typeof meta["title"] === "string" ? meta["title"] : null,
      creditsUsed: credits,
      fromCache: result.fromCache,
    };
  }

  async search(query: string, includeDomains: readonly string[]): Promise<Array<{ url: string; title: string }>> {
    const limit = this.config.firecrawl.searchLimit;
    const estimate = estimateSearchCost(this.config.firecrawl.costs, limit);
    this.reserve(estimate);
    if (this.dryRun) {
      this.state = recordSpend(this.state, estimate);
      return [];
    }
    const body = { query, limit, ...(includeDomains.length ? { includeDomains } : {}) };
    const result = await this.http.request({
      source: "firecrawl", endpoint: "search", url: `${this.config.firecrawl.baseUrl}/search`, method: "POST",
      body, headers: this.headers(), creditsOf: (status, text) => creditsFromResponse(status, text, estimate),
    });
    if (result.status === 402) throw new CreditsExhausted("Firecrawl respondió 402: créditos agotados");
    this.state = recordSpend(this.state, result.fromCache ? 0 : creditsFromResponse(result.status, result.text, estimate));
    const web = asObj(asObj(safeParse(result.text))["data"])["web"];
    return (Array.isArray(web) ? web : []).flatMap((row) => {
      const r = asObj(row);
      return typeof r["url"] === "string" ? [{ url: r["url"], title: typeof r["title"] === "string" ? r["title"] : "" }] : [];
    });
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
