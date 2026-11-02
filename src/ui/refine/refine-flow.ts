/**
 * Pure helpers of "¿quieres afinar tu perfil?": which module to suggest, the
 * per-module draft (saved and resumable on this device) and the payload.
 * No React, so every rule is unit-tested in Node.
 */
import { EXPERIENCE, QUIZ_ITEMS, QUIZ_MODULES, isSkippableItem } from "@/config";
import { suggestedModule } from "@/domain/psychometrics/modules";
import type { MatchTrack, QuizItem, QuizModuleId } from "@/types/microtest";

import { parseQuizDraft, type QuizDraft } from "../quiz/quiz-draft";
import type { FlowItem } from "../quiz/quiz-flow";

export type RefineItem = QuizItem & FlowItem;

export const MODULE_INFO = new Map(QUIZ_MODULES.map((m) => [m.id, m]));

export function isModuleId(value: string | null | undefined): value is QuizModuleId {
  return value !== "nucleo" && MODULE_INFO.has(value as QuizModuleId);
}

export function moduleItems(module: QuizModuleId): RefineItem[] {
  return QUIZ_ITEMS.filter((item) => item.modulo === module && item.tipo_respuesta === "likert_5").map((item) => ({
    ...item,
    skippable: isSkippableItem(item),
  }));
}

/** Track the person uses most: friendship when they have no romance matches. */
export function suggestionFor(track: MatchTrack, completed: readonly string[]): QuizModuleId | null {
  return suggestedModule(EXPERIENCE.refine.order[track], new Set(completed as QuizModuleId[]));
}

/** Modules in the suggested order for the track, with their completion flag. */
export function moduleMenu(track: MatchTrack, completed: readonly string[]) {
  const done = new Set(completed);
  return EXPERIENCE.refine.order[track].flatMap((id) => {
    const info = MODULE_INFO.get(id);
    return info ? [{ ...info, items: moduleItems(id).length, done: done.has(id) }] : [];
  });
}

export function draftKey(module: QuizModuleId): string {
  return `${EXPERIENCE.refine.draftKey}:${module}`;
}

/** Restores a module draft keeping only this module's items. */
export function parseModuleDraft(raw: string | null, items: readonly RefineItem[]): QuizDraft {
  const draft = parseQuizDraft(raw);
  const ids = new Set(items.map((i) => i.id));
  const likert: QuizDraft["likert"] = {};
  for (const [id, value] of Object.entries(draft.likert)) if (ids.has(id) && value !== undefined) likert[id] = value;
  return { likert, filters: {}, skipped: draft.skipped.filter((id) => ids.has(id)) };
}

export function refinePayload(module: QuizModuleId, items: readonly RefineItem[], draft: QuizDraft) {
  const likert = items.flatMap((item) => {
    const value = draft.likert[item.id];
    return value === undefined ? [] : [{ itemId: item.id, value }];
  });
  return { module, likert };
}
