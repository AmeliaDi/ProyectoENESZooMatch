/**
 * Pair-level analysis. Category similarities are computed ONCE per pair with
 * the production domain code; every aggregation variant (β, weights,
 * ablations) re-aggregates those numbers with the production `aggregatePair`.
 */
import { MATCHING_CONFIG } from "@/config";
import { aggregatePair, categorySimilarities, checkHardFilters, type CategorySimilarities } from "@/domain/matching";
import { quantile } from "@/domain/math";
import type { Random } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { MatchCategoryId, TrackConfig } from "@/types/matching-config";
import type { MatchTrack } from "@/types/microtest";

import { oracle, type Person } from "./population";

export interface Pair {
  readonly i: number;
  readonly j: number;
  readonly sims: CategorySimilarities;
  /** Same similarities on the TRUE traits (generator ground truth, SE = 0). */
  readonly oracleSims: CategorySimilarities;
  /** Romance hard filters pass (friendship is always eligible). */
  readonly romanceEligible: boolean;
}

export function allPairs(people: readonly Person[]): Pair[] {
  const truth = people.map(oracle);
  const pairs: Pair[] = [];
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i]!;
      const b = people[j]!;
      pairs.push({
        i,
        j,
        sims: categorySimilarities(a.latent, b.latent, MATCHING_CONFIG.categories),
        oracleSims: categorySimilarities(truth[i]!, truth[j]!, MATCHING_CONFIG.categories),
        romanceEligible: checkHardFilters(a.filters, b.filters),
      });
    }
  }
  return pairs;
}

export function eligible(pairs: readonly Pair[], track: MatchTrack): Pair[] {
  return track === "romance" ? pairs.filter((p) => p.romanceEligible) : [...pairs];
}

export const totals = (pairs: readonly Pair[], track: TrackConfig): number[] =>
  pairs.map((p) => aggregatePair(p.sims, track).total);

/**
 * Permutation null ("baraja de respuestas"): each null profile takes every
 * factor (θ̂ and its SE together) from an independently drawn real person.
 * Marginals and measurement precision are preserved; the coherence WITHIN a
 * profile is destroyed. Pairs of such profiles are compatible only by chance,
 * and the threshold is the (1 − α) quantile of their scores.
 */
function nullProfiles(people: readonly Person[], random: Random): LatentProfile[] {
  const factors = Object.keys(people[0]!.latent.theta);
  return people.map(() => {
    const theta: Record<string, number> = {};
    const se: Record<string, number> = {};
    for (const f of factors) {
      const donor = people[Math.floor(random() * people.length)]!.latent;
      theta[f] = donor.theta[f]!;
      se[f] = donor.se[f]!;
    }
    return { theta, se, quality: 1, answered: 0 };
  });
}

export function nullSims(people: readonly Person[], count: number, random: Random): CategorySimilarities[] {
  const shuffled = nullProfiles(people, random);
  return Array.from({ length: count }, () => {
    const i = Math.floor(random() * shuffled.length);
    const j = (i + 1 + Math.floor(random() * (shuffled.length - 1))) % shuffled.length;
    return categorySimilarities(shuffled[i]!, shuffled[j]!, MATCHING_CONFIG.categories);
  });
}

export function nullThreshold(nulls: readonly CategorySimilarities[], track: TrackConfig, alpha: number): number {
  return quantile(
    nulls.map((s) => aggregatePair(s, track).total),
    1 - alpha,
  );
}

export interface Selection {
  readonly selected: Set<number>;
  readonly coverage: number;
  readonly byPerson: number[];
}

/** Pairs strictly above the threshold, then top-K per person (production rule). */
export function select(
  people: readonly Person[],
  pairs: readonly Pair[],
  scores: readonly number[],
  threshold: number,
  maxMatches: number,
): Selection {
  const lists = people.map((): Array<[number, number]> => []);
  pairs.forEach((p, k) => {
    if (scores[k]! <= threshold) return;
    lists[p.i]!.push([k, scores[k]!]);
    lists[p.j]!.push([k, scores[k]!]);
  });
  const selected = new Set<number>();
  for (const list of lists) {
    list.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [k] of list.slice(0, maxMatches)) selected.add(k);
  }
  const byPerson = people.map(() => 0);
  for (const k of selected) {
    byPerson[pairs[k]!.i]! += 1;
    byPerson[pairs[k]!.j]! += 1;
  }
  return { selected, coverage: byPerson.filter((c) => c > 0).length / people.length, byPerson };
}

export function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Track with some categories removed; remaining core weights renormalized. */
export function ablate(track: TrackConfig, remove: readonly MatchCategoryId[]): TrackConfig {
  const drop = new Set(remove);
  const keep = <T>(record: Partial<Record<MatchCategoryId, T>>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => !drop.has(id as MatchCategoryId))) as Partial<Record<MatchCategoryId, T>>;
  const core = keep(track.core);
  const sum = Object.values(core).reduce((s, w) => s + (w ?? 0), 0);
  return {
    ...track,
    core: Object.fromEntries(Object.entries(core).map(([id, w]) => [id, (w ?? 0) / sum])),
    tail: keep(track.tail),
    floors: keep(track.floors),
  };
}
