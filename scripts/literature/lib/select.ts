/** Pure selection helpers for the literature pipeline. */
import type { LiteratureRecord } from "./records.ts";

const STOP = new Set(["the", "a", "an", "of", "and", "in", "on", "for", "to", "with", "from", "is", "are", "et", "al", "de", "la", "el", "y", "en"]);

export function titleTokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/** Share of the query's tokens present in the candidate title (recall-oriented). */
export function titleMatchScore(query: string, candidate: string): number {
  const q = titleTokens(query);
  const c = titleTokens(candidate);
  if (q.size === 0) return 0;
  let hits = 0;
  for (const token of q) if (c.has(token)) hits += 1;
  return hits / q.size;
}

export interface Candidate {
  readonly title: string;
  readonly year: number | null;
  readonly authors?: readonly string[];
}

function fold(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** True if any author name contains the expected surname (accent-insensitive). */
export function hasAuthor(candidate: Candidate, surname: string): boolean {
  const wanted = fold(surname);
  return (candidate.authors ?? []).some((name) => fold(name).includes(wanted));
}

export interface NamedMatch<T extends Candidate> {
  readonly hit: T | null;
  readonly score: number;
  readonly reason: string;
}

/** Accepts a hit only if the author matches, the year is within ±1 and the title matches well. */
export function pickNamedMatch<T extends Candidate>(query: string, year: number, author: string, hits: readonly T[], minScore: number): NamedMatch<T> {
  let best: T | null = null;
  let bestScore = 0;
  for (const hit of hits) {
    const score = titleMatchScore(query, hit.title);
    const yearOk = hit.year === null || Math.abs(hit.year - year) <= 1;
    if (yearOk && hasAuthor(hit, author) && score > bestScore) { best = hit; bestScore = score; }
  }
  if (!best) return { hit: null, score: 0, reason: "sin resultados con ese autor y año" };
  if (bestScore < minScore) return { hit: null, score: bestScore, reason: `coincidencia de título insuficiente (${bestScore.toFixed(2)})` };
  return { hit: best, score: bestScore, reason: "ok" };
}

export interface ExtractionTarget {
  readonly recordId: string;
  readonly url: string;
  readonly pdf: boolean;
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url) || /\/pdf(\/|$)/i.test(url) || /\/download\//i.test(url);
}

/**
 * Full text is only fetched when reuse is explicitly allowed: PMC, a Creative
 * Commons license, or a preprint server. "Free to read" publisher pages are
 * skipped even when an index marks them open access.
 */
export function hasReusableLicense(record: LiteratureRecord): boolean {
  return record.pmcid !== null || /^cc/i.test(record.oaLicense ?? "") || record.recordType === "preprint";
}

/** Prefers PMC HTML (full text, no PDF surcharge), then other open-access URLs. */
export function targetUrl(record: LiteratureRecord): string | null {
  if (!hasReusableLicense(record)) return null;
  if (record.pmcid) return `https://pmc.ncbi.nlm.nih.gov/articles/${record.pmcid}/`;
  return record.isOa ? record.oaUrl : null;
}

export function selectExtractionTargets(records: readonly LiteratureRecord[], relationalPattern: RegExp, max: number): ExtractionTarget[] {
  const eligible = records
    .filter((r) => r.recordType === "article" || r.recordType === "preprint")
    .filter((r) => r.title !== null && relationalPattern.test(r.title))
    .flatMap((r) => {
      const url = targetUrl(r);
      return url ? [{ recordId: r.id, url, pdf: isPdfUrl(url), html: r.pmcid !== null }] : [];
    })
    // HTML first (cheaper, full text), then by id for determinism.
    .sort((a, b) => Number(b.html) - Number(a.html) || a.recordId.localeCompare(b.recordId));
  return eligible.slice(0, max).map(({ recordId, url, pdf }) => ({ recordId, url, pdf }));
}

/** Short sentences around license keywords; never the whole page. */
export function licenseQuotes(markdown: string, keywords: RegExp, maxChars: number, maxQuotes: number): string[] {
  const sentences = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/[*_#>`|]/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 25);
  const out: string[] = [];
  for (const sentence of sentences) {
    if (!keywords.test(sentence)) continue;
    const quote = sentence.length > maxChars ? `${sentence.slice(0, maxChars - 1)}…` : sentence;
    if (!out.includes(quote)) out.push(quote);
    if (out.length >= maxQuotes) break;
  }
  return out;
}
