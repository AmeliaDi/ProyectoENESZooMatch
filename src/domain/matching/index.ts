export { MATCHING_CONFIG, QUIZ_ITEMS as MICROTEST_ITEMS } from "@/config";
export { attractedTo, checkHardFilters, isRelationshipCompatible, romanceOptOut } from "./hard-filters";
export { scoreQuiz, type LatentScorer } from "./score-quiz";
export { categorySimilarity, deadzoneSimilarity, distributionSimilarity, kernelSimilarity } from "./layers";
export {
  aggregatePair,
  categorySimilarities,
  pairScore,
  trackCategoryIds,
  type CategoryScore,
  type CategorySimilarities,
  type PairScore,
} from "./pair-score";
export {
  TRACKS,
  badgesFromScore,
  computeAllMatches,
  normalizeMatchPairs,
  type GlobalMatch,
  type MatchBadge,
  type PoolEntry,
} from "./compute-matches";
export { getAmistadThreshold, getMatchingConfig, getRomanceThreshold } from "./config";
