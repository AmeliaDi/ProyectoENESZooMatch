import { MATCHING_CONFIG } from "@/config";
import type { MatchingConfig } from "@/types/microtest";

export function getMatchingConfig(): MatchingConfig {
  return MATCHING_CONFIG;
}

export function getRomanceThreshold(): number {
  return getMatchingConfig().tracks.romance.minimum_similarity_exclusive;
}

export function getAmistadThreshold(): number {
  return getMatchingConfig().tracks.amistad.minimum_similarity_exclusive;
}


