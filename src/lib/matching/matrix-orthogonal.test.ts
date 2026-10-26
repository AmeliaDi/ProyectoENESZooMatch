import { describe, expect, it } from "vitest";

import { checkHardFilters } from "@/lib/matching";
import type { HardFilters } from "@/types/microtest";

const filters = (overrides: Partial<HardFilters> = {}): HardFilters => ({
  orientacion_sexual: [],
  identidad_genero: [],
  tipo_relacion_busca: [],
  ...overrides,
});

describe("romance hard-filter matrix", () => {
  it("annihilates the romance score when mutual attraction is false", () => {
    const man = filters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["hombre"],
      tipo_relacion_busca: ["monogamia"],
    });
    const otherMan = filters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["hombre"],
      tipo_relacion_busca: ["monogamia"],
    });

    expect(checkHardFilters(man, otherMan)).toBe(false);
  });

  it("keeps the score orthogonal for a solo_amistad project", () => {
    const soloFriends = filters({
      orientacion_sexual: ["todxs"],
      identidad_genero: ["prefiero no decir"],
      tipo_relacion_busca: ["solo_amistad"],
    });
    const open = filters({
      orientacion_sexual: ["todxs"],
      identidad_genero: ["prefiero no decir"],
      tipo_relacion_busca: ["monogamia"],
    });

    expect(checkHardFilters(soloFriends, open)).toBe(false);
  });

  it("annihilates incompatible relationship projects even with mutual attraction", () => {
    const monogamous = filters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["mujer"],
      tipo_relacion_busca: ["monogamia"],
    });
    const polyamorous = filters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["hombre"],
      tipo_relacion_busca: ["poliamor"],
    });

    expect(checkHardFilters(monogamous, polyamorous)).toBe(false);
  });

  it("preserves the score when both attraction indicators are true", () => {
    const first = filters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["mujer"],
      tipo_relacion_busca: ["monogamia"],
    });
    const second = filters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["hombre"],
      tipo_relacion_busca: ["monogamia"],
    });

    expect(checkHardFilters(first, second)).toBe(true);
  });

  it("is symmetric under profile exchange", () => {
    const first = filters({
      orientacion_sexual: ["mujeres", "personas no binarias"],
      identidad_genero: ["mujer"],
      tipo_relacion_busca: ["no_monogamia_etica"],
    });
    const second = filters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["no binario"],
      tipo_relacion_busca: ["poliamor"],
    });

    expect(checkHardFilters(first, second)).toBe(checkHardFilters(second, first));
    expect(checkHardFilters(first, second)).toBe(true);
  });

  it("treats wildcards as the universal set, never as a false indicator", () => {
    const wildcard = filters({
      orientacion_sexual: ["todxs"],
      identidad_genero: ["prefiero no decir"],
      // An unexpressed relationship project is universal too; `sin_definir`
      // deliberately excludes strict monogamy by product design.
      tipo_relacion_busca: [],
    });
    const strict = filters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["hombre"],
      tipo_relacion_busca: ["monogamia"],
    });

    expect(checkHardFilters(wildcard, strict)).toBe(true);
  });
});
