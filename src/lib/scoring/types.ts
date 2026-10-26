export interface BigFive {
  O: number;
  C: number;
  E: number;
  A: number;
  N: number;
}

export interface Sociocultural {
  orientacion?: string[];
  identidadGenero?: string[];
  tipoRelacion?: string[];
  ordinal?: Record<string, number>;
}

export interface ScoringProfile {
  userId: string;
  bigFive: BigFive | null;
  mbti: string | null;
  sociocultural: Sociocultural | null;
}

export interface ScoreBreakdown {
  bigfive: number;
  mbti: number | null;
  sociocultural: number | null;
}

export type ReasonCode =
  | "stability_bonus"
  | "stability_penalty"
  | "close_traits"
  | "high_conscientious_agreeable"
  | "mbti_shared"
  | "mbti_complementary"
  | "values_aligned"
  | "partial_data";

export interface PairScore {
  status: "ok";
  scoreFinal: number;
  breakdown: ScoreBreakdown;
  partial: boolean;
  missing: Array<"mbti" | "sociocultural">;
  appliedWeights: {
    bigfive: number;
    mbti: number;
    sociocultural: number;
  };
  reasons: ReasonCode[];
  explanation: string;
}

export type PairResult =
  | PairScore
  | { status: "insufficient_data"; message: string }
  | { status: "excluded"; reason: "hard_filter" };

export interface RankedMatch extends PairScore {
  userId: string;
}

export type BestMatchResult =
  | { status: "ok"; matches: RankedMatch[] }
  | { status: "insufficient_data"; message: string }
  | { status: "no_candidates"; message: string };
