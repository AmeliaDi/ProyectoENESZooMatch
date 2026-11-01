/**
 * Stage 3: versioned outputs. `review-queue.csv` is the human gate: nothing in
 * it feeds production parameters until `decision` is filled by a person.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { CrawlerConfig } from "../lib/config.ts";
import { parseCsv, toCsv, type CsvCell } from "../lib/csv.ts";
import type { LiteratureDb } from "../lib/db.ts";

export const REVIEW_HEADER = [
  "item_id", "kind", "record_id", "source_url", "field", "value_pass_a", "value_pass_b", "agreement",
  "quote", "location", "quote_in_source", "verificacion", "decision", "reviewer", "reviewed_on", "notes",
] as const;

const HUMAN_COLUMNS = ["verificacion", "decision", "reviewer", "reviewed_on", "notes"] as const;

type Row = Record<string, unknown>;

/** Keeps human edits (decision, reviewer...) when the queue is regenerated. */
export function mergeHumanColumns(previous: string[][], rows: CsvCell[][]): CsvCell[][] {
  const [header, ...body] = previous;
  if (!header) return rows;
  const idIndex = header.indexOf("item_id");
  const prior = new Map(body.map((r) => [r[idIndex] ?? "", r]));
  return rows.map((row) => {
    const old = prior.get(String(row[0]));
    if (!old) return row;
    const next = [...row];
    for (const column of HUMAN_COLUMNS) {
      const from = header.indexOf(column);
      const to = REVIEW_HEADER.indexOf(column);
      const value = old[from];
      if (from >= 0 && value) next[to] = value;
    }
    return next;
  });
}

function reviewRows(db: LiteratureDb): CsvCell[][] {
  const rows: CsvCell[][] = [];
  const extractions = db.prepare(
    `SELECT a.record_id, a.source_url, a.field, a.value AS va, b.value AS vb, a.agreement, COALESCE(a.quote, b.quote) AS quote,
            COALESCE(a.location, b.location) AS location, MAX(a.quote_in_source, COALESCE(b.quote_in_source, 0)) AS qis
     FROM extractions a LEFT JOIN extractions b ON b.record_id = a.record_id AND b.source_url = a.source_url AND b.field = a.field AND b.pass = 'b'
     WHERE a.pass = 'a' AND (a.value IS NOT NULL OR b.value IS NOT NULL)
     ORDER BY a.record_id, a.field`,
  ).all() as Row[];
  for (const e of extractions) {
    rows.push([
      `ext:${String(e["record_id"])}:${String(e["field"])}`, "extraccion", e["record_id"] as string, e["source_url"] as string, e["field"] as string,
      e["va"] as string, e["vb"] as string, e["agreement"] as string, e["quote"] as string, e["location"] as string,
      Number(e["qis"]) === 1 ? "si" : "no", "pendiente_humana", "", "", "", "",
    ]);
  }
  const quotes = db.prepare("SELECT id, page_url, topic, quote FROM quotes ORDER BY page_url, id").all() as Row[];
  for (const q of quotes) {
    rows.push([
      `lic:${String(q["page_url"])}:${String(q["id"])}`, "licencia", "", q["page_url"] as string, q["topic"] as string,
      "", "", "", q["quote"] as string, "", "si", "pendiente_humana", "", "", "", "",
    ]);
  }
  return rows;
}

export function exportOutputs(db: LiteratureDb, config: CrawlerConfig): { reviewRows: number; records: number } {
  const path = config.paths.reviewQueue;
  const previous = existsSync(path) ? parseCsv(readFileSync(path, "utf8")) : [];
  const rows = mergeHumanColumns(previous, reviewRows(db));
  writeFileSync(path, toCsv(REVIEW_HEADER, rows));

  const records = db.prepare(
    "SELECT id, doi, title, authors, year, venue, record_type, seed_origin, topic, is_oa, oa_license, pmcid, citations, sources, verification FROM records ORDER BY id",
  ).all() as Row[];
  const header = ["id", "doi", "title", "authors", "year", "venue", "record_type", "seed_origin", "topic", "is_oa", "oa_license", "pmcid", "citations", "sources", "verificacion"];
  writeFileSync(config.paths.recordsExport, toCsv(header, records.map((r) => header.map((h) => r[h === "verificacion" ? "verification" : h] as CsvCell))));
  return { reviewRows: rows.length, records: records.length };
}
