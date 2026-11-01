import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import rawParams from "../../data/psychometric-params.json";
import rawQuiz from "../../data/microtest.json";
import { CORE_ITEMS, QUIZ_ITEMS, QUIZ_MODULES, isSkippableItem } from "./index";
import { loadConfig } from "./load";
import { PSYCHOMETRIC_PARAMS, psychometricParamsSchema } from "./psychometric-params";
import { quizSchema } from "./quiz";

const HEXACO = ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"];
const likert = QUIZ_ITEMS.filter((item) => item.tipo_respuesta === "likert_5");

describe("item bank (ADR-016)", () => {
  it("has a 60-item core of 57 Likert + 3 hard filters", () => {
    expect(CORE_ITEMS).toHaveLength(60);
    expect(CORE_ITEMS.filter((item) => item.filtro_duro).map((item) => item.id)).toEqual(["FIL1", "FIL2", "FIL3"]);
    expect(QUIZ_MODULES.map((module) => module.id)).not.toContain("nucleo");
  });

  it("covers every HEXACO facet in the core and again in the facet module", () => {
    for (const factor of HEXACO) {
      const core = CORE_ITEMS.filter((item) => item.factor === factor);
      const facets = QUIZ_ITEMS.filter((item) => item.factor === factor && item.modulo === "hexaco_facetas");
      expect(core).toHaveLength(4);
      expect(new Set(core.map((item) => item.faceta)).size).toBe(4);
      expect(core.some((item) => item.polaridad === "negativa")).toBe(true);
      expect(new Set(facets.map((item) => item.faceta))).toEqual(new Set(core.map((item) => item.faceta)));
    }
  });

  it("gives every Big Five bridge trait 3 items with at least one reversed", () => {
    for (const factor of ["bf_e", "bf_a", "bf_c", "bf_n", "bf_o"]) {
      const items = likert.filter((item) => item.factor === factor);
      expect(items).toHaveLength(3);
      expect(items.some((item) => item.polaridad === "negativa")).toBe(true);
    }
  });

  it("keeps the core free of consecutive same-factor or consecutive reversed Likert items", () => {
    const core = CORE_ITEMS.filter((item) => !item.filtro_duro);
    core.slice(1).forEach((item, index) => {
      const previous = core[index]!;
      expect(item.factor, `${previous.id}->${item.id}`).not.toBe(previous.factor);
      expect(item.polaridad === "negativa" && previous.polaridad === "negativa").toBe(false);
    });
  });

  it("puts sensitive items at the end of the core and only those are skippable", () => {
    const firstSensitive = CORE_ITEMS.findIndex((item) => item.banderas.includes("SENS"));
    expect(CORE_ITEMS.slice(firstSensitive).every((item) => ["VAL", "ACT", "FIL"].some((p) => item.id.startsWith(p)))).toBe(true);
    expect(CORE_ITEMS.filter(isSkippableItem).map((item) => item.id).sort()).toEqual(["ACT2", "ACT3", "VAL5", "VAL6"]);
  });

  it("uses original wording for MBTI and Enneagram (never adapted from proprietary tests)", () => {
    for (const item of QUIZ_ITEMS.filter((i) => i.capa === 4)) expect(item.origen, item.id).toBe("original");
  });

  it("feeds no legacy dimension from Enneagram items (avatar and narrative only)", () => {
    for (const item of QUIZ_ITEMS.filter((i) => i.factor.startsWith("ennea_"))) {
      expect(Object.keys(item.pesos), item.id).toHaveLength(0);
    }
  });

  it("rejects items in an undeclared module", () => {
    const bad = structuredClone(rawQuiz);
    bad.modulos = bad.modulos.filter((module) => module.id !== "subtipo");
    expect(() => loadConfig("microtest", quizSchema, bad)).toThrow(/undeclared module/);
  });
});

describe("psychometric params", () => {
  it("was estimated from the current item bank (re-run the pipeline after editing items)", () => {
    const bank = readFileSync(new URL("../../data/microtest.json", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    expect(PSYCHOMETRIC_PARAMS.entrada_sha256).toBe(createHash("sha256").update(bank, "utf8").digest("hex"));
  });

  it("has GRM parameters for every Likert item and ordered thresholds", () => {
    for (const item of likert) {
      const params = PSYCHOMETRIC_PARAMS.items[item.id];
      expect(params, item.id).toBeDefined();
      expect(params?.factor).toBe(item.factor);
      expect(params?.clave).toBe(item.polaridad === "negativa" ? -1 : 1);
      const b = params?.b ?? [];
      expect(b.every((value, index) => index === 0 || value > (b[index - 1] ?? -Infinity))).toBe(true);
    }
  });

  it("labels every latent prior and keeps the matrix a valid correlation matrix", () => {
    expect(PSYCHOMETRIC_PARAMS.covarianza_latente.priors.length).toBeGreaterThan(0);
    const bad = structuredClone(rawParams);
    const row = bad.covarianza_latente.matriz[0];
    if (row) row[1] = 0.99;
    expect(() => loadConfig("psychometric-params", psychometricParamsSchema, bad)).toThrow(/symmetric/);
  });
});
