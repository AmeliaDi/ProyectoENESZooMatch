/**
 * Catalogue integrity specs.
 *
 * The JSON in `data/arquetipos.json`, the sprite engine's family map and the
 * Supabase seed are three views of the same catalogue. These tests keep them
 * aligned and enforce the product minimums (80+ animals, per-family floors,
 * mandatory blush metadata, four inclusive narrative voices).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import catalogoData from "../../data/arquetipos.json";
import { getAnimalFamily, type ShapeFamily } from "./pixel-sprites";
import type {
  ArchetypeAnimal,
  ArchetypeCatalog,
  MbtiCode,
  MorphologicalFamily,
} from "@/types/archetype";

const catalog = catalogoData as unknown as ArchetypeCatalog;
const animals = catalog.animales;

const FAMILY_MINIMUMS: Partial<Record<MorphologicalFamily, number>> = {
  insectos_aracnidos: 8,
  aves: 8,
  anfibios: 6,
  reptiles: 6,
  roedores_herbivoros: 8,
  felinos: 7,
  caninos: 7,
  osos: 5,
  ungulados: 7,
  vida_marina: 7,
  mamiferos_menores: 7,
  criaturas_misticas: 6,
};

const SPRITE_FAMILIES: readonly ShapeFamily[] = [
  "felino",
  "canino",
  "ave",
  "roedor",
  "reptil",
  "anfibio",
  "acuatico",
  "insecto",
  "ungulado",
  "oso",
  "marino",
  "exotico",
];

const MBTI_CODES: readonly MbtiCode[] = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];

const NARRATIVE_MODES = ["masculino", "femenino", "neutro_e", "neutro_universal"] as const;

describe("archetype catalogue", () => {
  it("ships at least 80 animals across the thirteen morphological families", () => {
    expect(animals.length).toBeGreaterThanOrEqual(80);
    const families = new Set(animals.map((animal) => animal.familia_morfologica));
    expect(families.size).toBe(13);
  });

  it("meets the per-family minimums", () => {
    const counts = new Map<MorphologicalFamily, number>();
    for (const animal of animals) {
      counts.set(animal.familia_morfologica, (counts.get(animal.familia_morfologica) ?? 0) + 1);
    }
    for (const [family, minimum] of Object.entries(FAMILY_MINIMUMS)) {
      expect(counts.get(family as MorphologicalFamily) ?? 0, family).toBeGreaterThanOrEqual(
        minimum,
      );
    }
  });

  it("keeps ids and diminutives unique", () => {
    expect(new Set(animals.map((animal) => animal.id)).size).toBe(animals.length);
    expect(new Set(animals.map((animal) => animal.diminutivo_es)).size).toBe(animals.length);
  });

  it("matches the sprite engine family for every animal", () => {
    for (const animal of animals) {
      expect(SPRITE_FAMILIES, animal.id).toContain(animal.familia_sprite);
      expect(getAnimalFamily(animal.id), animal.id).toBe(animal.familia_sprite);
    }
  });

  it("carries a complete, normalized psychometric profile", () => {
    for (const animal of animals) {
      expect(animal.vector_big_five, animal.id).toHaveLength(5);
      for (const value of animal.vector_big_five) {
        expect(value, animal.id).toBeGreaterThanOrEqual(0);
        expect(value, animal.id).toBeLessThanOrEqual(1);
      }
      for (const key of [
        "personalidad_apertura",
        "personalidad_responsabilidad",
        "personalidad_extraversion",
        "personalidad_amabilidad",
        "personalidad_estabilidad_emocional",
      ]) {
        expect(animal.personality_affinity[key], `${animal.id}/${key}`).toBeGreaterThanOrEqual(0);
        expect(animal.personality_affinity[key], `${animal.id}/${key}`).toBeLessThanOrEqual(1);
      }
      expect(Object.keys(animal.mbti_afinidad).sort()).toEqual([...MBTI_CODES].sort());
      for (const code of MBTI_CODES) {
        expect(animal.mbti_afinidad[code], `${animal.id}/${code}`).toBeGreaterThanOrEqual(0);
        expect(animal.mbti_afinidad[code], `${animal.id}/${code}`).toBeLessThanOrEqual(1);
      }
      expect(MBTI_CODES, animal.id).toContain(animal.mbti_primario);
      expect(MBTI_CODES, animal.id).toContain(animal.mbti_secundario);
      expect(animal.rasgos_personalidad, animal.id).toHaveLength(3);
      expect(new Set(animal.rasgos_personalidad).size).toBe(3);
    }
  });

  it("makes the kawaii blush mandatory and descriptive", () => {
    for (const animal of animals) {
      expect(animal.rasgos_kawaii.tiene_rubor, animal.id).toBe(true);
      expect(["#FFAAA6", "#FFB6C1"], animal.id).toContain(animal.rasgos_kawaii.color_rubor);
      expect(animal.rasgos_kawaii.forma_orejas.length).toBeGreaterThan(0);
      expect(animal.rasgos_kawaii.detalle_unico.length).toBeGreaterThan(0);
    }
  });

  it("provides four distinct, non-empty inclusive narratives", () => {
    for (const animal of animals) {
      const texts = NARRATIVE_MODES.map((mode) => animal.narrativa[mode]);
      for (const [index, text] of texts.entries()) {
        expect(text, `${animal.id}/${NARRATIVE_MODES[index]}`).toBeTruthy();
        expect(text.length, `${animal.id}/${NARRATIVE_MODES[index]}`).toBeGreaterThan(40);
      }
      expect(new Set(texts).size, animal.id).toBe(4);
    }
  });

  it("keeps metadata totals consistent with the payload", () => {
    expect(catalog.metadatos.total_animales).toBe(animals.length);
    expect(catalog.metadatos.total_colores).toBe(catalog.colores.length);
    expect(catalog.metadatos.total_combinaciones).toBe(
      animals.length * catalog.colores.length,
    );
    expect(catalog.metadatos.version).toBe("1.2");
  });

  it("has one seed row per animal", () => {
    const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
    for (const animal of animals) {
      expect(seed.includes(`('${animal.id}'`), animal.id).toBe(true);
    }
    expect(seed).toContain(`${animals.length} animals inserted/updated`);
  });
});

describe("archetype narratives", () => {
  it("never reuses another animal's inclusive copy verbatim", () => {
    const signatures = new Map<string, string>();
    for (const animal of animals as ArchetypeAnimal[]) {
      for (const mode of NARRATIVE_MODES) {
        const text = animal.narrativa[mode];
        const previous = signatures.get(text);
        expect(previous, `${animal.id}/${mode} duplicates ${previous}`).toBeUndefined();
        signatures.set(text, animal.id);
      }
    }
  });
});
