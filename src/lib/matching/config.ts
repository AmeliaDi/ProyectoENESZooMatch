import { z } from "zod";

import type { MatchingConfig } from "@/types/microtest";

import rawConfig from "../../../data/matching-config.json";

/**
 * ZooMatch — matching configuration loader.
 *
 * Validates `data/matching-config.json` at runtime and exposes the dual-track
 * similarity thresholds and per-track match limits.
 */

const selectivitySchema = z.object({
  intimacy_alignment_floor: z.number().min(0).max(1),
  intimacy_penalty_weight: z.number().min(0).max(1),
  conflict_tolerance: z.number().min(0).max(1),
  conflict_penalty_lambda: z.number().min(0),
});

const trackSchema = z.object({
  minimum_similarity_exclusive: z.number().min(0.5).max(0.999),
  centering: z.number().min(0).max(1),
  max_matches: z.number().int().positive(),
  target_coverage_percentile: z.number().min(0).max(1),
  maximum_pair_tail: z.number().min(0).max(1).optional(),
  dimensions: z.array(z.string()),
  hard_filters: z.array(z.string()),
  weights: z.record(z.string(), z.number()),
  selectivity: selectivitySchema.optional(),
});

const configSchema = z.object({
  version: z.string(),
  tracks: z.object({
    romance: trackSchema,
    amistad: trackSchema,
  }),
  calibration: z.object({
    method: z.string(),
    target_coverage: z.number(),
    max_users: z.number(),
  }),
});

export function getMatchingConfig(): MatchingConfig {
  const result = configSchema.safeParse(rawConfig);
  if (!result.success) {
    return rawConfig as unknown as MatchingConfig;
  }
  return result.data as unknown as MatchingConfig;
}

export function getRomanceThreshold(): number {
  return getMatchingConfig().tracks.romance.minimum_similarity_exclusive;
}

export function getAmistadThreshold(): number {
  return getMatchingConfig().tracks.amistad.minimum_similarity_exclusive;
}

export function getMaxMatches(track: "romance" | "amistad"): number {
  return getMatchingConfig().tracks[track].max_matches;
}
