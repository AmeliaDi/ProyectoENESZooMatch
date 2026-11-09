/**
 * El registro de re-tomas decide si una persona ve «Afinar mi perfil» o no ve
 * nada. Los cuatro estados se prueban por separado porque el costo de confundirlos
 * es distinto: `unstamped` convertido en invitación viola la regla 1 de B9 (volver
 * a preguntar lo que sigue siendo válido) y `unknown` convertido en invitación
 * fabrica preguntas que nadie calculó.
 */
import { describe, expect, it } from "vitest";

import type { ShippedRetakePlan } from "./retake-registry";
import { askCount, isAskable, lookupRetake } from "./retake-registry";

const PLAN: ShippedRetakePlan = {
  from: "2.1.0",
  to: "2.2.0",
  level: "T2",
  blocks: [
    { factor: "hex_e", items: ["E1", "E2"] },
    { factor: "(sin factor)", items: ["FIL1"] },
  ],
  reask: ["E1", "E2", "FIL1"],
  retired: ["VIEJO1"],
  reasons: ["1 ítem reescrito"],
  overCap: false,
};

const REGISTRY = { version: "1", plans: [PLAN] } as const;
const SEAL = (bank: string) => `psychometric-params-1+${bank}+${"0".repeat(12)}`;

describe("lookupRetake", () => {
  it("no invita a quien llegó antes del sello", () => {
    expect(lookupRetake(REGISTRY, null, "2.2.0")).toEqual({ status: "unstamped" });
    expect(lookupRetake(REGISTRY, "", "2.2.0")).toEqual({ status: "unstamped" });
    // Un sello con otro formato tampoco tiene banco de origen: no se adivina.
    expect(lookupRetake(REGISTRY, "sin-sello", "2.2.0")).toEqual({ status: "unstamped" });
  });

  it("dice «nada que re-preguntar» cuando el banco ya es el vigente", () => {
    expect(lookupRetake(REGISTRY, SEAL("2.2.0"), "2.2.0")).toEqual({ status: "current" });
  });

  it("devuelve el plan solo si cubre el banco de origen Y al vigente", () => {
    expect(lookupRetake(REGISTRY, SEAL("2.1.0"), "2.2.0")).toEqual({ status: "plan", plan: PLAN });
    // El plan 2.1.0 → 2.2.0 no sirve para migrar a una persona medida en 1.0.0.
    expect(lookupRetake(REGISTRY, SEAL("1.0.0"), "2.2.0")).toEqual({ status: "unknown", from: "1.0.0" });
    expect(lookupRetake(REGISTRY, SEAL("2.1.0"), "2.3.0")).toEqual({ status: "unknown", from: "2.1.0" });
  });
});

describe("isAskable", () => {
  const ids = new Set(["E1", "E2", "FIL1"]);

  it("no ofrece un plan por encima del presupuesto de re-toma", () => {
    expect(isAskable({ ...PLAN, overCap: true }, ids)).toBe(false);
  });

  it("no ofrece un plan que menciona ítems que ya no existen", () => {
    // El registro se publica a mano y el banco sigue moviéndose: si un id del
    // plan ya no está, el quiz pediría una pregunta que nadie puede renderizar.
    expect(isAskable(PLAN, new Set(["E1", "E2"]))).toBe(false);
    expect(isAskable({ ...PLAN, reask: [] }, ids)).toBe(false);
    expect(isAskable(null, ids)).toBe(false);
  });

  it("ofrece el plan completo y dentro del presupuesto", () => {
    expect(isAskable(PLAN, ids)).toBe(true);
  });
});

it("cuenta las preguntas por bloque, no por lista plana", () => {
  expect(askCount(PLAN)).toBe(3);
  expect(askCount({ ...PLAN, blocks: [{ factor: "hex_e", items: ["E1"] }] })).toBe(1);
});
