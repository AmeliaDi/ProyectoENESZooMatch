/**
 * "Tu carta": the owner's own readings, available any time after the test
 * (the reveal is shown only once). Owner-only; returns derived readings and
 * never θ, SE, vectors, answers or hard filters.
 */
import { SELF_READING } from "@/config/self-reading";
import type { AffinitySummaryDto, ProfileDto } from "@/contracts/profile";
import { MATCHING_CONFIG } from "@/domain/matching";
import { mbtiFromLatent } from "@/domain/psychometrics/derived";
import { openScaleCount, readSections, readVirtues } from "@/domain/psychometrics/self-reading";
import { err, ok, type Result } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

import type { AppError } from "./errors";
import { EXPLORING_ENNEAGRAM } from "./identity-readout";
import { counterpartIdentity, enneagramWords, toIdentityDto } from "./identity-dto";
import type { IdentityDto } from "@/contracts/identity";
import type { CounterpartProfile, MatchRepository, ProfileRepository, StoredMatch } from "./ports";

export interface GetProfileDeps {
  profiles: Pick<ProfileRepository, "findOwn" | "findCounterparts">;
  matches: Pick<MatchRepository, "listFor">;
}

/** Population prior: every scale reads as "abierta" until it is answered. */
const PRIOR_LATENT: LatentProfile = { theta: {}, se: {}, quality: 1, answered: 0 };
const PERCENT = 100;

function affinities(
  matches: readonly StoredMatch[],
  byId: ReadonlyMap<string, IdentityDto>,
  track: MatchTrack,
): { count: number; top: AffinitySummaryDto[] } {
  const mine = matches.filter((m) => m.track === track);
  const top: AffinitySummaryDto[] = [...mine]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SELF_READING.affinitiesTop)
    .filter((m) => m.otherUser !== null && byId.has(m.otherUser ?? ""))
    .map((m) => ({
      identity: byId.get(m.otherUser ?? "")!,
      percent: Math.round(m.similarity * PERCENT),
    }));
  return { count: mine.length, top };
}

/**
 * MBTI and Enneagram of the card come from the stored readout: the numbers a
 * person sees are the ones their identity was built with, not a second
 * calculation of the same latent profile.
 */
function identityReadout(identity: IdentityDto, latent: LatentProfile | null) {
  const axes = latent ? mbtiFromLatent(latent, MATCHING_CONFIG.scoring.mbti_ambiguity_se).axes : [];
  const ennea = enneagramWords(identity.enneagramCode);
  const exploring = ennea.code === null;
  return {
    mbti: { code: identity.mbtiCode ?? "—", balancedAxes: axes.filter((a) => a.ambiguous).length },
    enneagram: {
      code: ennea.code ?? EXPLORING_ENNEAGRAM.code,
      name: ennea.name ?? EXPLORING_ENNEAGRAM.nombre,
      archetype: ennea.archetype ?? EXPLORING_ENNEAGRAM.arquetipo,
      exploring,
    },
  };
}

export async function getProfile(viewerId: string, deps: GetProfileDeps): Promise<Result<ProfileDto, AppError>> {
  const [own, matches] = await Promise.all([deps.profiles.findOwn(viewerId), deps.matches.listFor(viewerId)]);
  if (!own.ok) return own;
  if (!matches.ok) return matches;
  const profile = own.value;
  if (!profile || profile.identity.estadoIdentidad !== "eclosionado") return err("quiz.not_completed");

  const identity = toIdentityDto(profile.identity);
  const otherIds = [...new Set(matches.value.flatMap((m) => (m.otherUser ? [m.otherUser] : [])))];
  const counterparts: readonly CounterpartProfile[] =
    otherIds.length > 0 ? await deps.profiles.findCounterparts(otherIds) : [];
  const byId = new Map(
    counterparts
      .filter((c) => c.estadoIdentidad === "eclosionado")
      .map((c) => [c.userId, counterpartIdentity(c)]),
  );

  const latent = profile.latent ?? PRIOR_LATENT;
  const sections = readSections(latent);
  const { mbti, enneagram } = identityReadout(identity, profile.latent);
  return ok({
    identity,
    narrative: profile.narrative,
    mbti,
    enneagram,
    virtues: readVirtues(latent).map(({ title, text }) => ({ title, text })),
    sections: sections.map((s) => ({ ...s, scales: s.scales.map((x) => ({ ...x, range: [x.range[0], x.range[1]] })) })),
    openScales: openScaleCount(sections),
    completedModules: [...profile.completedModules],
    affinities: { romance: affinities(matches.value, byId, "romance"), amistad: affinities(matches.value, byId, "amistad") },
  });
}
