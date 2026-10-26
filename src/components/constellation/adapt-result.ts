/**
 * Constellation data adapter — `GET /api/result` → render-layer props.
 *
 * This is the ONLY bridge between the network payload (`PublicResult`, the
 * same shape `PublicResultView` already parses) and the approved Phase B prop
 * contract (`ConstellationSelfInput` / `ConstellationMatchInput`). It is a pure,
 * DOM-free, side-effect-free function so it can be unit-tested in Vitest's
 * `node` environment and safely run during SSR.
 *
 * ─── Why resolution is needed ────────────────────────────────────────────────
 * The sprite engine (`getSpriteFrame(animalId, colorId, frame)`) only accepts
 * REAL catalogue ids. The API now resolves `animal_id` / `color_id` / `color_hex`
 * server-side, so the happy path is a straight pass-through. But the adapter
 * never trusts the wire: it re-validates every id against the local catalogue and
 * falls back to name / hex resolution, so a stale or partial payload still paints
 * instead of crashing the engine.
 *
 * Resolution order (animal):  explicit catalogue id → `diminutivo_es` /
 * `nombre_fuente` / id-as-name (accent- and case-insensitive).
 * Resolution order (colour):  explicit catalogue id → `nombre` / id-as-name →
 * nearest RGB hex among catalogue colours.
 *
 * If an animal or colour cannot be resolved, the match is SKIPPED defensively
 * (a missing sprite would break the whole sky). The self node is mandatory: if
 * IT cannot be resolved the adapter returns `null` and the caller shows its
 * error state.
 *
 * ─── Privacy ─────────────────────────────────────────────────────────────────
 * The visible identity of a node is animal + colour + alias only. The match `id`
 * is an opaque, non-reversible per-viewer handle derived by the API — used
 * purely as a stable React key, never displayed, and carrying no matrícula,
 * hash, answer or vector data. Vectors are deliberately NOT forwarded: the
 * detail sheet falls back to `explanation.breakdown`.
 */

import catalogoData from "../../../data/arquetipos.json";

import type { PublicResult, ResultMatch } from "@/components/public-experience-utils";
import type { MatchTrack } from "@/types/microtest";

import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

// ─── Catalogue indexes (built once at module load) ───────────────────────────

interface CatalogAnimal {
  id: string;
  nombre_fuente: string;
  diminutivo_es: string;
  categoria_fauna: string;
}

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
  textura: string;
  temperatura: string;
}

const CATALOG_ANIMALS = catalogoData.animales as unknown as CatalogAnimal[];
const CATALOG_COLORS = catalogoData.colores as unknown as CatalogColor[];

const ANIMAL_BY_ID = new Map<string, CatalogAnimal>(
  CATALOG_ANIMALS.map((animal) => [animal.id, animal]),
);
const COLOR_BY_ID = new Map<string, CatalogColor>(
  CATALOG_COLORS.map((color) => [color.id, color]),
);

/**
 * Strips diacritics, lowercases and trims, so `"Verde Esmeralda"`,
 * `"verde esmeralda"` and `"vérde esmeralda"` all collapse to the same key.
 */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ANIMAL_BY_NAME = new Map<string, string>();
for (const animal of CATALOG_ANIMALS) {
  ANIMAL_BY_NAME.set(norm(animal.diminutivo_es), animal.id);
  ANIMAL_BY_NAME.set(norm(animal.nombre_fuente), animal.id);
  ANIMAL_BY_NAME.set(norm(animal.id), animal.id);
}

const COLOR_BY_NAME = new Map<string, string>();
for (const color of CATALOG_COLORS) {
  COLOR_BY_NAME.set(norm(color.nombre), color.id);
  COLOR_BY_NAME.set(norm(color.id), color.id);
}

// ─── Small formatting helpers ────────────────────────────────────────────────

/** Capitalises the first letter for the es-MX animal display name. */
function displayCase(value: string): string {
  const trimmed = value.trim();
  return trimmed.length === 0 ? trimmed : trimmed[0].toUpperCase() + trimmed.slice(1);
}

/** Parses `#rrggbb` (with or without the leading `#`) into 0-255 channels. */
function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** True when the string is a usable six-digit hex colour. */
function isValidHex(hex: string | null | undefined): hex is string {
  return typeof hex === "string" && hexToRgb(hex) !== null;
}

/** Squared RGB distance; avoids a needless `sqrt` when only ordering matters. */
function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolves a catalogue animal id from an explicit id and/or a human name.
 * Returns `null` when nothing matches the catalogue.
 */
export function resolveAnimalId(
  explicitId: string | null | undefined,
  name: string | null | undefined,
): string | null {
  if (explicitId && ANIMAL_BY_ID.has(explicitId)) return explicitId;
  if (name) {
    const byName = ANIMAL_BY_NAME.get(norm(name));
    if (byName) return byName;
  }
  if (explicitId) {
    const byIdAsName = ANIMAL_BY_NAME.get(norm(explicitId));
    if (byIdAsName) return byIdAsName;
  }
  return null;
}

/** Finds the catalogue colour whose hex is closest to the given hex. */
function nearestColorIdByHex(hex: string): string | null {
  const target = hexToRgb(hex);
  if (!target) return null;
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const color of CATALOG_COLORS) {
    const rgb = hexToRgb(color.hex);
    if (!rgb) continue;
    const distance = colorDistance(rgb, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = color.id;
    }
  }
  return bestId;
}

export interface ResolvedColor {
  colorId: string;
  colorHex: string;
}

/**
 * Resolves a catalogue colour id (and a guaranteed-valid display hex) from an
 * explicit id, a human name and/or a hex. Order: id → name → id-as-name →
 * nearest hex. Returns `null` when nothing matches the catalogue.
 */
export function resolveColor(
  explicitId: string | null | undefined,
  name: string | null | undefined,
  hex: string | null | undefined,
): ResolvedColor | null {
  const withHex = (color: CatalogColor): ResolvedColor => ({
    colorId: color.id,
    // Prefer the payload hex when it is valid (it is the same catalogue source),
    // otherwise fall back to the catalogue hex so the value is always usable.
    colorHex: isValidHex(hex) ? hex : color.hex,
  });

  if (explicitId) {
    const byId = COLOR_BY_ID.get(explicitId);
    if (byId) return withHex(byId);
  }
  if (name) {
    const byName = COLOR_BY_NAME.get(norm(name));
    if (byName) {
      const color = COLOR_BY_ID.get(byName);
      if (color) return withHex(color);
    }
  }
  if (explicitId) {
    const byIdAsName = COLOR_BY_NAME.get(norm(explicitId));
    if (byIdAsName) {
      const color = COLOR_BY_ID.get(byIdAsName);
      if (color) return withHex(color);
    }
  }
  if (isValidHex(hex)) {
    const nearest = nearestColorIdByHex(hex);
    if (nearest) {
      const color = COLOR_BY_ID.get(nearest);
      if (color) return { colorId: color.id, colorHex: color.hex };
    }
  }
  return null;
}

// ─── Public adapter ──────────────────────────────────────────────────────────

/** Stable, non-colliding id for the centred self node. */
export const SELF_NODE_ID = "self";

export interface AdaptedConstellation {
  me: ConstellationSelfInput;
  /** Every match from BOTH tracks; the canvas filters by the active track. */
  matches: ConstellationMatchInput[];
}

/**
 * Maps one track's API matches into `ConstellationMatchInput`s, skipping any
 * entry whose animal or colour cannot be resolved to a real catalogue id.
 */
function adaptTrack(
  entries: readonly ResultMatch[],
  track: MatchTrack,
): ConstellationMatchInput[] {
  const adapted: ConstellationMatchInput[] = [];
  entries.forEach((entry, index) => {
    const animalId = resolveAnimalId(entry.animal_id, entry.animal);
    const color = resolveColor(entry.color_id, entry.color, entry.color_hex);
    if (!animalId || !color) return; // defensive skip — never feed a bad id to the engine

    const animal = ANIMAL_BY_ID.get(animalId);
    adapted.push({
      // The opaque per-viewer handle is the stable React key; fall back to a
      // per-track synthetic key only if the API somehow omitted it.
      id: entry.id ?? `${track}-${index}`,
      animalId,
      colorId: color.colorId,
      colorHex: color.colorHex,
      animalName: displayCase(entry.animal || (animal?.diminutivo_es ?? animalId)),
      colorName: (entry.color || color.colorId).toLowerCase(),
      alias: entry.alias,
      similarity: entry.similarity,
      track,
      badges: entry.badges,
      explanation: entry.explanation ?? null,
      mbtiCode: entry.mbti_code ?? null,
    });
  });
  return adapted;
}

/**
 * Adapts the full result payload. Returns `null` only when the SELF identity
 * cannot be resolved (the sky always needs its centre star); an empty or partly
 * unresolvable match list simply yields fewer (or zero) matches.
 */
export function adaptResult(result: PublicResult): AdaptedConstellation | null {
  const selfAnimalId = resolveAnimalId(result.animal?.id, result.animal?.diminutivo_es);
  const selfColor = resolveColor(result.color?.id, result.color?.nombre, result.color?.hex);
  if (!selfAnimalId || !selfColor) return null;

  const selfAnimal = ANIMAL_BY_ID.get(selfAnimalId);
  const me: ConstellationSelfInput = {
    id: SELF_NODE_ID,
    animalId: selfAnimalId,
    colorId: selfColor.colorId,
    colorHex: selfColor.colorHex,
    animalName: displayCase(result.animal?.diminutivo_es || (selfAnimal?.diminutivo_es ?? selfAnimalId)),
    colorName: (result.color?.nombre || selfColor.colorId).toLowerCase(),
    alias: result.alias,
    mbtiCode: result.mbti_code ?? null,
  };

  const matches: ConstellationMatchInput[] = [
    ...adaptTrack(result.matches?.romance ?? [], "romance"),
    ...adaptTrack(result.matches?.amistad ?? [], "amistad"),
  ];

  return { me, matches };
}
