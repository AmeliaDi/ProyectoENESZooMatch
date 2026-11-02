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
  type GlobalMatch,
  type MatchBadge,
  type PoolEntry,
} from "./compute-matches";
export { getAmistadThreshold, getMatchingConfig, getRomanceThreshold } from "./config";
export {
  buildMatchNarrative,
  cognitiveComplementarity,
  computeChemistrySummary,
  generateAffinityBreakdown,
  generateConnectionHeadline,
  generateMatchExplanation,
  generatePersonalitySummary,
} from "@/domain/explainability/explainability";
export type {
  AffinityBreakdown,
  AfinidadBigFive,
  ChemistryLevel,
  ChemistrySummary,
  CompatibilidadMBTI,
  MatchExplanation,
  MatchNarrative,
  MatchNarrativeInput,
  PersonalitySummary,
} from "@/domain/explainability/explainability";
