import { describe, expect, it } from "vitest";

import {
  NO_MATCH_LITERAL,
  answeredIndex,
  formatDimension,
  formatPercentage,
  isPublicMatriculaValid,
  normalizePublicMatricula,
  parsePublicResult,
  parseQuizDraft,
} from "@/components/public-experience-utils";

describe("public registration helpers", () => {
  it("matches the backend normalization and format without retaining separators", () => {
    expect(normalizePublicMatricula(" ab-１２_34 ")).toBe("AB1234");
    expect(isPublicMatriculaValid(" ab-１２_34 ")).toBe(true);
    expect(isPublicMatriculaValid("a!")).toBe(false);
  });
});

describe("temporary quiz draft", () => {
  it("keeps only canonical answers and never accepts identity fields", () => {
    const draft = parseQuizDraft(
      JSON.stringify({ BF01: 4, BF02: 0, matricula: "AB1234", unknown: 2 }),
    );
    expect(draft).toEqual({ BF01: 4 });
    expect("matricula" in draft).toBe(false);
    expect(answeredIndex(draft)).toBe(1);
  });

  it("recovers safely from malformed local data", () => {
    expect(parseQuizDraft("not-json")).toEqual({});
    expect(parseQuizDraft(null)).toEqual({});
  });
});

describe("public result formatting", () => {
  it("bounds percentages and translates known dimensions", () => {
    expect(formatPercentage(0.856)).toBe("86%");
    expect(formatPercentage(2)).toBe("100%");
    expect(formatDimension("relaciones_comunicacion")).toBe("comunicación");
  });

  it("keeps the shared no-match literal verbatim", () => {
    expect(NO_MATCH_LITERAL).toBe("aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor \u003c3");
  });

  it("accepts the existing result route shape", () => {
    const result = parsePublicResult({
      alias: "pulpito azul abisal · ABC12345",
      archetype: {
        id: "pulpito-azul-abisal",
        mbti_code: "INTJ",
        nickname: "Architect",
        role_name: "Analysts",
        traits: ["Introverted"],
        animal: { diminutivo_es: "pulpito" },
        palette: [{ nombre: "Azul abisal", hex: "#123B5D" }],
        primary_color: { nombre: "Azul abisal", hex: "#123B5D" },
        readable_combination: "pulpito azul abisal",
      },
      matches: [
        {
          alias: "buhíto índigo nocturno · DEF67890",
          similarity: 0.91,
          justification: [{ dimension: "relaciones_confianza", affinity: 0.95 }],
        },
      ],
    });

    expect(result?.matches[0]?.similarity).toBe(0.91);
    expect(result?.archetype.primary_color.hex).toBe("#123B5D");
  });
});
