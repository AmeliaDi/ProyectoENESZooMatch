/**
 * The single place where a stored identity becomes a DTO. It only projects
 * columns (plus two catalogue lookups); it never recomputes an animal, a
 * colour or an enneagram from the latent profile.
 */
import { CATALOG_COLORS } from "@/config";
import { baseColorId } from "@/domain/avatars/avatar-spec";
import type { SubtypeMark } from "@/domain/avatars/avatar-spec";
import type { IdentityDto } from "@/contracts/identity";
import type { IdentityState } from "@/domain/identity/hatch-identity";
import {
  ENNEAGRAM_WING_CODES,
  enneagramProfileFromType,
  enneagramTypeName,
  type EnneagramType,
} from "@/domain/psychometrics/psychometrics";

import type { CounterpartProfile, IdentityRecord } from "./ports";

const HEX_BY_COLOR_ID = new Map(CATALOG_COLORS.map((c) => [c.id, c.hex]));

/** Kind words of a stored enneagram readout; `null` code means still exploring. */
export interface EnneagramWords {
  type: number | null;
  wing: number | null;
  code: string | null;
  name: string | null;
  archetype: string | null;
}

/** `"4w5"` / `"4"` / `null` → catalogue words. A parse never invents a type. */
export function enneagramWords(code: string | null): EnneagramWords {
  const none: EnneagramWords = { type: null, wing: null, code: null, name: null, archetype: null };
  if (!code) return none;
  const match = /^([1-9])(?:w([1-9]))?$/.exec(code);
  if (!match) return none;
  const type = Number(match[1]) as EnneagramType;
  const wing = match[2] ? (Number(match[2]) as EnneagramType) : null;
  // The catalogue defines the 18 adjacent wings only. `"4"` has no wing tone
  // and `"4w2"` does not exist: both fall back to the type alone, so a screen
  // never invents a wing and never shows an unreadable code.
  if (wing === null || !ENNEAGRAM_WING_CODES.includes(`${type}w${wing}`)) {
    return { type, wing: null, code: String(type), name: enneagramTypeName(type), archetype: null };
  }
  const profile = enneagramProfileFromType(type, wing);
  return { type, wing, code, name: profile.nombre, archetype: profile.arquetipo };
}

/** Stored readout of the enneagram; the inverse of `enneagramWords`. */
export function enneagramCodeOfReadout(type: number | null, wing: number | null): string | null {
  if (type === null) return null;
  return wing === null ? String(type) : `${type}w${wing}`;
}

interface IdentitySource {
  estadoIdentidad: IdentityState;
  aliasCompleto: string | null;
  aliasAnimal: string | null;
  aliasColor: string | null;
  aliasSufijo: string | null;
  animalId: string | null;
  colorId: string | null;
  mbtiCode: string | null;
  enneagramCode: string | null;
  mark: SubtypeMark | null;
}

/**
 * Projects the stored columns. `showDetail === false` applies the same
 * opt-in filter the sprite already uses, so a name and its drawing can never
 * disagree about what the counterpart decided to share.
 */
function project(
  src: IdentitySource,
  options: {
    readonly revelacionVista: boolean;
    readonly showDetail?: boolean | undefined;
    readonly eggSeed?: number | null | undefined;
  },
): IdentityDto {
  if (src.estadoIdentidad === "huevo") {
    return {
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
      huevitoSeed: options.eggSeed ?? null,
    };
  }
  const revealWing = options.showDetail !== false;
  const enneagram = enneagramWords(src.enneagramCode);
  const colorId = revealWing && src.colorId !== null ? src.colorId : src.colorId !== null ? baseColorId(src.colorId) : null;
  const shownCode = revealWing || enneagram.type === null
    ? enneagram.code
    : enneagramCodeOfReadout(enneagram.type, null);
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: src.aliasCompleto,
    aliasAnimal: src.aliasAnimal,
    aliasColor: src.aliasColor,
    aliasSufijo: src.aliasSufijo,
    animalId: src.animalId,
    colorId,
    colorHex: colorId === null ? null : HEX_BY_COLOR_ID.get(colorId) ?? null,
    mbtiCode: src.mbtiCode,
    enneagramCode: shownCode,
    enneagramName: shownCode === null ? null : enneagram.name,
    mark: revealWing ? src.mark : null,
    revelacionVista: options.revelacionVista,
    huevitoSeed: null,
  };
}

/**
 * Own identity, exactly as stored. The shell seed is passed in because only
 * the caller holding the server secret can derive it, and only an egg needs it.
 */
export function toIdentityDto(record: IdentityRecord, eggSeed?: number | null): IdentityDto {
  return project(record, { revelacionVista: record.revelacionVista, eggSeed: eggSeed ?? null });
}

/** The DTO of a person who has not hatched: no name, no animal, no colour. */
export const EGG_IDENTITY_DTO: IdentityDto = project(
  {
    estadoIdentidad: "huevo",
    aliasCompleto: null,
    aliasAnimal: null,
    aliasColor: null,
    aliasSufijo: null,
    animalId: null,
    colorId: null,
    mbtiCode: null,
    enneagramCode: null,
    mark: null,
  },
  { revelacionVista: false },
);

/** Counterpart identity with the counterpart's own sharing choices applied. */
export function counterpartIdentity(other: CounterpartProfile): IdentityDto {
  return project(other, { revelacionVista: false, showDetail: other.showAvatarDetail });
}
