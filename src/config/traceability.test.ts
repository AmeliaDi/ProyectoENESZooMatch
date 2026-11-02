/**
 * Guard for docs/TRAZABILIDAD.md: the registered input hashes must match the
 * data files, and every evidence id, file and test cited in the matrix must
 * exist. Changing a model input without revisiting the matrix fails here.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const DOC = read("docs/TRAZABILIDAD.md");
const HASHED = ["data/matching-config.json", "data/psychometric-params.json", "data/self-reading.json"];

const hash = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);

function registered(file: string): string | undefined {
  const row = DOC.split(/\r?\n/).find((line) => line.startsWith(`| ${file} |`));
  return row?.match(/`([0-9a-f]{16})`/)?.[1];
}

const matrix = DOC.split(/\r?\n/).filter((line) => /^\| T-\d+ \|/.test(line));

describe("docs/TRAZABILIDAD.md", () => {
  it.each(HASHED)("registers the current hash of %s", (file) => {
    expect(registered(file), `actualiza el hash de ${file} en docs/TRAZABILIDAD.md`).toBe(hash(read(file)));
  });

  it("has a non-trivial decision matrix", () => {
    expect(matrix.length).toBeGreaterThanOrEqual(15);
  });

  it("cites only evidence ids and ADRs that exist", () => {
    const evidence = read("docs/EVIDENCIA.md");
    const decisions = read("docs/DECISIONES.md");
    for (const line of matrix) {
      for (const id of line.match(/EV-\d+/g) ?? []) expect(evidence, id).toMatch(new RegExp(`\\| ${id} \\|`));
      for (const adr of line.match(/ADR-\d+/g) ?? []) expect(decisions, adr).toContain(`## ${adr} `);
    }
  });

  it("points to code and test files that exist", () => {
    for (const line of matrix) {
      const paths = [...line.matchAll(/`((?:src|scripts|data)\/[^`]+)`/g)].map((m) => m[1]!);
      expect(paths.length, line.slice(0, 12)).toBeGreaterThanOrEqual(2);
      for (const path of paths) expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it("labels every decision with a known provenance tag", () => {
    for (const line of matrix) {
      expect(line).toMatch(/\| (prior_literatura|estimado_sintetico|supuesto_diseno|pendiente_verificacion) \|/);
    }
  });
});
