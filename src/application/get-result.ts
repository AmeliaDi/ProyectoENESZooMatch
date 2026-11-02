import { CATALOG_COLORS, EXPERIENCE } from "@/config";
import { publicVisual } from "@/domain/avatars/avatar-spec";
import {
  computeChemistrySummary,
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

const COLOR_BY_ID = new Map(CATALOG_COLORS.map((c) => [c.id, c]));

/** What the viewer may see of a counterpart's avatar (wing/mark only with opt-in). */
function disclosed(other: CounterpartProfile | undefined) {
  if (!other?.animalId || !other.colorId) return null;
  const visual = publicVisual({ animalId: other.animalId, colorId: other.colorId, mark: other.mark }, other.showAvatarDetail);
  const color = COLOR_BY_ID.get(visual.colorId);
  return color ? { ...visual, colorName: color.nombre, colorHex: color.hex } : null;
}

/** Shown when the counterpart has no alias yet (should not happen after the quiz). */
const FALLBACK_ALIAS = "alguien especial";
const OPAQUE_ID_LENGTH = 16;

export interface GetResultDeps {
  profiles: Pick<ProfileRepository, "findOwn" | "findCounterparts" | "countActive">;
  matches: Pick<MatchRepository, "listFor">;
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
      disclosed(other)?.colorName ?? "",
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
  const visual = disclosed(other);
  return {
    id: match.otherUser
      ? digest(`${viewerId}:${match.otherUser}`).slice(0, OPAQUE_ID_LENGTH)
      : null,
    alias,
    animal: match.otherAnimal ?? "",
    animal_id: visual?.animalId ?? null,
    color: visual?.colorName ?? "",
    color_id: visual?.colorId ?? null,
    color_hex: visual?.colorHex ?? null,
    mark: visual?.mark ?? null,
    mbti_code: other?.mbtiCode ?? null,
    similarity: match.similarity,
    chemistry: computeChemistrySummary(match.similarity, match.track),
    badges: match.badges,
    narrative: narrativeFor(match.track, alias, match.similarity),
    explanation: explain(match, own, other),
  };
}

export async function getResult(
  viewerId: string,
  deps: GetResultDeps,
): Promise<Result<ResultDto, AppError>> {
  const [own, matches, active] = await Promise.all([
    deps.profiles.findOwn(viewerId),
    deps.matches.listFor(viewerId),
    deps.profiles.countActive(),
  ]);
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
    mark: profile.mark,
    narrative: profile.narrative,
    mbti_code: profile.mbtiCode,
    matches: { romance, amistad },
    few_people: active !== null && active < EXPERIENCE.result.fewPeopleThreshold,
    no_match_message: NO_MATCH_MESSAGE,
  });
}
