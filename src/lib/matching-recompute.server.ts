import type { SupabaseClient } from "@supabase/supabase-js";

import { MATCHING_CONFIG_V2, computeAllMatchesV2 } from "@/lib/matching-v2";
import { ALL_DIMENSIONS_V2 } from "@/types/microtest-v2";
import type { DimensionScoresV2, HardFilters, ScoredProfileV2 } from "@/types/microtest-v2";

interface ProfileRow {
  user_id: string;
  romance_vector: number[];
  amistad_vector: number[];
  dimension_scores: Record<string, number> | null;
  orientacion_sexual: string[] | null;
  identidad_genero: string[] | null;
  tipo_relacion_busca: string[] | null;
  mbti_code: string | null;
}

function toScoredProfile(row: ProfileRow): ScoredProfileV2 {
  const dimensionScores = Object.fromEntries(
    ALL_DIMENSIONS_V2.map((dimension) => [dimension, row.dimension_scores?.[dimension] ?? 0.5]),
  ) as DimensionScoresV2;
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

export async function recomputeAllMatchesV2(admin: SupabaseClient) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin
      .from("profiles_v2")
      .select(
        "user_id, romance_vector, amistad_vector, dimension_scores, orientacion_sexual, identidad_genero, tipo_relacion_busca, mbti_code",
      )
      .not("quiz_completed_at", "is", null)
      .order("user_id");
    if (error || !data) throw new Error("Unable to load completed profiles for matching");

    const profiles = (data as unknown as ProfileRow[]).map((row) => ({
      userId: row.user_id,
      profile: toScoredProfile(row),
    }));
    const pairs = computeAllMatchesV2(profiles, MATCHING_CONFIG_V2);
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
  }

  throw new Error("Completed profiles changed during matching recomputation");
}
