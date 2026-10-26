import { SCORING_CONFIG } from "@/lib/scoring/config";

export interface MbtiScore {
  score: number | null;
  sharedAxes: string[];
  complementaryAxes: string[];
}

export function scoreMbti(a: string | null | undefined, b: string | null | undefined): MbtiScore {
  const pattern = new RegExp(SCORING_CONFIG.mbti.pattern, "i");
  if (typeof a !== "string" || typeof b !== "string" || !pattern.test(a) || !pattern.test(b)) {
    return { score: null, sharedAxes: [], complementaryAxes: [] };
  }

  const first = a.toUpperCase();
  const second = b.toUpperCase();
  const sharedAxes: string[] = [];
  const complementaryAxes: string[] = [];
  let score = 0;

  for (const axis of SCORING_CONFIG.mbti.axes) {
    const equal = first[axis.index] === second[axis.index];
    const earnsWeight = axis.direction === "same" ? equal : !equal;
    if (earnsWeight) score += axis.weight;
    if (axis.direction === "same" && equal) sharedAxes.push(axis.label);
    if (axis.direction === "different" && !equal) complementaryAxes.push(axis.label);
  }

  return { score, sharedAxes, complementaryAxes };
}
