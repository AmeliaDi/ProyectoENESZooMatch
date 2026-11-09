import { MATCHING_CONFIG } from "@/config";
import type { MatchingConfig } from "@/types/matching-config";

export function getMatchingConfig(): MatchingConfig {
  return MATCHING_CONFIG;
}

export function getRomanceThreshold(): number {
  return getMatchingConfig().tracks.romance.minimum_similarity_exclusive;
}

export function getAmistadThreshold(): number {
  return getMatchingConfig().tracks.amistad.minimum_similarity_exclusive;
}

/**
 * `reference_high`: the similarity the track itself treats as a strong
 * reading, and the denominator of the observatory's axis
 * `z = (similitud − umbral) / (reference_high − umbral)`. The config loader
 * rejects a `reference_high` at or below the cut, so the denominator is
 * positive and `z` grows with similarity.
 */
export function getRomanceReference(): number {
  return getMatchingConfig().tracks.romance.reference_high;
}

export function getAmistadReference(): number {
  return getMatchingConfig().tracks.amistad.reference_high;
}
