/**
 * Samejima graded response model, NORMAL-OGIVE form, matching the offline
 * estimation in scripts/psychometrics/irt.py:
 *
 *   P*(X' ≥ j+1 | θ) = Φ(a(θ − b_j)),  j = 1..4,   P*(≥1) = 1,  P*(≥6) = 0
 *   P(X' = k) = P*(≥k) − P*(≥k+1)
 *
 * where X' = X for keyed items and X' = 6 − X for reverse-keyed items (the
 * thresholds were estimated on the reversed response).
 */
import { normalCdf, normalPdf, PROBABILITY_FLOOR } from "@/domain/math";

export interface GrmItem {
  readonly factor: string;
  readonly clave: 1 | -1;
  readonly a: number;
  readonly b: readonly number[];
}

export const LIKERT_CATEGORIES = 5;
const LIKERT_REVERSE_PIVOT = LIKERT_CATEGORIES + 1;

/** 0-based keyed category of a raw 1..5 response. */
export function keyedCategory(item: GrmItem, response: number): number {
  return (item.clave === 1 ? response : LIKERT_REVERSE_PIVOT - response) - 1;
}

/** Φ(hi) − Φ(lo) without catastrophic cancellation in the upper tail. */
function normalInterval(lo: number, hi: number): number {
  if (lo === Number.NEGATIVE_INFINITY) return normalCdf(hi);
  if (hi === Number.POSITIVE_INFINITY) return normalCdf(-lo);
  return lo > 0 ? normalCdf(-lo) - normalCdf(-hi) : normalCdf(hi) - normalCdf(lo);
}

/**
 * For 0-based keyed category k: P(X' = k+1) = Φ(z_hi) − Φ(z_lo) with
 * z_hi = a(θ − b[k−1]) (+∞ for k = 0) and z_lo = a(θ − b[k]) (−∞ for k = 4).
 */
function boundaries(item: GrmItem, theta: number, k: number): { lo: number; hi: number } {
  const zUpper = k === 0 ? Number.POSITIVE_INFINITY : item.a * (theta - item.b[k - 1]!);
  const zLower = k === LIKERT_CATEGORIES - 1 ? Number.NEGATIVE_INFINITY : item.a * (theta - item.b[k]!);
  return { lo: zLower, hi: zUpper };
}

function density(z: number): number {
  return Number.isFinite(z) ? normalPdf(z) : 0;
}

/** Probabilities of the five keyed categories at θ (sum to 1 up to round-off). */
export function categoryProbabilities(item: GrmItem, theta: number): number[] {
  return Array.from({ length: LIKERT_CATEGORIES }, (_, k) => {
    const { lo, hi } = boundaries(item, theta, k);
    return Math.max(normalInterval(lo, hi), PROBABILITY_FLOOR);
  });
}

export interface ItemEvaluation {
  /** log P(observed | θ). */
  readonly logLik: number;
  /** ∂ log P / ∂θ. */
  readonly gradient: number;
  /** Fisher information I(θ) = Σ_k (∂P_k/∂θ)² / P_k. */
  readonly information: number;
}

/** Log-likelihood, score and Fisher information of one response at θ. */
export function evaluateItem(item: GrmItem, response: number, theta: number): ItemEvaluation {
  let information = 0;
  let logLik = 0;
  let gradient = 0;
  const observed = keyedCategory(item, response);
  for (let k = 0; k < LIKERT_CATEGORIES; k += 1) {
    const { lo, hi } = boundaries(item, theta, k);
    const p = Math.max(normalInterval(lo, hi), PROBABILITY_FLOOR);
    const dp = item.a * (density(hi) - density(lo));
    information += (dp * dp) / p;
    if (k === observed) {
      logLik = Math.log(p);
      gradient = dp / p;
    }
  }
  return { logLik, gradient, information };
}

/** E[log P] and Var[log P] under the model at θ (for the lz person-fit index). */
export function logLikMoments(item: GrmItem, theta: number): { mean: number; variance: number } {
  const probabilities = categoryProbabilities(item, theta);
  let mean = 0;
  let second = 0;
  for (const p of probabilities) {
    const l = Math.log(p);
    mean += p * l;
    second += p * l * l;
  }
  return { mean, variance: Math.max(0, second - mean * mean) };
}
