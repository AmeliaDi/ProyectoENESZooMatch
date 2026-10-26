export {
  MATCHING_CONFIG,
  MICROTEST_ITEMS,
  attractedTo,
  applyRomanceSelectivity,
  checkHardFilters,
  computeAllMatches,
  computeTrackCentroid,
  cosineSimilarity,
  trackDimensionWeights,
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
  AfinidadBigFive,
  ChemistryLevel,
  ChemistrySummary,
  CompatibilidadMBTI,
  MatchExplanation,
  MatchNarrative,
  MatchNarrativeInput,
  PersonalitySummary,
} from "./explainability";
