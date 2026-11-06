/**
 * Avatar spec (identity layer 4, docs/AVATARES.md). Pure and deterministic:
 *
 *   MBTI code (sign of the 4 continuous axes) → species pool (temperament +
 *   catalogue affinity, archetypal first); within the pool the CLARITY of the
 *   preferences, mean |2Φ(θ)−1| over the axes, picks the rank: clear
 *   preferences → the most archetypal species, mild ones → the softer ones.
 *   Enneagram type → colour family + chest emblem; wing → tone (deep = ring
 *   predecessor, light = successor); subtype instinct → a small mark.
 *   High entropy → "neblina" colour and a neutral aura instead of a type.
 *
 * Nothing here weighs in the compatibility score.
 */
import { AVATAR_CONFIG } from "@/config";
import { normalCdf } from "@/domain/math";
import { enneagramFromLatent, mbtiFromLatent } from "@/domain/psychometrics/derived";
import { fnv1a32, mulberry32 } from "@/domain/shared";
import type { LatentProfile } from "@/types/latent";

export type SubtypeMark = "sp" | "so" | "sx";
export type EmblemKey = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "neutro";

/** What the sprite engine needs; the only avatar data stored and shared. */
export interface AvatarVisual {
  readonly animalId: string;
  readonly colorId: string;
  readonly mark: SubtypeMark | null;
}

export interface AvatarSpec extends AvatarVisual {
  readonly mbtiCode: string;
  readonly emblem: EmblemKey;
  readonly enneagram: {
    readonly type: number | null;
    readonly wing: number | null;
    readonly ambiguous: boolean;
    readonly normalizedEntropy: number;
  };
}

export interface AvatarParams {
  /** Softmax temperature of the Enneagram readout (matching-config). */
  readonly temperature: number;
  /** Normalized entropy above which no type is forced (matching-config). */
  readonly ambiguityEntropy: number;
}

export const NEUTRAL_COLOR_ID = "ennea-neblina";
const AXIS_FACTORS = ["mbti_ei", "mbti_sn", "mbti_tf", "mbti_jp"] as const;
const SUBTYPES: readonly SubtypeMark[] = ["sp", "so", "sx"];

/** Mean |2Φ(θ)−1| over the four MBTI axes, in [0, 1). */
export function preferenceClarity(profile: LatentProfile): number {
  const total = AXIS_FACTORS.reduce((s, f) => s + Math.abs(2 * normalCdf(profile.theta[f] ?? 0) - 1), 0);
  return total / AXIS_FACTORS.length;
}

/** Pool species by clarity rank: highest clarity → first (most archetypal). */
export function pickSpecies(code: string, clarity: number): string {
  const pool = AVATAR_CONFIG.species_pools.pools[code as keyof typeof AVATAR_CONFIG.species_pools.pools];
  if (!pool || pool.length === 0) throw new Error(`No species pool for MBTI code ${code}`);
  const cuts = AVATAR_CONFIG.species_clarity_cuts.valores[String(pool.length)] ?? [];
  const bucket = cuts.filter((cut) => clarity >= cut).length;
  return pool[pool.length - 1 - bucket] ?? pool[0]!;
}

/** Dominant instinct, only when its posterior is informative and clearly ahead. */
export function subtypeMark(profile: LatentProfile): SubtypeMark | null {
  const { subtype_max_se: maxSe, subtype_margin: margin } = AVATAR_CONFIG.ambiguity;
  const ranked = SUBTYPES.map((s) => ({ s, theta: profile.theta[`sub_${s}`] ?? 0, se: profile.se[`sub_${s}`] ?? 1 }))
    .sort((a, b) => b.theta - a.theta);
  const [first, second] = ranked;
  if (!first || !second) return null;
  if (first.se >= maxSe.valor || first.theta - second.theta < margin.valor) return null;
  return first.s;
}

function latentProfileQuantile(profile: LatentProfile, seed?: string): number {
  if (seed && seed.trim().length > 0) {
    return mulberry32(fnv1a32(`avatar-color-seed:${seed.trim()}`))();
  }
  const keys = Object.keys(profile.theta).sort();
  const thetaPart = keys.map((k) => `${k}:${(profile.theta[k] ?? 0).toFixed(6)}`).join("|");
  const seKeys = Object.keys(profile.se).sort();
  const sePart = seKeys.map((k) => `${k}:${(profile.se[k] ?? 1).toFixed(4)}`).join("|");
  const raw = `avatar-color::${profile.answered}:${thetaPart}:${sePart}`;
  return mulberry32(fnv1a32(raw))();
}

/**
 * Deterministic posterior-weighted colour selection when the Enneagram type is
 * ambiguous (normalized entropy > threshold). Uses the full posterior over the
 * 9 types to weight the 27 type/wing tones and keeps `ennea-neblina` at its
 * catalog prior weight (1/28), sampling via a deterministic quantile of the
 * profile seed so no single fallback colour monopolizes ambiguous profiles.
 */
export function pickAmbiguousColor(
  profile: LatentProfile,
  probabilities: readonly number[],
  seed?: string,
): string {
  const neblinaWeight = AVATAR_CONFIG.ambiguity.neblina_prior_weight.valor;
  const remainingMass = Math.max(0, 1 - neblinaWeight);
  const candidates: Array<{ id: string; weight: number }> = [
    { id: NEUTRAL_COLOR_ID, weight: neblinaWeight },
  ];

  for (let type = 1; type <= 9; type++) {
    const pType = Math.max(0, probabilities[type - 1] ?? 1 / 9);
    const familyMass = remainingMass * pType;
    const left = type === 1 ? 9 : type - 1;
    const right = type === 9 ? 1 : type + 1;
    const pLeft = Math.max(1e-6, probabilities[left - 1] ?? 1 / 9);
    const pRight = Math.max(1e-6, probabilities[right - 1] ?? 1 / 9);
    const wingSum = pLeft + pRight;
    const baseMass = familyMass / 3;
    const wingMass = (familyMass * 2) / 3;

    candidates.push(
      { id: `ennea-${type}`, weight: baseMass },
      { id: `ennea-${type}-w${left}`, weight: wingMass * (pLeft / wingSum) },
      { id: `ennea-${type}-w${right}`, weight: wingMass * (pRight / wingSum) },
    );
  }

  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  const target = latentProfileQuantile(profile, seed) * (total > 0 ? total : 1);
  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (target < cumulative) return candidate.id;
  }
  return candidates[candidates.length - 1]!.id;
}

function enneagramVisual(profile: LatentProfile, params: AvatarParams, seed?: string) {
  const readout = enneagramFromLatent(profile, params.temperature, params.ambiguityEntropy);
  const base = { normalizedEntropy: readout.normalizedEntropy, ambiguous: readout.ambiguous };
  if (readout.ambiguous) {
    return {
      colorId: pickAmbiguousColor(profile, readout.probabilities, seed),
      emblem: "neutro" as EmblemKey,
      enneagram: { ...base, type: null, wing: null },
    };
  }
  const { type, wing, probabilities } = readout;
  const left = type === 1 ? 9 : type - 1;
  const right = type === 9 ? 1 : type + 1;
  const gap = Math.abs(probabilities[left - 1]! - probabilities[right - 1]!);
  const shown = gap >= AVATAR_CONFIG.ambiguity.wing_margin.valor ? wing : null;
  return {
    colorId: shown === null ? `ennea-${type}` : `ennea-${type}-w${shown}`,
    emblem: String(type) as EmblemKey,
    enneagram: { ...base, type, wing: shown },
  };
}

export function buildAvatarSpec(profile: LatentProfile, params: AvatarParams, seed?: string): AvatarSpec {
  const mbtiCode = mbtiFromLatent(profile, 0).code;
  const ennea = enneagramVisual(profile, params, seed);
  return { animalId: pickSpecies(mbtiCode, preferenceClarity(profile)), mbtiCode, mark: subtypeMark(profile), ...ennea };
}

/** `ennea-4-w5` → `ennea-4`; any other id is returned unchanged. */
export function baseColorId(colorId: string): string {
  return colorId.replace(/-w[1-9]$/, "");
}

/** Emblem implied by a palette colour id; `null` for ids outside the palette. */
export function emblemForColor(colorId: string): EmblemKey | null {
  if (colorId === NEUTRAL_COLOR_ID) return "neutro";
  const match = /^ennea-([1-9])(?:-w[1-9])?$/.exec(colorId);
  return match ? (match[1] as EmblemKey) : null;
}

/** What third parties see: the wing tone and subtype mark only with consent. */
export function publicVisual(visual: AvatarVisual, showDetail: boolean): AvatarVisual {
  if (showDetail) return visual;
  return { animalId: visual.animalId, colorId: baseColorId(visual.colorId), mark: null };
}
