import { EXPERIENCE } from "@/config";
import {
  computeChemistrySummary,
  explainPair,
  type MatchExplanation,
  type NarrativeSide,
} from "@/domain/explainability";
import { MATCHING_CONFIG, pairScore, type PairScore } from "@/domain/matching";
import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { err, ok, type Result } from "@/domain/shared";

import type { MatchEntryDto, ResultDto } from "./dto";
import { counterpartIdentity, enneagramWords, toIdentityDto } from "./identity-dto";
import { layerBands, sharedProfile } from "./counterpart-view";
import type { AppError } from "./errors";
import { matchHandle } from "./match-handle";
import type { CounterpartProfile, MatchRepository, OwnProfile, ProfileRepository, StoredMatch } from "./ports";

export interface GetResultDeps {
  profiles: Pick<ProfileRepository, "findOwn" | "findCounterparts" | "countActive">;
  matches: Pick<MatchRepository, "listFor">;
  /** One-way digest (hex) used to derive per-viewer opaque match handles. */
  digest(input: string): string;
}

/**
 * The two typology labels the explanation may mention. They are the stored
 * readout of each person, so the story always matches the displayed name.
 */
function narrativeSide(other: CounterpartProfile): NarrativeSide {
  return { enneagramType: enneagramWords(other.enneagramCode).type, mbti: other.mbtiCode };
}

function ownNarrative(own: OwnProfile): NarrativeSide {
  return { enneagramType: enneagramWords(own.identity.enneagramCode).type, mbti: own.identity.mbtiCode };
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
    selfNarrative: ownNarrative(own),
    otherNarrative: narrativeSide(other),
  });
}

function toEntry(
  match: StoredMatch,
  viewerId: string,
  own: OwnProfile,
  other: CounterpartProfile,
  digest: GetResultDeps["digest"],
): MatchEntryDto {
  const score = scoreOf(match, own, other);
  return {
    id: match.otherUser ? matchHandle(viewerId, match.otherUser, digest) : null,
    identity: counterpartIdentity(other),
    similarity: match.similarity,
    chemistry: computeChemistrySummary(match.similarity, match.track),
    badges: match.badges,
    explanation: explain(match, own, other, score),
    layers: layerBands(score),
    shared: sharedProfile(other),
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
  if (!own.value || own.value.identity.estadoIdentidad !== "eclosionado") return err("quiz.not_completed");
  const profile = own.value;

  const otherIds = [...new Set(matches.value.flatMap((m) => (m.otherUser ? [m.otherUser] : [])))];
  const counterparts = otherIds.length > 0 ? await deps.profiles.findCounterparts(otherIds) : [];
  const byId = new Map(counterparts.map((c) => [c.userId, c]));

  const romance: MatchEntryDto[] = [];
  const amistad: MatchEntryDto[] = [];
  for (const match of matches.value) {
    const other = match.otherUser ? byId.get(match.otherUser) : undefined;
    // A pair only renders when the other side really exists and already
    // hatched; an egg or a deleted account never shows a name in the cielo.
    if (!other || other.estadoIdentidad !== "eclosionado") continue;
    const entry = toEntry(match, viewerId, profile, other, deps.digest);
    (match.track === "romance" ? romance : amistad).push(entry);
  }

  return ok({
    identity: toIdentityDto(profile.identity),
    narrative: profile.narrative,
    matches: { romance, amistad },
    few_people: active !== null && active < EXPERIENCE.result.fewPeopleThreshold,
    no_match_message: NO_MATCH_MESSAGE,
  });
}
