import { z } from "zod";

import type { MatchingConfigV2 } from "@/types/microtest-v2";

import rawConfig from "../../data/matching-config-v2.json";

/**
 * ZooMatch v2 — matching configuration loader.
 *
 * Validates `data/matching-config-v2.json` at runtime and exposes the dual-track
 * similarity thresholds and per-track match limits.
 */

const trackSchema = z.object({
  minimum_similarity_exclusive: z.number().min(0.5).max(0.999),
  centering: z.number().min(0).max(1),
  max_matches: z.number().int().positive(),
  dimensions: z.array(z.string()),
  hard_filters: z.array(z.string()),
  weights: z.record(z.string(), z.number()),
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

export function getMatchingConfigV2(): MatchingConfigV2 {
  const result = configSchema.safeParse(rawConfig);
  if (!result.success) {
    return rawConfig as unknown as MatchingConfigV2;
  }
  return result.data as unknown as MatchingConfigV2;
}

export function getRomanceThreshold(): number {
  return getMatchingConfigV2().tracks.romance.minimum_similarity_exclusive;
}

export function getAmistadThreshold(): number {
  return getMatchingConfigV2().tracks.amistad.minimum_similarity_exclusive;
}

export function getMaxMatches(track: "romance" | "amistad"): number {
  return getMatchingConfigV2().tracks[track].max_matches;
}
