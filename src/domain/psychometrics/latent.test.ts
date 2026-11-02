import { describe, expect, it } from "vitest";

import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { MATCHING_CONFIG } from "@/config";
import { pearson } from "@/domain/math";
import { mulberry32 } from "@/domain/shared";

import { enneagramFromLatent, mbtiFromLatent } from "./derived";
import { categoryProbabilities, evaluateItem, type GrmItem } from "./grm";
import { buildMeasurementModel, posterior, responseQuality, scoreLatent } from "./latent";
import { drawTheta, priorFactor, simulateResponses } from "./simulate";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const LOWER = priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz.map((r) => [...r]));
const ITEM_IDS = [...MODEL.items.keys()];
const ITEM: GrmItem = { factor: "hex_h", clave: -1, a: 1.4, b: [-1.5, -0.4, 0.5, 1.6] };

describe("graded response model", () => {
  it("category probabilities sum to 1 across θ", () => {
    for (const theta of [-6, -2, 0, 0.7, 3, 8]) {
      const sum = categoryProbabilities(ITEM, theta).reduce((s, p) => s + p, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("the analytic score matches a finite difference", () => {
    const h = 1e-5;
    for (const response of [1, 2, 3, 4, 5]) {
      for (const theta of [-1.3, 0.2, 2.1]) {
        const numeric =
          (evaluateItem(ITEM, response, theta + h).logLik - evaluateItem(ITEM, response, theta - h).logLik) / (2 * h);
        expect(evaluateItem(ITEM, response, theta).gradient).toBeCloseTo(numeric, 5);
      }
    }
  });

  it("Fisher information is non-negative and the likelihood finite far in the tails", () => {
    for (const theta of [-12, 0, 12]) {
      const { information, logLik } = evaluateItem(ITEM, 3, theta);
      expect(information).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(logLik)).toBe(true);
    }
  });
});

describe("latent posterior", () => {
  it("recovers simulated HEXACO traits with the full bank", () => {
    const random = mulberry32(20261101);
    const truth: number[][] = [];
    const estimate: number[][] = [];
    for (let person = 0; person < 60; person += 1) {
      const theta = drawTheta(LOWER, random);
      truth.push(theta);
      estimate.push(posterior(MODEL, simulateResponses(MODEL, ITEM_IDS, theta, random)).theta);
    }
    for (const factor of ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"]) {
      const k = MODEL.factorIndex.get(factor)!;
      expect(pearson(truth.map((t) => t[k]!), estimate.map((t) => t[k]!))).toBeGreaterThan(0.7);
    }
  });

  it("keeps the prior for a factor without responses (SE ≈ 1, never imputed)", () => {
    const fit = posterior(MODEL, []);
    for (let i = 0; i < MODEL.factors.length; i += 1) {
      expect(fit.theta[i]).toBeCloseTo(0, 10);
      expect(Math.sqrt(fit.covariance[i]![i]!)).toBeCloseTo(1, 6);
    }
  });

  it("answers shrink the posterior SD of the measured factor", () => {
    const hexH = [...MODEL.items].filter(([, it]) => it.factor === "hex_h").map(([id]) => ({ itemId: id, value: 4 }));
    const k = MODEL.factorIndex.get("hex_h")!;
    expect(Math.sqrt(posterior(MODEL, hexH).covariance[k]![k]!)).toBeLessThan(0.6);
  });

  it("flags longstring patterns with lower quality", () => {
    const random = mulberry32(7);
    const honest = simulateResponses(MODEL, ITEM_IDS, drawTheta(LOWER, random), random);
    const flat = ITEM_IDS.map((itemId) => ({ itemId, value: 3 }));
    const q = MATCHING_CONFIG.quality;
    const good = responseQuality(MODEL, honest, posterior(MODEL, honest).theta, q).quality;
    const bad = responseQuality(MODEL, flat, posterior(MODEL, flat).theta, q).quality;
    expect(good).toBeGreaterThan(bad);
    expect(bad).toBeLessThan(1);
    expect(bad).toBeGreaterThanOrEqual(q.minimum);
  });

  it("is deterministic and free of NaN", () => {
    const responses = simulateResponses(MODEL, ITEM_IDS, drawTheta(LOWER, mulberry32(3)), mulberry32(4));
    const a = scoreLatent(MODEL, responses, MATCHING_CONFIG.quality);
    expect(scoreLatent(MODEL, responses, MATCHING_CONFIG.quality)).toEqual(a);
    for (const v of [...Object.values(a.theta), ...Object.values(a.se), a.quality]) expect(Number.isFinite(v)).toBe(true);
    expect(a.answered).toBe(responses.length);
  });
});

describe("identity readouts", () => {
  const flat = { theta: {}, se: {}, quality: 1, answered: 0 };

  it("marks every MBTI axis ambiguous when nothing is known", () => {
    const readout = mbtiFromLatent(flat, MATCHING_CONFIG.scoring.mbti_ambiguity_se);
    expect(readout.code).toMatch(/^[EI][SN][TF][JP]$/);
    expect(readout.axes.every((a) => a.ambiguous)).toBe(true);
  });

  it("does not force an enneagram type at maximum entropy", () => {
    const readout = enneagramFromLatent(flat, 0.5, MATCHING_CONFIG.scoring.enneagram_ambiguity_entropy);
    expect(readout.normalizedEntropy).toBeCloseTo(1, 12);
    expect(readout.ambiguous).toBe(true);
  });

  it("picks a clear type and an adjacent wing", () => {
    const profile = { ...flat, theta: { ennea_4: 2, ennea_5: 1, ennea_3: 0.2 } };
    const readout = enneagramFromLatent(profile, 0.5, MATCHING_CONFIG.scoring.enneagram_ambiguity_entropy);
    expect(readout.type).toBe(4);
    expect(readout.wing).toBe(5);
    expect(readout.ambiguous).toBe(false);
    expect(readout.probabilities.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 12);
  });

  it("wraps the wing around the ring (9 ↔ 1)", () => {
    const readout = enneagramFromLatent({ ...flat, theta: { ennea_9: 2, ennea_1: 1 } }, 0.5, 0.85);
    expect([readout.type, readout.wing]).toEqual([9, 1]);
  });
});
