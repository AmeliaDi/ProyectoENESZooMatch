/**
 * Layer 0: mutual eligibility for romance. Only what each person DECLARES is
 * used; nothing is inferred from other answers.
 */
import type { HardFilters } from "@/types/microtest";

/** Relationship-type compatibility map. */
const RELATIONSHIP_COMPATIBILITY: Record<string, readonly string[]> = {
  monogamia: ["monogamia"],
  no_monogamia_etica: ["no_monogamia_etica", "poliamor", "anarquia_relacional"],
  poliamor: ["poliamor", "no_monogamia_etica", "anarquia_relacional"],
  anarquia_relacional: ["anarquia_relacional", "no_monogamia_etica", "poliamor"],
  sin_definir: ["sin_definir", "no_monogamia_etica", "poliamor", "anarquia_relacional", "solo_amistad"],
  solo_amistad: ["solo_amistad", "sin_definir"],
};

/**
 * "Prefiero no decir". In the orientation or relationship-type filter it opts
 * the person out of romance (friendship only, ADR-016); in gender identity it
 * hides nothing from the other side's orientation (no inference either way).
 */
const PREFER_NOT_TO_SAY = "prefiero no decir";

const ORIENTATION_TARGETS: Record<string, readonly string[]> = {
  hombres: ["hombre"],
  mujeres: ["mujer"],
  "personas no binarias": ["no binarie", "género fluido", "agénero", "otra"],
};

/**
 * True when a person's own declarations take them out of romance (ADR-016):
 * "prefiero no decir" in orientation or bond type, or exactly `solo_amistad`.
 * The quiz uses it to say so before submitting; nobody is surprised later.
 */
export function romanceOptOut(filters: Partial<HardFilters>): boolean {
  const orientation = filters.orientacion_sexual ?? [];
  const bond = filters.tipo_relacion_busca ?? [];
  return (
    orientation.includes(PREFER_NOT_TO_SAY) ||
    bond.includes(PREFER_NOT_TO_SAY) ||
    (bond.length === 1 && bond[0] === "solo_amistad")
  );
}

function relationshipPairCompatible(x: string, y: string): boolean {
  if (x === y) return true;
  return (RELATIONSHIP_COMPATIBILITY[x]?.includes(y) ?? false) || (RELATIONSHIP_COMPATIBILITY[y]?.includes(x) ?? false);
}

export function attractedTo(orientations: string[], genders: string[]): boolean {
  if (orientations.includes(PREFER_NOT_TO_SAY)) return false;
  if (orientations.length === 0 || genders.length === 0 || genders.includes(PREFER_NOT_TO_SAY)) {
    return true;
  }
  const targets = orientations.flatMap((orientation) => ORIENTATION_TARGETS[orientation] ?? []);
  return targets.length === 0 || genders.some((gender) => targets.includes(gender));
}

/**
 * Relationship-type compatibility. Compatible when ANY value in `a` is
 * compatible with ANY value in `b`; exactly `["solo_amistad"]` or
 * `prefiero no decir` block romance; an empty selection is "no filter".
 */
export function isRelationshipCompatible(a: string[], b: string[]): boolean {
  if (a.includes(PREFER_NOT_TO_SAY) || b.includes(PREFER_NOT_TO_SAY)) return false;
  const soloAmistad = (values: string[]) => values.length === 1 && values[0] === "solo_amistad";
  if (soloAmistad(a) || soloAmistad(b)) return false;
  const filteredA = a.filter((value) => value !== "solo_amistad");
  const filteredB = b.filter((value) => value !== "solo_amistad");
  if (filteredA.length === 0 || filteredB.length === 0) return true;
  return filteredA.some((x) => filteredB.some((y) => relationshipPairCompatible(x, y)));
}

/**
 * Indicator product 1[G_B ∈ O_A] · 1[G_A ∈ O_B] · 1[K(A, B)], with K the
 * symmetric relationship-compatibility kernel.
 */
export function checkHardFilters(a: HardFilters, b: HardFilters): boolean {
  return (
    attractedTo(a.orientacion_sexual, b.identidad_genero) &&
    attractedTo(b.orientacion_sexual, a.identidad_genero) &&
    isRelationshipCompatible(a.tipo_relacion_busca, b.tipo_relacion_busca)
  );
}
