import type { BigFive, ScoringProfile, Sociocultural } from "@/lib/scoring/types";

export const BASE_BIG_FIVE: BigFive = {
  O: 50,
  C: 60,
  E: 50,
  A: 60,
  N: 50,
};

export const COMPLETE_SOCIOCULTURAL: Sociocultural = {
  orientacion: ["mujeres"],
  identidadGenero: ["mujer"],
  tipoRelacion: ["monogamia"],
  ordinal: { valores_empatia: 0.8, cultural_humor: 0.7 },
};

export function makeProfile(
  userId: string,
  overrides: Partial<ScoringProfile> = {},
): ScoringProfile {
  return {
    userId,
    bigFive: { ...BASE_BIG_FIVE },
    mbti: "ENFP",
    sociocultural: {
      ...COMPLETE_SOCIOCULTURAL,
      ordinal: { ...COMPLETE_SOCIOCULTURAL.ordinal },
    },
    ...overrides,
  };
}
