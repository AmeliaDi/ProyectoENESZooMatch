import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { rateLimitFor, type CrawlerConfig } from "./config.ts";
import type { LiteratureDb } from "./db.ts";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Stable cache key: method + URL + canonical body (no credentials). */
export function cacheKey(method: string, url: string, body?: unknown): string {
  return sha256(`${method} ${url} ${body === undefined ? "" : JSON.stringify(body)}`);
}

export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** attempt);
}

export function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface HttpResult {
  readonly status: number;
  readonly text: string;
  readonly fromCache: boolean;
}

interface CachedEntry {
  readonly status: number;
  readonly text: string;
  readonly savedAt: string;
}

export interface RequestOptions {
  readonly source: string;
  readonly endpoint: string;
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** Credits this call costs if it returns a document (Firecrawl only). */
  readonly creditsOf?: (status: number, text: string) => number;
  readonly useCache?: boolean;
}

/**
 * Rate-limited, cached, retrying HTTP client that logs every call (never the
 * Authorization header) to `literature.db`.
 */
export class HttpClient {
  private readonly lastCall = new Map<string, number>();
  private readonly config: CrawlerConfig;
  private readonly db: LiteratureDb;
  private readonly runId: string;

  constructor(config: CrawlerConfig, db: LiteratureDb, runId: string) {
    this.config = config;
    this.db = db;
    this.runId = runId;
    mkdirSync(config.paths.cacheDir, { recursive: true });
  }

  private cachePath(key: string): string {
    return join(this.config.paths.cacheDir, `${key}.json`);
  }

  readCache(key: string): CachedEntry | null {
    const path = this.cachePath(key);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as CachedEntry;
  }

  private async throttle(source: string): Promise<void> {
    const minGap = rateLimitFor(this.config, source);
    const last = this.lastCall.get(source) ?? 0;
    const wait = last + minGap - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCall.set(source, Date.now());
  }

  private log(opts: RequestOptions, key: string, status: number | null, credits: number, fromCache: boolean, text: string | null, error: string | null): void {
    this.db.prepare(
      "INSERT INTO calls(run_id, source, endpoint, url, cache_key, status, credits, from_cache, content_sha256, called_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      this.runId, opts.source, opts.endpoint, opts.url, key, status, credits, fromCache ? 1 : 0,
      text === null ? null : sha256(text), new Date().toISOString(), error,
    );
  }

  async request(opts: RequestOptions): Promise<HttpResult> {
    const method = opts.method ?? "GET";
    const key = cacheKey(method, opts.url, opts.body);
    if (opts.useCache !== false) {
      const cached = this.readCache(key);
      if (cached) {
        this.log(opts, key, cached.status, 0, true, cached.text, null);
        return { status: cached.status, text: cached.text, fromCache: true };
      }
    }
    const { maxRetries, backoffBaseMs, backoffMaxMs, timeoutMs } = this.config.http;
    let lastError = "sin respuesta";
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await this.throttle(opts.source);
      try {
        const init: RequestInit = {
          method,
          headers: { "User-Agent": this.config.userAgent, Accept: "application/json, text/plain, */*", ...opts.headers },
          signal: AbortSignal.timeout(timeoutMs),
        };
        if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
        const response = await fetch(opts.url, init);
        const text = await response.text();
        const credits = opts.creditsOf ? opts.creditsOf(response.status, text) : 0;
        if (isRetryable(response.status) && attempt < maxRetries) {
          this.log(opts, key, response.status, credits, false, null, `retry ${attempt + 1}`);
          const retryAfter = Number(response.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffDelay(attempt, backoffBaseMs, backoffMaxMs));
          continue;
        }
        this.log(opts, key, response.status, credits, false, text, response.ok ? null : `HTTP ${response.status}`);
        if (response.ok) {
          const entry: CachedEntry = { status: response.status, text, savedAt: new Date().toISOString() };
          writeFileSync(this.cachePath(key), JSON.stringify(entry));
        }
        return { status: response.status, text, fromCache: false };
      } catch (error) {
        lastError = error instanceof Error ? error.name : "error";
        if (attempt === maxRetries) break;
        await sleep(backoffDelay(attempt, backoffBaseMs, backoffMaxMs));
      }
    }
    this.log(opts, key, null, 0, false, null, lastError);
    return { status: 0, text: "", fromCache: false };
  }

  async getJson<T>(source: string, endpoint: string, url: string): Promise<T | null> {
    const result = await this.request({ source, endpoint, url });
    if (result.status < 200 || result.status >= 300) return null;
    try {
      return JSON.parse(result.text) as T;
    } catch {
      return null;
    }
  }
}
