/** Normalised bibliographic record and pure merge helpers. */

export interface LiteratureRecord {
  id: string;
  doi: string | null;
  title: string | null;
  authors: string | null;
  year: number | null;
  venue: string | null;
  recordType: "article" | "preprint" | "instrument_page" | "license_page";
  seedOrigin: string;
  topic: string | null;
  isOa: boolean | null;
  oaUrl: string | null;
  oaLicense: string | null;
  pmcid: string | null;
  s2Id: string | null;
  openalexId: string | null;
  citations: number | null;
  abstractAvailable: boolean;
  sources: string[];
}

export function normalizeDoi(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;]+$/, "")
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(cleaned) ? cleaned : null;
}

/** Extracts DOIs, keeping balanced parentheses such as `10.1016/0191-8869(96)00033-5`. */
export function extractDois(text: string): string[] {
  const found = new Set<string>();
  const regex = /10\.\d{4,9}\/(?:\([^()\s]*\)|[^\s|()`>,;*\]])+/g;
  for (const match of text.matchAll(regex)) {
    const doi = normalizeDoi(match[0]);
    if (doi) found.add(doi);
  }
  return [...found].sort();
}

export function recordIdForDoi(doi: string): string {
  return `doi:${doi}`;
}

export function emptyRecord(id: string, seedOrigin: string, recordType: LiteratureRecord["recordType"]): LiteratureRecord {
  return {
    id, doi: null, title: null, authors: null, year: null, venue: null, recordType, seedOrigin,
    topic: null, isOa: null, oaUrl: null, oaLicense: null, pmcid: null, s2Id: null, openalexId: null,
    citations: null, abstractAvailable: false, sources: [],
  };
}

/** Fills only missing fields: the first source to answer wins (Crossref is queried first). */
export function mergeRecord(base: LiteratureRecord, patch: Partial<LiteratureRecord>, source: string): LiteratureRecord {
  const next: LiteratureRecord = { ...base, sources: base.sources.includes(source) ? base.sources : [...base.sources, source] };
  const mutable = next as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || key === "sources") continue;
    const current = mutable[key];
    if (current === null || current === undefined || current === false) mutable[key] = value;
  }
  return next;
}

export function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
