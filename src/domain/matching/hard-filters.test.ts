/**
 * ADR-053 keeps the two gender vocabularies honest. The bank offers the words
 * and the kernel decides who reaches whom; each of them can be edited without
 * the other, and every way they can disagree is a real person losing or gaining
 * romance reach by accident. These tests read `data/microtest.json` instead of
 * restating it, so drift fails the build instead of shipping.
 */
import { describe, expect, it } from "vitest";

import { MICROTEST_ITEMS } from "@/domain/matching";

import { attractedTo, checkHardFilters, ORIENTATION_TARGET_KEYS } from "./hard-filters";

const PREFER_NOT = "prefiero no decir";

function optionsOf(itemId: string): string[] {
  return MICROTEST_ITEMS.find((item) => item.id === itemId)?.opciones ?? [];
}

const ORIENTATIONS = optionsOf("FIL1").filter((o) => o !== PREFER_NOT);
const IDENTITIES = optionsOf("FIL2").filter((o) => o !== PREFER_NOT);

/** The values that already existed before 2.3.0; the change has to be additive. */
const V22_ORIENTATIONS = ["mujeres", "hombres", "personas no binarias", PREFER_NOT];
const V22_IDENTITIES = ["mujer", "hombre", "no binarie", "género fluido", "agénero", "otra", PREFER_NOT];

describe("vocabulario de género (ADR-053)", () => {
  it("keeps every answer stored under 2.2.x still offerable", () => {
    for (const value of V22_ORIENTATIONS) expect(optionsOf("FIL1"), value).toContain(value);
    for (const value of V22_IDENTITIES) expect(optionsOf("FIL2"), value).toContain(value);
  });

  it("maps exactly the orientation options the bank offers", () => {
    expect([...ORIENTATION_TARGET_KEYS].sort()).toEqual([...ORIENTATIONS].sort());
  });

  it("leaves no declared identity out of everyone's reach", () => {
    for (const identity of IDENTITIES) {
      const seekers = ORIENTATIONS.filter((orientation) => attractedTo([orientation], [identity]));
      expect(seekers, `"${identity}" no la puede buscar ninguna opción`).not.toHaveLength(0);
    }
  });

  it("leaves no orientation option pointing at nobody", () => {
    for (const orientation of ORIENTATIONS) {
      const reached = IDENTITIES.filter((identity) => attractedTo([orientation], [identity]));
      expect(reached, `"${orientation}" no alcanza a ninguna identidad`).not.toHaveLength(0);
    }
  });

  it("means every gender with 'cualquier género', in one click", () => {
    for (const identity of IDENTITIES) expect(attractedTo(["cualquier género"], [identity]), identity).toBe(true);
  });

  it("counts a trans woman as a woman and not as a man", () => {
    expect(attractedTo(["mujeres"], ["mujer trans"])).toBe(true);
    expect(attractedTo(["hombres"], ["mujer trans"])).toBe(false);
    expect(attractedTo(["mujeres"], ["hombre trans"])).toBe(false);
    expect(attractedTo(["mujeres"], ["mujer"])).toBe(true);
  });

  it("keeps 'prefiero no decir' out of every target list", () => {
    for (const orientation of ORIENTATIONS) {
      expect(attractedTo([orientation], [PREFER_NOT]), orientation).toBe(true);
    }
  });
});

describe("checkHardFilters con el vocabulario nuevo", () => {
  const person = (orientacion_sexual: string[], identidad_genero: string[]) => ({
    orientacion_sexual,
    identidad_genero,
    tipo_relacion_busca: ["sin_definir"] as string[],
  });

  it("lets two women who like women match when one is trans", () => {
    const cis = person(["mujeres"], ["mujer"]);
    const trans = person(["mujeres"], ["mujer trans"]);
    expect(checkHardFilters(cis, trans)).toBe(true);
    expect(checkHardFilters(trans, cis)).toBe(true);
  });

  it("lets a pan person and a person who only seeks trans people match", () => {
    const pan = person(["cualquier género"], ["persona trans"]);
    const transSeeker = person(["personas trans"], ["mujer trans"]);
    expect(checkHardFilters(pan, transSeeker)).toBe(true);
    expect(checkHardFilters(transSeeker, pan)).toBe(true);
  });

  it("does not invent an attraction nobody declared", () => {
    const gayMan = person(["hombres"], ["hombre"]);
    const transWoman = person(["hombres"], ["mujer trans"]);
    const lesbian = person(["mujeres"], ["mujer"]);
    const transMan = person(["mujeres"], ["hombre trans"]);
    expect(checkHardFilters(gayMan, transWoman)).toBe(false);
    expect(checkHardFilters(lesbian, transMan)).toBe(false);
    expect(checkHardFilters(lesbian, person(["personas no binarias"], ["mujer"]))).toBe(false);
  });

  it("still closes the pair when one side hides in the opt-out", () => {
    const open = person(["cualquier género"], ["otra"]);
    const hidden = person([PREFER_NOT], ["mujer"]);
    expect(checkHardFilters(open, hidden)).toBe(false);
  });
});
