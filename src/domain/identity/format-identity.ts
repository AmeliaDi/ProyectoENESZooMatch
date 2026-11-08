/**
 * ZooMatch — Single source of truth for reading and formatting identity (Fase 5).
 *
 * Golden rule:
 *   NO component or use-case outside `domain/identity` may concatenate animal
 *   and color fields by hand or recalculate the animal from the latent profile.
 *   Every screen (result title/subtitle, "Tu carta", constellation, detail sheet,
 *   match cards, chat, notifications, admin, and aria-labels) reads `IdentityDTO`
 *   through `formatIdentity()`.
 */

import { AVATAR_CONFIG, CATALOG_ANIMALS } from "@/config";
import type { SubtypeMark } from "@/domain/avatars/avatar-spec";

import type { IdentityState } from "./hatch-identity";

const SEPARATOR = AVATAR_CONFIG.identity.separator.valor;

/** Sorted longest-first so multi-word diminutives ("osito de anteojos") match first. */
const SORTED_DIMINUTIVES = [...CATALOG_ANIMALS.map((a) => a.diminutivo)].sort(
  (a, b) => b.length - a.length,
);

export interface IdentityDTO {
  readonly estadoIdentidad?: IdentityState | undefined;
  readonly animalId?: string | null | undefined;
  readonly colorId?: string | null | undefined;
  readonly aliasAnimal?: string | null | undefined;
  readonly aliasColor?: string | null | undefined;
  readonly aliasSufijo?: string | null | undefined;
  readonly aliasCompleto?: string | null | undefined;
  readonly mbtiCode?: string | null | undefined;
  readonly enneagramCode?: string | null | undefined;
  readonly enneagramName?: string | null | undefined;
  readonly mark?: SubtypeMark | null | undefined;
  readonly colorHex?: string | null | undefined;
}

export interface FormattedIdentity {
  readonly isEgg: boolean;
  /** Full canonical display name: `"tu huevito"` or `"tortuguita gris neblina · DRRS"`. */
  readonly title: string;
  /** Animal + agreed color without suffix (`"tortuguita gris neblina"`), or `"tu huevito"`. */
  readonly shortName: string;
  /** 4-consonant suffix (`"DRRS"`) or `null` when in egg state. */
  readonly suffix: string | null;
  /**
   * Subtitle for result / profile headers:
   * Contains ONLY MBTI and (when present and defined) Enneagram, e.g. `"INFP · 4w5"` or `"INFP"`.
   * NEVER contains another animal or color name.
   */
  readonly subtitle: string;
  /** Accessible description for sprites and cards. */
  readonly ariaLabel: string;
}

export const EGG_DISPLAY_NAME = "tu huevito";
export const EGG_SUBTITLE = "Aún en su cascarón · completa el test para eclosionar";
export const EGG_ARIA_LABEL = "Tu huevito en espera de eclosionar";
export const FALLBACK_COUNTERPART_NAME = "alguien especial";

/**
 * Splits a full alias (`"{aliasAnimal} {aliasColor} · {aliasSufijo}"`) into its
 * constituent parts using the catalog's known diminutives.
 */
export function parseAliasParts(fullAlias: string): {
  aliasAnimal: string;
  aliasColor: string;
  aliasSufijo: string;
} | null {
  const trimmed = fullAlias.trim();
  const sepIdx = trimmed.lastIndexOf(SEPARATOR);
  if (sepIdx <= 0) return null;
  const prefix = trimmed.slice(0, sepIdx).trim();
  const aliasSufijo = trimmed.slice(sepIdx + SEPARATOR.length).trim();
  if (!prefix || !aliasSufijo) return null;

  const lowerPrefix = prefix.toLowerCase();
  for (const dim of SORTED_DIMINUTIVES) {
    if (lowerPrefix.startsWith(`${dim} `)) {
      const aliasColor = lowerPrefix.slice(dim.length + 1).trim();
      if (aliasColor.length > 0) {
        return { aliasAnimal: dim, aliasColor, aliasSufijo };
      }
    }
  }

  const firstSpace = lowerPrefix.indexOf(" ");
  if (firstSpace <= 0) return null;
  return {
    aliasAnimal: lowerPrefix.slice(0, firstSpace).trim(),
    aliasColor: lowerPrefix.slice(firstSpace + 1).trim(),
    aliasSufijo,
  };
}

function buildTypologySubtitle(
  mbtiCode: string | null | undefined,
  enneagramCode: string | null | undefined,
): string {
  const parts: string[] = [];
  const cleanMbti = mbtiCode?.trim();
  if (cleanMbti && cleanMbti !== "—") parts.push(cleanMbti);
  const cleanEnnea = enneagramCode?.trim();
  if (cleanEnnea && cleanEnnea !== "—") parts.push(cleanEnnea);
  return parts.join(SEPARATOR);
}

/**
 * Formats a stored `IdentityDTO` for display across any screen in the app.
 * Never recalculates animal or color from the psychometric profile.
 */
export function formatIdentity(identity: IdentityDTO): FormattedIdentity {
  if (identity.estadoIdentidad === "huevo") {
    return {
      isEgg: true,
      title: EGG_DISPLAY_NAME,
      shortName: EGG_DISPLAY_NAME,
      suffix: null,
      subtitle: EGG_SUBTITLE,
      ariaLabel: EGG_ARIA_LABEL,
    };
  }

  const storedFull = (identity.aliasCompleto ?? "").trim();
  const parsed = storedFull ? parseAliasParts(storedFull) : null;

  const aliasAnimal = (identity.aliasAnimal ?? parsed?.aliasAnimal ?? "").trim();
  const aliasColor = (identity.aliasColor ?? parsed?.aliasColor ?? "").trim();
  const aliasSufijo = (identity.aliasSufijo ?? parsed?.aliasSufijo ?? "").trim() || null;

  const shortName =
    aliasAnimal && aliasColor
      ? `${aliasAnimal} ${aliasColor}`
      : storedFull.includes(SEPARATOR)
        ? storedFull.slice(0, storedFull.lastIndexOf(SEPARATOR)).trim()
        : storedFull;

  const title =
    storedFull ||
    (shortName && aliasSufijo ? `${shortName}${SEPARATOR}${aliasSufijo}` : shortName);

  if (!title) {
    return {
      isEgg: true,
      title: EGG_DISPLAY_NAME,
      shortName: EGG_DISPLAY_NAME,
      suffix: null,
      subtitle: EGG_SUBTITLE,
      ariaLabel: EGG_ARIA_LABEL,
    };
  }

  const subtitle = buildTypologySubtitle(identity.mbtiCode, identity.enneagramCode);

  return {
    isEgg: false,
    title,
    shortName: shortName || title,
    suffix: aliasSufijo,
    subtitle,
    ariaLabel: title,
  };
}

