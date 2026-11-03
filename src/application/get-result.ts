import { CATALOG_COLORS, EXPERIENCE } from "@/config";
import { buildAvatarSpec, publicVisual } from "@/domain/avatars/avatar-spec";
import {
  computeChemistrySummary,
  explainPair,
  type MatchExplanation,
  type NarrativeSide,
} from "@/domain/explainability";
import { MATCHING_CONFIG, pairScore, type PairScore } from "@/domain/matching";
import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { err, ok, type Result } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";

import type { MatchEntryDto, ResultDto } from "./dto";
import { layerBands, sharedProfile } from "./counterpart-view";
import type { AppError } from "./errors";
import { avatarParams } from "./identity-readout";
import type { CounterpartProfile, MatchRepository, OwnProfile, ProfileRepository, StoredMatch } from "./ports";

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

/** Main enneagram type only (already readable from the public colour family). */
function narrativeSide(latent: LatentProfile, mbti: string | null): NarrativeSide {
  return { enneagramType: buildAvatarSpec(latent, avatarParams()).enneagram.type, mbti };
}

/**
 * Recomputes the pair score from both posteriors so every number in the
 * explanation is the model's own. Returns null (view degrades gracefully)
 * when a latent profile is missing.
 */
function scoreOf(match: StoredMatch, own: OwnProfile, other: CounterpartProfile | undefined): PairScore | null {
  if (!own.latent || !other?.latent) return null;
  return pairScore(own.latent, other.latent, MATCHING_CONFIG.tracks[match.track], MATCHING_CONFIG.categories);
}

function explain(match: StoredMatch, own: OwnProfile, other: CounterpartProfile | undefined, score: PairScore | null): MatchExplanation | null {
  if (!score || !own.latent || !other?.latent) return null;
  return explainPair({
    score,
    track: match.track,
    self: own.latent,
    other: other.latent,
    selfNarrative: narrativeSide(own.latent, own.mbtiCode),
    otherNarrative: narrativeSide(other.latent, other.mbtiCode),
  });
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
  const score = scoreOf(match, own, other);
  const shared = sharedProfile(other);
  return {
    id: match.otherUser ? digest(`${viewerId}:${match.otherUser}`).slice(0, OPAQUE_ID_LENGTH) : null,
    alias,
    animal: match.otherAnimal ?? "",
    animal_id: visual?.animalId ?? null,
    color: visual?.colorName ?? "",
    color_id: visual?.colorId ?? null,
    color_hex: visual?.colorHex ?? null,
    mark: visual?.mark ?? null,
    mbti_code: shared.mbti?.code ?? null,
    similarity: match.similarity,
    chemistry: computeChemistrySummary(match.similarity, match.track),
    badges: match.badges,
    explanation: explain(match, own, other, score),
    layers: layerBands(score),
    shared,
  };
}

export async function getResult(viewerId: string, deps: GetResultDeps): Promise<Result<ResultDto, AppError>> {
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
