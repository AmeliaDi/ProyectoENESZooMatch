/**
 * Minimal robots.txt evaluator (RFC 9309): groups by user-agent, longest
 * matching rule wins, `Allow` wins ties, `*` and `$` wildcards supported.
 */

interface Rule {
  readonly allow: boolean;
  readonly pattern: string;
}

interface Group {
  readonly agents: string[];
  readonly rules: Rule[];
}

export interface RobotsRules {
  readonly groups: readonly Group[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // An empty Disallow means "allow everything" and adds no rule.
      if (value === "") continue;
      current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  return { groups };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function selectGroup(rules: RobotsRules, agents: readonly string[]): Group | null {
  for (const agent of agents) {
    const wanted = agent.toLowerCase();
    if (wanted === "*") continue;
    const match = rules.groups.find((g) => g.agents.some((a) => a !== "*" && wanted.includes(a)));
    if (match) return match;
  }
  return rules.groups.find((g) => g.agents.includes("*")) ?? null;
}

/** `pathWithQuery` is the URL path plus search, e.g. `/articles/PMC1/?x=1`. */
export function isAllowed(rules: RobotsRules, agents: readonly string[], pathWithQuery: string): boolean {
  const group = selectGroup(rules, agents);
  if (!group) return true;
  let best: Rule | null = null;
  for (const rule of group.rules) {
    if (!patternToRegExp(rule.pattern).test(pathWithQuery)) continue;
    const longer = !best || rule.pattern.length > best.pattern.length;
    const tieAllow = best !== null && rule.pattern.length === best.pattern.length && rule.allow;
    if (longer || tieAllow) best = rule;
  }
  return best ? best.allow : true;
}

/** Crawl-delay for the selected group, in seconds, or null. */
export function crawlDelay(text: string): number | null {
  const match = /^\s*crawl-delay\s*:\s*([0-9.]+)/im.exec(text);
  const value = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : null;
}
