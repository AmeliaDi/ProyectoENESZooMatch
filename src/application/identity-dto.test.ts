/**
 * The projection that turns stored identity columns into `IdentityDto`.
 *
 * The interesting surface is the Enneagram readout: it is written once, as
 * text (`"4w5"`, `"4"` or `null`), and screens render it through
 * `enneagramWords`. A row written by an older build can hold anything, and a
 * projection that throws takes the whole result page down with it — so the
 * rule under test is that every input yields words or nothing, never a crash
 * and never a wing the catalogue does not have.
 */
import { describe, expect, it } from "vitest";

import { ENNEAGRAM_WING_CODES } from "@/domain/psychometrics/psychometrics";
import type { CounterpartProfile, IdentityRecord } from "./ports";

import {
  counterpartIdentity,
  enneagramCodeOfReadout,
  enneagramWords,
  toIdentityDto,
} from "./identity-dto";

const TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
/** All 81 type × wing pairs, adjacent and not. */
const ALL_COMBINATIONS = TYPES.flatMap((type) => TYPES.map((wing) => `${type}w${wing}`));

function record(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "zorrito naranja mandarina · DRRS",
    aliasAnimal: "zorrito",
    aliasColor: "naranja mandarina",
    aliasSufijo: "DRRS",
    animalId: "zorrito",
    colorId: "ennea-7",
    mbtiCode: "INFP",
    enneagramCode: "7w6",
    narrative: "Una narrativa",
    mark: "sx",
    revelacionVista: false,
    quizCompletedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("enneagramWords", () => {
  it("reads the three shapes the database can hold", () => {
    expect(enneagramWords(null)).toEqual({
      type: null,
      wing: null,
      code: null,
      name: null,
      archetype: null,
    });
    const typed = enneagramWords("4");
    expect(typed.type).toBe(4);
    expect(typed.wing).toBeNull();
    expect(typed.code).toBe("4");
    expect(typed.name).not.toBeNull();
    expect(typed.archetype).toBeNull();
    const winged = enneagramWords("4w5");
    expect(winged.wing).toBe(5);
    expect(winged.archetype).not.toBeNull();
    expect(winged.name).toBe(enneagramWords("4").name);
  });

  it("never throws on any type × wing pair and keeps only catalogue wings", () => {
    expect(ALL_COMBINATIONS).toHaveLength(81);
    expect(ENNEAGRAM_WING_CODES).toHaveLength(18);
    for (const code of ALL_COMBINATIONS) {
      const words = enneagramWords(code);
      const [type, wing] = code.split("w").map(Number) as [number, number];
      expect(words.type, code).toBe(type);
      expect(words.name, code).toBeTruthy();
      if (ENNEAGRAM_WING_CODES.includes(code)) {
        expect(words.wing, code).toBe(wing);
        expect(words.code, code).toBe(code);
        expect(words.archetype, code).toBeTruthy();
      } else {
        // Alas no vecinas (`"4w2"`) y alas repetidas (`"4w4"`) no existen en el
        // catálogo: se muestra el tipo solo, nunca un tono inventado.
        expect(words.wing, code).toBeNull();
        expect(words.code, code).toBe(String(type));
        expect(words.archetype, code).toBeNull();
      }
    }
  });

  it("rejects text that is not a readout instead of guessing", () => {
    for (const junk of ["", "  ", "4 ", "w5", "0w1", "10", "4w10", "cuatro", "4w5w6"]) {
      expect(enneagramWords(junk).code, junk).toBeNull();
    }
  });

  it("round-trips with the readout code written at hatching", () => {
    for (const code of [...ENNEAGRAM_WING_CODES, ...TYPES.map(String)]) {
      const words = enneagramWords(code);
      expect(enneagramCodeOfReadout(words.type, words.wing), code).toBe(words.code);
    }
  });
});

describe("toIdentityDto", () => {
  it("projects a wing-less readout without inventing one", () => {
    const dto = toIdentityDto(record({ enneagramCode: "5" }));
    expect(dto.enneagramCode).toBe("5");
    expect(dto.enneagramName).toBeTruthy();
    expect(dto.estadoIdentidad).toBe("eclosionado");
  });

  it("projects an unreadable readout as still exploring", () => {
    const dto = toIdentityDto(record({ enneagramCode: "4w2" }));
    expect(dto.enneagramCode).toBe("4");
  });

  it("hides the wing tone of the colour and the readout without the opt-in", () => {
    const counterpart: CounterpartProfile = {
      userId: "00000000-0000-4000-8000-00000000000b",
      estadoIdentidad: "eclosionado",
      aliasCompleto: "pulpito violeta amatista · KMPQ",
      aliasAnimal: "pulpito",
      aliasColor: "violeta amatista",
      aliasSufijo: "KMPQ",
      mbtiCode: "ENFP",
      enneagramCode: "4w5",
      latent: null,
      animalId: "pulpito",
      colorId: "ennea-4-w5",
      mark: "so",
      showAvatarDetail: true,
      sharedLayers: [],
    };
    const shown = counterpartIdentity(counterpart);
    expect(shown.colorId).toBe("ennea-4-w5");
    expect(shown.enneagramCode).toBe("4w5");
    expect(shown.mark).toBe("so");

    const hidden = counterpartIdentity({ ...counterpart, showAvatarDetail: false });
    expect(hidden.colorId).toBe("ennea-4");
    expect(hidden.enneagramCode).toBe("4");
    expect(hidden.mark).toBeNull();
    // El nombre no es un dato sensible: sigue siendo el mismo alias congelado.
    expect(hidden.aliasCompleto).toBe(counterpart.aliasCompleto);
  });

  it("says nothing about an egg, whatever the row claims", () => {
    const dto = toIdentityDto(
      record({
        estadoIdentidad: "huevo",
        aliasCompleto: "zorrito naranja mandarina · DRRS",
        animalId: "zorrito",
        colorId: "ennea-7",
        enneagramCode: "7w6",
      }),
      4242,
    );
    expect(dto).toEqual({
      estadoIdentidad: "huevo",
      aliasCompleto: null,
      aliasAnimal: null,
      aliasColor: null,
      aliasSufijo: null,
      animalId: null,
      colorId: null,
      colorHex: null,
      mbtiCode: null,
      enneagramCode: null,
      enneagramName: null,
      mark: null,
      revelacionVista: false,
      huevitoSeed: 4242,
    });
  });
});
