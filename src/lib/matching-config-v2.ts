import { z } from "zod";

import type { MatchingConfigV2 } from "@/types/microtest-v2";

import rawConfig from "../../data/matching-config-v2.json";

/**
 * ZooMatch v2 — matching configuration loader.
 *
 * Validates `data/matching-config-v2.json` at runtime and exposes the dual-track
 * similarity thresholds. If the config fails validation, safe fallback
 * thresholds are substituted so matching never runs with an invalid gate.
 */

const trackSchema = z.object({
  minimum_similarity_exclusive: z.number().min(0.5).max(0.999),
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

const SAFE_FALLBACK = {
  romance: 0.8,
  amistad: 0.75,
};

export function getMatchingConfigV2(): MatchingConfigV2 {
  const result = configSchema.safeParse(rawConfig);
  if (!result.success) {
    // Substitute safe default thresholds while preserving the rest of the config.
    return {
      ...rawConfig,
      tracks: {
        romance: {
          ...rawConfig.tracks.romance,
          minimum_similarity_exclusive: SAFE_FALLBACK.romance,
        },
        amistad: {
          ...rawConfig.tracks.amistad,
          minimum_similarity_exclusive: SAFE_FALLBACK.amistad,
        },
      },
    } as unknown as MatchingConfigV2;
  }
  return result.data as unknown as MatchingConfigV2;
}

export function getRomanceThreshold(): number {
  return getMatchingConfigV2().tracks.romance.minimum_similarity_exclusive;
}

export function getAmistadThreshold(): number {
  return getMatchingConfigV2().tracks.amistad.minimum_similarity_exclusive;
}
