import { describe, expect, it } from "vitest";

import { rankBestMatches } from "@/lib/scoring/rank";
import { makeProfile } from "@/lib/scoring/test-fixtures";

describe("rankBestMatches", () => {
  it("skips self, limits to three, and sorts ties by userId", () => {
    const target = makeProfile("target");
    const pool = [
      makeProfile("target"),
      makeProfile("z"),
      makeProfile("b"),
      makeProfile("a"),
      makeProfile("c"),
    ];
    const result = rankBestMatches(target, pool);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.matches).toHaveLength(3);
    expect(result.matches.map(({ userId }) => userId)).toEqual(["a", "b", "c"]);
  });

  it("returns insufficient_data when the target lacks Big Five", () => {
    expect(rankBestMatches(makeProfile("target", { bigFive: null }), [])).toEqual({
      status: "insufficient_data",
      message: "Faltan respuestas Big Five; no es posible calcular un match fiable.",
    });
  });

  it("returns no_candidates for an empty compatible pool", () => {
    expect(rankBestMatches(makeProfile("target"), [makeProfile("target")])).toEqual({
      status: "no_candidates",
      message: "Aún no hay perfiles compatibles…",
    });
  });

  it("produces the same ranking for shuffled pool order", () => {
    const target = makeProfile("target");
    const pool = [makeProfile("c"), makeProfile("a"), makeProfile("b")];

    expect(rankBestMatches(target, pool)).toEqual(
      rankBestMatches(target, [...pool].reverse()),
    );
  });

  it("keeps Big Five similarity ahead of a perfect but weaker MBTI result", () => {
    const target = makeProfile("target", { mbti: "ENTP" });
    const nearBigFive = makeProfile("x", {
      mbti: "ESFJ",
      bigFive: { O: 50, C: 50, E: 50, A: 50, N: 50 },
    });
    const farBigFive = makeProfile("y", {
      mbti: "ENTP",
      bigFive: { O: 100, C: 100, E: 100, A: 100, N: 100 },
    });

    const result = rankBestMatches(target, [farBigFive, nearBigFive]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.matches[0]?.userId).toBe("x");
  });

  it("excludes hard-filtered candidates from ranking", () => {
    const target = makeProfile("target", {
      sociocultural: {
        orientacion: ["mujeres"],
        identidadGenero: ["hombre"],
        tipoRelacion: ["monogamia"],
      },
    });
    const excluded = makeProfile("excluded", {
      sociocultural: {
        orientacion: ["mujeres"],
        identidadGenero: ["mujer"],
        tipoRelacion: ["solo_amistad"],
      },
    });
    const included = makeProfile("included", {
      sociocultural: {
        orientacion: ["hombres"],
        identidadGenero: ["mujer"],
        tipoRelacion: ["monogamia"],
      },
    });

    const result = rankBestMatches(target, [excluded, included]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.matches.map(({ userId }) => userId)).toEqual(["included"]);
  });
});
