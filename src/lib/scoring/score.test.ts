import { describe, expect, it } from "vitest";

import { scoreBigFive as scoreBigFiveWithWeights } from "@/lib/scoring/bigfive";
import { getBigFiveWeights } from "@/lib/scoring/calibration";
import { SCORING_CONFIG } from "@/lib/scoring/config";
import { scorePair as scorePairWithWeights } from "@/lib/scoring/score";
import {
  BASE_BIG_FIVE,
  COMPLETE_SOCIOCULTURAL,
  makeProfile,
} from "@/lib/scoring/test-fixtures";

const scorePair = (a: Parameters<typeof scorePairWithWeights>[0], b: Parameters<typeof scorePairWithWeights>[1]) =>
  scorePairWithWeights(a, b, getBigFiveWeights("baseline"));
const scoreBigFive = (a: Parameters<typeof scoreBigFiveWithWeights>[0], b: Parameters<typeof scoreBigFiveWithWeights>[1]) =>
  scoreBigFiveWithWeights(a, b, getBigFiveWeights("baseline"));

describe("scorePair", () => {
  it("scores two complete profiles and reports the configured component weights", () => {
    const result = scorePair(makeProfile("a"), makeProfile("b"));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.scoreFinal).toBeGreaterThanOrEqual(0);
    expect(result.scoreFinal).toBeLessThanOrEqual(100);
    expect(result.breakdown).toEqual({
      bigfive: expect.any(Number),
      mbti: expect.any(Number),
      sociocultural: expect.any(Number),
    });
    expect(result.appliedWeights).toEqual(SCORING_CONFIG.pair.weights);
    expect(result.partial).toBe(false);
  });

  it("requires Big Five data on both profiles", () => {
    expect(scorePair(makeProfile("a", { bigFive: null }), makeProfile("b"))).toEqual({
      status: "insufficient_data",
      message: "Faltan respuestas Big Five; no es posible calcular un match fiable.",
    });
    expect(scorePair(makeProfile("a"), makeProfile("b", { bigFive: null })).status)
      .toBe("insufficient_data");
  });

  it("renormalizes the remaining weights and marks missing MBTI as partial", () => {
    const result = scorePair(
      makeProfile("a", { mbti: null }),
      makeProfile("b"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.breakdown.mbti).toBeNull();
    expect(result.missing).toContain("mbti");
    expect(result.appliedWeights.bigfive).toBeCloseTo(0.7 / 0.85);
    expect(result.appliedWeights.mbti).toBe(0);
    expect(result.appliedWeights.sociocultural).toBeCloseTo(0.15 / 0.85);
    expect(Object.values(result.appliedWeights).reduce((sum, weight) => sum + weight, 0))
      .toBeCloseTo(1);
    expect(result.partial).toBe(true);
  });

  it("marks missing sociocultural data as partial", () => {
    const result = scorePair(
      makeProfile("a", { sociocultural: null }),
      makeProfile("b", { sociocultural: null }),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.breakdown.sociocultural).toBeNull();
    expect(result.missing).toContain("sociocultural");
    expect(result.partial).toBe(true);
  });

  it("marks missing relationship selections as partial", () => {
    const result = scorePair(
      makeProfile("a", {
        sociocultural: {
          orientacion: ["mujeres"],
          identidadGenero: ["mujer"],
          ordinal: { valores_empatia: 0.8 },
        },
      }),
      makeProfile("b"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.missing).toContain("sociocultural");
    expect(result.partial).toBe(true);
  });

  it("does not throw for null optional fields or invalid MBTI codes", () => {
    const result = scorePair(
      makeProfile("a", { mbti: "XXXX", sociocultural: null }),
      makeProfile("b", { mbti: null, sociocultural: null }),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.breakdown.mbti).toBeNull();
    expect(result.missing).toEqual(["mbti", "sociocultural"]);
  });

  it("excludes incompatible romance profiles and solo_amistad", () => {
    const straightMan = makeProfile("a", {
      sociocultural: {
        orientacion: ["mujeres"],
        identidadGenero: ["hombre"],
        tipoRelacion: ["monogamia"],
      },
    });
    const lesbianWoman = makeProfile("b", {
      sociocultural: {
        orientacion: ["mujeres"],
        identidadGenero: ["mujer"],
        tipoRelacion: ["monogamia"],
      },
    });
    const soloFriend = makeProfile("c", {
      sociocultural: {
        orientacion: ["mujeres"],
        identidadGenero: ["mujer"],
        tipoRelacion: ["solo_amistad"],
      },
    });

    expect(scorePair(straightMan, lesbianWoman)).toEqual({
      status: "excluded",
      reason: "hard_filter",
    });
    expect(scorePair(makeProfile("a"), soloFriend)).toEqual({
      status: "excluded",
      reason: "hard_filter",
    });
    expect(
      scorePair(
        makeProfile("c", {
          sociocultural: { tipoRelacion: ["solo_amistad"] },
        }),
        makeProfile("d", {
          sociocultural: { tipoRelacion: ["monogamia"] },
        }),
      ),
    ).toEqual({ status: "excluded", reason: "hard_filter" });
  });

  it("requires each person's conscientiousness and agreeableness to meet the threshold", () => {
    const high = scorePair(
      makeProfile("a", {
        bigFive: { ...BASE_BIG_FIVE, C: 65, A: 65 },
      }),
      makeProfile("b", {
        bigFive: { ...BASE_BIG_FIVE, C: 65, A: 65 },
      }),
    );
    const mixed = scorePair(
      makeProfile("c", {
        bigFive: { ...BASE_BIG_FIVE, C: 100, A: 100 },
      }),
      makeProfile("d", {
        bigFive: { ...BASE_BIG_FIVE, C: 30, A: 30 },
      }),
    );

    expect(high.status).toBe("ok");
    if (high.status === "ok") {
      expect(high.reasons).toContain("high_conscientious_agreeable");
    }
    expect(mixed.status).toBe("ok");
    if (mixed.status === "ok") {
      expect(mixed.reasons).not.toContain("high_conscientious_agreeable");
    }
  });

  it("treats incomplete hard-filter data as partial without excluding the pair", () => {
    const result = scorePair(
      makeProfile("a", {
        sociocultural: { ordinal: { valores_empatia: 0.8 } },
      }),
      makeProfile("b", {
        sociocultural: {
          ordinal: { valores_empatia: 0.8 },
          orientacion: ["mujeres"],
          identidadGenero: ["mujer"],
        },
      }),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.missing).toContain("sociocultural");
    expect(result.partial).toBe(true);
  });

  it("keeps full-precision ranking data separate from one-decimal output", () => {
    const a = makeProfile("a", { bigFive: { ...BASE_BIG_FIVE, N: 39 } });
    const b = makeProfile("b", { bigFive: { ...BASE_BIG_FIVE, N: 39 } });
    const expected = scoreBigFive(a.bigFive!, b.bigFive!);
    const result = scorePair(a, b);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.breakdown.bigfive).toBe(Math.round(expected.score * 1000) / 10);
  });

  it("keeps explanations deterministic and coherent with triggered stability reasons", () => {
    const sociocultural = {
      orientacion: ["mujeres"],
      identidadGenero: ["mujer"],
      tipoRelacion: ["monogamia"],
    };
    const low = makeProfile("a", {
      bigFive: { O: 80, C: 50, E: 80, A: 50, N: 30 },
      mbti: "ENTP",
      sociocultural,
    });
    const otherLow = makeProfile("b", {
      bigFive: { O: 80, C: 50, E: 80, A: 50, N: 30 },
      mbti: "ENTP",
      sociocultural,
    });
    const first = scorePair(low, otherLow);
    const second = scorePair(low, otherLow);

    expect(first).toEqual(second);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.reasons).toContain("stability_bonus");
    expect(first.explanation).toContain("niveles bajos de neuroticismo");
    expect(first.explanation.split(".").filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(first.explanation.split(".").filter(Boolean).every((sentence) => {
      const firstCharacter = sentence.trim().charAt(0);
      return firstCharacter === firstCharacter.toUpperCase();
    })).toBe(true);
    expect(first.explanation).toContain("MBTI");

    const noBonus = scorePair(
      makeProfile("c", { bigFive: { ...BASE_BIG_FIVE, N: 50 }, mbti: null }),
      makeProfile("d", { bigFive: { ...BASE_BIG_FIVE, N: 50 }, mbti: null }),
    );
    expect(noBonus.status).toBe("ok");
    if (noBonus.status !== "ok") return;
    expect(noBonus.reasons).not.toContain("stability_bonus");
    expect(noBonus.explanation).not.toContain("niveles bajos de neuroticismo");
    expect(noBonus.explanation).not.toContain("MBTI");
  });

  it("provides two sentences when close traits are the only triggered reason", () => {
    const noOptionalReasons = {
      orientacion: ["mujeres"],
      identidadGenero: ["mujer"],
      tipoRelacion: ["monogamia"],
      ordinal: { valores_empatia: 0.3, cultural_humor: 0.3 },
    };
    const a = makeProfile("a", {
      bigFive: { O: 50, C: 50, E: 50, A: 50, N: 50 },
      mbti: "ENTP",
      sociocultural: noOptionalReasons,
    });
    const b = makeProfile("b", {
      bigFive: { O: 50, C: 50, E: 50, A: 50, N: 50 },
      mbti: "ESFP",
      sociocultural: {
        ...noOptionalReasons,
        ordinal: { valores_empatia: 0, cultural_humor: 0 },
      },
    });
    const result = scorePair(a, b);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.reasons).toEqual(["close_traits"]);
    expect(result.explanation.split(".").filter(Boolean)).toHaveLength(2);
  });

  it("does not mutate the supplied sociocultural fixture", () => {
    const before = structuredClone(COMPLETE_SOCIOCULTURAL);
    scorePair(makeProfile("a"), makeProfile("b"));
    expect(COMPLETE_SOCIOCULTURAL).toEqual(before);
  });

  it("adds conflict and empathy alignment only when their answer rules are met", () => {
    const aligned = scorePair(
      makeProfile("a", {
        sociocultural: {
          ...COMPLETE_SOCIOCULTURAL,
          ordinal: { valores_gestion_conflicto: 0.55, valores_empatia: 0.8 },
        },
      }),
      makeProfile("b", {
        sociocultural: {
          ...COMPLETE_SOCIOCULTURAL,
          ordinal: { valores_gestion_conflicto: 0.7, valores_empatia: 0.75 },
        },
      }),
    );
    expect(aligned.status).toBe("ok");
    if (aligned.status !== "ok") return;
    expect(aligned.reasons).toContain("conflict_style_aligned");
    expect(aligned.reasons).toContain("empathy_aligned");
    expect(aligned.explanation).toContain("resolución de conflictos y empatía");
    expect(aligned.explanation.split(".").filter(Boolean).length).toBeLessThanOrEqual(3);

    const notAligned = scorePair(
      makeProfile("c", {
        sociocultural: {
          ...COMPLETE_SOCIOCULTURAL,
          ordinal: { valores_gestion_conflicto: 0.3, valores_empatia: 0.3 },
        },
      }),
      makeProfile("d", {
        sociocultural: {
          ...COMPLETE_SOCIOCULTURAL,
          ordinal: { valores_gestion_conflicto: 0.9, valores_empatia: 0.5 },
        },
      }),
    );
    expect(notAligned.status).toBe("ok");
    if (notAligned.status !== "ok") return;
    expect(notAligned.reasons).not.toContain("conflict_style_aligned");
    expect(notAligned.reasons).not.toContain("empathy_aligned");
  });

  it("reserves the last explanation sentence for partial data without changing complete pairs", () => {
    const bigFive = { O: 50, C: 50, E: 50, A: 50, N: 30 };
    const sociocultural = {
      ...COMPLETE_SOCIOCULTURAL,
      ordinal: { valores_empatia: 0.8, cultural_humor: 0.7 },
    };
    const complete = scorePair(
      makeProfile("complete-a", { bigFive, sociocultural }),
      makeProfile("complete-b", { bigFive, sociocultural }),
    );
    expect(complete.status).toBe("ok");
    if (complete.status !== "ok") return;
    expect(complete.explanation).toBe(
      "Ambas personas muestran niveles bajos de neuroticismo, un patrón favorable para la estabilidad. En sus respuestas, las mayores cercanías aparecen en apertura y responsabilidad. En sus respuestas sobre empatía, sus valores muestran cercanía.",
    );

    const partial = scorePair(
      makeProfile("partial-a", { bigFive, sociocultural }),
      makeProfile("partial-b", { bigFive, mbti: null, sociocultural }),
    );
    expect(partial.status).toBe("ok");
    if (partial.status !== "ok") return;
    expect(partial.reasons).toContain("empathy_aligned");
    expect(partial.reasons).toContain("partial_data");
    expect(partial.explanation.split(".").filter(Boolean)).toHaveLength(3);
    expect(partial.explanation.endsWith("La estimación es parcial porque faltan algunos datos opcionales."))
      .toBe(true);
  });
});
