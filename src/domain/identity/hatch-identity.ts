/**
 * ZooMatch — Pure, deterministic single-shot identity hatching (Fase 2).
 *
 * Golden rule:
 *   Identity (animal, color, suffix, and full alias) is computed ONCE when the
 *   user completes the mandatory core quiz ("huevo" -> "eclosionado"), persisted
 *   in the database, and NEVER recalculated afterwards.
 *
 *   - Animal: derived from MBTI code + preference clarity (docs/AVATARES.md).
 *   - Color: derived from Enneagram posterior (with diverse posterior-weighted
 *     distribution when entropy is high so "ennea-neblina" is just one more
 *     catalog color).
 *   - Seed for suffix and tie-breakers: HMAC-SHA256(serverSecret, userId),
 *     completely independent of profile answers so nothing in the profile can
 *     alter the suffix or tie-breaker.
 *   - Grammatical concordance: every animal has `genero` ("masculino" | "femenino")
 *     and `diminutivo`; every color has `masculino`, `femenino`, and `invariable`.
 */

import { AVATAR_CONFIG, CATALOG, MATCHING_CONFIG } from "@/config";
import {
  buildAvatarSpec,
  type AvatarParams,
  type AvatarSpec,
  type EmblemKey,
  type SubtypeMark,
} from "@/domain/avatars/avatar-spec";
import { hmacSha256Hex, type Hmac } from "@/domain/shared";
import type {
  ArchetypeAnimal,
  ArchetypeColor,
  GrammaticalGender,
} from "@/types/archetype";
import type { LatentProfile } from "@/types/latent";
import type { DimensionScores } from "@/types/microtest";

import { generateProfileNarrative, getTopDimensions } from "./profile-generator";

export type IdentityState = "huevo" | "eclosionado";

export interface CatalogSnapshot {
  readonly animales: readonly ArchetypeAnimal[];
  readonly colores: readonly ArchetypeColor[];
}

export interface HatchProfileInput {
  readonly userId: string;
  readonly latent: LatentProfile;
  readonly normalizedScores?: DimensionScores | undefined;
}

export interface HatchOptions {
  /** Existing `alias_completo` values in the pool to resolve collisions deterministically. */
  readonly existingAliases?: ReadonlySet<string> | undefined;
  /** Override avatar readout parameters (defaults to matching-config). */
  readonly params?: AvatarParams | undefined;
}

export interface HatchedIdentity {
  readonly estadoIdentidad: "eclosionado";
  readonly animalId: string;
  readonly colorId: string;
  readonly aliasAnimal: string;
  readonly aliasColor: string;
  readonly aliasSufijo: string;
  readonly aliasCompleto: string;
  readonly colorHex: string;
  readonly genero: GrammaticalGender;
  readonly mbtiCode: string;
  readonly mark: SubtypeMark | null;
  readonly emblem: EmblemKey;
  readonly enneagram: AvatarSpec["enneagram"];
  readonly narrative: string;
}

const DEFAULT_AVATAR_PARAMS: AvatarParams = {
  temperature:
    MATCHING_CONFIG.categories.eneagrama.kind === "distribution"
      ? MATCHING_CONFIG.categories.eneagrama.temperature
      : 1,
  ambiguityEntropy: MATCHING_CONFIG.scoring.enneagram_ambiguity_entropy,
};

const SUFFIX_ALPHABET = AVATAR_CONFIG.identity.suffix_alphabet.valor;
const SUFFIX_LENGTH = AVATAR_CONFIG.identity.suffix_length.valor;
const SEPARATOR = AVATAR_CONFIG.identity.separator.valor;
const MAX_ALIAS_LENGTH = AVATAR_CONFIG.identity.max_alias_length.valor;
const MAX_COLLISION_ATTEMPTS = AVATAR_CONFIG.identity.max_collision_attempts.valor;
const BLOCKED_SUFFIXES = new Set(AVATAR_CONFIG.identity.blocked_suffixes.valor);

/** Lowercase Spanish letters and single spaces only (no emojis, digits, or invisible chars). */
export const SAFE_WORD_PHRASE_REGEX = /^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$/;
/** 4 uppercase consonants without vowels. */
export const SAFE_SUFFIX_REGEX = /^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/;

/**
 * Returns the grammatically agreed color name for the given animal gender.
 * Examples:
 *   agreeColor(grisNeblina, "femenino")  -> "gris neblina"
 *   agreeColor(rojoCarmin,  "masculino") -> "rojo carmín"
 *   agreeColor(rojoCarmin,  "femenino")  -> "roja carmín"
 */
export function agreeColor(color: ArchetypeColor, genero: GrammaticalGender): string {
  if (color.invariable) return color.masculino;
  return genero === "femenino" ? color.femenino : color.masculino;
}

/**
 * Builds the agreed animal + color phrase for any (animal, color) pair.
 */
export function formatAgreedAnimalColor(animal: ArchetypeAnimal, color: ArchetypeColor): string {
  return `${animal.diminutivo} ${agreeColor(color, animal.genero)}`;
}

function computeHmacHex(secret: string | Hmac, message: string): string {
  if (typeof secret === "string") {
    if (secret.trim().length === 0) {
      throw new Error("hatchIdentity requires a non-empty server secret");
    }
    return hmacSha256Hex(secret, message);
  }
  return secret.sign(message);
}

/**
 * Deterministically maps a 64-char hex digest into a 4-consonant suffix
 * from `BCDFGHJKLMNPQRSTVWXYZ` (zero vowels).
 */
export function suffixFromDigestHex(digestHex: string): string {
  const base = SUFFIX_ALPHABET.length;
  const word = parseInt(digestHex.slice(0, 8), 16) >>> 0;
  let value = word;
  let out = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    const idx = value % base;
    out += SUFFIX_ALPHABET[idx]!;
    value = Math.floor(value / base);
  }
  return out;
}

export function isBlockedSuffix(suffix: string): boolean {
  return BLOCKED_SUFFIXES.has(suffix) || !SAFE_SUFFIX_REGEX.test(suffix);
}

/**
 * Validates that an `aliasCompleto` obeys all character, structure, and length rules.
 */
export function isValidAliasCompleto(
  aliasCompleto: string,
  aliasAnimal: string,
  aliasColor: string,
  aliasSufijo: string,
): boolean {
  if (aliasCompleto.length > MAX_ALIAS_LENGTH) return false;
  if (!SAFE_WORD_PHRASE_REGEX.test(aliasAnimal)) return false;
  if (!SAFE_WORD_PHRASE_REGEX.test(aliasColor)) return false;
  if (isBlockedSuffix(aliasSufijo)) return false;
  return aliasCompleto === `${aliasAnimal} ${aliasColor}${SEPARATOR}${aliasSufijo}`;
}

/**
 * Deterministic cosmetic seed for the unhatched egg ("tu huevito").
 * Derived from `HMAC(secret, userId)` so it never leaks or previews the future animal.
 */
export function eggCosmeticSeed(userId: string, secret: string | Hmac): number {
  const hex = computeHmacHex(secret, `egg:v1:${userId.trim().toLowerCase()}`);
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

/**
 * Pure, deterministic single-shot identity generator.
 * Executed ONCE on the server when the mandatory core quiz is completed.
 */
export function hatchIdentity(
  profile: HatchProfileInput,
  secret: string | Hmac,
  catalogSnapshot: CatalogSnapshot = CATALOG,
  options?: HatchOptions,
): HatchedIdentity {
  const normalizedUserId = profile.userId.trim().toLowerCase();
  if (normalizedUserId.length === 0) {
    throw new Error("hatchIdentity requires a non-empty userId");
  }

  const baseSeedHex = computeHmacHex(secret, `identity:v1:${normalizedUserId}`);
  const params = options?.params ?? DEFAULT_AVATAR_PARAMS;
  const spec = buildAvatarSpec(profile.latent, params, baseSeedHex);

  const animal = catalogSnapshot.animales.find((a) => a.id === spec.animalId);
  const color = catalogSnapshot.colores.find((c) => c.id === spec.colorId);
  if (!animal || !color) {
    throw new Error(`Avatar outside catalog snapshot: ${spec.animalId}/${spec.colorId}`);
  }

  const aliasAnimal = animal.diminutivo;
  const aliasColor = agreeColor(color, animal.genero);
  const existing = options?.existingAliases;

  let chosenSuffix = "";
  let chosenAliasCompleto = "";

  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const attemptDigest =
      attempt === 0
        ? baseSeedHex
        : computeHmacHex(secret, `identity:v1:${normalizedUserId}:attempt:${attempt}`);
    const candidateSuffix = suffixFromDigestHex(attemptDigest);
    if (isBlockedSuffix(candidateSuffix)) continue;

    const candidateAlias = `${aliasAnimal} ${aliasColor}${SEPARATOR}${candidateSuffix}`;
    if (!isValidAliasCompleto(candidateAlias, aliasAnimal, aliasColor, candidateSuffix)) {
      continue;
    }
    if (existing && existing.has(candidateAlias)) {
      continue;
    }
    chosenSuffix = candidateSuffix;
    chosenAliasCompleto = candidateAlias;
    break;
  }

  if (!chosenSuffix || !chosenAliasCompleto) {
    throw new Error(`Could not allocate non-colliding suffix after ${MAX_COLLISION_ATTEMPTS} attempts`);
  }

  const topDims = getTopDimensions(profile.normalizedScores ?? ({} as DimensionScores), 3);
  const narrative = generateProfileNarrative(animal, color, topDims);

  return Object.freeze({
    estadoIdentidad: "eclosionado",
    animalId: animal.id,
    colorId: color.id,
    aliasAnimal,
    aliasColor,
    aliasSufijo: chosenSuffix,
    aliasCompleto: chosenAliasCompleto,
    colorHex: color.hex,
    genero: animal.genero,
    mbtiCode: spec.mbtiCode,
    mark: spec.mark,
    emblem: spec.emblem,
    enneagram: spec.enneagram,
    narrative,
  });
}

