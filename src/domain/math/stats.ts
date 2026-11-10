/**
 * Scalar statistics helpers: normal distribution, log-sum-exp, soft-min,
 * softmax/entropy, ranks and quantiles. All pure and NaN-safe on finite input.
 */
import type { Random } from "@/domain/shared";

const SQRT_2PI = Math.sqrt(2 * Math.PI);
/** Probabilities are clamped here before logs to avoid −∞. */
export const PROBABILITY_FLOOR = 1e-300;

/**
 * erfc(x) with fractional error < 1.2e-7 everywhere (Chebyshev fit, Press et
 * al., Numerical Recipes §6.2). Sufficient for GRM category probabilities.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 +
        t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal CDF Φ(x). */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** Standard normal density φ(x). */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

export function logSumExp(values: readonly number[]): number {
  if (values.length === 0) return Number.NEGATIVE_INFINITY;
  const max = Math.max(...values);
  if (!Number.isFinite(max)) return max;
  let sum = 0;
  for (const value of values) sum += Math.exp(value - max);
  return max + Math.log(sum);
}

/**
 * Weighted soft-min  S_β(s; w) = −(1/β)·log Σ wᵢ e^{−β sᵢ}  with Σ wᵢ = 1.
 * Properties: min(s) ≤ S_β ≤ Σ wᵢ sᵢ; β → 0 gives the weighted mean and
 * β → ∞ the minimum. Zero-weight entries are ignored.
 * @throws If weights are negative or all zero, or lengths differ.
 */
export function softMin(scores: readonly number[], weights: readonly number[], beta: number): number {
  if (scores.length !== weights.length) throw new Error("softMin: length mismatch");
  let total = 0;
  for (const w of weights) {
    if (!(w >= 0)) throw new Error("softMin: weights must be non-negative");
    total += w;
  }
  if (!(total > 0)) throw new Error("softMin: weights must not all be zero");
  if (beta <= 0) return scores.reduce((sum, s, i) => sum + (weights[i]! / total) * s, 0);
  const terms: number[] = [];
  scores.forEach((s, i) => {
    const w = weights[i]! / total;
    if (w > 0) terms.push(Math.log(w) - beta * s);
  });
  return -logSumExp(terms) / beta;
}

/** Softmax with temperature `tau` (> 0). */
export function softmax(values: readonly number[], tau = 1): number[] {
  const scaled = values.map((value) => value / tau);
  const lse = logSumExp(scaled);
  return scaled.map((value) => Math.exp(value - lse));
}

/** Shannon entropy in nats of a probability vector. */
export function entropy(probabilities: readonly number[]): number {
  let h = 0;
  for (const p of probabilities) if (p > 0) h -= p * Math.log(p);
  return h;
}

/** Box–Muller standard normal draw from a uniform source. */
export function gaussian(random: Random): number {
  const u = Math.max(random(), Number.MIN_VALUE);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Average ranks (ties share their mean rank), 1-based. */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length).fill(0);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.value === order[start]!.value) end += 1;
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k += 1) out[order[k]!.index] = rank;
    start = end + 1;
  }
  return out;
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return Number.NaN;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : Number.NaN;
}

export function spearman(x: readonly number[], y: readonly number[]): number {
  return pearson(ranks(x), ranks(y));
}

/** Type-7 (linear interpolation) sample quantile, `p ∈ [0, 1]`. */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/**
 * ROC AUC (Mann–Whitney U / n₁n₀) of `scores` for binary `labels`, ties
 * counted as one half.
 */
export function auc(scores: readonly number[], labels: readonly boolean[]): number {
  const r = ranks(scores);
  let positives = 0;
  let rankSum = 0;
  labels.forEach((label, i) => {
    if (label) {
      positives += 1;
      rankSum += r[i]!;
    }
  });
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return Number.NaN;
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/**
 * Gini coefficient of a non-negative exposure vector, G ∈ [0, (n−1)/n]:
 * G = ΣᵢΣⱼ|xᵢ − xⱼ| / (2n²x̄), evaluated on the sorted values as
 * G = (2·Σᵢ i·x₍ᵢ₎)/(n·Σx) − (n+1)/n with i 1-based ascending.
 * No exposure at all is reported as 0 (there is nothing to distribute).
 * @throws On negative or non-finite entries: counts cannot be either.
 */
export function gini(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) {
    if (!Number.isFinite(v) || v < 0) throw new Error("gini: values must be finite and non-negative");
    sum += v;
  }
  if (sum === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let weighted = 0;
  sorted.forEach((v, k) => {
    weighted += (k + 1) * v;
  });
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

/** Plain cosine similarity; used only as the naive baseline in validation. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("cosine: length mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}
