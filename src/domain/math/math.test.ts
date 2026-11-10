import { describe, expect, it } from "vitest";

import { mulberry32 } from "@/domain/shared";

import {
  auc,
  cholesky,
  choleskySolve,
  entropy,
  gaussHermiteNormal,
  gini,
  inverseFromCholesky,
  jacobiEigen,
  logDetFromCholesky,
  matMul,
  matVec,
  normalCdf,
  projectToPsdCorrelation,
  quantile,
  softMin,
  softmax,
  spearman,
  transpose,
  type Matrix,
} from "./index";

function randomSpd(n: number, seed: number): Matrix {
  const random = mulberry32(seed);
  const b = Array.from({ length: n }, () => Array.from({ length: n }, () => random() - 0.5));
  const a = matMul(b, transpose(b));
  return a.map((row, i) => row.map((v, j) => v + (i === j ? 0.1 : 0)));
}

describe("cholesky", () => {
  it("reconstructs SPD matrices and solves linear systems", () => {
    const a = randomSpd(8, 7);
    const { lower, ridge } = cholesky(a);
    expect(ridge).toBe(0);
    const back = matMul(lower, transpose(lower));
    back.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(a[i]![j]!, 10)));
    const x = [1, -2, 3, 0.5, 0, 1, 2, -1];
    const solved = choleskySolve(lower, matVec(a, x));
    solved.forEach((v, i) => expect(v).toBeCloseTo(x[i]!, 8));
  });

  it("inverts and computes log-determinants", () => {
    const a = randomSpd(5, 11);
    const { lower } = cholesky(a);
    const product = matMul(a, inverseFromCholesky(lower));
    product.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 8)));
    expect(logDetFromCholesky(cholesky([[2, 0], [0, 3]]).lower)).toBeCloseTo(Math.log(6), 12);
  });

  it("regularizes singular and nearly singular matrices instead of failing", () => {
    const singular = [[1, 1], [1, 1]];
    const { lower, ridge } = cholesky(singular);
    expect(ridge).toBeGreaterThan(0);
    expect(lower.flat().every(Number.isFinite)).toBe(true);
  });

  it("rejects non-finite input", () => {
    expect(() => cholesky([[Number.NaN]])).toThrow();
  });
});

describe("jacobiEigen", () => {
  it("diagonalizes symmetric matrices: A·v = λ·v", () => {
    const a = randomSpd(6, 3);
    const { values, vectors } = jacobiEigen(a);
    expect([...values].sort((x, y) => x - y)).toEqual(values);
    values.forEach((lambda, k) => {
      const v = vectors.map((row) => row[k]!);
      matVec(a, v).forEach((value, i) => expect(value).toBeCloseTo(lambda * v[i]!, 9));
    });
  });

  it("projects an indefinite pseudo-correlation onto a PSD correlation", () => {
    const bad = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
    expect(jacobiEigen(bad).values[0]).toBeLessThan(0);
    const fixed = projectToPsdCorrelation(bad);
    expect(jacobiEigen(fixed).values[0]).toBeGreaterThan(0);
    fixed.forEach((row, i) => expect(row[i]).toBeCloseTo(1, 12));
  });
});

describe("gaussHermiteNormal", () => {
  it("integrates normal moments exactly up to degree 2n − 1", () => {
    const { nodes, weights } = gaussHermiteNormal(21);
    const moment = (k: number) => nodes.reduce((s, x, i) => s + weights[i]! * x ** k, 0);
    expect(moment(0)).toBeCloseTo(1, 12);
    expect(moment(1)).toBeCloseTo(0, 12);
    expect(moment(2)).toBeCloseTo(1, 10);
    expect(moment(4)).toBeCloseTo(3, 9);
    expect(moment(6)).toBeCloseTo(15, 8);
  });

  it("integrates the normal CDF: E[Φ(aθ + b)] = Φ(b/√(1+a²))", () => {
    const { nodes, weights } = gaussHermiteNormal(41);
    const a = 1.3;
    const b = 0.4;
    const value = nodes.reduce((s, x, i) => s + weights[i]! * normalCdf(a * x + b), 0);
    expect(value).toBeCloseTo(normalCdf(b / Math.sqrt(1 + a * a)), 5);
  });

  it("is memoized and validates n", () => {
    expect(gaussHermiteNormal(9)).toBe(gaussHermiteNormal(9));
    expect(() => gaussHermiteNormal(1)).toThrow();
  });
});

describe("scalar statistics", () => {
  it("Φ matches reference values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 6);
  });

  it("soft-min lies between the minimum and the weighted mean", () => {
    const s = [0.9, 0.4, 0.8];
    const w = [0.5, 0.2, 0.3];
    const mean = s.reduce((acc, v, i) => acc + v * w[i]!, 0);
    for (const beta of [0.5, 2, 8, 32]) {
      const value = softMin(s, w, beta);
      expect(value).toBeGreaterThanOrEqual(Math.min(...s) - 1e-12);
      expect(value).toBeLessThanOrEqual(mean + 1e-12);
    }
    expect(softMin(s, w, 0)).toBeCloseTo(mean, 12);
    expect(softMin(s, w, 2000)).toBeCloseTo(0.4, 2);
    expect(softMin([0.3, 0.9], [1, 0], 5)).toBeCloseTo(0.3, 12);
  });

  it("soft-min is monotone in every score", () => {
    const w = [0.25, 0.25, 0.5];
    expect(softMin([0.5, 0.6, 0.7], w, 6)).toBeLessThan(softMin([0.5, 0.65, 0.7], w, 6));
  });

  it("softmax sums to one and entropy is maximal for uniform", () => {
    const p = softmax([1, 2, 3]);
    expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
    expect(entropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(Math.log(4), 12);
  });

  it("quantile, spearman and auc behave on simple cases", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 12);
    expect(auc([0.9, 0.8, 0.2, 0.1], [true, true, false, false])).toBe(1);
    expect(auc([0.5, 0.5], [true, false])).toBe(0.5);
  });
});

describe("gini", () => {
  it("matches the closed form on hand-computable exposure vectors", () => {
    expect(gini([3, 3, 3, 3])).toBe(0);
    expect(gini([0, 0, 0, 10])).toBeCloseTo(0.75, 12);
    expect(gini([1, 2, 3, 4])).toBeCloseTo(0.25, 12);
    expect(gini([7])).toBe(0);
  });

  it("reaches (n − 1)/n when one person takes every appearance", () => {
    for (const n of [2, 5, 10, 139]) {
      const all = new Array<number>(n).fill(0);
      all[0] = 100;
      expect(gini(all)).toBeCloseTo((n - 1) / n, 12);
    }
  });

  it("is zero when nobody is exposed, and invariant to scale and order", () => {
    expect(gini([])).toBe(0);
    expect(gini([0, 0, 0])).toBe(0);
    const counts = [4, 0, 9, 2, 7, 1];
    expect(gini(counts.map((c) => c * 3))).toBeCloseTo(gini(counts), 12);
    expect(gini([...counts].reverse())).toBeCloseTo(gini(counts), 12);
  });

  it("falls when exposure moves from a more exposed person to a less exposed one", () => {
    const before = [0, 2, 4, 12];
    const after = [1, 3, 5, 9];
    expect(before.reduce((s, v) => s + v, 0)).toBe(after.reduce((s, v) => s + v, 0));
    expect(gini(after)).toBeLessThan(gini(before));
  });

  it("rejects values that cannot be exposure counts", () => {
    expect(() => gini([1, -1])).toThrow();
    expect(() => gini([1, Number.NaN])).toThrow();
    expect(() => gini([1, Number.POSITIVE_INFINITY])).toThrow();
  });
});
