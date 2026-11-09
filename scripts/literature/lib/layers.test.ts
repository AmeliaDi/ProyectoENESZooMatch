import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import rawConfig from "../../../data/matching-config.json";
import {
  budgetSummary,
  decisionTable,
  evaluateCandidate,
  extrasWeight,
  licensingGaps,
  loadLayerFiles,
  planDe,
  syncDecisionTable,
  type LayerCandidate,
} from "./layers.ts";

const { criteria, data, counts } = loadLayerFiles(
  "data/literature/layer-criteria.json",
  "data/literature/layer-candidates.json",
  "data/microtest.json",
);

const evaluate = (c: LayerCandidate) => evaluateCandidate(c, criteria, counts);

function base(): LayerCandidate {
  const first = data.candidates[0];
  if (!first) throw new Error("sin candidatos");
  return structuredClone(first);
}

describe("layer admission", () => {
  it("declared decisions match the computed ones", () => {
    for (const c of data.candidates) {
      expect(evaluate(c).decision, c.id).toBe(c.decisionDeclarada);
    }
  });

  it("docs/CAPAS_EVIDENCIA.md §2 is the computed table, not a copy", () => {
    const doc = readFileSync("docs/CAPAS_EVIDENCIA.md", "utf8");
    const table = decisionTable(data, data.candidates.map(evaluate), counts);
    expect(syncDecisionTable(doc, table)).toBe(doc);
  });

  it("only counts studies with a verified abstract", () => {
    const c = base();
    c.evidencia = c.evidencia.map((s) => ({ ...s, verificacion: "pendiente_humana" as const }));
    expect(evaluate(c).criteria.evidence).toBe(false);
  });

  it("level-only effects do not justify a compatibility function", () => {
    const c = base();
    c.evidencia = c.evidencia.map((s) => ({ ...s, efecto: "nivel" as const }));
    c.plan = { ...c.plan, factores: [] };
    expect(evaluate(c).decision).toBe("descartada");
  });

  it("sexual-behaviour items are always excluded", () => {
    const c = base();
    c.sensible = { inferencia: false, conductaSexual: true };
    expect(evaluate(c).decision).toBe("descartada");
  });

  it("restricted licences pass only with original items", () => {
    const c = base();
    c.licencia = { ...c.licencia, estado: "restringida", aprobadaUsuaria: false };
    c.plan = { ...c.plan, itemsOriginales: false };
    expect(evaluate(c).criteria.license).toBe(false);
    c.plan = { ...c.plan, itemsOriginales: true };
    expect(evaluate(c).criteria.license).toBe(true);
  });

  it("the item plan comes from the bank, not from what the card remembers", () => {
    // La familia ACT no es un factor: de los 6 ACT que estaban en el núcleo, ACT1-3 miden
    // act_igualdad, ACT4/ACT6 miden act_compromiso_social y ACT5 mide rel_autonomia. Contar
    // por prefijo fue lo que dejó el registry en 54 cuando el banco entregaba 58 (ADR-044).
    const valores = data.candidates.find((c) => c.id === "valores");
    if (!valores) throw new Error("sin ficha de valores");
    expect(planDe(valores.plan.factores, counts)).toEqual({ nucleo: 12, opcional: 5, total: 17 });
    expect(() => planDe(["no_existe_el_factor"], counts)).toThrow(/factor desconocido en el banco/);
  });

  it("the core fits the ≤ 9 min budget and equals the delivered core", () => {
    const summary = budgetSummary(data, criteria, data.candidates.map(evaluate), counts);
    const delivered = (JSON.parse(readFileSync("data/microtest.json", "utf8")) as {
      items: ReadonlyArray<{ modulo: string }>;
    }).items.filter((item) => item.modulo === "nucleo").length;
    expect(summary.coreItems).toBe(delivered);
    expect(summary.coreMinutes).toBeLessThanOrEqual(criteria.budget.coreMaxMinutes);
    expect(summary.withinBudget).toBe(true);
  });

  it("product extras need an explicit decision and stay under the weight cap", () => {
    const c = base();
    c.evidencia = c.evidencia.map((s) => ({ ...s, efecto: "nulo" as const }));
    expect(evaluate(c).decision).toBe("opcional_narrativa");
    c.productoExtra = { pesoMax: 0.01, motivo: "test" };
    expect(evaluate(c).decision).toBe("extra_peso_minimo");
    expect(extrasWeight(data, data.candidates.map(evaluate))).toBeLessThanOrEqual(criteria.extras.maxTotalWeight);
  });

  it("extras never enter the core", () => {
    for (const c of data.candidates.filter((x) => x.decisionDeclarada === "extra_peso_minimo")) {
      expect(planDe(c.plan.factores, counts).nucleo, c.id).toBe(0);
    }
  });

  it("discarded layers contribute no items", () => {
    for (const c of data.candidates.filter((x) => x.decisionDeclarada === "descartada")) {
      expect(planDe(c.plan.factores, counts).total, c.id).toBe(0);
    }
  });
});

describe("weight licensing (criterio 3 de aceptación de B1)", () => {
  const config = rawConfig as unknown as Parameters<typeof licensingGaps>[2];

  it("every factor that carries weight is claimed by a card", () => {
    const claimed = new Set(data.fixedCore.flatMap((f) => f.factores));
    for (const c of data.candidates) for (const f of c.plan.factores) claimed.add(f);
    for (const [categoria, cfg] of Object.entries(config.categories)) {
      const weight = Math.max(
        ...Object.values(config.tracks).map((t) => t.core?.[categoria] ?? t.tail?.[categoria] ?? 0),
      );
      if (weight <= 0) continue;
      for (const factor of Object.keys(cfg.factors)) {
        expect(claimed.has(factor), `${categoria} puntúa ${factor} sin ficha`).toBe(true);
      }
    }
  });

  it("has exactly one debt: relacional weighs 0,20 with no licensed card", () => {
    const gaps = licensingGaps(data, data.candidates.map(evaluate), config);
    // B7-REL (tarea #13) abrió la ficha: si la capa pierde el peso, o si se licencia con
    // evidencia verificada, esta lista se vacía sola.
    expect(gaps.map((g) => `${g.categoria} ${g.pesoMaximo} > ${g.licenciado}`)).toEqual(["relacional 0.2 > 0"]);
  });
});

