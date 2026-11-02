/**
 * "Tu carta": the owner's own readings, available any time after the test
 * (the reveal is shown only once). Owner-only; returns derived readings and
 * never θ, SE, vectors, answers or hard filters.
 */
import { SELF_READING } from "@/config/self-reading";
import type { AffinitySummaryDto, ProfileDto } from "@/contracts/profile";
import { buildAvatarSpec } from "@/domain/avatars/avatar-spec";
import { MATCHING_CONFIG } from "@/domain/matching";
import { mbtiFromLatent } from "@/domain/psychometrics/derived";
import { openScaleCount, readSections, readVirtues } from "@/domain/psychometrics/self-reading";
import { err, ok, type Result } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

import type { AppError } from "./errors";
import { avatarParams, enneagramLabel, EXPLORING_ENNEAGRAM } from "./identity-readout";
import type { MatchRepository, ProfileRepository, StoredMatch } from "./ports";

export interface GetProfileDeps {
  profiles: Pick<ProfileRepository, "findOwn">;
  matches: Pick<MatchRepository, "listFor">;
}

/** Population prior: every scale reads as "abierta" until it is answered. */
const PRIOR_LATENT: LatentProfile = { theta: {}, se: {}, quality: 1, answered: 0 };
const PERCENT = 100;
const FALLBACK_ALIAS = "alguien especial";

function affinities(matches: readonly StoredMatch[], track: MatchTrack) {
  const mine = matches.filter((m) => m.track === track);
  const top: AffinitySummaryDto[] = [...mine]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SELF_READING.affinitiesTop)
    .map((m) => ({
      alias: m.otherAlias ?? FALLBACK_ALIAS,
      animal: m.otherAnimal ?? "",
      percent: Math.round(m.similarity * PERCENT),
    }));
  return { count: mine.length, top };
}

function identityReadout(latent: LatentProfile | null, storedCode: string | null) {
  if (!latent) {
    return { mbti: { code: storedCode ?? "—", balancedAxes: 0 }, enneagram: { ...EXPLORING_ENNEAGRAM, exploring: true } };
  }
  const mbti = mbtiFromLatent(latent, MATCHING_CONFIG.scoring.mbti_ambiguity_se);
  const spec = buildAvatarSpec(latent, avatarParams());
  const label = enneagramLabel(spec);
  return {
    mbti: { code: mbti.code, balancedAxes: mbti.axes.filter((a) => a.ambiguous).length },
    enneagram: { ...label, exploring: spec.enneagram.type === null },
  };
}

export async function getProfile(viewerId: string, deps: GetProfileDeps): Promise<Result<ProfileDto, AppError>> {
  const [own, matches] = await Promise.all([deps.profiles.findOwn(viewerId), deps.matches.listFor(viewerId)]);
  if (!own.ok) return own;
  if (!matches.ok) return matches;
  const profile = own.value;
  if (!profile?.animal || !profile.color) return err("quiz.not_completed");

  const latent = profile.latent ?? PRIOR_LATENT;
  const sections = readSections(latent);
  const { mbti, enneagram } = identityReadout(profile.latent, profile.mbtiCode);
  return ok({
    alias: profile.alias,
    animal: { id: profile.animal.id, name: profile.animal.diminutivo_es },
    color: { id: profile.color.id, name: profile.color.nombre, hex: profile.color.hex },
    mark: profile.mark,
    narrative: profile.narrative,
    mbti,
    enneagram: { code: enneagram.code, name: enneagram.nombre, archetype: enneagram.arquetipo, exploring: enneagram.exploring },
    virtues: readVirtues(latent).map(({ title, text }) => ({ title, text })),
    sections: sections.map((s) => ({ ...s, scales: s.scales.map((x) => ({ ...x, range: [x.range[0], x.range[1]] })) })),
    openScales: openScaleCount(sections),
    affinities: { romance: affinities(matches.value, "romance"), amistad: affinities(matches.value, "amistad") },
  });
}
