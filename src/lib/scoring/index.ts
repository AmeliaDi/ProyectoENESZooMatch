export { scoreBigFive } from "@/lib/scoring/bigfive";
export { getBigFiveWeights, SCORING_CALIBRATION } from "@/lib/scoring/calibration";
export { SCORING_CONFIG } from "@/lib/scoring/config";
export { explainPair } from "@/lib/scoring/explain";
export { toScoringProfile } from "@/lib/scoring/from-profile";
export { scoreMbti } from "@/lib/scoring/mbti";
export { rankBestMatches } from "@/lib/scoring/rank";
export { scorePair } from "@/lib/scoring/score";
export { isHardCompatible, scoreSociocultural } from "@/lib/scoring/sociocultural";
export type {
  BestMatchResult,
  BigFive,
  PairResult,
  PairScore,
  RankedMatch,
  ReasonCode,
  ScoreBreakdown,
  ScoringProfile,
  Sociocultural,
} from "@/lib/scoring/types";
export type { BigFiveWeights } from "@/lib/scoring/calibration";
