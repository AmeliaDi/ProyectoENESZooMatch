/**
 * Shared synthetic world for the validation: the SAME population, pairs and
 * oracle labels as `npm run data:matching` (same seeds), plus the extra views
 * the preregistered hypotheses need (noise, core-only re-scoring).
 */
import { MATCHING_CONFIG } from "@/config";
import { aggregatePair, categorySimilarities, type CategorySimilarities } from "@/domain/matching";
import { scoreLatent } from "@/domain/psychometrics/latent";
import { mulberry32 } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { TrackConfig } from "@/types/matching-config";
import type { MatchTrack } from "@/types/microtest";

import { allPairs, eligible, totals, type Pair } from "../matching/analysis";
import { HYPOTHESES, baselineScores, topShare } from "../matching/metrics";
import { CORE_IDS, MODEL, makePopulation, perturbed, type Person } from "../matching/population";
import { TRUE_MATCH_SHARE, seedFor } from "../matching/track-analysis";

export const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];
const NOISE_SHARE = 0.1;
const CORE = new Set(CORE_IDS);

export interface TrackView {
  readonly track: MatchTrack;
  readonly cfg: TrackConfig;
  readonly pairs: readonly Pair[];
  readonly scores: readonly number[];
  readonly baseline: readonly number[];
  /** Oracle labels: top share of eligible pairs under each generating hypothesis. */
  readonly labels: Readonly<Record<string, readonly boolean[]>>;
  readonly noisyScores: readonly number[];
}

export interface World {
  readonly people: readonly Person[];
  readonly all: readonly Pair[];
  /** Index of people who completed every optional module. */
  readonly fullBank: readonly number[];
  /** Same people re-scored with their core answers only (no imputation). */
  readonly coreOnly: ReadonlyMap<number, LatentProfile>;
  readonly views: Readonly<Record<MatchTrack, TrackView>>;
}

export const isFullBank = (p: Person) => p.responses.some((r) => !CORE.has(r.itemId));

export function coreOnlyProfile(p: Person): LatentProfile {
  return scoreLatent(MODEL, p.responses.filter((r) => CORE.has(r.itemId)), MATCHING_CONFIG.quality);
}

function trackView(track: MatchTrack, people: readonly Person[], all: readonly Pair[], noisy: readonly CategorySimilarities[]): TrackView {
  const cfg = MATCHING_CONFIG.tracks[track];
  const pairs = eligible(all, track);
  const keep = track === "romance" ? all.map((p) => p.romanceEligible) : all.map(() => true);
  const labels = Object.fromEntries(
    Object.entries(HYPOTHESES).map(([h, fn]) => [h, topShare(pairs.map((p) => fn(people[p.i]!, people[p.j]!, cfg, p)), TRUE_MATCH_SHARE)]),
  );
  return {
    track,
    cfg,
    pairs,
    scores: totals(pairs, cfg),
    baseline: baselineScores(people, pairs, cfg),
    labels,
    noisyScores: noisy.filter((_, k) => keep[k]).map((s) => aggregatePair(s, cfg).total),
  };
}

export function buildWorld(size: number): World {
  const people = makePopulation(size, mulberry32(seedFor("population")), MATCHING_CONFIG.quality);
  const all = allPairs(people);
  const noiseRandom = mulberry32(seedFor("noise"));
  const noisyLatent = people.map((p) => perturbed(p, NOISE_SHARE, noiseRandom, MATCHING_CONFIG.quality));
  const noisy = all.map((p) => categorySimilarities(noisyLatent[p.i]!, noisyLatent[p.j]!, MATCHING_CONFIG.categories));
  const fullBank = people.flatMap((p, k) => (isFullBank(p) ? [k] : []));
  const coreOnly = new Map(fullBank.map((k) => [k, coreOnlyProfile(people[k]!)]));
  const views = Object.fromEntries(TRACKS.map((t) => [t, trackView(t, people, all, noisy)])) as Record<MatchTrack, TrackView>;
  return { people, all, fullBank, coreOnly, views };
}
