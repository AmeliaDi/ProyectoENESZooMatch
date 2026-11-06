/**
 * ZooMatch — Condition that turns an egg into a hatched identity (Fase 3).
 *
 * The identity is derived from the mandatory core test only. Optional modules
 * sharpen the reading (aura, wing mark, narrative) but never change the
 * animal, the color or the alias, because those are frozen at hatching.
 *
 * `hatch_required_modules` lists the modules whose non-sensitive Likert items
 * must all be answered. It includes the items that feed the MBTI readout (the
 * animal) and the Enneagram readout (the color): with the Enneagram posterior
 * still at its prior the type is ambiguous, and `pickAmbiguousColor` distributes
 * the palette deterministically instead of defaulting everybody to "neblina".
 */

import { AVATAR_CONFIG } from "@/config";
import type { QuizModuleId, QuizItem } from "@/types/microtest";

export interface IdentityRequirements {
  readonly modules: readonly QuizModuleId[];
  readonly requiredItemIds: readonly string[];
  readonly answeredRequired: number;
  readonly totalRequired: number;
  readonly met: boolean;
}

const isRequired = (item: QuizItem): boolean =>
  item.tipo_respuesta === "likert_5" && !item.banderas.includes("SENS");

export function hatchRequiredItemIds(items: readonly QuizItem[]): string[] {
  const modules = new Set<string>(AVATAR_CONFIG.identity.hatch_required_modules.valor);
  return items.filter((item) => modules.has(item.modulo) && isRequired(item)).map((item) => item.id);
}

/** Modules still missing for hatching (ids only; never the answers). */
export function pendingIdentityModules(
  items: readonly QuizItem[],
  answeredIds: ReadonlySet<string>,
): QuizModuleId[] {
  const pending = new Set<QuizModuleId>();
  for (const item of items) {
    if (isRequired(item) && !answeredIds.has(item.id)) pending.add(item.modulo);
  }
  return [...pending];
}

export function identityRequirements(
  items: readonly QuizItem[],
  answeredIds: ReadonlySet<string>,
): IdentityRequirements {
  const required = hatchRequiredItemIds(items);
  const answeredRequired = required.reduce((n, id) => n + (answeredIds.has(id) ? 1 : 0), 0);
  return {
    modules: [...AVATAR_CONFIG.identity.hatch_required_modules.valor],
    requiredItemIds: required,
    answeredRequired,
    totalRequired: required.length,
    met: required.length > 0 && answeredRequired === required.length,
  };
}

/** Convenience predicate used by the use cases before calling `hatchIdentity`. */
export function hatchConditionMet(items: readonly QuizItem[], answeredIds: ReadonlySet<string>): boolean {
  return identityRequirements(items, answeredIds).met;
}
