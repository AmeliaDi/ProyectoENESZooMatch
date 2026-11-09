/**
 * El archivo publicado (`data/retake-plans.json`) es evidencia medida, no una
 * opinión editable: lo produce `node scripts/matching/retake-plans.mjs --write`
 * comparando el banco del árbol con cada versión que sigue en git. Estas pruebas
 * congelan los números ya contados y vigilan las invariantes que la carga del
 * config también exige.
 */
import { describe, expect, it } from "vitest";

import { RETAKE_PLANS, QUIZ_ITEMS, QUIZ_VERSION } from "@/config";
import { isAskable } from "@/domain/psychometrics/retake-registry";

import { retakeRegistrySchema } from "./retake-plans";

const BANK_IDS = new Set(QUIZ_ITEMS.map((item) => item.id));
const factorOf = new Map(QUIZ_ITEMS.map((item) => [item.id, item.factor]));
const current = RETAKE_PLANS.plans.find((plan) => plan.from === "2.2.0")!;

describe("plan de re-toma publicado", () => {
  it("apunta al banco vigente y tiene una entrada por banco de origen", () => {
    expect(RETAKE_PLANS.version).toBe("retake-plans-1");
    expect(RETAKE_PLANS.plans.length).toBeGreaterThan(0);
    for (const plan of RETAKE_PLANS.plans) expect(plan.to).toBe(QUIZ_VERSION);
    const origins = RETAKE_PLANS.plans.map((plan) => plan.from);
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("la re-toma vigente son 8 preguntas en 4 bloques, sin retirar nada", () => {
    expect(current.level).toBe("T2");
    expect(current.overCap).toBe(false);
    expect(current.retired).toEqual([]);
    expect(current.reask).toEqual(["VAL6", "FIL1", "VAL13", "FIL2", "FIL3", "APE1", "APE2", "LAM2"]);
    expect(current.blocks.map((block) => block.factor)).toEqual([
      "afecto_tiempo",
      "apego_ansiedad",
      "filtro",
      "meta_crianza",
    ]);
    expect(current.reasons[0]).toBe("0 ítems nuevos, 6 reescritos, 0 retirados");
  });

  it("ningún bloque parte una familia de puntaje (I9)", () => {
    for (const plan of RETAKE_PLANS.plans) {
      for (const block of plan.blocks) {
        for (const id of block.items) expect(factorOf.get(id)).toBe(block.factor);
      }
    }
  });

  it("todo lo que se re-pregunta sigue existiendo en el banco", () => {
    for (const plan of RETAKE_PLANS.plans) {
      for (const id of plan.reask) expect(BANK_IDS.has(id)).toBe(true);
    }
  });

  it("los planes por encima del presupuesto no se ofrecen, solo se explican", () => {
    const offered = RETAKE_PLANS.plans.filter((plan) => isAskable(plan, BANK_IDS));
    expect(offered.map((plan) => plan.from)).toEqual(["2.2.0"]);
    for (const plan of RETAKE_PLANS.plans) {
      expect(plan.overCap).toBe(plan.reask.length > 25);
    }
  });

  it("el conteo de retirados de la razón coincide con la lista", () => {
    for (const plan of RETAKE_PLANS.plans) {
      expect(plan.reasons[0]).toContain(`${plan.retired.length} retirados`);
    }
  });
});

describe("carga del registro", () => {
  const ok = { ...current };

  it("rechaza un plan que no apunta al banco vigente", () => {
    const parsed = retakeRegistrySchema.safeParse({
      version: RETAKE_PLANS.version,
      plans: [{ ...ok, to: "9.9.9" }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("retake-plans.mjs --write");
  });

  it("rechaza un ítem que ya no está en el banco", () => {
    expect(retakeRegistrySchema.safeParse({ version: "x", plans: [{ ...ok, reask: ["ZZZ1"] }] }).success).toBe(false);
  });

  it("rechaza un bloque que no está dentro de reask", () => {
    const parsed = retakeRegistrySchema.safeParse({
      version: "x",
      plans: [{ ...ok, reask: ["VAL6"], blocks: [{ factor: "afecto_tiempo", items: ["LAM2"] }] }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain("el bloque LAM2 no está en reask (2.2.0)");
  });

  it("rechaza un overCap que miente sobre el presupuesto", () => {
    const many = QUIZ_ITEMS.map((item) => item.id).slice(0, 26);
    const lying = { ...ok, reask: many, blocks: [], overCap: false };
    expect(retakeRegistrySchema.safeParse({ version: "x", plans: [lying] }).success).toBe(false);
    expect(retakeRegistrySchema.safeParse({ version: "x", plans: [{ ...lying, overCap: true }] }).success).toBe(true);
  });

  it("rechaza dos planes desde el mismo banco", () => {
    expect(retakeRegistrySchema.safeParse({ version: "x", plans: [ok, ok] }).success).toBe(false);
  });

  it("rechaza un campo que no conoce, para que nadie agregue reglas en la sombra", () => {
    expect(retakeRegistrySchema.safeParse({ version: "x", plans: [ok], nota: "manual" }).success).toBe(false);
  });
});
