/**
 * Per-category compatibility functions (docs/MATCHING.md §3). Every function
 * returns the EXPECTED similarity under both posteriors, treating the factor
 * gap as δ_f ~ N(μ_f, s_f²) with μ_f = θ̂a − θ̂b and s_f² = SEa² + SEb²
 * (diagonal posterior approximation). Consequences:
 *  - symmetric in (a, b) and bounded in [0, 1];
 *  - for fixed uncertainty it is maximal at μ = 0 and decreasing in |μ|;
 *  - an uninformative profile collapses to the population-average similarity,
 *    never to a falsely high one.
 */
import { normalCdf, softmax } from "@/domain/math";
import type {
  CategoryConfig,
  DeadzoneCategory,
  DistributionCategory,
  KernelCategory,
} from "@/types/matching-config";
import type { LatentProfile } from "@/types/latent";

interface FactorGap {
  readonly mean: number;
  readonly variance: number;
}

function gap(a: LatentProfile, b: LatentProfile, factor: string): FactorGap {
  const ta = a.theta[factor] ?? 0;
  const tb = b.theta[factor] ?? 0;
  const sa = a.se[factor] ?? 1;
  const sb = b.se[factor] ?? 1;
  return { mean: ta - tb, variance: sa * sa + sb * sb };
}

/** Weights rescaled to mean 1 (so the bandwidth keeps its per-dimension meaning). */
function meanNormalized(weights: Readonly<Record<string, number>>): Array<[string, number]> {
  const entries = Object.entries(weights);
  const mean = entries.reduce((s, [, w]) => s + w, 0) / entries.length;
  return entries.map(([f, w]) => [f, w / mean]);
}

/**
 * Gaussian kernel exp(−½ Σ w_f δ_f² / h²), h = c·√d. Per factor the expected
 * value under δ ~ N(μ, s²) is  r/√(r² + s²) · exp(−½ μ² / (r² + s²)),  with
 * r² = h² / w_f. `low_side` inflates μ by (1 + η·max(0, −min(θa, θb))).
 */
export function kernelSimilarity(cfg: KernelCategory, a: LatentProfile, b: LatentProfile): number {
  let log = 0;
  for (const [, term] of kernelFactorLogs(cfg, a, b)) log += term;
  return Math.exp(log);
}

/** Per-factor log terms; `exp(Σ)` is exactly `kernelSimilarity`. */
export function kernelFactorLogs(cfg: KernelCategory, a: LatentProfile, b: LatentProfile): Array<[string, number]> {
  const factors = meanNormalized(cfg.factors);
  const h2 = cfg.bandwidth_per_sqrt_dim ** 2 * factors.length;
  return factors.map(([factor, w]) => {
    const { mean, variance } = gap(a, b, factor);
    const eta = cfg.low_side?.[factor] ?? 0;
    const low = Math.min(a.theta[factor] ?? 0, b.theta[factor] ?? 0);
    const mu = mean * (1 + eta * Math.max(0, -low));
    const r2 = h2 / w;
    return [factor, 0.5 * Math.log(r2 / (r2 + variance)) - (0.5 * mu * mu) / (r2 + variance)];
  });
}

/**
 * E[g(δ)] with δ ~ N(μ, s²) and g(δ) = exp(−½ (max(0, |δ| − tol)/scale)²).
 *
 * The line splits into three pieces — the window |δ| ≤ tol, where g is 1, and
 * the two sides, where g is a Gaussian centred on the window edge. Each side is
 * therefore an integral of a Gaussian against a normal density over a half
 * line, which is exact in closed form:
 *
 *   ∫_{c}^{∞} e^{−(δ−t)²/2a²} φ_s(δ−μ) dδ = (a/h)·e^{−(t−μ)²/2h²}·Φ((m−c)/√v)
 *   h² = a² + s²,  √v = a·s/h,  m = (t·s² + μ·a²)/h²
 *
 * (and Φ((c−m)/√v) for a left tail). This replaces a Gauss–Hermite rule that
 * had to be dropped: the kink at |δ| = tol makes the integrand non-analytic, so
 * the rule converged slowly — 1.4e-2 of error at 21 nodes and 2.5e-3 at 41 when
 * s² = 2, worse than the granularity the score is read at. `gaussHermiteNormal`
 * survives as the oracle that pins this formula in the test.
 */
function expectedWindow(mu: number, variance: number, tolerance: number, scale: number): number {
  const gate = (delta: number) => {
    const excess = Math.max(0, Math.abs(delta) - tolerance) / scale;
    return Math.exp(-0.5 * excess * excess);
  };
  const s = Math.sqrt(Math.max(0, variance));
  // A point mass leaves nothing to integrate (the schema keeps scale > 0).
  if (s === 0) return gate(mu);
  const a2 = scale * scale;
  const s2 = s * s;
  const h2 = a2 + s2;
  const h = Math.sqrt(h2);
  const sqrtV = (scale * s) / h;
  const tilt = (edge: number) => (edge * s2 + mu * a2) / h2;
  const side = (edge: number, direction: 1 | -1) => {
    const mean = tilt(edge);
    const cut = direction === 1 ? (mean - edge) / sqrtV : (edge - mean) / sqrtV;
    return (scale / h) * Math.exp(-((edge - mu) ** 2) / (2 * h2)) * normalCdf(cut);
  };
  const inside = normalCdf((tolerance - mu) / s) - normalCdf((-tolerance - mu) / s);
  return Math.min(1, Math.max(0, inside + side(tolerance, 1) + side(-tolerance, -1)));
}

/** Tolerance window per factor, combined by product (strict) or weighted geometric mean. */
export function deadzoneSimilarity(cfg: DeadzoneCategory, a: LatentProfile, b: LatentProfile): number {
  const factors = meanNormalized(cfg.factors);
  let log = 0;
  for (const [factor, w] of factors) {
    const { mean, variance } = gap(a, b, factor);
    const g = Math.max(expectedWindow(mean, variance, cfg.tolerance[factor] ?? 0, cfg.scale), Number.MIN_VALUE);
    log += (cfg.combine === "product" ? w : w / factors.length) * Math.log(g);
  }
  return Math.exp(log);
}

/**
 * Bhattacharyya coefficient Σ √(p q) of the two softmax type distributions,
 * shrunk toward `neutral` by the joint information (1 − Ha)(1 − Hb), with H
 * the entropy normalized to [0, 1]. Two maximally uncertain profiles score
 * exactly `neutral` instead of a spurious 1.
 */
export function distributionSimilarity(cfg: DistributionCategory, a: LatentProfile, b: LatentProfile): number {
  const factors = Object.keys(cfg.factors);
  const p = softmax(factors.map((f) => a.theta[f] ?? 0), cfg.temperature);
  const q = softmax(factors.map((f) => b.theta[f] ?? 0), cfg.temperature);
  const maxEntropy = Math.log(factors.length);
  const information = (dist: readonly number[]) =>
    1 - dist.reduce((h, x) => (x > 0 ? h - x * Math.log(x) : h), 0) / maxEntropy;
  const bc = p.reduce((s, x, i) => s + Math.sqrt(x * q[i]!), 0);
  const lambda = Math.max(0, information(p)) * Math.max(0, information(q));
  return Math.min(1, Math.max(0, cfg.neutral + lambda * (bc - cfg.neutral)));
}

export function categorySimilarity(cfg: CategoryConfig, a: LatentProfile, b: LatentProfile): number {
  switch (cfg.kind) {
    case "kernel":
      return kernelSimilarity(cfg, a, b);
    case "deadzone":
      return deadzoneSimilarity(cfg, a, b);
    case "distribution":
      return distributionSimilarity(cfg, a, b);
  }
}
