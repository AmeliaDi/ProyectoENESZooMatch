import { describe, expect, it } from "vitest";

import {
  buildMatchNarrative,
  cognitiveComplementarity,
  computeChemistrySummary,
  generateMatchExplanation,
} from "./explainability";
import { getMatchingConfig } from "./config";
import type { MatchTrack } from "@/types/microtest";

const config = getMatchingConfig();

function similarityAt(track: MatchTrack, relative: number): number {
  const threshold = config.tracks[track].minimum_similarity_exclusive;
  return threshold + relative * (1 - threshold) + 1e-9;
}

describe("computeChemistrySummary", () => {
  it.each(["romance", "amistad"] as const)(
    "calibrates %s bands against the configured threshold",
    (track) => {
      const threshold = config.tracks[track].minimum_similarity_exclusive;

      expect(computeChemistrySummary(threshold, track).level).toBe("quimica_moderada");
      expect(computeChemistrySummary(similarityAt(track, 0.02), track).level).toBe(
        "quimica_moderada",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.12), track).level).toBe(
        "buena_quimica",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.30), track).level).toBe(
        "quimica_fuerte",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.50), track).level).toBe(
        "quimica_excepcional",
      );
      expect(computeChemistrySummary(similarityAt(track, 0.75), track).level).toBe(
        "almas_gemelas",
      );
    },
  );

  it("keeps the raw percentage and exposes the threshold used for the band", () => {
    const summary = computeChemistrySummary(0.74, "romance");

    expect(summary.percentage).toBe(74);
    expect(summary.displayText).toBe("74% de Compatibilidad");
    expect(summary.levelLabel).toBe("Química fuerte");
    expect(summary.threshold).toBe(config.tracks.romance.minimum_similarity_exclusive);
    expect(summary.relativePosition).toBeGreaterThan(0);
    expect(summary.relativePosition).toBeLessThan(1);
  });

  it("uses friendship-specific copy and clamps below-threshold scores", () => {
    const summary = computeChemistrySummary(0.1, "amistad");

    expect(summary.displayText).toBe("10% de Química Amistosa");
    expect(summary.level).toBe("quimica_moderada");
    expect(summary.relativePosition).toBe(0);
  });

  it("never exceeds the band range for perfect similarity", () => {
    const summary = computeChemistrySummary(1, "romance");

    expect(summary.percentage).toBe(100);
    expect(summary.level).toBe("almas_gemelas");
    expect(summary.relativePosition).toBe(1);
  });
});

describe("cognitiveComplementarity", () => {
  it("finds complementary dominant/auxiliary functions", () => {
    expect(cognitiveComplementarity("INFP", "INFJ")).toContain("Ne ↔ Ni");
    expect(cognitiveComplementarity("INTP", "ENFJ")).toContain("Ti ↔ Fe");
  });

  it("returns an empty list when the styles are parallel or the codes are missing", () => {
    expect(cognitiveComplementarity("INFP", "INFP")).toEqual([]);
    expect(cognitiveComplementarity(null, "INFJ")).toEqual([]);
  });
});

describe("buildMatchNarrative", () => {
  const sharedOpenAgreeable = {
    personalidad_apertura: 0.86,
    personalidad_responsabilidad: 0.55,
    personalidad_extraversion: 0.82,
    personalidad_amabilidad: 0.88,
    personalidad_estabilidad_emocional: 0.6,
  };
  const quietOpenAgreeable = {
    personalidad_apertura: 0.8,
    personalidad_responsabilidad: 0.5,
    personalidad_extraversion: 0.2,
    personalidad_amabilidad: 0.84,
    personalidad_estabilidad_emocional: 0.55,
  };
  const calmProfile = {
    personalidad_apertura: 0.55,
    personalidad_responsabilidad: 0.55,
    personalidad_extraversion: 0.45,
    personalidad_amabilidad: 0.6,
    personalidad_estabilidad_emocional: 0.85,
  };

  it("weights openness and agreeableness for friendship and tolerates extraversion differences", () => {
    const narrative = buildMatchNarrative({
      track: "amistad",
      similarity: 0.72,
      userDimensionScores: sharedOpenAgreeable,
      matchDimensionScores: quietOpenAgreeable,
      userMbtiCode: "ENFP",
      matchMbtiCode: "INFJ",
      userAnimal: "perrito",
      matchAnimal: "buhito",
    });

    expect(narrative.track).toBe("amistad");
    expect(narrative.scorePorcentaje).toBe(72);
    expect(narrative.tituloQuimica).toBe("Conexión Creativa y Complementaria");
    expect(narrative.porQueFunciona).toContain("apertura mental");
    expect(narrative.porQueFunciona).toContain("amabilidad");
    expect(narrative.porQueFunciona).toContain("extraversión");
    expect(narrative.dinamicaCotidiana.length).toBeGreaterThan(40);
    expect(narrative.puntoDeAtencion).toContain("energía social");
  });

  it("weights shared stability and MBTI complementarity for romance", () => {
    const narrative = buildMatchNarrative({
      track: "romance",
      similarity: 0.78,
      userDimensionScores: calmProfile,
      matchDimensionScores: calmProfile,
      userMbtiCode: "INFP",
      matchMbtiCode: "INFJ",
      userAnimal: "ajolotito",
      matchAnimal: "cisnecito",
    });

    expect(narrative.track).toBe("romance");
    expect(narrative.scorePorcentaje).toBe(78);
    expect(narrative.tituloQuimica).toBe("Chispa de Calma y Complemento");
    expect(narrative.porQueFunciona).toContain("estabilidad emocional");
    expect(narrative.porQueFunciona).toContain("Ne ↔ Ni");
    expect(narrative.porQueFunciona).toContain("identidad y orientación");
    expect(narrative.dinamicaCotidiana.length).toBeGreaterThan(40);
    expect(narrative.puntoDeAtencion.length).toBeGreaterThan(40);
  });

  it("is deterministic and never throws for missing scores", () => {
    const input = {
      track: "romance" as const,
      similarity: 0.7,
      userDimensionScores: null,
      matchDimensionScores: null,
      userMbtiCode: null,
      matchMbtiCode: null,
      userAnimal: "gatito",
      matchAnimal: "zorrito",
    };

    expect(buildMatchNarrative(input)).toEqual(buildMatchNarrative(input));
    expect(buildMatchNarrative(input).porQueFunciona.length).toBeGreaterThan(40);
    expect(buildMatchNarrative(input).compatibilidadMBTI).toBeNull();
    expect(buildMatchNarrative(input).afinidadBigFive).toEqual([]);
  });

  it("keeps the canonical aliases in sync and fills only the track-specific rationale", () => {
    const base = {
      similarity: 0.74,
      userDimensionScores: sharedOpenAgreeable,
      matchDimensionScores: quietOpenAgreeable,
      userMbtiCode: "ENFP",
      matchMbtiCode: "INFJ",
      userAnimal: "perrito",
      matchAnimal: "buhito",
    };
    const friendship = buildMatchNarrative({ ...base, track: "amistad" });
    const romance = buildMatchNarrative({ ...base, track: "romance" });

    expect(friendship.porcentajeQuimica).toBe(friendship.scorePorcentaje);
    expect(friendship.tituloConexion).toBe(friendship.tituloQuimica);
    expect(friendship.dondeCrecer).toBe(friendship.puntoDeAtencion);
    expect(typeof friendship.porQueBuenaAmistad).toBe("string");
    expect(friendship.porQueBuenaAmistad!.length).toBeGreaterThan(40);
    expect(friendship.porQuePosibleRomance).toBeNull();

    expect(romance.porcentajeQuimica).toBe(74);
    expect(romance.tituloConexion).toBe(romance.tituloQuimica);
    expect(romance.dondeCrecer).toBe(romance.puntoDeAtencion);
    expect(typeof romance.porQuePosibleRomance).toBe("string");
    expect(romance.porQuePosibleRomance!.length).toBeGreaterThan(40);
    expect(romance.porQueBuenaAmistad).toBeNull();
  });

  it("describes MBTI cognitive dynamics for a valid pair and stays null otherwise", () => {
    const narrative = buildMatchNarrative({
      track: "romance",
      similarity: 0.8,
      userDimensionScores: calmProfile,
      matchDimensionScores: calmProfile,
      userMbtiCode: "ENFJ",
      matchMbtiCode: "INFP",
      userAnimal: "perrito",
      matchAnimal: "ajolotito",
    });

    expect(narrative.compatibilidadMBTI).not.toBeNull();
    expect(narrative.compatibilidadMBTI!.tipo1).toBe("ENFJ");
    expect(narrative.compatibilidadMBTI!.tipo2).toBe("INFP");
    expect(narrative.compatibilidadMBTI!.funcionesComplementarias.length).toBeGreaterThan(40);
    expect(narrative.compatibilidadMBTI!.dinamicaNatural).toContain("Mentor-Soñador");

    const withoutCodes = buildMatchNarrative({
      track: "romance",
      similarity: 0.8,
      userDimensionScores: calmProfile,
      matchDimensionScores: calmProfile,
      userMbtiCode: "not-a-type",
      matchMbtiCode: null,
      userAnimal: "perrito",
      matchAnimal: "ajolotito",
    });
    expect(withoutCodes.compatibilidadMBTI).toBeNull();
  });

  it("sorts shared Big Five affinities and computes them from the raw gap", () => {
    const narrative = buildMatchNarrative({
      track: "amistad",
      similarity: 0.7,
      userDimensionScores: sharedOpenAgreeable,
      matchDimensionScores: quietOpenAgreeable,
      userMbtiCode: "ENFP",
      matchMbtiCode: "INFJ",
      userAnimal: "perrito",
      matchAnimal: "buhito",
    });

    const entries = narrative.afinidadBigFive;
    expect(entries).toHaveLength(5);
    for (let index = 1; index < entries.length; index++) {
      expect(entries[index - 1]!.similitud).toBeGreaterThanOrEqual(entries[index]!.similitud);
    }
    const byDimension = new Map(entries.map((entry) => [entry.dimension, entry.similitud]));
    expect(byDimension.get("Amabilidad")).toBe(0.96);
    expect(byDimension.get("Responsabilidad")).toBe(0.95);
    expect(byDimension.get("Apertura Mental")).toBe(0.94);
    expect(byDimension.get("Energía Social")).toBe(0.38);
    for (const entry of entries) {
      expect(entry.interpretacion.length).toBeGreaterThan(40);
      expect(entry.similitud).toBeGreaterThanOrEqual(0);
      expect(entry.similitud).toBeLessThanOrEqual(1);
    }

    const symmetric = buildMatchNarrative({
      track: "amistad",
      similarity: 0.7,
      userDimensionScores: sharedOpenAgreeable,
      matchDimensionScores: sharedOpenAgreeable,
      userMbtiCode: null,
      matchMbtiCode: null,
      userAnimal: "perrito",
      matchAnimal: "buhito",
    });
    expect(symmetric.afinidadBigFive.every((entry) => entry.similitud === 1)).toBe(true);
  });

  it("prioritises the new attention dynamics over the generic gap", () => {
    const quiet = {
      personalidad_apertura: 0.5,
      personalidad_responsabilidad: 0.5,
      personalidad_extraversion: 0.2,
      personalidad_amabilidad: 0.5,
      personalidad_estabilidad_emocional: 0.5,
    };
    const bothIntroverted = buildMatchNarrative({
      track: "amistad",
      similarity: 0.7,
      userDimensionScores: quiet,
      matchDimensionScores: quiet,
      userMbtiCode: null,
      matchMbtiCode: null,
      userAnimal: "gatito",
      matchAnimal: "buhito",
    });
    expect(bothIntroverted.puntoDeAtencion).toContain("conversaciones difíciles");

    const planner = {
      ...quiet,
      personalidad_responsabilidad: 0.85,
      personalidad_extraversion: 0.5,
    };
    const freeSpirit = {
      ...quiet,
      personalidad_responsabilidad: 0.2,
      personalidad_extraversion: 0.5,
    };
    const planningClash = buildMatchNarrative({
      track: "romance",
      similarity: 0.7,
      userDimensionScores: planner,
      matchDimensionScores: freeSpirit,
      userMbtiCode: null,
      matchMbtiCode: null,
      userAnimal: "castorcito",
      matchAnimal: "colibrito",
    });
    expect(planningClash.puntoDeAtencion).toContain("espontaneidad");

    const intense = {
      ...quiet,
      personalidad_extraversion: 0.5,
      personalidad_estabilidad_emocional: 0.2,
    };
    const bothIntense = buildMatchNarrative({
      track: "romance",
      similarity: 0.7,
      userDimensionScores: intense,
      matchDimensionScores: intense,
      userMbtiCode: null,
      matchMbtiCode: null,
      userAnimal: "fenixito",
      matchAnimal: "tigrito",
    });
    expect(bothIntense.puntoDeAtencion).toContain("ancla del otre");
  });
});

describe("generateMatchExplanation", () => {
  it("adds the narrative contract to the richer explanation payload", () => {
    const vector = Array.from({ length: 26 }, () => 0.5);
    const explanation = generateMatchExplanation(
      0.8,
      vector,
      vector,
      "romance",
      "cisnecito",
      "blanco perla",
      "INFJ",
      {
        personalidad_apertura: 0.55,
        personalidad_responsabilidad: 0.55,
        personalidad_extraversion: 0.45,
        personalidad_amabilidad: 0.6,
        personalidad_estabilidad_emocional: 0.85,
      },
      "ajolotito",
      {
        personalidad_apertura: 0.55,
        personalidad_responsabilidad: 0.55,
        personalidad_extraversion: 0.45,
        personalidad_amabilidad: 0.6,
        personalidad_estabilidad_emocional: 0.85,
      },
      "INFP",
    );

    expect(explanation.track).toBe("romance");
    expect(explanation.scorePorcentaje).toBe(80);
    expect(explanation.tituloQuimica.length).toBeGreaterThan(0);
    expect(explanation.porQueFunciona.length).toBeGreaterThan(40);
    expect(explanation.dinamicaCotidiana.length).toBeGreaterThan(40);
    expect(explanation.puntoDeAtencion.length).toBeGreaterThan(40);
    expect(explanation.chemistry.percentage).toBe(80);
  });
});
