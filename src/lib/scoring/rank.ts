import { SCORING_CONFIG } from "@/lib/scoring/config";
import { INSUFFICIENT_BIGFIVE_MESSAGE, scorePairForRanking } from "@/lib/scoring/score";
import type { BestMatchResult, ScoringProfile } from "@/lib/scoring/types";

const NO_CANDIDATES_MESSAGE = "Aún no hay perfiles compatibles…";

export function rankBestMatches(
  target: ScoringProfile,
  pool: ScoringProfile[],
  limit = SCORING_CONFIG.ranking.defaultLimit,
): BestMatchResult {
  if (!target.bigFive) {
    return { status: "insufficient_data", message: INSUFFICIENT_BIGFIVE_MESSAGE };
  }

  const ranked = pool.flatMap((candidate) => {
    if (candidate.userId === target.userId) return [];
    const evaluation = scorePairForRanking(target, candidate);
    if (evaluation.result.status !== "ok" || !evaluation.ranking) return [];
    return [{ match: evaluation.result, userId: candidate.userId, ranking: evaluation.ranking }];
  });

  ranked.sort((left, right) => {
    const finalDifference = right.ranking.scoreFinal - left.ranking.scoreFinal;
    if (finalDifference !== 0) return finalDifference;
    const bigFiveDifference = right.ranking.bigfive - left.ranking.bigfive;
    if (bigFiveDifference !== 0) return bigFiveDifference;
    if (left.ranking.mbti === null && right.ranking.mbti !== null) return 1;
    if (right.ranking.mbti === null && left.ranking.mbti !== null) return -1;
    const mbtiDifference = (right.ranking.mbti ?? 0) - (left.ranking.mbti ?? 0);
    if (mbtiDifference !== 0) return mbtiDifference;
    if (left.userId < right.userId) return -1;
    if (left.userId > right.userId) return 1;
    return 0;
  });

  const matches = ranked
    .slice(0, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0)
    .map(({ match, userId }) => ({ ...match, userId }));
  return matches.length > 0
    ? { status: "ok", matches }
    : { status: "no_candidates", message: NO_CANDIDATES_MESSAGE };
}
