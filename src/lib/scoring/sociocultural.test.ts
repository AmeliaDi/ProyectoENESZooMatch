import { describe, expect, it } from "vitest";

import {
  isHardCompatible,
  scoreSociocultural,
} from "@/lib/scoring/sociocultural";
import type { Sociocultural } from "@/lib/scoring/types";

describe("sociocultural scoring and hard filters", () => {
  it("uses shared ordinal values and relationship Jaccard", () => {
    const a: Sociocultural = {
      ordinal: { valores_empatia: 0.9, cultura: 0.7 },
      tipoRelacion: ["monogamia", "no_monogamia_etica"],
    };
    const b: Sociocultural = {
      ordinal: { valores_empatia: 0.7, cultura: 0.7 },
      tipoRelacion: ["monogamia"],
    };

    expect(scoreSociocultural(a, b)).toBeCloseTo(0.7 * 0.9 + 0.3 * 0.5);
  });

  it("uses the available component when only ordinal or relationship data exists", () => {
    expect(
      scoreSociocultural(
        { ordinal: { valores_empatia: 0.8 } },
        { ordinal: { valores_empatia: 0.5 } },
      ),
    ).toBeCloseTo(0.7);
    expect(
      scoreSociocultural(
        { tipoRelacion: ["monogamia"] },
        { tipoRelacion: ["monogamia", "poliamor"] },
      ),
    ).toBe(0.5);
  });

  it("skips Jaccard when both relationship sets are empty after sin_definir is removed", () => {
    expect(
      scoreSociocultural(
        { tipoRelacion: ["sin_definir"] },
        { tipoRelacion: ["sin_definir"] },
      ),
    ).toBeNull();
  });

  it("reuses romance hard filters for incompatible orientations and solo_amistad", () => {
    const straightMan: Sociocultural = {
      orientacion: ["mujeres"],
      identidadGenero: ["hombre"],
      tipoRelacion: ["monogamia"],
    };
    const lesbianWoman: Sociocultural = {
      orientacion: ["mujeres"],
      identidadGenero: ["mujer"],
      tipoRelacion: ["monogamia"],
    };
    expect(isHardCompatible(straightMan, lesbianWoman)).toBe(false);

    expect(
      isHardCompatible(
        { ...straightMan, identidadGenero: ["mujer"], tipoRelacion: ["solo_amistad"] },
        { ...lesbianWoman, tipoRelacion: ["monogamia"] },
      ),
    ).toBe(false);
  });

  it("passes hard filters when orientation or gender data is missing", () => {
    expect(
      isHardCompatible(
        { orientacion: ["mujeres"], identidadGenero: ["mujer"] },
        { orientacion: ["hombres"] },
      ),
    ).toBe(true);
    expect(isHardCompatible(null, null)).toBe(true);
  });

  it("checks relationship filters without orientation and always excludes solo_amistad-only", () => {
    expect(
      isHardCompatible(
        { tipoRelacion: ["solo_amistad"] },
        { tipoRelacion: ["monogamia"] },
      ),
    ).toBe(false);
    expect(
      isHardCompatible(
        { tipoRelacion: ["monogamia"] },
        { tipoRelacion: ["poliamor"] },
      ),
    ).toBe(false);
  });
});
