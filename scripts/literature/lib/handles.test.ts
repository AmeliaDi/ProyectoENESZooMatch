import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { loadCrawlerConfig } from "./config.ts";
import { parseCsv } from "./csv.ts";
import { normalizeDoi } from "./records.ts";
import {
  handleState,
  loadRegistry,
  mergeChecks,
  keepDoi,
  unresolvedDois,
  type HandleCheck,
  type HandleRegistry,
} from "./handles.ts";

const config = loadCrawlerConfig();
const registry = loadRegistry(config.paths.doiChecks);

/** The seven handles the audit proved absent: five invented gender citations plus two wrong DOIs. */
const DOI_INVENTADOS = [
  "10.1177/0192513X20985862",
  "10.1007/s11199-019-01118-1",
  "10.1177/2158244015581265",
  "10.1007/s11199-020-01217-5",
  "10.1007/s10964-024-01964-9",
  "10.1037/0022-3514.74.2.401",
  "10.1016/j.jrp.2023.104442",
].map((d) => normalizeDoi(d) ?? d);

function check(doi: string, estado: HandleCheck["estado"], http: number | null = null): HandleCheck {
  return { doi, estado, http, consultado: "2026-11-09T00:00:00.000Z", via: "doi.org/api/handles" };
}

const only = (checks: readonly HandleCheck[]): HandleRegistry => mergeChecks({}, checks);

describe("doi resolution gate", () => {
  it("reads only 404 and 410 as an absent handle", () => {
    for (const status of [200, 201, 204]) expect(handleState(status)).toBe("resuelve");
    for (const status of [404, 410]) expect(handleState(status)).toBe("no_resuelve");
  });

  it("treats timeouts, blocks and server errors as no answer at all", () => {
    for (const status of [0, 403, 408, 429, 500, 503]) expect(handleState(status)).toBe("sin_comprobar");
  });

  it("never lets an unanswered call launder real evidence into unknown", () => {
    const resuelto = only([check("10.1/a", "resuelve", 200)]);
    expect(mergeChecks(resuelto, [check("10.1/a", "sin_comprobar")])["10.1/a"]?.estado).toBe("resuelve");
    expect(mergeChecks(resuelto, [check("10.1/a", "no_resuelve", 404)])["10.1/a"]?.estado).toBe("no_resuelve");

    const muerto = only([check("10.1/b", "no_resuelve", 404)]);
    expect(mergeChecks(muerto, [check("10.1/b", "resuelve", 200)])["10.1/b"]?.estado).toBe("resuelve");
    expect(mergeChecks(muerto, [check("10.1/b", "no_resuelve", 410)])["10.1/b"]?.http).toBe(410);
    expect(mergeChecks(muerto, [check("10.1/b", "sin_comprobar", 0)])["10.1/b"]?.estado).toBe("no_resuelve");
  });

  it("drops only the rows whose handle is known to be absent", () => {
    const r = only([check("10.1/a", "resuelve", 200), check("10.1/b", "no_resuelve", 404)]);
    expect(keepDoi("10.1/a", r)).toBe(true);
    expect(keepDoi("10.1/b", r)).toBe(false);
    // Untested and unknown are not evidence of absence, so they cannot delete a citation.
    expect(keepDoi("10.1/c", r)).toBe(true);
    expect(keepDoi("10.1/a", {})).toBe(true);
    // Rows without a DOI come from searches; they stay and are keyed by id.
    expect(keepDoi(null, r)).toBe(true);
  });

  it("explains why each citation cannot stand", () => {
    const r = only([check("10.1/a", "resuelve", 200), check("10.1/b", "no_resuelve", 404), check("10.1/c", "sin_comprobar", 0)]);
    const deudas = unresolvedDois(["10.1/a", "10.1/b", "10.1/c", "10.1/d"], r);
    expect(deudas.map((d) => d.doi)).toEqual(["10.1/b", "10.1/c", "10.1/d"]);
    expect(deudas[0]?.motivo).toContain("404");
    expect(deudas[1]?.motivo).toContain("no está comprobado");
  });

  it("has a verdict for every DOI the fichas cite, and all of them resolve", () => {
    const cards = JSON.parse(readFileSync("data/literature/layer-candidates.json", "utf8")) as {
      candidates: Array<{ id: string; evidencia: Array<{ doi: string | null }> }>;
    };
    const cited = new Set<string>();
    for (const card of cards.candidates) {
      for (const source of card.evidencia) {
        if (source.doi === null) continue;
        const doi = normalizeDoi(source.doi);
        if (doi === null) throw new Error(`${card.id}: doi mal formado ${source.doi}`);
        cited.add(doi);
      }
    }
    expect(cited.size).toBeGreaterThanOrEqual(20);
    expect(unresolvedDois(cited, registry)).toEqual([]);
  });

  it("keeps the audit's invented citations dead", () => {
    for (const doi of DOI_INVENTADOS) {
      expect(registry[doi]?.estado, doi).not.toBe("resuelve");
    }
    expect(DOI_INVENTADOS.every((d) => registry[d]?.estado === "no_resuelve")).toBe(true);
  });

  it("leaves no dead handle in the exported records", () => {
    const rows = parseCsv(readFileSync(config.paths.recordsExport, "utf8"));
    const header = rows[0] ?? [];
    const doiColumn = header.indexOf("doi");
    expect(doiColumn).toBeGreaterThanOrEqual(0);
    const dead = rows.slice(1)
      .map((row) => normalizeDoi(row[doiColumn] ?? "") ?? (row[doiColumn] ?? ""))
      .filter((doi) => doi !== "" && registry[doi]?.estado === "no_resuelve");
    expect(dead).toEqual([]);
  });

  it("keys the registry by the normalised doi, so case and URL prefixes agree", () => {
    const keys = Object.keys(registry);
    expect(keys.length).toBeGreaterThan(90);
    for (const key of keys) expect(key).toBe(normalizeDoi(key));
    // The invented Kwon citation reaches the registry only through its normalised form.
    expect(registry["10.1177/0192513x20985862"]?.estado).toBe("no_resuelve");
    expect(keepDoi(normalizeDoi("https://doi.org/10.1177/0192513X20985862"), registry)).toBe(false);
  });

  it("points the crawler at the artifact the tests read", () => {
    expect(config.paths.doiChecks).toBe("data/literature/doi-checks.json");
    expect(config.rateLimits["doi.org"]).toBeGreaterThanOrEqual(100);
  });
});
