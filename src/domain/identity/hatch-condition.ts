/**
 * ZooMatch — Condition that turns an egg into a hatched identity (Fase 3).
 *
 * Delegates to `domain/psychometrics/core-complete` (Fase 1 single source).
 * Kept as a thin re-export so existing imports keep working; new code should
 * import `isCoreComplete` directly from `@/domain/psychometrics/core-complete`.
 */

import { AVATAR_CONFIG } from "@/config";
import {
  coreRequiredItemIds,
  isCoreComplete,
  pendingCoreModules,
} from "@/domain/psychometrics/core-complete";
import type { QuizModuleId, QuizItem } from "@/types/microtest";

export interface IdentityRequirements {
  readonly modules: readonly QuizModuleId[];
  readonly requiredItemIds: readonly string[];
  readonly answeredRequired: number;
  readonly totalRequired: number;
  readonly met: boolean;
}

export function hatchRequiredItemIds(items: readonly QuizItem[]): string[] {
  return coreRequiredItemIds(items);
}

export function pendingIdentityModules(
  items: readonly QuizItem[],
  answeredIds: ReadonlySet<string>,
): QuizModuleId[] {
  return pendingCoreModules(items, answeredIds);
}

export function identityRequirements(
  items: readonly QuizItem[],
  answeredIds: ReadonlySet<string>,
): IdentityRequirements {
  const core = isCoreComplete(items, answeredIds);
  return {
    modules: [...AVATAR_CONFIG.identity.hatch_required_modules.valor],
    requiredItemIds: coreRequiredItemIds(items),
    answeredRequired: core.answeredRequired,
    totalRequired: core.totalRequired,
    met: core.complete,
  };
}

export function hatchConditionMet(items: readonly QuizItem[], answeredIds: ReadonlySet<string>): boolean {
  return isCoreComplete(items, answeredIds).complete;
}