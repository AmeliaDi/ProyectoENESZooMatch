import { describe, expect, it } from "vitest";

import { applyPlatt, benjaminiHochberg, bootstrapP, brier, ece, fitPlatt, holm, wilson } from "./stats";

describe("multiplicity control", () => {
  it("Holm matches the textbook step-down", () => {
    expect(holm([0.01, 0.04, 0.03, 0.005])).toEqual([0.03, 0.06, 0.06, 0.02]);
  });

  it("BH matches the textbook step-up and is never below the raw p", () => {
    const p = [0.01, 0.04, 0.03, 0.005];
    const q = benjaminiHochberg(p);
    expect(q.map((x) => Number(x.toFixed(6)))).toEqual([0.02, 0.04, 0.04, 0.02]);
    q.forEach((x, i) => expect(x).toBeGreaterThanOrEqual(p[i]!));
  });
});

describe("intervals and calibration", () => {
  it("Wilson covers the textbook value and handles 0 successes", () => {
    const { lo, hi } = wilson(8, 10);
    expect(lo).toBeCloseTo(0.4902, 3);
    expect(hi).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 75).lo).toBeCloseTo(0, 12);
  });

  it("Platt recovers a known logistic and yields a calibrated, skilful forecast", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const x = Array.from({ length: 4000 }, () => rand());
    const truth = { a: 6, b: -4 };
    const y = x.map((v) => rand() < applyPlatt(truth, v));
    const fit = fitPlatt(x, y);
    expect(fit.a).toBeCloseTo(truth.a, 0);
    expect(fit.b).toBeCloseTo(truth.b, 0);
    const p = x.map((v) => applyPlatt(fit, v));
    const base = y.filter(Boolean).length / y.length;
    expect(brier(p, y)).toBeLessThan(brier(p.map(() => base), y));
    expect(ece(p, y, 10)).toBeLessThan(0.03);
  });

  it("bootstrap p uses the +1 correction", () => {
    expect(bootstrapP([0.1, 0.2, 0.3])).toBe(0.25);
    expect(bootstrapP([-0.1, 0.2])).toBeCloseTo(2 / 3);
  });
});
