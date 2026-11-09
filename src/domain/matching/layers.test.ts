import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG } from "@/config";
import { gaussian, gaussHermiteNormal, normalCdf } from "@/domain/math";
import { mulberry32, type Random } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import { MATCH_CATEGORY_IDS } from "@/types/matching-config";

import { categorySimilarity, deadzoneSimilarity } from "./layers";
import { pairScore } from "./pair-score";

const CATS = MATCHING_CONFIG.categories;
const FACTORS = [...new Set(Object.values(CATS).flatMap((c) => Object.keys(c.factors)))];

function profile(random: Random, se = 0.4): LatentProfile {
  const theta: Record<string, number> = {};
  const sd: Record<string, number> = {};
  for (const f of FACTORS) {
    theta[f] = gaussian(random);
    sd[f] = se;
  }
  return { theta, se: sd, quality: 1, answered: 100 };
}

function shifted(base: LatentProfile, factor: string, delta: number): LatentProfile {
  return { ...base, theta: { ...base.theta, [factor]: (base.theta[factor] ?? 0) + delta } };
}

const random = mulberry32(99);
const PEOPLE = Array.from({ length: 12 }, () => profile(random));

describe("category similarities", () => {
  it("are symmetric, bounded and finite", () => {
    for (const id of MATCH_CATEGORY_IDS) {
      for (const a of PEOPLE) {
        for (const b of PEOPLE) {
          const ab = categorySimilarity(CATS[id], a, b);
          expect(ab).toBeCloseTo(categorySimilarity(CATS[id], b, a), 12);
          expect(ab).toBeGreaterThanOrEqual(0);
          expect(ab).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("decrease monotonically with the gap in every kernel and window factor", () => {
    const base = PEOPLE[0]!;
    for (const id of MATCH_CATEGORY_IDS) {
      const cfg = CATS[id];
      if (cfg.kind === "distribution") continue;
      for (const factor of Object.keys(cfg.factors)) {
        let previous = Number.POSITIVE_INFINITY;
        for (const delta of [0, 0.5, 1, 2, 3]) {
          const s = categorySimilarity(cfg, base, shifted(base, factor, delta));
          expect(s).toBeLessThanOrEqual(previous + 1e-12);
          previous = s;
        }
      }
    }
  });

  it("do not reward uncertainty: wider posteriors never beat a sure identical pair", () => {
    const sure = profile(mulberry32(5), 0.2);
    const unsure: LatentProfile = { ...sure, se: Object.fromEntries(FACTORS.map((f) => [f, 1])) };
    for (const id of MATCH_CATEGORY_IDS) {
      expect(categorySimilarity(CATS[id], unsure, unsure)).toBeLessThanOrEqual(
        categorySimilarity(CATS[id], sure, sure) + 1e-12,
      );
    }
  });

  it("collapse the enneagram overlap to `neutral` when both profiles are uninformative", () => {
    const flat: LatentProfile = { theta: {}, se: {}, quality: 1, answered: 0 };
    const cfg = CATS.eneagrama;
    expect(categorySimilarity(cfg, flat, flat)).toBeCloseTo(cfg.kind === "distribution" ? cfg.neutral : 0, 12);
  });

  it("penalize a low-Honesty pair more than a high-Honesty pair with the same gap", () => {
    const base = PEOPLE[1]!;
    const at = (h: number) => ({ ...base, theta: { ...base.theta, hex_h: h } });
    const high = categorySimilarity(CATS.personalidad, at(1.5), at(0.5));
    const low = categorySimilarity(CATS.personalidad, at(-0.5), at(-1.5));
    expect(low).toBeLessThan(high);
  });
});

describe("expected window of a deadzone factor", () => {
  /** A one-factor `product` category returns E[g(δ)] itself. */
  const windowOf = (mu: number, se: number, tolerance: number, scale: number) =>
    deadzoneSimilarity(
      { kind: "deadzone", factors: { w: 1 }, tolerance: { w: tolerance }, scale, combine: "product" },
      { theta: { w: mu / 2 }, se: { w: se }, quality: 1, answered: 1 },
      { theta: { w: -mu / 2 }, se: { w: se }, quality: 1, answered: 1 },
    );

  /** The rule the closed form replaced. */
  const windowByQuadrature = (mu: number, se: number, tolerance: number, scale: number, nodes: number) => {
    const rule = gaussHermiteNormal(nodes);
    const sd = Math.sqrt(2 * se * se);
    let sum = 0;
    rule.nodes.forEach((x, k) => {
      const excess = Math.max(0, Math.abs(mu + sd * x) - tolerance) / scale;
      sum += rule.weights[k]! * Math.exp(-0.5 * excess * excess);
    });
    return sum;
  };

  /** Independent oracle: composite Simpson over ±14 posterior sd. */
  const windowBySimpson = (mu: number, se: number, tolerance: number, scale: number) => {
    const sd = se * Math.SQRT2;
    const density = (delta: number) => {
      const excess = Math.max(0, Math.abs(delta) - tolerance) / scale;
      return Math.exp(-0.5 * excess * excess - 0.5 * ((delta - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
    };
    const step = (28 * sd) / 20000;
    let sum = density(mu - 14 * sd) + density(mu + 14 * sd);
    for (let i = 1; i < 20000; i++) sum += (i % 2 === 1 ? 4 : 2) * density(mu - 14 * sd + i * step);
    return (sum * step) / 3;
  };

  const WINDOWS = [
    [0.75, 0.6],
    [0.5, 0.8],
    [0.75, 0.8],
  ] as const;
  const SOS = [0.2, 0.3, 0.4, 0.5, 0.7, 1];
  const MUS = [-3, -1.5, -0.9, -0.4, 0, 0.4, 0.9, 1.5, 3];

  it("matches an independent numerical integration", () => {
    let worst = 0;
    for (const [tolerance, scale] of WINDOWS) {
      for (const se of SOS) {
        for (const mu of MUS) {
          worst = Math.max(worst, Math.abs(windowOf(mu, se, tolerance, scale) - windowBySimpson(mu, se, tolerance, scale)));
        }
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it("is exact where the 21-node rule it replaced was not", () => {
    let exact = 0;
    let old = 0;
    for (const [tolerance, scale] of WINDOWS) {
      for (const se of SOS) {
        for (const mu of MUS) {
          const reference = windowBySimpson(mu, se, tolerance, scale);
          exact = Math.max(exact, Math.abs(windowOf(mu, se, tolerance, scale) - reference));
          old = Math.max(old, Math.abs(windowByQuadrature(mu, se, tolerance, scale, 21) - reference));
        }
      }
    }
    // The kink at |δ| = tol makes Gauss–Hermite converge slowly: at se = 1 —
    // an unmeasured factor — 21 nodes were off by a hundredth, a tenth of the
    // band the score is read at.
    expect(exact).toBeLessThan(1e-6);
    expect(old).toBeGreaterThan(5e-3);
  });

  it("reduces to the Gaussian-times-Gaussian integral when the window is a point", () => {
    for (const se of SOS) {
      for (const mu of MUS) {
        const scale = 0.8;
        const h = Math.sqrt(scale * scale + 2 * se * se);
        // `normalCdf` keeps ~1e-7 fractional error (its erfc fit), hence 6 digits.
        expect(windowOf(mu, se, 0, scale)).toBeCloseTo((scale / h) * Math.exp((-mu * mu) / (2 * h * h)), 6);
      }
    }
  });

  it("is the gate itself when there is no uncertainty, and a hard cut when there is no window", () => {
    for (const mu of MUS) {
      expect(windowOf(mu, 0, 0.75, 0.6)).toBeCloseTo(Math.exp(-0.5 * (Math.max(0, Math.abs(mu) - 0.75) / 0.6) ** 2), 12);
    }
    // tolerance 0 with a sure gap of exactly 0 is the only pair that scores 1.
    expect(windowOf(0, 0, 0, 0.8)).toBeCloseTo(1, 12);
    expect(windowOf(0.4, 0.2, 0.75, 0.8)).toBeLessThan(1);
    expect(windowOf(0, 0.2, 0.75, 0.8)).toBeGreaterThan(0.999);
  });

  it("opens to 1 as the window widens and closes to the window mass as it shrinks", () => {
    const mass = (mu: number, se: number, tolerance: number) => {
      const sd = se * Math.SQRT2;
      return normalCdf((tolerance - mu) / sd) - normalCdf((-tolerance - mu) / sd);
    };
    for (const se of [0.2, 0.4, 1]) {
      for (const mu of [0, 0.5, 1.5]) {
        expect(windowOf(mu, se, 0.75, 1e6)).toBeGreaterThan(0.999999);
        // The narrowing limit is the window mass, and the tails are worth O(scale).
        expect(Math.abs(windowOf(mu, se, 0.75, 1e-3) - mass(mu, se, 0.75))).toBeLessThan(2e-3);
      }
    }
  });
});

describe("pairScore", () => {
  for (const track of ["romance", "amistad"] as const) {
    const cfg = MATCHING_CONFIG.tracks[track];
    it(`${track}: symmetric, in [0, 1], self-pair maximal, contributions add up`, () => {
      for (const a of PEOPLE) {
        const self = pairScore(a, a, cfg, CATS).total;
        for (const b of PEOPLE) {
          const ab = pairScore(a, b, cfg, CATS);
          expect(ab.total).toBeCloseTo(pairScore(b, a, cfg, CATS).total, 12);
          expect(ab.total).toBeGreaterThanOrEqual(0);
          expect(ab.total).toBeLessThanOrEqual(1);
          expect(ab.total).toBeLessThanOrEqual(self + 1e-12);
          expect(ab.categories.reduce((s, c) => s + c.contribution, 0)).toBeCloseTo(ab.total, 10);
        }
      }
    });
  }

  it("soft-min sits between the minimum and the weighted mean", () => {
    const score = pairScore(PEOPLE[2]!, PEOPLE[3]!, MATCHING_CONFIG.tracks.romance, CATS);
    const core = score.categories.filter((c) => c.role === "core");
    const mean = core.reduce((s, c) => s + c.weight * c.similarity, 0);
    expect(score.core).toBeLessThanOrEqual(mean + 1e-12);
    expect(score.core).toBeGreaterThanOrEqual(Math.min(...core.map((c) => c.similarity)) - 1e-12);
  });

  it("keeps the identity layer (MBTI + Enneagram) within its cap", () => {
    const score = pairScore(PEOPLE[4]!, PEOPLE[5]!, MATCHING_CONFIG.tracks.romance, CATS);
    const identity = score.categories
      .filter((c) => c.id === "mbti" || c.id === "eneagrama")
      .reduce((s, c) => s + c.contribution, 0);
    expect(identity).toBeLessThanOrEqual(MATCHING_CONFIG.tail_groups.identity_max_total + 1e-12);
  });

  it("stays finite with near-singular or extreme posteriors", () => {
    const extreme: LatentProfile = {
      theta: Object.fromEntries(FACTORS.map((f, i) => [f, i % 2 ? 40 : -40])),
      se: Object.fromEntries(FACTORS.map((f) => [f, 1e-9])),
      quality: 1,
      answered: 1,
    };
    const score = pairScore(extreme, PEOPLE[0]!, MATCHING_CONFIG.tracks.romance, CATS);
    expect(Number.isFinite(score.total)).toBe(true);
    for (const c of score.categories) expect(Number.isFinite(c.contribution)).toBe(true);
  });

  it("is deterministic", () => {
    const cfg = MATCHING_CONFIG.tracks.amistad;
    expect(pairScore(PEOPLE[6]!, PEOPLE[7]!, cfg, CATS)).toEqual(pairScore(PEOPLE[6]!, PEOPLE[7]!, cfg, CATS));
  });
});
