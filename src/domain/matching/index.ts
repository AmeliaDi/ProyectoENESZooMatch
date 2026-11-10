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
  computeWith,
  layeredEvaluator,
  normalizeMatchPairs,
  type GlobalMatch,
  type MatchBadge,
  type PairEvaluation,
  type PairEvaluator,
  type PoolEntry,
} from "./compute-matches";
export {
  DEFAULT_ENGINE,
  ENGINES,
  ENGINE_IDS,
  cosineEvaluator,
  resolveEngine,
  type EngineId,
  type MatchingEngine,
} from "./engine";
export {
  conservationLoss,
  conserveProtected,
  evaluateGates,
  structuralViolations,
  type ProtectedPair,
} from "./rollout";
export { getAmistadReference, getAmistadThreshold, getMatchingConfig, getRomanceReference, getRomanceThreshold } from "./config";
