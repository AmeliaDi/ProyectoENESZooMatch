import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCompletedProfilesV2 } from "@/lib/matching-recompute.server";
import { toScoringProfile } from "@/lib/scoring/from-profile-v2";
import { rankBestMatches } from "@/lib/scoring/rank";
import type {
  BestMatchResult,
  PairScore,
  RankedMatch,
  ScoringProfile,
} from "@/lib/scoring/types";

type LoadedProfile = Awaited<ReturnType<typeof loadCompletedProfilesV2>>[number];

export type BestMatchDisplay = Omit<RankedMatch, "userId"> & {
  alias: string;
  animal: string;
  color: string;
};

export type BestMatchesWithDisplay =
  | { status: "ok"; matches: BestMatchDisplay[] }
  | { status: "insufficient_data"; message: string }
  | { status: "no_candidates"; message: string };

function joinedValue(value: unknown, key: string): string {
  const joined = Array.isArray(value) ? value[0] : value;
  if (!joined || typeof joined !== "object" || Array.isArray(joined)) return "";
  const result = (joined as Record<string, unknown>)[key];
  return typeof result === "string" ? result : "";
}

function displayFor(row: LoadedProfile) {
  return {
    alias: row.alias ?? "alguien especial",
    animal: joinedValue(row.animals, "diminutivo_es"),
    color: joinedValue(row.colors, "nombre"),
  };
}

function profileFor(row: LoadedProfile): ScoringProfile {
  return toScoringProfile(row);
}

function insufficientResult(result: BestMatchResult): result is Exclude<BestMatchResult, { status: "ok" }> {
  return result.status !== "ok";
}

export async function getBestMatches(
  admin: SupabaseClient,
  userId: string,
): Promise<BestMatchesWithDisplay> {
  const rows = await loadCompletedProfilesV2(admin);
  const profileById = new Map(rows.map((row) => [row.user_id, row]));
  const profiles = rows.map(profileFor);
  const target = profiles.find((profile) => profile.userId === userId) ?? {
    userId,
    bigFive: null,
    mbti: null,
    sociocultural: null,
  };
  const result = rankBestMatches(target, profiles);
  if (insufficientResult(result)) return result;

  const matches: BestMatchDisplay[] = result.matches.map((match) => {
    const { userId: counterpartId, ...score } = match;
    const counterpart = profileById.get(counterpartId);
    const display = counterpart ? displayFor(counterpart) : {
      alias: "alguien especial",
      animal: "",
      color: "",
    };
    return { ...score, ...display } satisfies PairScore & BestMatchDisplay;
  });

  return { status: "ok", matches };
}
