/**
 * Datos sintéticos deterministas para `/dev/constellation`.
 *
 * Cada coincidencia usa un animalito distinto (hasta agotar el catálogo) y un
 * color distinto (hasta agotar la paleta), de modo que nunca aparezcan dos
 * sprites idénticos en el mismo cielo. El "yo" del panel queda excluido para no
 * duplicar el nodo central.
 */

import catalogoData from "../../../../data/arquetipos.json";
import type {
  ConstellationMatchInput,
  ConstellationSelfInput,
} from "@/components/constellation";
import { generateMatchExplanation } from "@/lib/matching";
import { getAllAnimalIds, getAllColorIds } from "@/lib/pixel-sprites";
import { projectAnimalDimensions } from "@/lib/psychometrics";
import type { ArchetypeAnimal } from "@/types/archetype";
import {
  FRIENDSHIP_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_DIMENSIONS,
  type MatchTrack,
} from "@/types/microtest";

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
}

const ANIMALS = catalogoData.animales as unknown as ArchetypeAnimal[];
const ANIMAL_BY_ID = new Map<string, ArchetypeAnimal>(
  ANIMALS.map((animal) => [animal.id, animal]),
);
const COLORS = catalogoData.colores as unknown as CatalogColor[];

const ANIMAL_IDS = getAllAnimalIds();
const COLOR_IDS = getAllColorIds();
const ANIMAL_NAME = new Map<string, string>(ANIMALS.map((a) => [a.id, a.diminutivo_es]));
const COLOR_NAME = new Map<string, string>(COLORS.map((c) => [c.id, c.nombre]));
const COLOR_HEX = new Map<string, string>(COLORS.map((c) => [c.id, c.hex]));

export const DEV_SELF: ConstellationSelfInput = {
  id: "dev-self",
  animalId: "ajolotito",
  colorId: "verde-esmeralda",
  colorHex: COLOR_HEX.get("verde-esmeralda") ?? "#50C878",
  animalName: "Ajolotito",
  colorName: "verde esmeralda",
  alias: "tú (dev)",
  mbtiCode: null,
};

const SELF_ANIMAL = ANIMAL_BY_ID.get(DEV_SELF.animalId) ?? ANIMALS[0]!;
const SELF_PROJECTION = projectAnimalDimensions(SELF_ANIMAL);
const SELF_SCORES = SELF_PROJECTION.scores as Record<string, number>;

function trackVector(scores: Record<string, number>, track: MatchTrack): number[] {
  const dimensions =
    track === "romance" ? ROMANCE_VECTOR_DIMENSIONS : FRIENDSHIP_VECTOR_DIMENSIONS;
  return dimensions.map((dimension) => scores[dimension] ?? 0.5);
}

/** PRNG determinista y sembrable (mulberry32). Devuelve valores en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Fisher-Yates determinista; no muta la lista original. */
function shuffled<T>(list: readonly T[], rand: () => number): T[] {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface SyntheticMatchOptions {
  count: number;
  threshold: number;
  seed: number;
  excludeAnimalId?: string;
}

/**
 * Genera `count` conexiones sintéticas con animales y colores sin repetición.
 * La pista alterna romance/amistad igual que en el panel.
 */
export function generateSyntheticMatches({
  count,
  threshold,
  seed,
  excludeAnimalId,
}: SyntheticMatchOptions): ConstellationMatchInput[] {
  const rand = mulberry32(seed);
  const animals = shuffled(
    ANIMAL_IDS.filter((id) => id !== excludeAnimalId),
    rand,
  );
  const colors = shuffled(COLOR_IDS, rand);
  const capacity = animals.length * colors.length;
  const total = Math.min(count, capacity);

  const matches: ConstellationMatchInput[] = [];
  for (let index = 0; index < total; index += 1) {
    const track: MatchTrack = index % 2 === 0 ? "romance" : "amistad";
    const animalId = animals[index % animals.length];
    const colorId = colors[index % colors.length];
    const goesAbove = rand() < 0.6;
    const similarity = goesAbove
      ? clamp01(threshold + rand() * (1 - threshold))
      : clamp01(threshold - rand() * threshold);
    const animalName = ANIMAL_NAME.get(animalId) ?? animalId;
    const colorName = (COLOR_NAME.get(colorId) ?? colorId).toLowerCase();
    const roundedSimilarity = Math.round(similarity * 1000) / 1000;
    const animal = ANIMAL_BY_ID.get(animalId)!;
    const projection = projectAnimalDimensions(animal);
    const matchScores = projection.scores as Record<string, number>;
    const explanation = generateMatchExplanation(
      roundedSimilarity,
      trackVector(SELF_SCORES, track),
      trackVector(matchScores, track),
      track,
      animalName,
      colorName,
      projection.mbti,
      matchScores,
      SELF_ANIMAL.diminutivo_es,
      SELF_SCORES,
      SELF_PROJECTION.mbti,
    );
    matches.push({
      id: `dev-${seed}-${index}`,
      animalId,
      colorId,
      colorHex: COLOR_HEX.get(colorId) ?? "#c9d4ff",
      animalName,
      colorName,
      alias: `${animalName} ${colorName} · dev${index}`,
      similarity: roundedSimilarity,
      track,
      badges: [],
      explanation,
    });
  }
  return matches;
}
