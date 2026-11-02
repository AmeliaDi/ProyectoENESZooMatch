/**
 * H6b: does "confianza alta" mark more true matches than "media"?
 * Production (`computeMatchConfidence`) requires BOTH a margin above the
 * threshold (relative position ≥ confidence_high_margin, computed exactly as
 * here) AND every breakdown area ≥ category_floor. The production breakdown
 * still comes from the inherited descriptive vectors, which the synthetic
 * generator does not produce, so the floor is evaluated on the latent core
 * categories instead (declared deviation in docs/PREREGISTRO.md).
 */
import { MATCHING_CONFIG } from "@/config";
import { aggregatePair } from "@/domain/matching";
import type { MatchCategoryId } from "@/types/matching-config";
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
  const { confidence_high_margin: margin, category_floor: floor } = MATCHING_CONFIG.explainability;
  const threshold = v.cfg.minimum_similarity_exclusive;
  const span = Math.max(1e-9, v.cfg.reference_high - threshold);
  const core = Object.keys(v.cfg.core) as MatchCategoryId[];
  const chosen = [...select(world.people, v.pairs, v.scores, threshold, v.cfg.max_matches).selected];
  const labels = v.labels.similitud!;

  const marginOk = (k: number) => Math.min(1, Math.max(0, (v.scores[k]! - threshold) / span)) >= margin;
  const floorOk = (k: number) => {
    const s = aggregatePair(v.pairs[k]!.sims, v.cfg);
    return s.categories.filter((c) => core.includes(c.id)).every((c) => Math.round(c.similarity * 100) >= floor);
  };
  const row = (rule: string, high: (k: number) => boolean): ConfidenceRow => {
    const alta = chosen.filter(high);
    const media = chosen.filter((k) => !high(k));
    const rate = (xs: number[]) => (xs.length ? xs.filter((k) => labels[k]).length / xs.length : Number.NaN);
    return { rule, alta: alta.length, media: media.length, rateAlta: rate(alta), rateMedia: rate(media) };
  };
  return [
    row("solo margen (idéntico a producción)", marginOk),
    row("margen + piso en categorías latentes", (k) => marginOk(k) && floorOk(k)),
  ];
}
