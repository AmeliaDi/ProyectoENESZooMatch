/**
 * B9: la lista de re-toma se deriva del diff del banco, no de «cambió la
 * versión, repite todo». Cada caso es una mutación concreta del banco o del
 * modelo de medición, y lo que se afirma es cuántas preguntas nuevas se piden.
 */
import { describe, expect, it } from "vitest";

import type { StampItem, StampParams } from "@/domain/matching/math-stamp";

import { minimalRetake, type RetakeSnapshot } from "./minimal-retake";

function item(overrides: Partial<StampItem> & { id: string }): StampItem {
  return {
    texto: `Enunciado de ${overrides.id}`,
    modulo: "nucleo",
    factor: "hex_h",
    tipo: "likert_5",
    opciones: null,
    polaridad: "positiva",
    romance: true,
    amistad: true,
    filtro_duro: false,
    ...overrides,
  };
}

/** El set de factores latentes del modelo: fijo, para no confundir un cambio
 *  de banco con un cambio de modelo en los fixtures. */
const FACTORS = ["hex_h", "hex_e", "act_igualdad"];

function params(items: readonly StampItem[], overrides: Partial<StampParams> = {}): StampParams {
  return {
    factores: FACTORS,
    covarianza: FACTORS.map((_, i) => FACTORS.map((__, j) => (i === j ? 1 : 0))),
    items: Object.fromEntries(items.map((i) => [i.id, { factor: i.factor ?? "", clave: 1, a: 1, b: [0, 0, 0, 0] }])),
    ...overrides,
  };
}

function snapshot(items: readonly StampItem[], method = "eap_laplace"): RetakeSnapshot {
  return { bank: items, params: params(items), method };
}

const BASE = [
  item({ id: "H1", factor: "hex_h" }),
  item({ id: "H2", factor: "hex_h" }),
  item({ id: "E1", factor: "hex_e" }),
  item({ id: "ACT7", factor: "act_igualdad", modulo: "actitudes" }),
];

describe("re-toma mínima del banco", () => {
  it("un cambio de pesos o umbrales no pide ni una pregunta", () => {
    const plan = minimalRetake(snapshot(BASE), snapshot(BASE));
    expect(plan.level).toBe("T1");
    expect(plan.reask).toEqual([]);
    expect(plan.rescoreOnly).toHaveLength(4);
    expect(plan.answersUsable).toBe(true);
  });

  it("solo las cargas del GRM re-estimadas tampoco piden preguntas", () => {
    const base = snapshot(BASE);
    const next: RetakeSnapshot = {
      ...base,
      params: { ...base.params, items: { ...base.params.items, H1: { factor: "hex_h", clave: 1, a: 1.31, b: [-1, 0, 0, 1] } } },
    };
    const plan = minimalRetake(snapshot(BASE), next);
    expect(plan.level).toBe("T1");
    expect(plan.reask).toEqual([]);
    expect(plan.reasons.join(" ")).toContain("las respuestas siguen valiendo");
  });

  it("un enunciado reescrito re-pregunta ese ítem y a su familia", () => {
    const next = BASE.map((i) => (i.id === "H1" ? item({ ...i, texto: "Otra forma de decir lo mismo." }) : i));
    const plan = minimalRetake(snapshot(BASE), snapshot(next));
    expect(plan.level).toBe("T2");
    expect([...plan.reask].sort()).toEqual(["H1", "H2"]);
    expect(plan.byFactor.hex_h).toEqual(["H1", "H2"]);
    expect([...plan.rescoreOnly].sort()).toEqual(["ACT7", "E1"]);
  });

  it("una opción reetiquetada en un ítem de selección cuenta como reescritura", () => {
    const next = BASE.map((i) => (i.id === "E1" ? item({ ...i, tipo: "seleccion_multiple", opciones: ["sí", "no"] }) : i));
    const plan = minimalRetake(snapshot(BASE), snapshot(next));
    expect(plan.level).toBe("T2");
    expect(plan.reask).toEqual(["E1"]);
  });

  it("un factor partido arrastra a los ítems de los dos lados", () => {
    const next = BASE.map((i) => (i.id === "ACT7" ? item({ ...i, factor: "act_compromiso_social" }) : i));
    const plan = minimalRetake(snapshot(BASE), snapshot(next));
    expect(plan.level).toBe("T2");
    expect(plan.newFactors).toEqual(["act_compromiso_social"]);
    expect(plan.reask).toEqual(["ACT7"]);
    expect(Object.keys(plan.byFactor)).toEqual(["act_compromiso_social"]);
  });

  it("una polaridad invertida se re-pregunta", () => {
    const next = BASE.map((i) => (i.id === "E1" ? item({ ...i, polaridad: "negativa" }) : i));
    const plan = minimalRetake(snapshot(BASE), snapshot(next));
    expect(plan.reask).toEqual(["E1"]);
  });

  it("un ítem nuevo se pregunta y un ítem retirado no bloquea nada", () => {
    const next = [...BASE.filter((i) => i.id !== "E1"), item({ id: "N1", factor: "hex_h" })];
    const plan = minimalRetake(snapshot(BASE), snapshot(next));
    expect(plan.level).toBe("T2");
    expect(plan.reask).toEqual(["N1"]);
    expect(plan.retired).toEqual(["E1"]);
  });

  it("la covarianza latente o el método cambian es T3: re-estimar, no re-preguntar", () => {
    const plan = minimalRetake(snapshot(BASE), snapshot(BASE, "ml_laplace"));
    expect(plan.level).toBe("T3");
    expect(plan.reask).toEqual([]);
    expect(plan.answersUsable).toBe(true);
    expect(plan.reasons.join(" ")).toContain("método");

    const base = snapshot(BASE);
    const movedR: RetakeSnapshot = { ...base, params: { ...base.params, covarianza: [[1, 0.2], [0.2, 1]] } };
    expect(minimalRetake(snapshot(BASE), movedR).level).toBe("T3");
  });

  it("por encima del presupuesto de 25 preguntas el plan lo avisa", () => {
    const many = Array.from({ length: 30 }, (_, k) => item({ id: `X${k}`, factor: `f_${k}` }));
    const plan = minimalRetake(snapshot([many[0]!]), snapshot(many));
    expect(plan.level).toBe("T2");
    expect(plan.reask).toHaveLength(29);
    expect(plan.rescoreOnly).toEqual(["X0"]);
    expect(plan.overCap).toBe(true);
  });

  it("nunca pide de nuevo lo que no cambió", () => {
    const next = BASE.map((i) => (i.id === "H1" ? item({ ...i, texto: "Reescrito." }) : i));
    const plan = minimalRetake(snapshot(BASE), snapshot(next));
    for (const id of plan.rescoreOnly) {
      const before = BASE.find((i) => i.id === id)!;
      const after = next.find((i) => i.id === id)!;
      expect([after.texto, after.factor, after.polaridad]).toEqual([before.texto, before.factor, before.polaridad]);
    }
    expect(new Set([...plan.reask, ...plan.rescoreOnly]).size).toBe(4);
  });
});
