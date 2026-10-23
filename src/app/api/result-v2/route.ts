import { NextResponse } from "next/server";
import { z } from "zod";

import { generateMatchExplanation } from "@/lib/explainability";
import type { MatchExplanation } from "@/lib/explainability";
import { NO_MATCH_MESSAGE_V2 } from "@/lib/notification-copy";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";
import type { MatchTrack } from "@/types/microtest-v2";
import { FRIENDSHIP_VECTOR_LENGTH, ROMANCE_VECTOR_LENGTH } from "@/types/microtest-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const badgeSchema = z.object({
  dimension: z.string(),
  affinity: z.number(),
});

const matchRowSchema = z.object({
  track: z.enum(["romance", "amistad"]),
  other_user: z.string().nullable().optional(),
  other_alias: z.string().nullable().optional(),
  other_animal: z.string().nullable().optional(),
  other_color: z.string().nullable().optional(),
  similarity: z.number(),
  badges: z.array(badgeSchema).nullable().optional(),
});

interface MatchEntry {
  /**
   * Opaque counterpart user id (the `other_user` UUID from the RPC). Used only as
   * a stable React key for the constellation; it is never displayed and carries
   * no matrícula, hash, answer or vector data.
   */
  id: string | null;
  alias: string;
  animal: string;
  /** Catalogue id resolved server-side from profiles_v2.animal_id. */
  animal_id: string | null;
  color: string;
  /** Catalogue id resolved server-side from profiles_v2.color_id. */
  color_id: string | null;
  /** Catalogue hex resolved server-side from the colors join. */
  color_hex: string | null;
  mbti_code: string | null;
  similarity: number;
  badges: Array<{ dimension: string; affinity: number }>;
  narrative: string;
  explanation: MatchExplanation | null;
}

/** Subset of a profiles_v2 row needed to build an explanation. */
interface MatchProfileData {
  dimension_scores: Record<string, number> | null;
  mbti_code: string | null;
  romance_vector: number[] | null;
  amistad_vector: number[] | null;
  animal_id?: string | null;
  color_id?: string | null;
  color_hex?: string | null;
}

/** Unwraps a Supabase embedded join that may arrive as an object or a 1-array. */
function firstJoined(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

function buildMatchNarrative(
  track: "romance" | "amistad",
  alias: string,
  similarity: number,
): string {
  const percent = Math.round(similarity * 100);
  const heading = track === "romance" ? "Conexión romántica" : "Conexión de amistad";
  return `${heading} del ${percent}% con ${alias}.`;
}

/** Selects the track-appropriate vector from a profile row. */
function trackVector(profile: MatchProfileData | undefined, track: MatchTrack): number[] | null {
  if (!profile) return null;
  const vector = track === "romance" ? profile.romance_vector : profile.amistad_vector;
  return Array.isArray(vector) ? vector : null;
}

/**
 * Builds the affective explanation for a single match. Returns `null` when
 * either user's vector data is missing or malformed, so the response degrades
 * gracefully instead of throwing.
 */
function buildExplanation(
  track: MatchTrack,
  similarity: number,
  user: MatchProfileData | undefined,
  other: MatchProfileData | undefined,
  matchAnimal: string,
  matchColor: string,
  userAnimal: string,
): MatchExplanation | null {
  const expectedLength = track === "romance" ? ROMANCE_VECTOR_LENGTH : FRIENDSHIP_VECTOR_LENGTH;
  const vectorA = trackVector(user, track);
  const vectorB = trackVector(other, track);
  if (
    !vectorA ||
    !vectorB ||
    vectorA.length !== expectedLength ||
    vectorB.length !== expectedLength
  ) {
    return null;
  }

  try {
    return generateMatchExplanation(
      similarity,
      vectorA,
      vectorB,
      track,
      matchAnimal,
      matchColor,
      other?.mbti_code ?? null,
      other?.dimension_scores ?? null,
      userAnimal,
      user?.dimension_scores ?? null,
    );
  } catch {
    return null;
  }
}

async function handleGet() {
  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profileResult, matchesResult] = await Promise.all([
    client
      .from("profiles_v2")
      .select(
        "alias, narrative, mbti_code, dimension_scores, romance_vector, amistad_vector, animals(id, diminutivo_es, categoria_fauna), colors(id, nombre, hex)",
      )
      .eq("user_id", userData.user.id)
      .maybeSingle(),
    client.rpc("get_my_matches_v2"),
  ]);

  if (profileResult.error || matchesResult.error) {
    return NextResponse.json({ error: "Result unavailable" }, { status: 503 });
  }

  if (!profileResult.data) {
    return NextResponse.json({ error: "Quiz not completed" }, { status: 404 });
  }

  const parsedMatches = z.array(matchRowSchema).safeParse(matchesResult.data ?? []);
  if (!parsedMatches.success) {
    return NextResponse.json({ error: "Result unavailable" }, { status: 503 });
  }

  // The querying user's own vector data (RLS-safe via the authenticated client).
  const userProfile: MatchProfileData = {
    dimension_scores:
      (profileResult.data.dimension_scores as unknown as Record<string, number> | null) ?? null,
    mbti_code: (profileResult.data.mbti_code as unknown as string | null) ?? null,
    romance_vector: (profileResult.data.romance_vector as unknown as number[] | null) ?? null,
    amistad_vector: (profileResult.data.amistad_vector as unknown as number[] | null) ?? null,
  };
  const userAnimal = ((profileResult.data.animals as unknown as { diminutivo_es?: string } | null)?.diminutivo_es) ?? "";

  // Fetch matched users' vectors + scores. profiles_v2 is RLS-restricted to the
  // owner, so the service-role client reads the counterpart profiles.
  const otherUserIds = Array.from(
    new Set(parsedMatches.data.map((m) => m.other_user).filter((id): id is string => Boolean(id))),
  );
  const otherProfiles = new Map<string, MatchProfileData>();
  if (otherUserIds.length > 0) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("profiles_v2")
        .select(
          "user_id, dimension_scores, mbti_code, romance_vector, amistad_vector, animal_id, color_id, colors(id, nombre, hex)",
        )
        .in("user_id", otherUserIds);
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const joinedColor = firstJoined(row.colors);
        otherProfiles.set(row.user_id as string, {
          dimension_scores: (row.dimension_scores as Record<string, number> | null) ?? null,
          mbti_code: (row.mbti_code as string | null) ?? null,
          romance_vector: (row.romance_vector as number[] | null) ?? null,
          amistad_vector: (row.amistad_vector as number[] | null) ?? null,
          animal_id: (row.animal_id as string | null) ?? null,
          color_id: (row.color_id as string | null) ?? null,
          color_hex: (joinedColor?.hex as string | null) ?? null,
        });
      }
    }
  }

  const romance: MatchEntry[] = [];
  const amistad: MatchEntry[] = [];

  for (const match of parsedMatches.data) {
    const alias = match.other_alias ?? "alguien especial";
    const otherProfile = match.other_user ? otherProfiles.get(match.other_user) : undefined;
    const entry: MatchEntry = {
      id: match.other_user ?? null,
      alias,
      animal: match.other_animal ?? "",
      animal_id: otherProfile?.animal_id ?? null,
      color: match.other_color ?? "",
      color_id: otherProfile?.color_id ?? null,
      color_hex: otherProfile?.color_hex ?? null,
      mbti_code: otherProfile?.mbti_code ?? null,
      similarity: match.similarity,
      badges: match.badges ?? [],
      narrative: buildMatchNarrative(match.track, alias, match.similarity),
      explanation: buildExplanation(
        match.track,
        match.similarity,
        userProfile,
        otherProfile,
        match.other_animal ?? "",
        match.other_color ?? "",
        userAnimal,
      ),
    };
    if (match.track === "romance") {
      romance.push(entry);
    } else {
      amistad.push(entry);
    }
  }

  return NextResponse.json(
    {
      alias: profileResult.data.alias,
      animal: profileResult.data.animals,
      color: profileResult.data.colors,
      narrative: profileResult.data.narrative,
      mbti_code: profileResult.data.mbti_code,
      matches: { romance, amistad },
      no_match_message: NO_MATCH_MESSAGE_V2,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "result-v2",
  limit: 60,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
