export {
  MATCHING_CONFIG,
  MICROTEST_ITEMS,
  attractedTo,
  checkHardFilters,
  computeAllMatches,
  cosineSimilarity,
  findDualMatches,
  generateBadges,
  isRelationshipCompatible,
  scoreQuiz,
  trackSimilarity,
  weightedTrackSimilarity,
} from "./engine";
export type { GlobalMatch } from "./engine";
export {
  getAmistadThreshold,
  getMatchingConfig,
  getMaxMatches,
  getRomanceThreshold,
} from "./config";
export {
  buildMatchNarrative,
  cognitiveComplementarity,
  computeChemistrySummary,
  generateAffinityBreakdown,
  generateConnectionHeadline,
  generateMatchExplanation,
  generatePersonalitySummary,
} from "./explainability";
export type {
  AffinityBreakdown,
  ChemistryLevel,
  ChemistrySummary,
  MatchExplanation,
  MatchNarrative,
  MatchNarrativeInput,
  PersonalitySummary,
} from "./explainability";
