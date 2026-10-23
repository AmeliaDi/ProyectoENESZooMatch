import { z } from "zod";

import matchingConfigData from "../../data/matching-config.json";

const SAFE_FALLBACK_THRESHOLD = 0.85;

const matchingConfigSchema = z.object({
  minimum_similarity_exclusive: z.number().min(0.85).max(0.999999),
});

export function getMatchingThreshold(): number {
  const result = matchingConfigSchema.safeParse(matchingConfigData);
  return result.success
    ? result.data.minimum_similarity_exclusive
    : SAFE_FALLBACK_THRESHOLD;
}
