/**
 * Chemistry band of an estimated affinity: where the score sits between the
 * track's calibrated threshold (null quantile) and its achievable ceiling.
 * It ORDERS matches; it is never a probability (ADR-020).
 */
import { MATCHING_CONFIG } from "@/config";
import { CHEMISTRY_LEVELS, EXPLANATION_COPY } from "@/config/explanation-copy";
import type { MatchTrack } from "@/types/microtest";

export type ChemistryLevel = (typeof CHEMISTRY_LEVELS)[number];

export interface ChemistrySummary {
  /** Integer percentage, 0-100. */
  percentage: number;
  /** e.g. "54 % de afinidad estimada". */
  displayText: string;
  level: ChemistryLevel;
  levelLabel: string;
  /** Track threshold (0-1) the band is measured from. */
  threshold: number;
  /** Position within [threshold, ceiling]; 0 at or below the threshold. */
  relativePosition: number;
}

const PERCENT = 100;
const MIN_SPAN = 1e-9;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function relativePosition(similarity: number, track: MatchTrack): number {
  const { minimum_similarity_exclusive: threshold, reference_high: ceiling } = MATCHING_CONFIG.tracks[track];
  return clamp01((clamp01(similarity) - threshold) / Math.max(MIN_SPAN, ceiling - threshold));
}

export function computeChemistrySummary(similarity: number, track: MatchTrack): ChemistrySummary {
  const percentage = Math.round(clamp01(similarity) * PERCENT);
  const position = relativePosition(similarity, track);
  const { levels, noun } = EXPLANATION_COPY.chemistry;
  const band = levels.find((l) => position >= l.min) ?? levels.at(-1)!;
  return {
    percentage,
    displayText: `${percentage} % de ${noun}`,
    level: band.id,
    levelLabel: band.label,
    threshold: MATCHING_CONFIG.tracks[track].minimum_similarity_exclusive,
    relativePosition: position,
  };
}
