import type { CrawlerConfig } from "./config.ts";
import type { HttpClient } from "./http.ts";
import { isAllowed, parseRobots, type RobotsRules } from "./robots.ts";

/** Fetches robots.txt once per origin. A 4xx means "no rules"; network errors deny. */
export class RobotsGate {
  private readonly cache = new Map<string, RobotsRules | "deny">();
  private readonly http: HttpClient;
  private readonly config: CrawlerConfig;

  constructor(http: HttpClient, config: CrawlerConfig) {
    this.http = http;
    this.config = config;
  }

  isBlockedHost(url: string): boolean {
    const host = new URL(url).hostname.toLowerCase();
    return this.config.compliance.blockedHosts.some((blocked) => host.includes(blocked));
  }

  async allowed(url: string): Promise<boolean> {
    if (this.isBlockedHost(url)) return false;
    const parsed = new URL(url);
    let rules = this.cache.get(parsed.origin);
    if (!rules) {
      const result = await this.http.request({ source: "robots", endpoint: "robots.txt", url: `${parsed.origin}/robots.txt` });
      if (result.status >= 200 && result.status < 300) rules = parseRobots(result.text);
      else if (result.status >= 400 && result.status < 500) rules = parseRobots("");
      else rules = "deny";
      this.cache.set(parsed.origin, rules);
    }
    if (rules === "deny") return false;
    return isAllowed(rules, this.config.compliance.robotsAgents, `${parsed.pathname}${parsed.search}`);
  }
}
