import { SCORING_CONFIG } from "@/lib/scoring/config";
import { checkHardFilters, isRelationshipCompatible } from "@/lib/matching-v2";
import type { HardFilters } from "@/types/microtest-v2";
import type { Sociocultural } from "@/lib/scoring/types";

function presentSelections(value: string[] | undefined): value is string[] {
  return Array.isArray(value) && value.length > 0;
}

export function hasHardFilterData(a: Sociocultural | null, b: Sociocultural | null): boolean {
  return Boolean(
    a &&
      b &&
      presentSelections(a.orientacion) &&
      presentSelections(a.identidadGenero) &&
      presentSelections(b.orientacion) &&
      presentSelections(b.identidadGenero),
  );
}

export function hasRelationshipData(a: Sociocultural | null, b: Sociocultural | null): boolean {
  return presentSelections(a?.tipoRelacion) && presentSelections(b?.tipoRelacion);
}

function isSoloAmistadOnly(values: string[] | undefined): boolean {
  return values?.length === 1 && values[0] === "solo_amistad";
}

export function isHardCompatible(a: Sociocultural | null, b: Sociocultural | null): boolean {
  if (isSoloAmistadOnly(a?.tipoRelacion) || isSoloAmistadOnly(b?.tipoRelacion)) {
    return false;
  }
  if (!a || !b) return true;

  if (
    hasRelationshipData(a, b) &&
    !isRelationshipCompatible(a.tipoRelacion ?? [], b.tipoRelacion ?? [])
  ) {
    return false;
  }
  if (!hasHardFilterData(a, b)) return true;

  const hardFiltersA: HardFilters = {
    orientacion_sexual: a.orientacion ?? [],
    identidad_genero: a.identidadGenero ?? [],
    tipo_relacion_busca: a.tipoRelacion ?? [],
  };
  const hardFiltersB: HardFilters = {
    orientacion_sexual: b.orientacion ?? [],
    identidad_genero: b.identidadGenero ?? [],
    tipo_relacion_busca: b.tipoRelacion ?? [],
  };

  return checkHardFilters(hardFiltersA, hardFiltersB);
}

export function scoreOrdinalSimilarity(a: Sociocultural | null, b: Sociocultural | null): number | null {
  if (!a?.ordinal || !b?.ordinal) return null;

  const sharedValues = Object.keys(a.ordinal)
    .filter((key) => {
      const left = a.ordinal?.[key];
      const right = b.ordinal?.[key];
      return typeof left === "number" && Number.isFinite(left) &&
        typeof right === "number" && Number.isFinite(right);
    })
    .map((key) => Math.abs((a.ordinal?.[key] ?? 0) - (b.ordinal?.[key] ?? 0)));

  if (sharedValues.length === 0) return null;
  const meanDifference = sharedValues.reduce((sum, difference) => sum + difference, 0) /
    sharedValues.length;
  return 1 - meanDifference;
}

function scoreRelationshipJaccard(a: Sociocultural | null, b: Sociocultural | null): number | null {
  if (!a || !b || !Array.isArray(a.tipoRelacion) || !Array.isArray(b.tipoRelacion)) {
    return null;
  }

  const ignored = new Set<string>(SCORING_CONFIG.sociocultural.ignoredRelationshipTypes);
  const valuesA = new Set(a.tipoRelacion.filter((value) => !ignored.has(value)));
  const valuesB = new Set(b.tipoRelacion.filter((value) => !ignored.has(value)));
  const union = new Set([...valuesA, ...valuesB]);
  if (union.size === 0) return null;

  const intersectionSize = [...valuesA].filter((value) => valuesB.has(value)).length;
  return intersectionSize / union.size;
}

export function scoreSociocultural(a: Sociocultural | null, b: Sociocultural | null): number | null {
  const ordinal = scoreOrdinalSimilarity(a, b);
  const relationship = scoreRelationshipJaccard(a, b);
  const { ordinalWeight, relationshipWeight } = SCORING_CONFIG.sociocultural;

  if (ordinal !== null && relationship !== null) {
    return ordinalWeight * ordinal + relationshipWeight * relationship;
  }
  if (ordinal !== null) return ordinal;
  if (relationship !== null) return relationship;
  return null;
}
