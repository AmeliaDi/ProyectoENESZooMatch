/**
 * Affinity per layer with the selected person, as bands (ADR-030). Derived
 * from the exact pair score: the band reads the category similarity with the
 * same cut points as the explanation copy, and the line strength (1–3) is the
 * category's real contribution relative to the largest one. MBTI/Enneagram
 * stay out: they are narrative, not a cause of the score (ADR-017).
 */
import { EXPLANATION_COPY, categoryCopy } from "@/config/explanation-copy";
import { MATCHING_CONFIG } from "@/config";
import type { PairScore } from "@/domain/matching/pair-score";
import type { MatchCategoryId } from "@/types/matching-config";

export type AffinityBand = "alta" | "media" | "baja";
export type LineStrength = 1 | 2 | 3;

export interface LayerAffinityBand {
  readonly category: MatchCategoryId;
  readonly label: string;
  readonly band: AffinityBand;
  readonly strength: LineStrength;
}

const IDENTITY = new Set<MatchCategoryId>(MATCHING_CONFIG.tail_groups.identity);
const MAX_STRENGTH = 3;

export function affinityBand(similarity: number): AffinityBand {
  const { alta, media } = EXPLANATION_COPY.bands;
  if (!Number.isFinite(similarity)) return "baja";
  return similarity >= alta ? "alta" : similarity >= media ? "media" : "baja";
}

function strengthOf(contribution: number, largest: number): LineStrength {
  if (!(largest > 0) || !(contribution > 0)) return 1;
  const level = Math.ceil((contribution / largest) * MAX_STRENGTH);
  return Math.min(MAX_STRENGTH, Math.max(1, level)) as LineStrength;
}

export function layerAffinityBands(score: PairScore): LayerAffinityBand[] {
  const layers = score.categories.filter((c) => !IDENTITY.has(c.id));
  const largest = layers.reduce((max, c) => Math.max(max, c.contribution), 0);
  return [...layers]
    .sort((a, b) => b.contribution - a.contribution || (a.id < b.id ? -1 : 1))
    .map((c) => ({
      category: c.id,
      label: categoryCopy(c.id).label,
      band: affinityBand(c.similarity),
      strength: strengthOf(c.contribution, largest),
    }));
}
