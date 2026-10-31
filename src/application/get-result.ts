import {
  generateMatchExplanation,
  type MatchExplanation,
} from "@/domain/explainability/explainability";
import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { err, ok, type Result } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";
import { FRIENDSHIP_VECTOR_LENGTH, ROMANCE_VECTOR_LENGTH } from "@/types/microtest";

import type { MatchEntryDto, ResultDto } from "./dto";
import type { AppError } from "./errors";
import type {
  CounterpartProfile,
  MatchRepository,
  OwnProfile,
  ProfileRepository,
  StoredMatch,
} from "./ports";

/** Shown when the counterpart has no alias yet (should not happen after the quiz). */
const FALLBACK_ALIAS = "alguien especial";
const OPAQUE_ID_LENGTH = 16;

export interface GetResultDeps {
  profiles: Pick<ProfileRepository, "findOwn" | "findCounterparts">;
  matches: Pick<MatchRepository, "listMine">;
  /** One-way digest (hex) used to derive per-viewer opaque match handles. */
  digest(input: string): string;
}

type VectorSource = Pick<OwnProfile, "romanceVector" | "amistadVector">;

function trackVector(profile: VectorSource | undefined, track: MatchTrack): number[] | null {
  if (!profile) return null;
  const vector = track === "romance" ? profile.romanceVector : profile.amistadVector;
  const expected = track === "romance" ? ROMANCE_VECTOR_LENGTH : FRIENDSHIP_VECTOR_LENGTH;
  return Array.isArray(vector) && vector.length === expected ? vector : null;
}

/** Returns null when either vector is missing so the view degrades gracefully. */
function explain(
  match: StoredMatch,
  own: OwnProfile,
  other: CounterpartProfile | undefined,
): MatchExplanation | null {
  const vectorA = trackVector(own, match.track);
  const vectorB = trackVector(other, match.track);
  if (!vectorA || !vectorB) return null;
  try {
    return generateMatchExplanation(
      match.similarity,
      vectorA,
      vectorB,
      match.track,
      match.otherAnimal ?? "",
      match.otherColor ?? "",
      other?.mbtiCode ?? null,
      other?.dimensionScores ?? null,
      own.animal?.diminutivo_es ?? "",
      own.dimensionScores,
      own.mbtiCode,
    );
  } catch {
    return null;
  }
}

function narrativeFor(track: MatchTrack, alias: string, similarity: number): string {
  const heading = track === "romance" ? "Conexión romántica" : "Conexión de amistad";
  return `${heading} del ${Math.round(similarity * 100)}% con ${alias}.`;
}

function toEntry(
  match: StoredMatch,
  viewerId: string,
  own: OwnProfile,
  other: CounterpartProfile | undefined,
  digest: GetResultDeps["digest"],
): MatchEntryDto {
  const alias = match.otherAlias ?? FALLBACK_ALIAS;
  return {
    id: match.otherUser
      ? digest(`${viewerId}:${match.otherUser}`).slice(0, OPAQUE_ID_LENGTH)
      : null,
    alias,
    animal: match.otherAnimal ?? "",
    animal_id: other?.animalId ?? null,
    color: match.otherColor ?? "",
    color_id: other?.colorId ?? null,
    color_hex: other?.colorHex ?? null,
    mbti_code: other?.mbtiCode ?? null,
    similarity: match.similarity,
    badges: match.badges,
    narrative: narrativeFor(match.track, alias, match.similarity),
    explanation: explain(match, own, other),
  };
}

export async function getResult(
  viewerId: string,
  deps: GetResultDeps,
): Promise<Result<ResultDto, AppError>> {
  const [own, matches] = await Promise.all([deps.profiles.findOwn(viewerId), deps.matches.listMine()]);
  if (!own.ok) return own;
  if (!matches.ok) return matches;
  if (!own.value) return err("quiz.not_completed");
  const profile = own.value;

  const otherIds = [...new Set(matches.value.flatMap((m) => (m.otherUser ? [m.otherUser] : [])))];
  const counterparts = otherIds.length > 0 ? await deps.profiles.findCounterparts(otherIds) : [];
  const byId = new Map(counterparts.map((c) => [c.userId, c]));

  const romance: MatchEntryDto[] = [];
  const amistad: MatchEntryDto[] = [];
  for (const match of matches.value) {
    const other = match.otherUser ? byId.get(match.otherUser) : undefined;
    const entry = toEntry(match, viewerId, profile, other, deps.digest);
    (match.track === "romance" ? romance : amistad).push(entry);
  }

  return ok({
    alias: profile.alias,
    animal: profile.animal,
    color: profile.color,
    narrative: profile.narrative,
    mbti_code: profile.mbtiCode,
    matches: { romance, amistad },
    no_match_message: NO_MATCH_MESSAGE,
  });
}
