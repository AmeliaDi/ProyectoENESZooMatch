import { describe, expect, it } from "vitest";

import type { AvatarVisual } from "@/domain/avatars/avatar-spec";
import {
  generateProfileIdentity,
  generateProfileNarrative,
  getTopDimensions,
  type CatalogAnimal,
  type CatalogColor,
  type DimensionAffinity,
} from "@/domain/identity/profile-generator";
import { ALL_DIMENSIONS } from "@/types/microtest";
import type { DimensionScores } from "@/types/microtest";

import { CATALOG as catalogo } from "@/config";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CATALOG_ANIMALS: readonly CatalogAnimal[] = catalogo.animales;
const CATALOG_COLORS: readonly CatalogColor[] = catalogo.colores;

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const ALIAS_SUFFIX_PATTERN = / · [0-9A-Z]{4}$/;

/** Words a validating narrative must never use. */
const FORBIDDEN_PATTERN =
  /score|similarity|vector|cosine|percentil|umbral|feo|fea|tont|estúpid|inútil|defectuoso|fracaso|inferior|aburrid|patétic|rechaz/i;

function animalById(id: string): CatalogAnimal {
  const found = CATALOG_ANIMALS.find((animal) => animal.id === id);
  if (!found) throw new Error(`Missing catalog animal: ${id}`);
  return found;
}

function colorById(id: string): CatalogColor {
  const found = CATALOG_COLORS.find((color) => color.id === id);
  if (!found) throw new Error(`Missing catalog color: ${id}`);
  return found;
}

/** Every one of the 30 scoring dimensions set to the same normalized value. */
function uniformScores(value = 0.5): DimensionScores {
  return Object.fromEntries(ALL_DIMENSIONS.map((dimension) => [dimension, value])) as
    DimensionScores;
}

function scored(overrides: Partial<Record<string, number>>, base = 0.5): DimensionScores {
  return Object.fromEntries(
    ALL_DIMENSIONS.map((dimension) => [dimension, overrides[dimension] ?? base]),
  ) as DimensionScores;
}


const AXOLOTL = animalById("ajolotito");
const MANTIS = animalById("mantisita");
const HUMMINGBIRD = animalById("colibrito");
const EMERALD = colorById("ennea-6");
const PASTEL_PINK = colorById("ennea-2-w3");

const TOP_DIMENSIONS: DimensionAffinity[] = [
  { dimension: "valores_empatia", score: 0.95, label: "empatía profunda" },
  { dimension: "cultural_humor", score: 0.9, label: "sentido del humor" },
  { dimension: "personalidad_apertura", score: 0.8, label: "apertura a nuevas experiencias" },
];

// ─── Narrative generation ─────────────────────────────────────────────────────

describe("generateProfileNarrative", () => {
  const narrative = generateProfileNarrative(AXOLOTL, EMERALD, TOP_DIMENSIONS);

  it("returns a non-empty paragraph that names the animal and the color", () => {
    expect(narrative.length).toBeGreaterThan(100);
    expect(narrative.toLowerCase()).toContain(AXOLOTL.diminutivo_es);
    expect(narrative.toLowerCase()).toContain(EMERALD.nombre.toLowerCase());
    expect(narrative.endsWith(".")).toBe(true);
  });

  it("weaves in the animal metaphor of the selected species", () => {
    expect(narrative).toContain("regeneración y adaptabilidad");
    expect(narrative).toContain("Tu naturaleza de ajolotito");
    expect(narrative.toLowerCase()).not.toContain("axolotl");
  });

  it("is deterministic and varies with the identity", () => {
    expect(generateProfileNarrative(AXOLOTL, EMERALD, TOP_DIMENSIONS)).toBe(narrative);
    expect(generateProfileNarrative(MANTIS, PASTEL_PINK, TOP_DIMENSIONS)).not.toBe(narrative);
    expect(generateProfileNarrative(AXOLOTL, PASTEL_PINK, TOP_DIMENSIONS)).not.toBe(narrative);
  });

  it("stays warm: no clinical, numeric or judgmental language", () => {
    for (const animal of [AXOLOTL, MANTIS, HUMMINGBIRD]) {
      for (const color of [EMERALD, PASTEL_PINK]) {
        const text = generateProfileNarrative(animal, color, TOP_DIMENSIONS);
        expect(text).not.toMatch(FORBIDDEN_PATTERN);
        expect(text).not.toMatch(/\d/);
      }
    }
  });

  it("never leaks the English source name into es-MX copy", () => {
    for (const animal of catalogo.animales) {
      const text = generateProfileNarrative(animal, EMERALD, TOP_DIMENSIONS);
      expect(text).toContain(`naturaleza de ${animal.diminutivo_es} `);
    }
  });

  it("uses the feminine article for diminutives ending in -a", () => {
    expect(generateProfileNarrative(animalById("garcita"), EMERALD, [])).toMatch(/^Eres una garcita /);
    expect(generateProfileNarrative(AXOLOTL, EMERALD, [])).toMatch(/^Eres un ajolotito /);
  });

  it("still produces a full paragraph without top dimensions", () => {
    const short = generateProfileNarrative(AXOLOTL, EMERALD, []);

    expect(short.length).toBeGreaterThan(100);
    expect(short).not.toMatch(FORBIDDEN_PATTERN);
    expect(short.toLowerCase()).toContain(AXOLOTL.diminutivo_es);
  });
});

// ─── Full identity pipeline ───────────────────────────────────────────────────

describe("generateProfileIdentity", () => {
  const scores = scored({
    personalidad_extraversion: 0.85,
    cultural_estetica_visual: 0.7,
    valores_empatia: 0.95,
  });
  const avatar: AvatarVisual = { animalId: "ajolotito", colorId: "ennea-6", mark: "sp" };
  const identity = generateProfileIdentity(scores, "user-7", avatar);

  it("fills every field of the public identity", () => {
    expect(Object.keys(identity).sort()).toEqual([
      "alias",
      "animalDiminutivo",
      "animalId",
      "colorHex",
      "colorId",
      "colorNombre",
      "mark",
      "narrative",
    ]);
    expect(identity.colorHex).toMatch(HEX_PATTERN);
    expect(identity.alias).toMatch(ALIAS_SUFFIX_PATTERN);
    expect(identity.mark).toBe("sp");
  });

  it("uses the avatar spec for animal and colour and builds the narrative from them", () => {
    expect(identity.animalId).toBe(AXOLOTL.id);
    expect(identity.animalDiminutivo).toBe(AXOLOTL.diminutivo_es);
    expect(identity.colorId).toBe(EMERALD.id);
    expect(identity.colorNombre).toBe(EMERALD.nombre);
    expect(identity.narrative).toBe(generateProfileNarrative(AXOLOTL, EMERALD, getTopDimensions(scores, 3)));
    expect(identity.alias.startsWith(`${AXOLOTL.diminutivo_es} ${EMERALD.nombre.toLowerCase()} · `)).toBe(true);
  });

  it("is deterministic and never leaks the user id", () => {
    expect(generateProfileIdentity(scores, "user-7", avatar)).toEqual(identity);
    expect(JSON.stringify(identity)).not.toContain("user-7");
  });

  it("rejects an avatar outside the catalogue instead of inventing one", () => {
    expect(() => generateProfileIdentity(scores, "user-7", { ...avatar, colorId: "verde-esmeralda" })).toThrow();
  });
});

// ─── Top dimensions ───────────────────────────────────────────────────────────

describe("getTopDimensions", () => {
  it("returns three entries by default, sorted by score descending", () => {
    const top = getTopDimensions(
      scored({ valores_empatia: 0.99, cultural_humor: 0.9, personalidad_apertura: 0.8 }),
    );

    expect(top).toHaveLength(3);
    expect(top.map((entry) => entry.dimension)).toEqual([
      "valores_empatia",
      "cultural_humor",
      "personalidad_apertura",
    ]);
    const scores = top.map((entry) => entry.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  it("exposes dimension, score and a human-readable label", () => {
    for (const entry of getTopDimensions(uniformScores(), 5)) {
      expect(Object.keys(entry).sort()).toEqual(["dimension", "label", "score"]);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.label).not.toBe(entry.dimension);
      expect(entry.score).toBeCloseTo(0.5, 12);
    }
    expect(getTopDimensions(scored({ valores_empatia: 0.99 }))[0]?.label).toBe("empatía profunda");
  });

  it("honours the requested limit and never exceeds the dimension count", () => {
    expect(getTopDimensions(uniformScores(), 1)).toHaveLength(1);
    expect(getTopDimensions(uniformScores(), 8)).toHaveLength(8);
    expect(getTopDimensions(uniformScores(), ALL_DIMENSIONS.length)).toHaveLength(
      ALL_DIMENSIONS.length,
    );
    expect(getTopDimensions(uniformScores(), ALL_DIMENSIONS.length + 25)).toHaveLength(
      ALL_DIMENSIONS.length,
    );
    expect(getTopDimensions(uniformScores(), 0)).toHaveLength(0);
  });

  it("covers every scored dimension when nothing is filtered out", () => {
    const all = getTopDimensions(uniformScores(), ALL_DIMENSIONS.length);

    expect(all.map((entry) => entry.dimension).sort()).toEqual([...ALL_DIMENSIONS].sort());
  });
});
