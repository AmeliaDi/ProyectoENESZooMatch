import type { LiteratureDb } from "./db.ts";
import type { Extraction, FieldComparison } from "./extraction.ts";
import type { LiteratureRecord } from "./records.ts";

export function upsertRecord(db: LiteratureDb, r: LiteratureRecord): void {
  db.prepare(
    `INSERT INTO records(id, doi, title, authors, year, venue, record_type, seed_origin, topic, is_oa, oa_url, oa_license, pmcid, s2_id, openalex_id, citations, abstract_available, sources, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET doi=excluded.doi, title=excluded.title, authors=excluded.authors, year=excluded.year, venue=excluded.venue,
       record_type=excluded.record_type, seed_origin=excluded.seed_origin, topic=excluded.topic, is_oa=excluded.is_oa, oa_url=excluded.oa_url,
       oa_license=excluded.oa_license, pmcid=excluded.pmcid, s2_id=excluded.s2_id, openalex_id=excluded.openalex_id, citations=excluded.citations,
       abstract_available=excluded.abstract_available, sources=excluded.sources, updated_at=excluded.updated_at`,
  ).run(
    r.id, r.doi, r.title, r.authors, r.year, r.venue, r.recordType, r.seedOrigin, r.topic,
    r.isOa === null ? null : Number(r.isOa), r.oaUrl, r.oaLicense, r.pmcid, r.s2Id, r.openalexId, r.citations,
    Number(r.abstractAvailable), r.sources.join(";"), new Date().toISOString(),
  );
}

export function upsertPage(
  db: LiteratureDb,
  page: { url: string; recordId: string | null; kind: string; status: number | null; title: string | null; sha: string | null; robotsAllowed: boolean; note: string | null },
): void {
  db.prepare(
    `INSERT INTO pages(url, record_id, kind, status, title, content_sha256, robots_allowed, fetched_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET record_id=excluded.record_id, kind=excluded.kind, status=excluded.status, title=excluded.title,
       content_sha256=excluded.content_sha256, robots_allowed=excluded.robots_allowed, fetched_at=excluded.fetched_at, note=excluded.note`,
  ).run(page.url, page.recordId, page.kind, page.status, page.title, page.sha, Number(page.robotsAllowed), new Date().toISOString(), page.note);
}

export function insertQuote(db: LiteratureDb, pageUrl: string, topic: string, quote: string): void {
  db.prepare("INSERT OR IGNORE INTO quotes(page_url, topic, quote) VALUES (?, ?, ?)").run(pageUrl, topic, quote);
}

export function storeExtraction(
  db: LiteratureDb,
  recordId: string,
  sourceUrl: string,
  pass: "a" | "b",
  extraction: Extraction,
  quoteInSource: (quote: string | null) => boolean,
): void {
  const stmt = db.prepare(
    `INSERT INTO extractions(record_id, source_url, pass, field, value, quote, location, quote_in_source, extracted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(record_id, source_url, pass, field) DO UPDATE SET value=excluded.value, quote=excluded.quote, location=excluded.location,
       quote_in_source=excluded.quote_in_source, extracted_at=excluded.extracted_at`,
  );
  for (const [field, data] of Object.entries(extraction)) {
    stmt.run(
      recordId, sourceUrl, pass, field, data.value === null ? null : JSON.stringify(data.value), data.quote, data.location,
      Number(quoteInSource(data.quote)), new Date().toISOString(),
    );
  }
}

export function storeAgreement(db: LiteratureDb, recordId: string, sourceUrl: string, comparisons: readonly FieldComparison[]): void {
  const stmt = db.prepare("UPDATE extractions SET agreement = ? WHERE record_id = ? AND source_url = ? AND field = ?");
  for (const c of comparisons) stmt.run(c.agreement, recordId, sourceUrl, c.field);
}
