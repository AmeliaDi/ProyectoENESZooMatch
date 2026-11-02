/**
 * Per-track calibration and validation tables (docs/MATCHING_RESULTADOS.md).
 */
import { createHash } from "node:crypto";

import { MATCHING_CONFIG } from "@/config";
import { aggregatePair } from "@/domain/matching";
import { quantile, spearman } from "@/domain/math";
import { mulberry32 } from "@/domain/shared";
import type { MatchCategoryId, TrackConfig } from "@/types/matching-config";
import type { MatchTrack } from "@/types/microtest";

import { ablate, eligible, jaccard, nullSims, nullThreshold, select, totals, type Pair } from "./analysis";
import { HYPOTHESES, aucWithBootstrap, baselineScores, morris, topShare } from "./metrics";
import { SUBPOPULATIONS, type Person } from "./population";
import type { TrackReport } from "./report";

const BETAS = [0, 2, 4, 6, 10, 20] as const;
const BOOTSTRAP_REPS = 100;
const MORRIS_TRAJECTORIES = 20;
const MORRIS_PAIRS = 6000;
export const TRUE_MATCH_SHARE = 0.1;
/** Achievable ceiling used to scale relative positions above the threshold. */
export const REFERENCE_QUANTILE = 0.999;

export const seedFor = (stage: string) =>
  (MATCHING_CONFIG.calibration.seed ^ createHash("sha256").update(stage).digest().readUInt32LE(0)) >>> 0;

/** Weakest core area of each published match, summarized by its P10 and median. */
function weakestArea(pairs: readonly Pair[], chosen: ReadonlySet<number>, track: TrackConfig) {
  const core = Object.keys(track.core) as MatchCategoryId[];
  const minima = [...chosen].map((k) => Math.min(...core.map((id) => pairs[k]!.sims[id]!)));
  return { p10: quantile(minima, 0.1), median: quantile(minima, 0.5) };
}

function contributionShare(pairs: readonly Pair[], track: TrackConfig, ids: readonly MatchCategoryId[]): number {
  let sum = 0;
  for (const p of pairs) {
    const score = aggregatePair(p.sims, track);
    const part = score.categories.filter((c) => ids.includes(c.id)).reduce((t, c) => t + c.contribution, 0);
    if (score.total > 0) sum += part / score.total;
  }
  return sum / pairs.length;
}

const EXTRAS: readonly MatchCategoryId[] = ["conflicto", "apego", "afecto"];
const IDENTITY: readonly MatchCategoryId[] = ["mbti", "eneagrama"];

function ablationVariants(cfg: TrackConfig): Array<[string, MatchCategoryId[]]> {
  return [
    ["sin MBTI", ["mbti"]],
    ["sin Eneagrama", ["eneagrama"]],
    ["sin capa 4 (MBTI + Eneagrama)", [...IDENTITY]],
    ["sin extras (conflicto, apego, afecto)", [...EXTRAS]],
    ["sin Big Five (peso 0)", ["big_five"]],
    ...(Object.keys(cfg.core) as MatchCategoryId[]).map((id): [string, MatchCategoryId[]] => [`sin ${id}`, [id]]),
  ];
}

export function analyseTrack(name: MatchTrack, people: readonly Person[], all: readonly Pair[], noisy: readonly Pair[]): TrackReport {
  const cfg = MATCHING_CONFIG.tracks[name];
  const pairs = eligible(all, name);
  const nulls = nullSims(people, MATCHING_CONFIG.calibration.null_pairs, mulberry32(seedFor(`null:${name}`)));
  const nullTotals = nulls.map((s) => aggregatePair(s, cfg).total);
  const threshold = quantile(nullTotals, 1 - cfg.null_alpha);
  const scores = totals(pairs, cfg);
  const chosen = select(people, pairs, scores, threshold, cfg.max_matches);

  const betas = BETAS.map((beta) => {
    const variant = { ...cfg, beta };
    const t = nullThreshold(nulls, variant, cfg.null_alpha);
    const s = totals(pairs, variant);
    const sel = select(people, pairs, s, t, cfg.max_matches);
    return { beta, threshold: t, coverage: sel.coverage, ...weakestArea(pairs, sel.selected, cfg), rho: spearman(s, scores) };
  });

  const labelsBy = Object.fromEntries(
    Object.entries(HYPOTHESES).map(([h, fn]) => [h, topShare(pairs.map((p) => fn(people[p.i]!, people[p.j]!, cfg, p)), TRUE_MATCH_SHARE)]),
  );
  const baseline = baselineScores(people, pairs, cfg);
  const recovery = Object.entries(labelsBy).map(([hypothesis, labels], n) => ({
    hypothesis,
    model: aucWithBootstrap(people, pairs, scores, labels, BOOTSTRAP_REPS, mulberry32(seedFor(`boot:${name}:${n}`))),
    baseline: aucWithBootstrap(people, pairs, baseline, labels, BOOTSTRAP_REPS, mulberry32(seedFor(`boot:${name}:${n}`))),
  }));

  const ablation = ablationVariants(cfg).map(([label, remove]) => {
    const variant = ablate(cfg, remove);
    const s = totals(pairs, variant);
    const sel = select(people, pairs, s, nullThreshold(nulls, variant, cfg.null_alpha), cfg.max_matches);
    return { label, rho: spearman(s, scores), jaccard: jaccard(sel.selected, chosen.selected), coverage: sel.coverage, auc: aucWithBootstrap(people, pairs, s, labelsBy.similitud!, 0, mulberry32(1)).estimate };
  });

  const noisyPairs = eligible(noisy, name);
  const noisyScores = totals(noisyPairs, cfg);
  const noisySel = select(people, noisyPairs, noisyScores, threshold, cfg.max_matches);

  const equity = SUBPOPULATIONS.map(({ id }) => {
    const members = people.flatMap((p, k) => (p.group === id ? [k] : []));
    const options = members.map((k) => pairs.filter((p) => p.i === k || p.j === k).length);
    return {
      group: id,
      n: members.length,
      eligiblePartners: options.reduce((s, v) => s + v, 0) / Math.max(1, members.length),
      coverage: members.filter((k) => chosen.byPerson[k]! > 0).length / Math.max(1, members.length),
    };
  });

  const stride = Math.max(1, Math.floor(pairs.length / MORRIS_PAIRS));
  return {
    track: name,
    alpha: cfg.null_alpha,
    pairs: pairs.length,
    threshold,
    above: scores.filter((s) => s > threshold).length / scores.length,
    coverage: chosen.coverage,
    matches: chosen.selected.size,
    quantiles: [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1].map((q) => ({ q, real: quantile(scores, q), null: quantile(nullTotals, q) })),
    coverageCurve: [0.8, 0.85, 0.9, 0.95, 0.99].map((q) => {
      const t = quantile(nullTotals, q);
      return { q, threshold: t, above: scores.filter((s) => s > t).length / scores.length, coverage: select(people, pairs, scores, t, cfg.max_matches).coverage };
    }),
    betas,
    recovery,
    ablation,
    stability: { rho: spearman(noisyScores, scores), jaccard: jaccard(noisySel.selected, chosen.selected) },
    equity,
    morris: morris(pairs.filter((_, k) => k % stride === 0), cfg, MORRIS_TRAJECTORIES, mulberry32(seedFor(`morris:${name}`))),
    identityShare: contributionShare(pairs, cfg, IDENTITY),
    extrasShare: contributionShare(pairs, cfg, EXTRAS),
    identityWeight: IDENTITY.reduce((s, id) => s + (cfg.tail[id] ?? 0), 0),
    extrasWeight: EXTRAS.reduce((s, id) => s + (cfg.tail[id] ?? 0), 0),
    maxScore: quantile(scores, 1),
    referenceHigh: quantile(scores, REFERENCE_QUANTILE),
  };
}
