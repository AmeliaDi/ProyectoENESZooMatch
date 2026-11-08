/**
 * Single source of truth for "core complete" (Fase 1, ADR-038).
 *
 * Pure, deterministic, no I/O. Every consumer — submission, self-repair,
 * reconciler, UI progress — imports this function instead of duplicating
 * the predicate. The bank revision is implicit in the items array passed
 * by the caller (MICROTEST_ITEMS from config).
 */
import { AVATAR_CONFIG } from "@/config";
import type { QuizItem, QuizModuleId } from "@/types/microtest";

export interface CoreCompletion {
  readonly complete: boolean;
  readonly missingItemIds: readonly string[];
  readonly answeredRequired: number;
  readonly totalRequired: number;
}

const isRequired = (item: QuizItem): boolean =>
  item.tipo_respuesta === "likert_5" && !item.banderas.includes("SENS");

/** Item ids that must be answered for hatching (config-driven modules). */
export function coreRequiredItemIds(items: readonly QuizItem[]): string[] {
  const modules = new Set<string>(AVATAR_CONFIG.identity.hatch_required_modules.valor);
  return items.filter((item) => modules.has(item.modulo) && isRequired(item)).map((item) => item.id);
}

/**
 * The one predicate. Returns exactly which items are still missing so the
 * UI can say "Te faltan N preguntas" and the quiz can jump to them.
 */
export function isCoreComplete(
  items: readonly QuizItem[],
  answeredIds: ReadonlySet<string>,
): CoreCompletion {
  const required = coreRequiredItemIds(items);
  const missing = required.filter((id) => !answeredIds.has(id));
  return {
    complete: required.length > 0 && missing.length === 0,
    missingItemIds: missing,
    answeredRequired: required.length - missing.length,
    totalRequired: required.length,
  };
}

/** Modules still missing for hatching (ids only; never the answers). */
export function pendingCoreModules(
  items: readonly QuizItem[],
  answeredIds: ReadonlySet<string>,
): QuizModuleId[] {
  const pending = new Set<QuizModuleId>();
  for (const item of items) {
    if (isRequired(item) && !answeredIds.has(item.id)) pending.add(item.modulo);
  }
  return [...pending];
}