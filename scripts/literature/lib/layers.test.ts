import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HARD_FILTER_FIELDS, NON_SCORED_FACTORS } from "@/config/matching";
import {
  budgetSummary,
  decisionTable,
  evaluateCandidate,
  extrasWeight,
  licensingGaps,
  loadLayerFiles,
  planDe,
  scoredFactors,
  sensitiveBlocks,
  syncDecisionTable,
  type LayerCandidate,
  type ScoredConfig,
  type SensitiveEntry,
} from "./layers.ts";

const { criteria, data, counts, config } = loadLayerFiles(
  "data/literature/layer-criteria.json",
  "data/literature/layer-candidates.json",
  "data/microtest.json",
  "data/matching-config.json",
);

const evaluate = (c: LayerCandidate) => evaluateCandidate(c, criteria, counts, config);

function base(): LayerCandidate {
  const first = data.candidates[0];
  if (!first) throw new Error("sin candidatos");
  return structuredClone(first);
}

const card = (id: string): LayerCandidate => {
  const c = data.candidates.find((x) => x.id === id);
  if (!c) throw new Error(`sin ficha ${id}`);
  return structuredClone(c);
};

/** A config copy where `factor` weighs inside `categoria` (the way a factor enters a score). */
function weightFactor(cfg: ScoredConfig, categoria: string, factor: string): ScoredConfig {
  const category = cfg.categories[categoria];
  if (!category) throw new Error(`sin categoría ${categoria} en el config`);
  return {
    ...cfg,
    categories: { ...cfg.categories, [categoria]: { ...category, factors: { ...category.factors, [factor]: 1 } } },
  };
}

const declare = (c: LayerCandidate, entries: readonly SensitiveEntry[]): LayerCandidate => {
  c.sensible = { categorias: entries.map((e) => structuredClone(e)) };
  return c;
};

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
    // Con ADR-045 son 16: los 12 de antes más VAL16-19, los segundos ítems de los
    // cuatro valores que pesaban 0,13 viajando en un solo ítem.
    const valores = data.candidates.find((c) => c.id === "valores");
    if (!valores) throw new Error("sin ficha de valores");
    expect(planDe(valores.plan.factores, counts)).toEqual({ nucleo: 16, opcional: 5, total: 21 });
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

  it("weighs nothing without a licensed card: the registry has no debt", () => {
    const gaps = licensingGaps(data, data.candidates.map(evaluate), config);
    // El deudor histórico era `relacional`: 0,20 de peso con ficha
    // opcional_narrativa (ADR-050 le devolvió el peso a 0). Si alguna categoría
    // recibe peso sin una ficha `admitida` que lo licencie, la lista se llena
    // sola y esta prueba rompe — es exactamente lo que se quiere impedir.
    expect(gaps.map((g) => `${g.categoria} ${g.pesoMaximo} > ${g.licenciado}`)).toEqual([]);
  });
});

describe("criterio 5: la lista legal de datos sensibles (LFPDPPP art. 9)", () => {
  it("enumerates what the law enumerates", () => {
    expect(criteria.sensitivity.categorias.map((c) => c.id)).toEqual([
      "origen_etnico_racial",
      "opinion_politica",
      "creencia_religiosa_o_filosofica",
      "estado_de_salud",
      "informacion_genetica",
      "preferencia_o_identidad_sexual",
      "conducta_sexual",
      "datos_biomtricos",
    ]);
  });

  it("covers every factor the scoring config refuses to weight, and weighs none of them", () => {
    const sensibles = criteria.sensitivity.categorias.flatMap((c) => c.factores);
    const scored = scoredFactors(config);
    for (const factor of NON_SCORED_FACTORS) {
      expect(sensibles, `${factor} falta en la lista legal`).toContain(factor);
      expect(scored.has(factor), `${factor} puntúa pese a NON_SCORED_FACTORS`).toBe(false);
    }
  });

  it("names the same hard filters the code enforces", () => {
    expect([...criteria.sensitivity.filtrosDuros].sort()).toEqual([...HARD_FILTER_FIELDS].sort());
  });

  it("no card scores a sensitive factor", () => {
    const scored = scoredFactors(config);
    for (const c of data.candidates) {
      for (const cat of criteria.sensitivity.categorias) {
        const pesa = c.plan.factores.filter((f) => cat.factores.includes(f) && scored.has(f));
        expect(pesa, `${c.id} puntúa ${cat.id}`).toEqual([]);
      }
    }
  });

  it("sexual-behaviour items stay excluded whatever safeguard they cite", () => {
    const intentada = declare(card("sociosexualidad"), [
      { id: "conducta_sexual", salvaguardas: ["no_puntuable", "filtro_duro", "opt_in"], filtros: ["tipo_relacion_busca"], nota: "test" },
    ]);
    expect(sensitiveBlocks(intentada, criteria, config).join(" ")).toMatch(/la app no pregunta/);
    expect(evaluate(intentada).decision).toBe("descartada");
    expect(evaluate(card("sociosexualidad")).criteria.safe, "la ficha declarada también queda bloqueada").toBe(false);
  });

  it("verifies «no puntuable» against the config instead of trusting the card", () => {
    const c = card("intereses_estilo_vida");
    expect(evaluate(c).criteria.safe).toBe(true);
    const weighted = weightFactor(config, "estilo", "soc_politica");
    const blocks = sensitiveBlocks(c, criteria, weighted).join(" ");
    expect(blocks).toMatch(/declara «opinion_politica» no puntuable, pero soc_politica sí pesa/);
    expect(blocks).toMatch(/sin filtro_duro \+ opt_in/);
    expect(evaluateCandidate(c, criteria, counts, weighted).decision).toBe("descartada");
  });

  it("a category that does score needs the hard filter and the opt-in", () => {
    const weighted = weightFactor(config, "valores", "val_espiritualidad");
    const sinFiltro = declare(card("valores"), [
      { id: "creencia_religiosa_o_filosofica", salvaguardas: ["opt_in"], nota: "test" },
    ]);
    expect(sensitiveBlocks(sinFiltro, criteria, weighted).join(" ")).toMatch(/sin filtro_duro/);
    const completa = declare(card("valores"), [
      { id: "creencia_religiosa_o_filosofica", salvaguardas: ["filtro_duro", "opt_in"], filtros: ["tipo_relacion_busca"], nota: "test" },
    ]);
    expect(sensitiveBlocks(completa, criteria, weighted)).toEqual([]);
  });

  it("planning a sensitive factor without declaring its category is a block", () => {
    const c = declare(card("valores"), []);
    expect(sensitiveBlocks(c, criteria, config).join(" "))
      .toMatch(/planea val_espiritualidad sin declarar «creencia_religiosa_o_filosofica»/);
  });

  it("rejects invented categories and invented filters", () => {
    const inventada = declare(card("valores"), [{ id: "religion", salvaguardas: ["no_puntuable"], nota: "test" }]);
    expect(() => sensitiveBlocks(inventada, criteria, config)).toThrow(/categoría sensible desconocida/);
    const malFiltro = declare(card("valores"), [
      { id: "creencia_religiosa_o_filosofica", salvaguardas: ["no_puntuable", "filtro_duro"], filtros: ["nivel_de_estres"], nota: "test" },
    ]);
    expect(sensitiveBlocks(malFiltro, criteria, config).join(" ")).toMatch(/no son duros/);
  });

  it("the table shows the safeguard, so the column is auditable", () => {
    const table = decisionTable(data, data.candidates.map(evaluate), counts);
    expect(table).toContain("opinion_politica: no_puntuable");
    expect(table).toContain("creencia_religiosa_o_filosofica: no_puntuable");
    expect(table).toMatch(/conducta_sexual.*\*\*descartada\*\*/);
  });
});

