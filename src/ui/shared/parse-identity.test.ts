/**
 * The client-side identity reader (Fase 5) and the one-time reveal gate
 * (Fase 4). These are the only two questions every screen asks the same way:
 * is there a renderable name, and has its reveal already painted.
 */
import { describe, expect, it } from "vitest";

import { EGG_IDENTITY, hasPendingRevelation, isHatched, parseIdentity } from "./parse-identity";

const HATCHED = {
  estadoIdentidad: "eclosionado",
  aliasCompleto: "libélula verde menta · TXTV",
  aliasAnimal: "libélula",
  aliasColor: "verde menta",
  aliasSufijo: "TXTV",
  animalId: "libelula",
  colorId: "ennea-4",
  colorHex: "#a7a58b",
  mbtiCode: "INFJ",
  enneagramCode: "4w5",
  enneagramName: "La individualista",
  mark: "sx",
  revelacionVista: true,
  huevitoSeed: null,
};

describe("parseIdentity", () => {
  it("reads a frozen identity as stored, flag included", () => {
    const id = parseIdentity(HATCHED);
    expect(id.estadoIdentidad).toBe("eclosionado");
    expect(id.aliasCompleto).toBe(HATCHED.aliasCompleto);
    expect(id.revelacionVista).toBe(true);
    // The shell belongs to eggs only.
    expect(id.huevitoSeed).toBeNull();
  });

  it("degrades a hatched payload without a paintable name to the egg", () => {
    for (const broken of [
      { ...HATCHED, aliasCompleto: null },
      { ...HATCHED, aliasSufijo: null },
      { ...HATCHED, animalId: "Libélula" },
      { ...HATCHED, colorId: null },
    ]) {
      const id = parseIdentity(broken);
      expect(id.estadoIdentidad).toBe("huevo");
      expect(isHatched(id)).toBe(false);
    }
  });

  it("keeps only a sane cosmetic seed for an egg", () => {
    expect(parseIdentity({ ...EGG_IDENTITY, huevitoSeed: 4294967295 }).huevitoSeed).toBe(4294967295);
    expect(parseIdentity({ ...EGG_IDENTITY, huevitoSeed: 2 ** 40 }).huevitoSeed).toBe(2 ** 40 % 4294967296);
    for (const junk of [-1, 1.5, "semilla", null, undefined]) {
      expect(parseIdentity({ ...EGG_IDENTITY, huevitoSeed: junk }).huevitoSeed).toBeNull();
    }
  });
});

describe("hasPendingRevelation", () => {
  it("asks for the reveal only of a frozen identity whose flag is still false", () => {
    expect(hasPendingRevelation(parseIdentity({ ...HATCHED, revelacionVista: false }))).toBe(true);
    expect(hasPendingRevelation(parseIdentity(HATCHED))).toBe(false);
  });

  it("never asks an egg: there is no name to reveal yet", () => {
    expect(hasPendingRevelation(parseIdentity(EGG_IDENTITY))).toBe(false);
  });

  it("never asks for a payload that failed to parse into a name", () => {
    expect(hasPendingRevelation(parseIdentity({ ...HATCHED, aliasCompleto: null }))).toBe(false);
    expect(hasPendingRevelation(parseIdentity(null))).toBe(false);
  });
});
