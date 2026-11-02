/**
 * Identity-layer readouts derived from the latent profile (layer 4). They feed
 * avatars and narrative; their weight in the score is minimal (ADR-017).
 *
 * MBTI: four continuous axes. Sign convention of the bank: mbti_ei > 0 → I,
 * mbti_sn > 0 → N, mbti_tf > 0 → F, mbti_jp > 0 → P. An axis is "ambiguous"
 * when |θ| < k·SE (posterior mass on both sides).
 *
 * Enneagram: p = softmax(θ_ennea / T); normalized entropy H/log 9 measures
 * ambiguity; above the configured threshold no type is forced. The wing is
 * the more probable of the two ring neighbours.
 */
import { entropy, softmax } from "@/domain/math";
import type { LatentProfile } from "@/types/latent";

export interface MbtiAxis {
  readonly factor: string;
  readonly theta: number;
  readonly se: number;
  readonly letter: string;
  readonly ambiguous: boolean;
}

export interface MbtiReadout {
  readonly code: string;
  readonly axes: readonly MbtiAxis[];
}

const AXES = [
  { factor: "mbti_ei", positive: "I", negative: "E" },
  { factor: "mbti_sn", positive: "N", negative: "S" },
  { factor: "mbti_tf", positive: "F", negative: "T" },
  { factor: "mbti_jp", positive: "P", negative: "J" },
] as const;

export function mbtiFromLatent(profile: LatentProfile, ambiguitySe: number): MbtiReadout {
  const axes = AXES.map(({ factor, positive, negative }) => {
    const theta = profile.theta[factor] ?? 0;
    const se = profile.se[factor] ?? 1;
    // θ = 0 exactly → negative letter; deterministic tie-break.
    return { factor, theta, se, letter: theta > 0 ? positive : negative, ambiguous: Math.abs(theta) < ambiguitySe * se };
  });
  return { code: axes.map((a) => a.letter).join(""), axes };
}

export const ENNEAGRAM_TYPES = 9;
const ENNEAGRAM_FACTORS = Array.from({ length: ENNEAGRAM_TYPES }, (_, i) => `ennea_${i + 1}`);

export interface EnneagramReadout {
  /** P(type) for types 1..9 (index 0 = type 1). */
  readonly probabilities: readonly number[];
  /** H / log 9 ∈ [0, 1]. */
  readonly normalizedEntropy: number;
  readonly type: number;
  readonly wing: number;
  readonly ambiguous: boolean;
}

export function enneagramProbabilities(profile: LatentProfile, temperature: number): number[] {
  return softmax(ENNEAGRAM_FACTORS.map((f) => profile.theta[f] ?? 0), temperature);
}

function ringNeighbours(type: number): readonly [number, number] {
  const left = type === 1 ? ENNEAGRAM_TYPES : type - 1;
  const right = type === ENNEAGRAM_TYPES ? 1 : type + 1;
  return [left, right];
}

export function enneagramFromLatent(
  profile: LatentProfile,
  temperature: number,
  ambiguityEntropy: number,
): EnneagramReadout {
  const probabilities = enneagramProbabilities(profile, temperature);
  const normalizedEntropy = entropy(probabilities) / Math.log(ENNEAGRAM_TYPES);
  // Lowest type number wins exact ties (deterministic).
  let type = 1;
  probabilities.forEach((p, i) => {
    if (p > probabilities[type - 1]!) type = i + 1;
  });
  const [left, right] = ringNeighbours(type);
  const wing = probabilities[right - 1]! > probabilities[left - 1]! ? right : left;
  return { probabilities, normalizedEntropy, type, wing, ambiguous: normalizedEntropy > ambiguityEntropy };
}
