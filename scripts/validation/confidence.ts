/**
 * H6b: does "confianza alta" mark more true matches than "media"?
 * Since ADR-021 production confidence is computed on the SAME latent pair
 * score this script uses (`computeMatchConfidence`: margin over the
 * threshold, core-category floor and pair posterior uncertainty), so the
 * main row is the production rule itself. The margin-only row is kept as the
 * preregistered reference.
 */
import { MATCHING_CONFIG } from "@/config";
import { computeChemistrySummary, computeMatchConfidence, pairUncertainty } from "@/domain/explainability";
import { aggregatePair } from "@/domain/matching";
import type { MatchTrack } from "@/types/microtest";

import { select } from "../matching/analysis";
import type { World } from "./context";

export interface ConfidenceRow {
  readonly rule: string;
  readonly alta: number;
  readonly media: number;
  readonly rateAlta: number;
  readonly rateMedia: number;
}

export function confidenceCheck(world: World, track: MatchTrack): ConfidenceRow[] {
  const v = world.views[track];
  const threshold = v.cfg.minimum_similarity_exclusive;
  const chosen = [...select(world.people, v.pairs, v.scores, threshold, v.cfg.max_matches).selected];
  const labels = v.labels.similitud!;

  const chemistry = (k: number) => computeChemistrySummary(v.scores[k]!, track);
  const marginOk = (k: number) => chemistry(k).relativePosition >= MATCHING_CONFIG.explainability.confidence_high_margin;
  const production = (k: number) => {
    const pair = v.pairs[k]!;
    const uncertainty = pairUncertainty(world.people[pair.i]!.latent, world.people[pair.j]!.latent, track);
    return computeMatchConfidence(chemistry(k), aggregatePair(pair.sims, v.cfg), uncertainty).level === "alta";
  };
  const row = (rule: string, high: (k: number) => boolean): ConfidenceRow => {
    const alta = chosen.filter(high);
    const media = chosen.filter((k) => !high(k));
    const rate = (xs: number[]) => (xs.length ? xs.filter((k) => labels[k]).length / xs.length : Number.NaN);
    return { rule, alta: alta.length, media: media.length, rateAlta: rate(alta), rateMedia: rate(media) };
  };
  return [row("solo margen (referencia preregistrada)", marginOk), row("producción: margen + piso + incertidumbre", production)];
}
