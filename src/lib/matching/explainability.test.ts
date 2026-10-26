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
