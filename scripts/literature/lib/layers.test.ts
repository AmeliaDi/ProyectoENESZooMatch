import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { budgetSummary, decisionTable, evaluateCandidate, extrasWeight, loadLayerFiles, syncDecisionTable, type LayerCandidate } from "./layers.ts";

const { criteria, data } = loadLayerFiles("data/literature/layer-criteria.json", "data/literature/layer-candidates.json");

function base(): LayerCandidate {
  const first = data.candidates[0];
  if (!first) throw new Error("sin candidatos");
  return structuredClone(first);
}

describe("layer admission", () => {
  it("declared decisions match the computed ones", () => {
    for (const c of data.candidates) {
      expect(evaluateCandidate(c, criteria).decision, c.id).toBe(c.decisionDeclarada);
    }
  });

  it("docs/CAPAS_EVIDENCIA.md §2 is the computed table, not a copy", () => {
    const doc = readFileSync("docs/CAPAS_EVIDENCIA.md", "utf8");
    const table = decisionTable(data, data.candidates.map((c) => evaluateCandidate(c, criteria)));
    expect(syncDecisionTable(doc, table)).toBe(doc);
  });

  it("only counts studies with a verified abstract", () => {
    const c = base();
    c.evidencia = c.evidencia.map((s) => ({ ...s, verificacion: "pendiente_humana" as const }));
    expect(evaluateCandidate(c, criteria).criteria.evidence).toBe(false);
  });

  it("level-only effects do not justify a compatibility function", () => {
    const c = base();
    c.evidencia = c.evidencia.map((s) => ({ ...s, efecto: "nivel" as const }));
    c.plan = { ...c.plan, itemsOpcional: 0 };
    expect(evaluateCandidate(c, criteria).decision).toBe("descartada");
  });

  it("sexual-behaviour items are always excluded", () => {
    const c = base();
    c.sensible = { inferencia: false, conductaSexual: true };
    expect(evaluateCandidate(c, criteria).decision).toBe("descartada");
  });

  it("restricted licences pass only with original items", () => {
    const c = base();
    c.licencia = { ...c.licencia, estado: "restringida", aprobadaUsuaria: false };
    c.plan = { ...c.plan, itemsOriginales: false };
    expect(evaluateCandidate(c, criteria).criteria.license).toBe(false);
    c.plan = { ...c.plan, itemsOriginales: true };
    expect(evaluateCandidate(c, criteria).criteria.license).toBe(true);
  });

  it("the core fits the ≤ 9 min budget and reports its distance to the item target", () => {
    const evaluations = data.candidates.map((c) => evaluateCandidate(c, criteria));
    const summary = budgetSummary(data, criteria, evaluations);
    expect(summary.coreMinutes).toBeLessThanOrEqual(criteria.budget.coreMaxMinutes);
    // coreItems es contabilidad del registry (blanco + capas `admitida`): al bajar la capa de
    // género por ADR-043 son 54, 6 por debajo del blanco de 60 ± 3 (ADR-014), y withinBudget
    // sale false. El núcleo ENTREGADO sigue siendo 60 ítems: `plan.itemsNucleo` es un conteo
    // por familia de prefijo, no por factor — de los 6 ACT del núcleo, solo ACT1-3 miden
    // `act_igualdad`; ACT4/ACT6 miden `act_compromiso_social` (dentro de la categoría
    // `valores`) y ACT5 mide `rel_autonomia` (en `relacional`, que el registry ni desglosa).
    // Derivar el plan del banco es B2; B3 fija el blanco al rediseñar la entrega.
    expect(summary.coreItems).toBe(54);
    expect(summary.withinBudget, "deriva plan.itemsNucleo del banco (B2) y fija el blanco (B3)").toBe(false);
  });

  it("product extras need an explicit decision and stay under the weight cap", () => {
    const c = base();
    c.evidencia = c.evidencia.map((s) => ({ ...s, efecto: "nulo" as const }));
    expect(evaluateCandidate(c, criteria).decision).toBe("opcional_narrativa");
    c.productoExtra = { pesoMax: 0.01, motivo: "test" };
    expect(evaluateCandidate(c, criteria).decision).toBe("extra_peso_minimo");
    const evaluations = data.candidates.map((x) => evaluateCandidate(x, criteria));
    expect(extrasWeight(data, evaluations)).toBeLessThanOrEqual(criteria.extras.maxTotalWeight);
  });

  it("extras never enter the core", () => {
    for (const c of data.candidates.filter((x) => x.decisionDeclarada === "extra_peso_minimo")) {
      expect(c.plan.itemsNucleo, c.id).toBe(0);
    }
  });

  it("discarded layers contribute no items", () => {
    for (const c of data.candidates.filter((x) => x.decisionDeclarada === "descartada")) {
      expect(c.plan.itemsNucleo + c.plan.itemsOpcional, c.id).toBe(0);
    }
  });
});
