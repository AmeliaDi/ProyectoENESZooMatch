/**
 * The ONLY client-side reader of `IdentityDto`. Every screen parses the stored
 * identity here and then renders it through `formatIdentity()`; no component
 * assembles a name from animal and colour fields by hand (golden rule,
 * docs/DECISIONES.md). Fail closed: a malformed or non-hatched payload becomes
 * the egg, which carries no name at all.
 */
import type { IdentityDto } from "@/contracts/identity";
import type { SpriteMark } from "@/contracts/result";
import { parseAliasParts } from "@/domain/identity/format-identity";

const HEX = /^#[0-9A-Fa-f]{6}$/;
/** Display alias: letters (any script), digits, spaces, dots, hyphens, apostrophes. */
const ALIAS = /^[\p{L}\p{N}][\p{L}\p{N} .·'’-]{0,63}$/u;
const CATALOG_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MBTI_CODE = /^[EI][NS][TF][JP]$/;
const ENNEAGRAM_CODE = /^[1-9](w[1-9])?$/;

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Non-empty, safe display text clamped to the configured maximum length. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !ALIAS.test(trimmed)) return null;
  return trimmed;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function id(value: unknown): string | null {
  if (typeof value !== "string" || !CATALOG_ID.test(value)) return null;
  return value;
}

function mark(value: unknown): SpriteMark | null {
  return value === "sp" || value === "so" || value === "sx" ? value : null;
}

export const EGG_IDENTITY: IdentityDto = {
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
  huevitoSeed: null,
};

/** Cosmetic shell seed: an unsigned 32-bit integer, nothing else is trusted. */
function seed(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value % 4294967296;
}

/** A person with no renderable identity: the egg, carrying only its shell seed. */
function asEgg(raw: unknown): IdentityDto {
  return { ...EGG_IDENTITY, huevitoSeed: isRec(raw) ? seed(raw.huevitoSeed) : null };
}

/** Reads the wire identity; anything unusable degrades to the egg, never to a guess. */
export function parseIdentity(raw: unknown): IdentityDto {
  if (!isRec(raw) || raw.estadoIdentidad !== "eclosionado") return asEgg(raw);

  const aliasCompleto = text(raw.aliasCompleto);
  const animalId = id(raw.animalId);
  const colorId = id(raw.colorId);
  if (!aliasCompleto || !animalId || !colorId) return asEgg(raw);

  // Legacy rows (hatched before the alias split, typically soft-deleted ones
  // migrations skip) may carry only `aliasCompleto`. `formatIdentity` derives
  // the parts from it anyway, so the suffix is recovered the same way instead
  // of hiding a perfectly paintable name behind the egg.
  const aliasSufijo = text(raw.aliasSufijo) ?? parseAliasParts(aliasCompleto)?.aliasSufijo ?? null;
  if (!aliasSufijo) return asEgg(raw);

  const hex = typeof raw.colorHex === "string" && HEX.test(raw.colorHex) ? raw.colorHex : null;
  const mbtiCode = typeof raw.mbtiCode === "string" && MBTI_CODE.test(raw.mbtiCode) ? raw.mbtiCode : null;
  const enneagramCode =
    typeof raw.enneagramCode === "string" && ENNEAGRAM_CODE.test(raw.enneagramCode) ? raw.enneagramCode : null;

  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto,
    aliasAnimal: nullableText(raw.aliasAnimal),
    aliasColor: nullableText(raw.aliasColor),
    aliasSufijo,
    animalId,
    colorId,
    colorHex: hex,
    mbtiCode,
    enneagramCode,
    enneagramName: nullableText(raw.enneagramName),
    mark: mark(raw.mark),
    revelacionVista: raw.revelacionVista === true,
    huevitoSeed: null,
  };
}

/** True only for a person whose frozen identity is actually renderable. */
export function isHatched(identity: IdentityDto): boolean {
  return identity.estadoIdentidad === "eclosionado" && identity.aliasCompleto !== null;
}

/**
 * True when the identity is frozen but the stored flag says the reveal never
 * painted: the recovery path for a tab closed mid-animation. The flag is
 * `revelacion_vista` read straight from the row, and the reveal spends it on
 * mount, so the next visit goes to the sky.
 */
export function hasPendingRevelation(identity: IdentityDto): boolean {
  return isHatched(identity) && identity.revelacionVista === false;
}
