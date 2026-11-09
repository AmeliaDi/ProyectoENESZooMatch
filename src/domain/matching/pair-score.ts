/**
 * Pair score of a track (docs/MATCHING.md §4):
 *
 *   S_core = −(1/β) log Σ_c w_c e^{−β s_c}                  (weighted soft-min)
 *   F      = Π_{c ∈ floors} min(1, s_c / floor_c)           (critical floors)
 *   total  = (1 − Σ_t τ_t) · F · S_core + Σ_t τ_t s_t        (minimal tail)
 *
 * Exact decomposition: with π_c = w_c e^{−β s_c} / Σ w e^{−β s} (= ∂S/∂s_c),
 * S_core = Σ π_c s_c + KL(π‖w)/β, so contribution_c = (1−Στ)·F·π_c·(s_c + KL/β)
 * for core and τ_t s_t for tail; contributions sum to `total` exactly. The
 * explanation engine shows these numbers and nothing else.
 */
import { logSumExp } from "@/domain/math";
import type { LatentProfile } from "@/types/latent";
import type { MatchCategoryId, MatchingConfig, TrackConfig } from "@/types/matching-config";

import { categorySimilarity } from "./layers";

export interface CategoryScore {
  readonly id: MatchCategoryId;
  readonly role: "core" | "tail";
  readonly similarity: number;
  readonly weight: number;
  readonly contribution: number;
}

export interface PairScore {
  readonly total: number;
  readonly core: number;
  readonly floorFactor: number;
  readonly categories: readonly CategoryScore[];
}

export type CategorySimilarities = Readonly<Partial<Record<MatchCategoryId, number>>>;

type Weights = Array<[MatchCategoryId, number]>;

function positive(weights: TrackConfig["core"]): Weights {
  return (Object.entries(weights) as Weights).filter(([, w]) => w > 0);
}

interface SoftMinParts {
  readonly value: number;
  readonly pi: number[];
  readonly residual: number;
}

/** Soft-min with its tilted weights π and residual KL(π‖w)/β (β = 0 → mean). */
function softMinParts(scores: readonly number[], weights: readonly number[], beta: number): SoftMinParts {
  const total = weights.reduce((s, w) => s + w, 0);
  const w = weights.map((x) => x / total);
  if (beta <= 0) return { value: w.reduce((s, x, i) => s + x * scores[i]!, 0), pi: w, residual: 0 };
  const logTerms = w.map((x, i) => Math.log(x) - beta * scores[i]!);
  const lse = logSumExp(logTerms);
  const pi = logTerms.map((t) => Math.exp(t - lse));
  const kl = pi.reduce((s, p, i) => (p > 0 ? s + p * Math.log(p / w[i]!) : s), 0);
  return { value: -lse / beta, pi, residual: kl / beta };
}

/** Similarity of every category in `ids` (all configured categories by default). */
export function categorySimilarities(
  a: LatentProfile,
  b: LatentProfile,
  categories: MatchingConfig["categories"],
  ids: readonly MatchCategoryId[] = Object.keys(categories) as MatchCategoryId[],
): CategorySimilarities {
  const out: Partial<Record<MatchCategoryId, number>> = {};
  for (const id of ids) out[id] = categorySimilarity(categories[id], a, b);
  return out;
}

export function trackCategoryIds(track: TrackConfig): MatchCategoryId[] {
  return [...positive(track.core), ...positive(track.tail)].map(([id]) => id);
}

/**
 * Nominal share of the track total a single factor can move: category weight ×
 * (factor weight / Σ of its category's factor weights), with core categories
 * scaled by (1 − Σ tail). The soft-min tilts the real share toward whichever
 * category scores worst, so a factor that disagrees is worth at least this.
 */
export function factorEffectiveWeights(
  track: TrackConfig,
  categories: MatchingConfig["categories"],
): Map<string, number> {
  const tailMass = positive(track.tail).reduce((s, [, w]) => s + w, 0);
  const out = new Map<string, number>();
  for (const [role, scale] of [["core", 1 - tailMass], ["tail", 1]] as const) {
    for (const [id, weight] of positive(role === "core" ? track.core : track.tail)) {
      const factors = categories[id].factors;
      const sum = Object.values(factors).reduce((s, w) => s + w, 0);
      for (const [factor, factorWeight] of Object.entries(factors)) {
        out.set(factor, (out.get(factor) ?? 0) + weight * scale * (factorWeight / sum));
      }
    }
  }
  return out;
}

/** Aggregates precomputed category similarities under a track's weights. */
export function aggregatePair(similarities: CategorySimilarities, track: TrackConfig): PairScore {
  const core = positive(track.core);
  const tail = positive(track.tail);
  const sim = new Map<MatchCategoryId, number>();
  for (const [id] of [...core, ...tail]) {
    const s = similarities[id];
    if (s === undefined) throw new Error(`aggregatePair: missing similarity for ${id}`);
    sim.set(id, s);
  }

  const coreScores = core.map(([id]) => sim.get(id)!);
  const parts = softMinParts(coreScores, core.map(([, w]) => w), track.beta);
  let floorFactor = 1;
  for (const [id, floor] of Object.entries(track.floors) as Weights) {
    const s = sim.get(id);
    if (s !== undefined && floor > 0) floorFactor *= Math.min(1, s / floor);
  }
  const tailMass = tail.reduce((s, [, w]) => s + w, 0);
  const coreScale = (1 - tailMass) * floorFactor;

  const scored: CategoryScore[] = [
    ...core.map(([id, weight], i): CategoryScore => ({
      id,
      role: "core",
      similarity: coreScores[i]!,
      weight,
      contribution: coreScale * parts.pi[i]! * (coreScores[i]! + parts.residual),
    })),
    ...tail.map(([id, weight]): CategoryScore => ({
      id,
      role: "tail",
      similarity: sim.get(id)!,
      weight,
      contribution: weight * sim.get(id)!,
    })),
  ];
  const total = scored.reduce((s, c) => s + c.contribution, 0);
  return { total: Math.min(1, Math.max(0, total)), core: parts.value, floorFactor, categories: scored };
}

export function pairScore(
  a: LatentProfile,
  b: LatentProfile,
  track: TrackConfig,
  categories: MatchingConfig["categories"],
): PairScore {
  return aggregatePair(categorySimilarities(a, b, categories, trackCategoryIds(track)), track);
}
