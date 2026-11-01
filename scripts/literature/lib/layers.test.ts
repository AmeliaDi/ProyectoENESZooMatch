import { describe, expect, it } from "vitest";

import { budgetSummary, evaluateCandidate, loadLayerFiles, type LayerCandidate } from "./layers.ts";

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
    c.licencia = { ...c.licencia, estado: "restringida" };
    c.plan = { ...c.plan, itemsOriginales: false };
    expect(evaluateCandidate(c, criteria).criteria.license).toBe(false);
    c.plan = { ...c.plan, itemsOriginales: true };
    expect(evaluateCandidate(c, criteria).criteria.license).toBe(true);
  });

  it("the core fits the ~60-item, ≤ 9 min budget", () => {
    const evaluations = data.candidates.map((c) => evaluateCandidate(c, criteria));
    const summary = budgetSummary(data, criteria, evaluations);
    expect(summary.withinBudget).toBe(true);
    expect(summary.coreMinutes).toBeLessThanOrEqual(criteria.budget.coreMaxMinutes);
  });

  it("discarded layers contribute no items", () => {
    for (const c of data.candidates.filter((x) => x.decisionDeclarada === "descartada")) {
      expect(c.plan.itemsNucleo + c.plan.itemsOpcional, c.id).toBe(0);
    }
  });
});
