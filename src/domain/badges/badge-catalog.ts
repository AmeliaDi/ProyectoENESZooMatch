/**
 * Badge catalogue: the definitions and the section copy, read from
 * `data/badges.json`. The thresholds are design assumptions with their provenance
 * stated in the file and in `docs/INSIGNIAS.md`; this module owns no numbers.
 */

import { BADGES } from "@/config/badges";

import type { BadgeDefinition } from "./badge-types";

export const BADGE_CATALOG: readonly BadgeDefinition[] = BADGES.insignias.map((badge) => ({
  id: badge.id,
  nombre: badge.nombre,
  descripcion: badge.descripcion,
  icono: badge.icono,
  condicion: badge.condicion,
}));

/** Copy for the badge section on the profile page. */
export const BADGE_SECTION_COPY = {
  title: BADGES.copy.titulo,
  emptyHint: BADGES.copy.pista_vacia,
  lockedLabel: BADGES.copy.etiqueta_bloqueada,
  unlockedLabel: BADGES.copy.etiqueta_desbloqueada,
  derivedNote: BADGES.copy.nota_derivada,
} as const;

/** Lookup a badge definition by id. */
export function getBadgeDefinition(id: string): BadgeDefinition | null {
  return BADGE_CATALOG.find((b) => b.id === id) ?? null;
}
