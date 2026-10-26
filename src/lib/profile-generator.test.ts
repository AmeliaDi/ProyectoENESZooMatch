import { describe, expect, it } from "vitest";

import {
  generateAlias,
  generateProfileIdentity,
  generateProfileNarrative,
  getTopDimensions,
  selectAnimal,
  selectColor,
  type CatalogAnimal,
  type CatalogColor,
  type DimensionAffinity,
} from "@/lib/profile-generator";
import { ALL_DIMENSIONS, BIG_FIVE_DIMENSIONS } from "@/types/microtest";
import type { DimensionScores } from "@/types/microtest";

import catalogo from "../../data/arquetipos.json";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CATALOG_ANIMALS = catalogo.animales as CatalogAnimal[];
const CATALOG_COLORS = catalogo.colores as CatalogColor[];

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

function bigFiveVector(animal: CatalogAnimal): number[] {
  return BIG_FIVE_DIMENSIONS.map((dimension) => animal.personality_affinity[dimension] ?? 0);
}

function cosine(first: readonly number[], second: readonly number[]): number {
  let dot = 0;
  let magnitudeFirst = 0;
  let magnitudeSecond = 0;
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index] ?? 0;
    const b = second[index] ?? 0;
    dot += a * b;
    magnitudeFirst += a * a;
    magnitudeSecond += b * b;
  }
  const denominator = Math.sqrt(magnitudeFirst) * Math.sqrt(magnitudeSecond);
  return denominator === 0 ? 0 : dot / denominator;
}

const AXOLOTL = animalById("ajolotito");
const MANTIS = animalById("mantisita");
const HUMMINGBIRD = animalById("colibrito");
const EMERALD = colorById("verde-esmeralda");
const PASTEL_PINK = colorById("rosa-pastel");

const TOP_DIMENSIONS: DimensionAffinity[] = [
  { dimension: "valores_empatia", score: 0.95, label: "empatía profunda" },
  { dimension: "cultural_humor", score: 0.9, label: "sentido del humor" },
  { dimension: "personalidad_apertura", score: 0.8, label: "apertura a nuevas experiencias" },
];

// ─── Animal selection ─────────────────────────────────────────────────────────

describe("selectAnimal", () => {
  it("returns a complete entry from the catalogue", () => {
    const animal = selectAnimal(uniformScores());

    expect(CATALOG_ANIMALS).toHaveLength(catalogo.metadatos.total_animales);
    expect(CATALOG_ANIMALS.some((entry) => entry.id === animal.id)).toBe(true);
    expect(animal.id.length).toBeGreaterThan(0);
    expect(animal.nombre_fuente.length).toBeGreaterThan(0);
    expect(animal.diminutivo_es.length).toBeGreaterThan(0);
    expect(animal.categoria_fauna.length).toBeGreaterThan(0);
    for (const dimension of BIG_FIVE_DIMENSIONS) {
      expect(animal.personality_affinity[dimension]).toBeGreaterThanOrEqual(0);
      expect(animal.personality_affinity[dimension]).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same score profile", () => {
    const scores = uniformScores(0.5);

    expect(selectAnimal(scores)).toEqual(selectAnimal(scores));
    expect(selectAnimal(scored({ personalidad_extraversion: 0.9 })).id).toBe(
      selectAnimal(scored({ personalidad_extraversion: 0.9 })).id,
    );
  });

  it("picks an animal whose Big Five affinity is parallel to the user profile", () => {
    // Two catalog vectors that are clearly not proportional to each other.
    expect(cosine(bigFiveVector(HUMMINGBIRD), bigFiveVector(MANTIS))).toBeLessThan(0.95);

    const social = selectAnimal(scored(HUMMINGBIRD.personality_affinity));
    const methodical = selectAnimal(scored(MANTIS.personality_affinity));

    expect(cosine(bigFiveVector(social), bigFiveVector(HUMMINGBIRD))).toBeCloseTo(1, 12);
    expect(cosine(bigFiveVector(methodical), bigFiveVector(MANTIS))).toBeCloseTo(1, 12);
    expect(social.id).not.toBe(methodical.id);
  });

  it("separates an extraverted profile from an introverted one", () => {
    const extraverted = selectAnimal(
      scored({
        personalidad_apertura: 0.4,
        personalidad_responsabilidad: 0.3,
        personalidad_extraversion: 1,
        personalidad_amabilidad: 0.4,
        personalidad_estabilidad_emocional: 0.3,
      }, 0),
    );
    const introverted = selectAnimal(
      scored({
        personalidad_apertura: 0.4,
        personalidad_responsabilidad: 0.9,
        personalidad_extraversion: 0,
        personalidad_amabilidad: 0.2,
        personalidad_estabilidad_emocional: 0.8,
      }, 0),
    );

    expect(extraverted.personality_affinity.personalidad_extraversion).toBeGreaterThanOrEqual(
      introverted.personality_affinity.personalidad_extraversion,
    );
    expect(bigFiveVector(extraverted)).not.toEqual(bigFiveVector(introverted));
  });

  it("never returns an empty result even for extreme score profiles", () => {
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      expect(selectAnimal(uniformScores(value)).id.length).toBeGreaterThan(0);
    }
  });
});

// ─── Color selection ──────────────────────────────────────────────────────────

describe("selectColor", () => {
  const warmScores = scored({ personalidad_extraversion: 0.9, cultural_estetica_visual: 0.8 });
  const coolScores = scored({ personalidad_apertura: 0.9, personalidad_extraversion: 0.2 });

  it("returns a catalog color with a valid six-digit hex", () => {
    const color = selectColor(uniformScores(), "user-1");

    expect(CATALOG_COLORS).toHaveLength(catalogo.metadatos.total_colores);
    expect(CATALOG_COLORS.some((entry) => entry.id === color.id)).toBe(true);
    expect(color.hex).toMatch(HEX_PATTERN);
    expect(color.nombre.length).toBeGreaterThan(0);
    expect(["calido", "frio", "neutro"]).toContain(color.temperatura);
  });

  it("is deterministic for the same user id and scores", () => {
    expect(selectColor(warmScores, "user-42")).toEqual(selectColor(warmScores, "user-42"));
    expect(selectColor(coolScores, "user-42").id).toBe(selectColor(coolScores, "user-42").id);
  });

  it("gives warm personalities warm colors", () => {
    expect(selectColor(warmScores, "user-1").temperatura).toBe("calido");
    expect(selectColor(warmScores, "user-2").temperatura).toBe("calido");
    expect(selectColor(warmScores, "user-3").temperatura).toBe("calido");
  });

  it("gives introspective personalities cool colors", () => {
    expect(selectColor(coolScores, "user-1").temperatura).toBe("frio");
    expect(selectColor(coolScores, "user-2").temperatura).toBe("frio");
  });

  it("falls back to the neutral temperature for balanced profiles", () => {
    expect(selectColor(uniformScores(0.5), "user-1").temperatura).toBe("neutro");
  });

  it("changes the pick when the user id changes, staying inside the temperature", () => {
    const picks = ["user-a", "user-b", "user-c", "user-d", "user-e"].map((userId) =>
      selectColor(warmScores, userId),
    );

    for (const color of picks) {
      expect(color.temperatura).toBe("calido");
      expect(color.hex).toMatch(HEX_PATTERN);
    }
  });
});

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
    expect(narrative.toLowerCase()).toContain("axolotl");
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

  it("still produces a full paragraph without top dimensions", () => {
    const short = generateProfileNarrative(AXOLOTL, EMERALD, []);

    expect(short.length).toBeGreaterThan(100);
    expect(short).not.toMatch(FORBIDDEN_PATTERN);
    expect(short.toLowerCase()).toContain(AXOLOTL.diminutivo_es);
  });
});

// ─── Alias generation ─────────────────────────────────────────────────────────

describe("generateAlias", () => {
  const alias = generateAlias(AXOLOTL, EMERALD, "user-1");

  it("follows the '{animal} {color} · {4 chars}' shape", () => {
    expect(alias.startsWith(`${AXOLOTL.diminutivo_es} ${EMERALD.nombre.toLowerCase()} · `)).toBe(
      true,
    );
    expect(alias).toMatch(ALIAS_SUFFIX_PATTERN);
  });

  it("is deterministic for the same user id", () => {
    expect(generateAlias(AXOLOTL, EMERALD, "user-1")).toBe(alias);
  });

  it("never exposes the raw user id", () => {
    expect(alias).not.toContain("user-1");
    expect(generateAlias(MANTIS, PASTEL_PINK, "4f9c2a1e-0000-4000-8000-000000000000")).not.toContain(
      "4f9c2a1e",
    );
  });

  it("changes with the animal and the color", () => {
    expect(generateAlias(MANTIS, EMERALD, "user-1")).not.toBe(alias);
    expect(generateAlias(AXOLOTL, PASTEL_PINK, "user-1")).not.toBe(alias);
  });
});

// ─── Full identity pipeline ───────────────────────────────────────────────────

describe("generateProfileIdentity", () => {
  const scores = scored({
    personalidad_extraversion: 0.85,
    cultural_estetica_visual: 0.7,
    valores_empatia: 0.95,
  });
  const identity = generateProfileIdentity(scores, "user-7");

  it("fills every field of the public identity", () => {
    expect(Object.keys(identity).sort()).toEqual([
      "alias",
      "animalDiminutivo",
      "animalId",
      "colorHex",
      "colorId",
      "colorNombre",
      "narrative",
    ]);
    for (const value of Object.values(identity)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
    expect(identity.colorHex).toMatch(HEX_PATTERN);
    expect(identity.alias).toMatch(ALIAS_SUFFIX_PATTERN);
  });

  it("reuses the animal, color, narrative and alias builders", () => {
    expect(identity.animalId).toBe(selectAnimal(scores).id);
    expect(identity.animalDiminutivo).toBe(selectAnimal(scores).diminutivo_es);
    expect(identity.colorId).toBe(selectColor(scores, "user-7").id);
    expect(identity.colorNombre).toBe(selectColor(scores, "user-7").nombre);
    expect(identity.narrative).toBe(
      generateProfileNarrative(
        selectAnimal(scores),
        selectColor(scores, "user-7"),
        getTopDimensions(scores, 3),
      ),
    );
    expect(identity.alias).toBe(
      generateAlias(selectAnimal(scores), selectColor(scores, "user-7"), "user-7"),
    );
  });

  it("is deterministic and never leaks the user id", () => {
    expect(generateProfileIdentity(scores, "user-7")).toEqual(identity);
    expect(JSON.stringify(identity)).not.toContain("user-7");
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
