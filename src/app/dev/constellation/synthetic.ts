/**
 * Datos sintéticos deterministas para `/dev/constellation`.
 *
 * Cada coincidencia usa un animalito distinto (hasta agotar el catálogo) y un
 * color distinto (hasta agotar la paleta), de modo que nunca aparezcan dos
 * sprites idénticos en el mismo cielo. El "yo" del panel queda excluido para no
 * duplicar el nodo central.
 *
 * Los nodos sintéticos viajan con un `IdentityDto` completo: la pantalla lee
 * nombres y sprites por esa única ruta, así que el banco de pruebas imita el
 * contrato real en lugar de inventarse campos sueltos.
 */

import { mulberry32 } from "@/domain/shared";
import { AVATAR_CONFIG, CATALOG_ANIMALS, CATALOG_COLORS } from "@/config";
import type { IdentityDto } from "@/contracts/identity";
import type {
  ConstellationMatchInput,
  ConstellationSelfInput,
} from "@/ui/constellation";
import { explainPair } from "@/domain/explainability";
import { MATCHING_CONFIG, pairScore } from "@/domain/matching";
import { getAllAnimalIds, getAllColorIds } from "@/domain/avatars/pixel-sprites";
import type { ArchetypeAnimal } from "@/types/archetype";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
}

const ANIMALS: readonly ArchetypeAnimal[] = CATALOG_ANIMALS;
const COLORS: readonly CatalogColor[] = CATALOG_COLORS;

const ANIMAL_IDS = getAllAnimalIds();
const COLOR_IDS = getAllColorIds();
const ANIMAL_NAME = new Map<string, string>(ANIMALS.map((a) => [a.id, a.diminutivo_es]));
const COLOR_NAME = new Map<string, string>(COLORS.map((c) => [c.id, c.nombre]));
const COLOR_HEX = new Map<string, string>(COLORS.map((c) => [c.id, c.hex]));

const SEPARATOR = AVATAR_CONFIG.identity.separator.valor;

/**
 * `IdentityDto` sintético y ya eclosionado: el cielo de desarrollo pinta nombres
 * y sprites sólo por esa ruta, igual que producción.
 */
export function devIdentityDto(input: {
  animalId: string;
  colorId: string;
  colorHex: string;
  aliasAnimal: string;
  aliasColor: string;
  sufijo: string;
  mbtiCode?: string | null;
  enneagramCode?: string | null;
}): IdentityDto {
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: `${input.aliasAnimal} ${input.aliasColor}${SEPARATOR}${input.sufijo}`,
    aliasAnimal: input.aliasAnimal,
    aliasColor: input.aliasColor,
    aliasSufijo: input.sufijo,
    animalId: input.animalId,
    colorId: input.colorId,
    colorHex: input.colorHex,
    mbtiCode: input.mbtiCode ?? null,
    enneagramCode: input.enneagramCode ?? null,
    enneagramName: null,
    mark: null,
    revelacionVista: true,
    huevitoSeed: null,
  };
}

export const DEV_SELF: ConstellationSelfInput = {
  id: "dev-self",
  identity: devIdentityDto({
    animalId: "ajolotito",
    colorId: "ennea-6",
    colorHex: COLOR_HEX.get("ennea-6") ?? "#338547",
    aliasAnimal: "ajolotito",
    aliasColor: "verde bosque",
    sufijo: "VTSD",
  }),
  animalId: "ajolotito",
  colorId: "ennea-6",
  colorHex: COLOR_HEX.get("ennea-6") ?? "#338547",
};

const FACTORS = [
  ...new Set(Object.values(MATCHING_CONFIG.categories).flatMap((c) => Object.keys(c.factors))),
].sort();
/** Posterior SD of the synthetic profiles (≈ a full-bank respondent). */
const SYNTHETIC_SE = 0.68;

/** Deterministic synthetic posterior: θ uniform in [-1.5, 1.5], fixed SE. */
function syntheticLatent(rand: () => number): LatentProfile {
  const theta: Record<string, number> = {};
  const se: Record<string, number> = {};
  for (const f of FACTORS) {
    theta[f] = (rand() * 2 - 1) * 1.5;
    se[f] = SYNTHETIC_SE;
  }
  return { theta, se, quality: 1, answered: 0 };
}

const SELF_LATENT = syntheticLatent(mulberry32(2604));

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Fisher-Yates determinista; no muta la lista original. */
function shuffled<T>(list: readonly T[], rand: () => number): T[] {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/** Sufijo pseudo-realista (4 consonantes del alfabeto oficial) para cada estrella. */
export function suffixFor(index: number): string {
  const alphabet = AVATAR_CONFIG.identity.suffix_alphabet.valor;
  let out = "";
  let rest = index;
  for (let position = 0; position < 4; position += 1) {
    out += alphabet[rest % alphabet.length] ?? "B";
    rest = Math.floor(rest / alphabet.length);
  }
  return out;
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
    // total <= animals.length * colors.length, so both lists are non-empty here.
    const animalId = animals[index % animals.length]!;
    const colorId = colors[index % colors.length]!;
    const goesAbove = rand() < 0.6;
    const similarity = goesAbove
      ? clamp01(threshold + rand() * (1 - threshold))
      : clamp01(threshold - rand() * threshold);
    const animalName = ANIMAL_NAME.get(animalId) ?? animalId;
    const colorName = (COLOR_NAME.get(colorId) ?? colorId).toLowerCase();
    const roundedSimilarity = Math.round(similarity * 1000) / 1000;
    // The explanation comes from the real engine on synthetic posteriors; the
    // node distance keeps the panel's similarity control (layout testing).
    const other = syntheticLatent(rand);
    const score = pairScore(SELF_LATENT, other, MATCHING_CONFIG.tracks[track], MATCHING_CONFIG.categories);
    const explanation = explainPair({
      score,
      track,
      self: SELF_LATENT,
      other,
      selfNarrative: { enneagramType: 6, mbti: "INFP" },
      otherNarrative: { enneagramType: 1 + (index % 9), mbti: null },
    });
    matches.push({
      id: `dev-${seed}-${index}`,
      identity: devIdentityDto({
        animalId,
        colorId,
        colorHex: COLOR_HEX.get(colorId) ?? "#c9d4ff",
        aliasAnimal: animalName,
        aliasColor: colorName,
        sufijo: suffixFor(index),
      }),
      animalId,
      colorId,
      colorHex: COLOR_HEX.get(colorId) ?? "#c9d4ff",
      similarity: roundedSimilarity,
      track,
      badges: [],
      chemistry: explanation.chemistry,
      explanation,
    });
  }
  return matches;
}
