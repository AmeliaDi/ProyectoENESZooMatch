import { SCORING_CONFIG } from "@/lib/scoring/config";
import type { BigFive, ScoringProfile, Sociocultural } from "@/lib/scoring/types";

export interface ProfileScoringRow {
  user_id: string;
  dimension_scores: Record<string, unknown> | null;
  mbti_code: string | null;
  orientacion_sexual: string[] | null;
  identidad_genero: string[] | null;
  tipo_relacion_busca: string[] | null;
}

const BIG_FIVE_DIMENSIONS = {
  O: "personalidad_apertura",
  C: "personalidad_responsabilidad",
  E: "personalidad_extraversion",
  A: "personalidad_amabilidad",
  N: "personalidad_estabilidad_emocional",
} as const;

const ORDINAL_DIMENSIONS = [
  "valores_empatia",
  "valores_confianza",
  "valores_gestion_conflicto",
  "valores_igualdad_genero",
  "valores_corresponsabilidad",
  "valores_respeto_diversidad",
  "cultural_musica_exploracion",
  "cultural_estetica_visual",
  "cultural_hobbies_creativos",
  "cultural_vida_universitaria",
  "cultural_humor",
  "identidad_exclusividad",
  "identidad_comunicacion_afectiva",
] as const;

function finiteValue(scores: Record<string, unknown> | null, key: string): number | null {
  const value = scores?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalSelections(value: string[] | null): string[] | undefined {
  return Array.isArray(value) ? [...value] : undefined;
}

export function toScoringProfile(row: ProfileScoringRow): ScoringProfile {
  const scores = row.dimension_scores;
  const bigFiveValues = Object.fromEntries(
    Object.entries(BIG_FIVE_DIMENSIONS).map(([trait, dimension]) => [
      trait,
      finiteValue(scores, dimension),
    ]),
  ) as Record<keyof BigFive, number | null>;

  const hasCompleteBigFive = SCORING_CONFIG.bigfive.traits.every(
    (trait) => bigFiveValues[trait] !== null,
  );
  const bigFive = hasCompleteBigFive
    ? ({
        O: (bigFiveValues.O as number) * SCORING_CONFIG.bigfive.maxValue,
        C: (bigFiveValues.C as number) * SCORING_CONFIG.bigfive.maxValue,
        E: (bigFiveValues.E as number) * SCORING_CONFIG.bigfive.maxValue,
        A: (bigFiveValues.A as number) * SCORING_CONFIG.bigfive.maxValue,
        N:
          (1 - (bigFiveValues.N as number)) *
          SCORING_CONFIG.bigfive.maxValue,
      } satisfies BigFive)
    : null;

  const ordinal = Object.fromEntries(
    ORDINAL_DIMENSIONS.flatMap((dimension) => {
      const value = finiteValue(scores, dimension);
      return value === null ? [] : [[dimension, value]];
    }),
  );
  const orientacion = optionalSelections(row.orientacion_sexual);
  const identidadGenero = optionalSelections(row.identidad_genero);
  const tipoRelacion = optionalSelections(row.tipo_relacion_busca);
  const sociocultural: Sociocultural | null =
    Object.keys(ordinal).length > 0 ||
    orientacion !== undefined ||
    identidadGenero !== undefined ||
    tipoRelacion !== undefined
      ? {
          ...(orientacion === undefined ? {} : { orientacion }),
          ...(identidadGenero === undefined ? {} : { identidadGenero }),
          ...(tipoRelacion === undefined ? {} : { tipoRelacion }),
          ...(Object.keys(ordinal).length === 0 ? {} : { ordinal }),
        }
      : null;

  return {
    userId: row.user_id,
    bigFive,
    mbti: row.mbti_code,
    sociocultural,
  };
}
