import type { SupabaseClient } from "@supabase/supabase-js";

import { MATCHING_CONFIG, computeAllMatches } from "@/lib/matching";
import { ALL_DIMENSIONS } from "@/types/microtest";
import type { DimensionScores, HardFilters, ScoredProfile } from "@/types/microtest";

const PROFILE_PAGE_SIZE = 1000;

/** Attempts to replace the global match set when the profile pool changes mid-run. */
export const RECOMPUTE_MAX_ATTEMPTS = 5;

const BACKOFF_BASE_MS = 50;
const BACKOFF_JITTER_MS = 50;
const BACKOFF_MAX_MS = 200;

/** Short exponential backoff with jitter (50-200 ms) between recompute attempts. */
export function recomputeBackoffMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.min(BACKOFF_MAX_MS, exponential + Math.floor(random() * BACKOFF_JITTER_MS));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ProfileRow {
  user_id: string;
  romance_vector: number[];
  amistad_vector: number[];
  dimension_scores: Record<string, number> | null;
  orientacion_sexual: string[] | null;
  identidad_genero: string[] | null;
  tipo_relacion_busca: string[] | null;
  mbti_code: string | null;
  alias: string | null;
  animal_id: string | null;
  color_id: string | null;
  animals: unknown;
  colors: unknown;
}

function toScoredProfile(row: ProfileRow): ScoredProfile {
  const dimensionScores = Object.fromEntries(
    ALL_DIMENSIONS.map((dimension) => [dimension, row.dimension_scores?.[dimension] ?? 0.5]),
  ) as DimensionScores;
  const hardFilters: HardFilters = {
    orientacion_sexual: row.orientacion_sexual ?? [],
    identidad_genero: row.identidad_genero ?? [],
    tipo_relacion_busca: row.tipo_relacion_busca ?? [],
  };

  return {
    rawScores: dimensionScores,
    normalizedScores: dimensionScores,
    mbtiCode: row.mbti_code ?? "ENTJ",
    hardFilters,
    romanceVector: row.romance_vector,
    friendshipVector: row.amistad_vector,
  };
}

export async function recomputeAllMatches(admin: SupabaseClient) {
  for (let attempt = 0; attempt < RECOMPUTE_MAX_ATTEMPTS; attempt += 1) {
    const profileRows = await loadCompletedProfiles(admin);
    const profiles = profileRows.map((row) => ({
      userId: row.user_id,
      profile: toScoredProfile(row),
    }));
    const pairs = computeAllMatches(profiles, MATCHING_CONFIG);
    const { data: replaced, error: replaceError } = await admin.rpc("replace_matches_v2", {
      p_matches: pairs.map((pair) => ({
        track: pair.track,
        user_a: pair.userA,
        user_b: pair.userB,
        similarity: pair.similarity,
        badges: pair.badges,
      })),
      p_expected_profiles: profiles.length,
    });
    if (replaceError) throw new Error("Unable to replace global matches");
    if (replaced !== -1) return pairs;

    if (attempt < RECOMPUTE_MAX_ATTEMPTS - 1) {
      await sleep(recomputeBackoffMs(attempt));
    }
  }

  throw new Error("Completed profiles changed during matching recomputation");
}

export async function loadCompletedProfiles(admin: SupabaseClient): Promise<ProfileRow[]> {
  const profileRows: ProfileRow[] = [];
  for (let from = 0; ; from += PROFILE_PAGE_SIZE) {
    const { data, error } = await admin
      .from("profiles_v2")
      .select(
        "user_id, romance_vector, amistad_vector, dimension_scores, orientacion_sexual, identidad_genero, tipo_relacion_busca, mbti_code, alias, animal_id, color_id, animals(diminutivo_es), colors(nombre)",
      )
      .not("quiz_completed_at", "is", null)
      .order("user_id")
      .range(from, from + PROFILE_PAGE_SIZE - 1);
    if (error || !data) throw new Error("Unable to load completed profiles for matching");
    profileRows.push(...(data as unknown as ProfileRow[]));
    if (data.length < PROFILE_PAGE_SIZE) break;
  }
  return profileRows;
}
