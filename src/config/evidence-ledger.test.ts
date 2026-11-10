/**
 * Guard for `data/evidence-ledger.json`: the ledger must be the current view of
 * the annotated configurations (drift), must index every number they contain
 * (coverage), and may only call something a literature prior if its own
 * `fuente` cites an `EV-xx` that really exists in docs/EVIDENCIA.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PARAM_LABELS } from "@/types/matching-config";
import { INDEXED_FILES, STAMPED_FILES, buildLedger, collectEntries, serializeLedger } from "./evidence-ledger";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const parse = (path: string) => JSON.parse(read(path)) as unknown;

const sources: Record<string, unknown> = Object.fromEntries(
  [...INDEXED_FILES, ...STAMPED_FILES].map(({ archivo }) => [archivo, parse(archivo)]),
);
const ledger = buildLedger(sources);
const committed = JSON.parse(read("data/evidence-ledger.json")) as typeof ledger;

/** JSON numbers sitting in a value position, counted straight off the text. */
function numericValues(path: string): number {
  return (read(path).match(/:\s*-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?=\s*[,}\]])/g) ?? []).length;
}

describe("data/evidence-ledger.json", () => {
  it("is the current view of the configurations", () => {
    expect(committed, "corre `node scripts/evidence/ledger.mjs --write`").toEqual(ledger);
    expect(serializeLedger(committed)).toBe(serializeLedger(ledger));
  });

  it("indexes every number of every annotated file", () => {
    for (const { archivo } of INDEXED_FILES) {
      const expected = numericValues(archivo);
      const got = ledger.entradas.filter((entry) => entry.archivo === archivo).length;
      expect(got, `${archivo}: ${String(expected)} números en el texto, ${String(got)} filas en el ledger`).toBe(expected);
      expect(got).toBeGreaterThan(0);
    }
  });

  it("does not invent rows for the estimated parameters", () => {
    for (const { archivo } of STAMPED_FILES) {
      expect(ledger.entradas.filter((entry) => entry.archivo === archivo)).toEqual([]);
      expect(ledger.sello[archivo]).toBeDefined();
    }
    expect(ledger.sello["data/psychometric-params.json"]).toMatchObject({
      generado_por: "scripts/psychometrics/run.py",
    });
  });

  it("carries a provenance tag and a reason on every row", () => {
    for (const entry of ledger.entradas) {
      expect(PARAM_LABELS, `${entry.ruta} usa una etiqueta desconocida`).toContain(entry.etiqueta);
      expect(entry.fuente.trim().length, `${entry.ruta} no dice de dónde sale`).toBeGreaterThan(0);
      expect(Number.isFinite(entry.valor), `${entry.ruta} no guarda un número`).toBe(true);
    }
  });

  it("only calls prior_literatura what actually cites a study", () => {
    const naked = ledger.entradas
      .filter((entry) => entry.etiqueta === "prior_literatura" && entry.ev.length === 0)
      .map((entry) => entry.ruta);
    expect(naked, "sin EV-xx citado no hay prior de literatura").toEqual([]);
  });

  it("cites evidence ids that exist in docs/EVIDENCIA.md", () => {
    const evidence = read("docs/EVIDENCIA.md");
    for (const entry of ledger.entradas) {
      for (const id of entry.ev) {
        expect(evidence, `${entry.ruta} cita ${id}, que no está en docs/EVIDENCIA.md`).toMatch(new RegExp(`\\| ${id} \\|`));
      }
    }
  });

  it("numbers the rows once and in path order", () => {
    const ids = ledger.entradas.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("E-001");
    expect(ids.at(-1)).toBe(`E-${String(ledger.entradas.length).padStart(3, "0")}`);
    for (const { archivo } of INDEXED_FILES) {
      const routes = ledger.entradas.filter((entry) => entry.archivo === archivo).map((entry) => entry.ruta);
      expect(routes).toEqual([...routes].sort());
    }
  });

  it("refuses an unlabelled number instead of guessing", () => {
    expect(() => collectEntries("x.json", { huérfano: 0.5 })).toThrow(/sin etiqueta ni fuente/);
  });
});
