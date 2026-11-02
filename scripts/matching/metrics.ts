/**
 * Validation metrics: recovery AUC under alternative generating hypotheses,
 * person-cluster bootstrap, Morris screening of the core weights.
 */
import { MATCHING_CONFIG } from "@/config";
import { aggregatePair } from "@/domain/matching";
import { auc, cosine, quantile, spearman } from "@/domain/math";
import type { Random } from "@/domain/shared";
import type { MatchCategoryId, TrackConfig } from "@/types/matching-config";

import type { Pair } from "./analysis";
import { MODEL, type Person } from "./population";

const HEXACO = ["hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o"] as const;
const VALUES = ["val_apertura_cambio", "val_autopromocion", "val_autotrascendencia", "val_conservacion", "val_presente"] as const;
const WINDOW_TOLERANCE = 0.75;
const WINDOW_SCALE = 0.8;

const idx = (f: string) => MODEL.factorIndex.get(f)!;

/** Generating hypotheses on the TRUE traits (the generator's ground truth). */
export const HYPOTHESES: Record<string, (a: Person, b: Person, track: TrackConfig, pair: Pair) => number> = {
  similitud: (_a, _b, track, pair) => aggregatePair(pair.oracleSims, track).total,
  ventana: (a, b) => {
    let log = 0;
    for (const f of [...HEXACO, ...VALUES]) {
      const excess = Math.max(0, Math.abs(a.theta[idx(f)]! - b.theta[idx(f)]!) - WINDOW_TOLERANCE) / WINDOW_SCALE;
      log -= 0.5 * excess * excess;
    }
    return Math.exp(log);
  },
  complementariedad_x: (a, b) => {
    let d2 = 0;
    for (const f of [...HEXACO, ...VALUES]) {
      const [ta, tb] = [a.theta[idx(f)]!, b.theta[idx(f)]!];
      d2 += f === "hex_x" ? (ta + tb) ** 2 : (ta - tb) ** 2;
    }
    return Math.exp((-0.5 * d2) / (HEXACO.length + VALUES.length));
  },
};

/** Naive baseline input: per-factor mean of keyed answers rescaled to [0, 1]. */
function descriptiveVector(person: Person, factors: readonly string[]): number[] {
  const sums = new Map<string, [number, number]>();
  for (const { itemId, value } of person.responses) {
    const item = MODEL.items.get(itemId)!;
    const keyed = item.clave === 1 ? value : 6 - value;
    const [s, n] = sums.get(item.factor) ?? [0, 0];
    sums.set(item.factor, [s + keyed, n + 1]);
  }
  return factors.map((f) => {
    const [s, n] = sums.get(f) ?? [0, 0];
    return n === 0 ? 0.5 : (s / n - 1) / 4;
  });
}

function trackFactors(track: TrackConfig): string[] {
  return (Object.keys(track.core) as MatchCategoryId[]).flatMap((id) => Object.keys(MATCHING_CONFIG.categories[id].factors));
}

/** Baseline: uncentered cosine of descriptive [0, 1] vectors (the previous engine's core idea). */
export function baselineScores(people: readonly Person[], pairs: readonly Pair[], track: TrackConfig): number[] {
  const factors = trackFactors(track);
  const vectors = people.map((p) => descriptiveVector(p, factors));
  return pairs.map((p) => cosine(vectors[p.i]!, vectors[p.j]!));
}

export interface Interval {
  readonly estimate: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * AUC with a person-cluster bootstrap (pairs sharing a person are not
 * independent): resample people, keep pairs whose two members were drawn.
 */
export function aucWithBootstrap(
  people: readonly Person[],
  pairs: readonly Pair[],
  scores: readonly number[],
  labels: readonly boolean[],
  reps: number,
  random: Random,
): Interval {
  const estimate = auc(scores, labels);
  const draws: number[] = [];
  for (let r = 0; r < reps; r += 1) {
    const drawn = new Array<boolean>(people.length).fill(false);
    for (let k = 0; k < people.length; k += 1) drawn[Math.floor(random() * people.length)] = true;
    const s: number[] = [];
    const l: boolean[] = [];
    pairs.forEach((p, k) => {
      if (drawn[p.i] && drawn[p.j]) {
        s.push(scores[k]!);
        l.push(labels[k]!);
      }
    });
    const value = auc(s, l);
    if (Number.isFinite(value)) draws.push(value);
  }
  return { estimate, lo: draws.length ? quantile(draws, 0.025) : Number.NaN, hi: draws.length ? quantile(draws, 0.975) : Number.NaN };
}

export function topShare(values: readonly number[], share: number): boolean[] {
  const cut = quantile(values, 1 - share);
  return values.map((v) => v >= cut);
}

export interface MorrisRow {
  readonly id: MatchCategoryId;
  readonly muStar: number;
  readonly sigma: number;
}

/**
 * Morris elementary effects on the core weights: each weight is scaled by
 * m ∈ [0.5, 1.5] (renormalized), output Y = Spearman(totals, config totals)
 * on a fixed sample of pairs. μ* = mean |EE|, σ = SD of EE. Levels p = 4,
 * Δ = p / (2(p − 1)), r trajectories (Morris 1991; Campolongo et al. 2007).
 */
export function morris(pairs: readonly Pair[], track: TrackConfig, trajectories: number, random: Random): MorrisRow[] {
  const ids = Object.keys(track.core) as MatchCategoryId[];
  const levels = 4;
  const delta = levels / (2 * (levels - 1));
  const base = pairs.map((p) => aggregatePair(p.sims, track).total);
  const output = (x: readonly number[]) => {
    const raw = ids.map((id, k) => (track.core[id] ?? 0) * (0.5 + x[k]!));
    const sum = raw.reduce((s, w) => s + w, 0);
    const variant = { ...track, core: Object.fromEntries(ids.map((id, k) => [id, raw[k]! / sum])) };
    return spearman(pairs.map((p) => aggregatePair(p.sims, variant).total), base);
  };
  const effects = ids.map((): number[] => []);
  for (let t = 0; t < trajectories; t += 1) {
    const x = ids.map(() => Math.floor(random() * (levels / 2)) / (levels - 1));
    let y = output(x);
    const order = ids.map((_, k) => ({ k, r: random() })).sort((a, b) => a.r - b.r).map(({ k }) => k);
    for (const k of order) {
      x[k]! += delta;
      const next = output(x);
      effects[k]!.push((next - y) / delta);
      y = next;
    }
  }
  return ids.map((id, k) => {
    const e = effects[k]!;
    const mean = e.reduce((s, v) => s + v, 0) / e.length;
    const muStar = e.reduce((s, v) => s + Math.abs(v), 0) / e.length;
    const sigma = Math.sqrt(e.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, e.length - 1));
    return { id, muStar, sigma };
  });
}
