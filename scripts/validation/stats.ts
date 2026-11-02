/**
 * Small, dependency-free statistics for the synthetic validation
 * (docs/PREREGISTRO.md): multiplicity control, Wilson interval, calibration
 * metrics and a 1-D logistic (Platt) fit.
 */

/** Holm step-down adjusted p-values (monotone, capped at 1). */
export function holm(p: readonly number[]): number[] {
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(p.length).fill(1);
  let running = 0;
  order.forEach(([v, i], k) => {
    running = Math.max(running, Math.min(1, (p.length - k) * v));
    out[i] = running;
  });
  return out;
}

/** Benjamini–Hochberg adjusted p-values (q-values). */
export function benjaminiHochberg(p: readonly number[]): number[] {
  const m = p.length;
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const out = new Array<number>(m).fill(1);
  let running = 1;
  order.forEach(([v, i], k) => {
    const rank = m - k;
    running = Math.min(running, (m * v) / rank);
    out[i] = Math.min(1, running);
  });
  return out;
}

/** Wilson 95 % score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.959963984540054): { lo: number; hi: number } {
  if (n === 0) return { lo: Number.NaN, hi: Number.NaN };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export function brier(prob: readonly number[], labels: readonly boolean[]): number {
  return prob.reduce((s, p, i) => s + (p - (labels[i] ? 1 : 0)) ** 2, 0) / prob.length;
}

export interface Bin {
  readonly meanPredicted: number;
  readonly observed: number;
  readonly n: number;
}

/** Equal-frequency reliability bins of `score` against the observed label rate. */
export function reliabilityBins(score: readonly number[], labels: readonly boolean[], bins: number): Bin[] {
  const order = score.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]);
  return Array.from({ length: bins }, (_, b) => {
    const slice = order.slice(Math.floor((b * order.length) / bins), Math.floor(((b + 1) * order.length) / bins));
    const n = slice.length;
    return {
      meanPredicted: slice.reduce((s, [v]) => s + v, 0) / Math.max(1, n),
      observed: slice.filter(([, i]) => labels[i]).length / Math.max(1, n),
      n,
    };
  });
}

/** Expected calibration error over equal-frequency bins. */
export function ece(prob: readonly number[], labels: readonly boolean[], bins: number): number {
  const total = prob.length;
  return reliabilityBins(prob, labels, bins).reduce((s, b) => s + (b.n / total) * Math.abs(b.meanPredicted - b.observed), 0);
}

export interface Platt {
  readonly a: number;
  readonly b: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Logistic fit p = σ(a·x + b) by Newton–Raphson on the log-likelihood. */
export function fitPlatt(x: readonly number[], labels: readonly boolean[], iterations = 50): Platt {
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / x.length) || 1;
  let [a, b] = [0, 0];
  for (let it = 0; it < iterations; it += 1) {
    let [ga, gb, haa, hab, hbb] = [0, 0, 0, 0, 0];
    x.forEach((v, i) => {
      const z = (v - mx) / sx;
      const p = sigmoid(a * z + b);
      const r = (labels[i] ? 1 : 0) - p;
      const w = p * (1 - p);
      ga += r * z;
      gb += r;
      haa += w * z * z;
      hab += w * z;
      hbb += w;
    });
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a += da;
    b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  // Back to the raw score scale.
  return { a: a / sx, b: b - (a * mx) / sx };
}

export const applyPlatt = (m: Platt, x: number) => sigmoid(m.a * x + m.b);

/** One-sided bootstrap p-value for H0: Δ ≤ 0, with the +1 correction. */
export function bootstrapP(draws: readonly number[]): number {
  return (1 + draws.filter((d) => d <= 0).length) / (draws.length + 1);
}
