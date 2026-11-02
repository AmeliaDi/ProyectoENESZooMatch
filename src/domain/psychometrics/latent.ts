/**
 * Bayesian latent scoring (docs/MATCHING.md §2).
 *
 * Posterior over all factors θ ∈ ℝ^K under the normal-ogive GRM with the
 * multivariate prior θ ~ N(0, R), R = latent correlation matrix estimated
 * offline (data/psychometric-params.json):
 *
 *   log p(θ | x) = q · Σ_i log P(x_i | θ_{f(i)}) − ½ θᵀ R⁻¹ θ + const
 *
 * The mode θ̂ is found by Fisher scoring (the GRM log-likelihood is concave
 * in θ, so the objective is strictly concave), and Σ̂ = (R⁻¹ + q·diag(I))⁻¹
 * is the Laplace posterior covariance. Unanswered factors are never imputed:
 * they keep the prior conditional on the answered ones, so their SD stays
 * near 1. The quality weight q ∈ (0, 1] tempers the likelihood (power
 * posterior): low-quality response patterns shrink toward the population
 * mean and get wider intervals.
 */
import { cholesky, choleskySolve, inverseFromCholesky, type Matrix } from "@/domain/math";
import type { LatentProfile } from "@/types/latent";
import type { QualityConfig } from "@/types/matching-config";

import { evaluateItem, logLikMoments, type GrmItem } from "./grm";

export interface ParamsSource {
  readonly factores: readonly string[];
  readonly covarianza_latente: { readonly matriz: readonly (readonly number[])[] };
  readonly items: Readonly<Record<string, GrmItem>>;
}

export interface MeasurementModel {
  readonly factors: readonly string[];
  readonly factorIndex: ReadonlyMap<string, number>;
  readonly items: ReadonlyMap<string, GrmItem & { readonly index: number }>;
  /** R⁻¹ (prior precision). */
  readonly precision: Matrix;
}

export interface LatentResponse {
  readonly itemId: string;
  readonly value: number;
}

const MAX_ITERATIONS = 60;
const CONVERGENCE = 1e-7;
const MAX_HALVINGS = 30;
/** Values are rounded before persistence; 4 decimals ≪ any posterior SD. */
const STORAGE_DECIMALS = 4;

export function buildMeasurementModel(params: ParamsSource): MeasurementModel {
  const factors = [...params.factores];
  const factorIndex = new Map(factors.map((factor, i) => [factor, i]));
  const items = new Map<string, GrmItem & { index: number }>();
  for (const [id, item] of Object.entries(params.items)) {
    const index = factorIndex.get(item.factor);
    if (index === undefined) throw new Error(`item ${id}: unknown factor ${item.factor}`);
    items.set(id, { factor: item.factor, clave: item.clave, a: item.a, b: [...item.b], index });
  }
  const r = params.covarianza_latente.matriz.map((row) => [...row]);
  const precision = inverseFromCholesky(cholesky(r).lower);
  return { factors, factorIndex, items, precision };
}

interface Evaluation {
  objective: number;
  gradient: number[];
  information: number[];
}

function evaluate(
  model: MeasurementModel,
  responses: readonly LatentResponse[],
  theta: readonly number[],
  q: number,
): Evaluation {
  const k = theta.length;
  const gradient = new Array<number>(k).fill(0);
  const information = new Array<number>(k).fill(0);
  let objective = 0;
  for (const { itemId, value } of responses) {
    const item = model.items.get(itemId)!;
    const e = evaluateItem(item, value, theta[item.index]!);
    objective += q * e.logLik;
    gradient[item.index]! += q * e.gradient;
    information[item.index]! += q * e.information;
  }
  for (let i = 0; i < k; i += 1) {
    let pt = 0;
    const row = model.precision[i]!;
    for (let j = 0; j < k; j += 1) pt += row[j]! * theta[j]!;
    gradient[i]! -= pt;
    objective -= 0.5 * theta[i]! * pt;
  }
  return { objective, gradient, information };
}

function curvature(model: MeasurementModel, information: readonly number[]): Matrix {
  return model.precision.map((row, i) => row.map((v, j) => (i === j ? v + information[i]! : v)));
}

export interface Posterior {
  readonly theta: number[];
  readonly covariance: Matrix;
}

/** MAP + Laplace posterior with likelihood temperature `q`. */
export function posterior(model: MeasurementModel, responses: readonly LatentResponse[], q = 1): Posterior {
  const known = responses.filter((r) => model.items.has(r.itemId));
  let theta = new Array<number>(model.factors.length).fill(0);
  let current = evaluate(model, known, theta, q);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const { lower } = cholesky(curvature(model, current.information));
    const step = choleskySolve(lower, current.gradient);
    let scale = 1;
    let next = theta.map((t, i) => t + step[i]!);
    let candidate = evaluate(model, known, next, q);
    for (let h = 0; h < MAX_HALVINGS && !(candidate.objective >= current.objective - 1e-12); h += 1) {
      scale /= 2;
      next = theta.map((t, i) => t + scale * step[i]!);
      candidate = evaluate(model, known, next, q);
    }
    const moved = Math.max(...step.map((s) => Math.abs(s * scale)));
    theta = next;
    current = candidate;
    if (moved < CONVERGENCE) break;
  }
  const { lower } = cholesky(curvature(model, current.information));
  return { theta, covariance: inverseFromCholesky(lower) };
}

/** Standardized log-likelihood person-fit index lz (Drasgow et al., 1985). */
export function personFit(model: MeasurementModel, responses: readonly LatentResponse[], theta: readonly number[]): number {
  let observed = 0;
  let expected = 0;
  let variance = 0;
  for (const { itemId, value } of responses) {
    const item = model.items.get(itemId);
    if (!item) continue;
    const t = theta[item.index]!;
    observed += evaluateItem(item, value, t).logLik;
    const m = logLikMoments(item, t);
    expected += m.mean;
    variance += m.variance;
  }
  return variance > 0 ? (observed - expected) / Math.sqrt(variance) : 0;
}

function longestRun(values: readonly number[]): number {
  let best = 0;
  let run = 0;
  values.forEach((v, i) => {
    run = i > 0 && v === values[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

function sd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
}

/** Linear ramp: 1 at `good`, `floor` at `bad` (either orientation). */
function ramp(value: number, good: number, bad: number, floor: number): number {
  const t = (value - bad) / (good - bad);
  return floor + (1 - floor) * Math.min(1, Math.max(0, t));
}

export interface QualityReport {
  readonly quality: number;
  readonly lz: number;
  readonly longstring: number;
  readonly sd: number;
}

/** Quality in [minimum, 1] from person fit, longstring and intra-person SD. */
export function responseQuality(
  model: MeasurementModel,
  responses: readonly LatentResponse[],
  theta: readonly number[],
  cfg: QualityConfig,
): QualityReport {
  const values = responses.map((r) => r.value);
  const lz = personFit(model, responses, theta);
  const longstring = longestRun(values);
  const spread = sd(values);
  const quality = Math.min(
    ramp(lz, cfg.lz_ok, cfg.lz_floor, cfg.minimum),
    ramp(longstring, cfg.longstring_ok, cfg.longstring_max, cfg.minimum),
    ramp(spread, cfg.sd_ok, 0, cfg.minimum),
  );
  return { quality, lz, longstring, sd: spread };
}

function round(value: number): number {
  const f = 10 ** STORAGE_DECIMALS;
  return Math.round(value * f) / f;
}

/**
 * Full latent profile: untempered MAP → quality → tempered MAP when q < 1.
 * `responses` must be in presentation order (longstring depends on it).
 */
export function scoreLatent(
  model: MeasurementModel,
  responses: readonly LatentResponse[],
  cfg: QualityConfig,
): LatentProfile {
  const known = responses.filter((r) => model.items.has(r.itemId));
  const first = posterior(model, known, 1);
  const { quality } = responseQuality(model, known, first.theta, cfg);
  const final = quality < 1 ? posterior(model, known, quality) : first;
  const theta: Record<string, number> = {};
  const se: Record<string, number> = {};
  model.factors.forEach((factor, i) => {
    theta[factor] = round(final.theta[i]!);
    se[factor] = round(Math.sqrt(Math.max(final.covariance[i]![i]!, 0)));
  });
  return { theta, se, quality: round(quality), answered: known.length };
}
