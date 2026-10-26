import { describe, expect, it } from "vitest";

import { toScoringProfile } from "@/lib/scoring/from-profile-v2";
import type { ProfilesV2ScoringRow } from "@/lib/scoring/from-profile-v2";

const row: ProfilesV2ScoringRow = {
  user_id: "user-a",
  dimension_scores: {
    personalidad_apertura: 0.6,
    personalidad_responsabilidad: 0.7,
    personalidad_extraversion: 0.8,
    personalidad_amabilidad: 0.9,
    personalidad_estabilidad_emocional: 0.4,
    valores_empatia: 0.75,
    cultural_humor: 0.5,
    identidad_exclusividad: 0.4,
  },
  mbti_code: "INFP",
  orientacion_sexual: ["mujeres"],
  identidad_genero: ["mujer"],
  tipo_relacion_busca: ["monogamia"],
};

describe("toScoringProfile", () => {
  it("maps Big Five to 0-100 and inverts emotional stability for N", () => {
    const profile = toScoringProfile(row);

    expect(profile).toEqual({
      userId: "user-a",
      bigFive: { O: 60, C: 70, E: 80, A: 90, N: 60 },
      mbti: "INFP",
      sociocultural: {
        orientacion: ["mujeres"],
        identidadGenero: ["mujer"],
        tipoRelacion: ["monogamia"],
        ordinal: {
          valores_empatia: 0.75,
          cultural_humor: 0.5,
          identidad_exclusividad: 0.4,
        },
      },
    });
  });

  it("sets Big Five to null when any required dimension is missing or non-finite", () => {
    const missingAmabilidad = { ...row.dimension_scores! };
    delete missingAmabilidad.personalidad_amabilidad;
    expect(toScoringProfile({ ...row, dimension_scores: missingAmabilidad }).bigFive).toBeNull();
    expect(
      toScoringProfile({
        ...row,
        dimension_scores: {
          ...row.dimension_scores,
          personalidad_amabilidad: Number.NaN,
        },
      }).bigFive,
    ).toBeNull();
  });

  it("ignores non-finite ordinal dimensions and preserves absent filter fields", () => {
    const profile = toScoringProfile({
      ...row,
      dimension_scores: {
        ...row.dimension_scores,
        valores_empatia: Number.NaN,
      },
      orientacion_sexual: null,
      identidad_genero: null,
      tipo_relacion_busca: null,
    });

    expect(profile.sociocultural?.orientacion).toBeUndefined();
    expect(profile.sociocultural?.identidadGenero).toBeUndefined();
    expect(profile.sociocultural?.tipoRelacion).toBeUndefined();
    expect(profile.sociocultural?.ordinal).not.toHaveProperty("valores_empatia");
  });

  it("returns null sociocultural data when every optional source is absent", () => {
    expect(
      toScoringProfile({
        user_id: "user-b",
        dimension_scores: null,
        mbti_code: null,
        orientacion_sexual: null,
        identidad_genero: null,
        tipo_relacion_busca: null,
      }).sociocultural,
    ).toBeNull();
  });
});
