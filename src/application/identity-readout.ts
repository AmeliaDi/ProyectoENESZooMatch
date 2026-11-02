/**
 * Identity-layer helpers shared by the reveal (submit-quiz) and "Tu carta"
 * (get-profile): enneagram readout parameters and kind display labels.
 */
import type { AvatarParams, AvatarSpec } from "@/domain/avatars/avatar-spec";
import { MATCHING_CONFIG } from "@/domain/matching";
import { enneagramProfileFromType, type EnneagramType } from "@/domain/psychometrics/psychometrics";

/** Enneagram readout parameters live in matching-config (single source). */
export function avatarParams(): AvatarParams {
  const { scoring, categories } = MATCHING_CONFIG;
  const temperature = categories.eneagrama.kind === "distribution" ? categories.eneagrama.temperature : 1;
  return { temperature, ambiguityEntropy: scoring.enneagram_ambiguity_entropy };
}

export interface EnneagramLabel {
  code: string;
  nombre: string;
  arquetipo: string;
}

export const EXPLORING_ENNEAGRAM: EnneagramLabel = {
  code: "—",
  nombre: "En exploración",
  arquetipo: "Tu eneagrama aún no se define",
};

/** Kind words for the readout; an ambiguous readout never forces a type. */
export function enneagramLabel(spec: AvatarSpec): EnneagramLabel {
  const { type, wing } = spec.enneagram;
  if (type === null) return EXPLORING_ENNEAGRAM;
  const ring = type === 1 ? 9 : type - 1;
  const profile = enneagramProfileFromType(type as EnneagramType, (wing ?? ring) as EnneagramType);
  return wing === null
    ? { code: String(type), nombre: profile.nombre, arquetipo: profile.nombre }
    : { code: profile.code, nombre: profile.nombre, arquetipo: profile.arquetipo };
}
