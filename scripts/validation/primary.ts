/**
 * Preregistered primary hypotheses H1–H4c (docs/PREREGISTRO.md §3).
 */
import { MATCHING_CONFIG } from "@/config";
import { aggregatePair, categorySimilarities } from "@/domain/matching";
import { spearman } from "@/domain/math";
import { mulberry32 } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";

import { jaccard, select } from "../matching/analysis";
import { CORE_IDS, MODEL, SUBPOPULATIONS } from "../matching/population";
import { seedFor } from "../matching/track-analysis";
import { pairedAuc, type PairedAuc } from "./bootstrap";
import type { World } from "./context";
import { wilson } from "./stats";

export const PRIMARY_REPS = 200;

export interface EquityRow {
  readonly group: string;
  readonly n: number;
  readonly coverage: number;
  readonly lo: number;
  readonly hi: number;
  readonly excluded: boolean;
}

export interface PrimaryTrack {
  readonly track: MatchTrack;
  readonly h1: Record<string, PairedAuc>;
  readonly h2: EquityRow[];
  readonly h3: { readonly rho: number; readonly jaccard: number };
  readonly h4: PairedAuc & { readonly pairs: number };
  readonly h4c: number;
}

/** Subpopulation with 0 eligible romance partners by declared design (ADR-016). */
export const DECLARED_EXCLUSION = "prefiere_no_decir";

function equity(world: World, track: MatchTrack): EquityRow[] {
  const v = world.views[track];
  const chosen = select(world.people, v.pairs, v.scores, v.cfg.minimum_similarity_exclusive, v.cfg.max_matches);
  return SUBPOPULATIONS.map(({ id }) => {
    const members = world.people.flatMap((p, k) => (p.group === id ? [k] : []));
    const hits = members.filter((k) => chosen.byPerson[k]! > 0).length;
    const { lo, hi } = wilson(hits, members.length);
    return { group: id, n: members.length, coverage: hits / members.length, lo, hi, excluded: track === "romance" && id === DECLARED_EXCLUSION };
  });
}

/** H4/H4c: full-bank people re-scored from their core answers only. */
function coreOnly(world: World, track: MatchTrack) {
  const v = world.views[track];
  const keep = v.pairs.flatMap((p, k) => (world.coreOnly.has(p.i) && world.coreOnly.has(p.j) ? [k] : []));
  const pairs = keep.map((k) => v.pairs[k]!);
  const core = pairs.map((p) => aggregatePair(categorySimilarities(world.coreOnly.get(p.i)!, world.coreOnly.get(p.j)!, MATCHING_CONFIG.categories), v.cfg).total);
  const full = keep.map((k) => v.scores[k]!);
  const result = pairedAuc(world.people.length, pairs, core, keep.map((k) => v.baseline[k]!), keep.map((k) => v.labels.similitud![k]!), PRIMARY_REPS, mulberry32(seedFor(`h4:${track}`)));
  return { h4: { ...result, pairs: pairs.length }, h4c: spearman(core, full) };
}

export function primaryTrack(world: World, track: MatchTrack): PrimaryTrack {
  const v = world.views[track];
  const h1 = Object.fromEntries(
    Object.entries(v.labels).map(([h, labels]) => [
      h,
      pairedAuc(world.people.length, v.pairs, v.scores, v.baseline, labels, PRIMARY_REPS, mulberry32(seedFor(`h1:${track}:${h}`))),
    ]),
  );
  const chosen = select(world.people, v.pairs, v.scores, v.cfg.minimum_similarity_exclusive, v.cfg.max_matches);
  const noisy = select(world.people, v.pairs, v.noisyScores, v.cfg.minimum_similarity_exclusive, v.cfg.max_matches);
  return {
    track,
    h1,
    h2: equity(world, track),
    h3: { rho: spearman(v.noisyScores, v.scores), jaccard: jaccard(noisy.selected, chosen.selected) },
    ...coreOnly(world, track),
  };
}

export interface SeRow {
  readonly factor: string;
  /** The factor has items outside the core (so the full bank adds information). */
  readonly optional: boolean;
  readonly full: number;
  readonly core: number;
}

/** H4b: mean posterior SE per factor, full bank vs core-only (same people). */
export function uncertaintyWidening(world: World): SeRow[] {
  const core = new Set(CORE_IDS);
  const optional = new Set([...MODEL.items].filter(([id]) => !core.has(id)).map(([, it]) => it.factor));
  const mean = (pick: (k: number) => number) => world.fullBank.reduce((s, k) => s + pick(k), 0) / world.fullBank.length;
  return MODEL.factors.map((factor) => ({
    factor,
    optional: optional.has(factor),
    full: mean((k) => world.people[k]!.latent.se[factor] ?? 1),
    core: mean((k) => world.coreOnly.get(k)!.se[factor] ?? 1),
  }));
}
