/**
 * Pure quiz flow: presentation order, answer bookkeeping and payload
 * building. No React, so every rule is unit-tested in Node.
 */

import type { QuizDraft } from "./quiz-draft";

export interface FlowItem {
  id: string;
  categoria: string;
  tipo_respuesta: string;
  opciones?: readonly string[] | undefined;
}

/**
 * Keeps the questionnaire order but moves sensitive categories to the end,
 * as the design asks ("lo sensible al final"). Stable within each group.
 */
export function presentationOrder<T extends FlowItem>(
  items: readonly T[],
  sensitive: readonly string[],
): T[] {
  const late = new Set(sensitive);
  return [...items.filter((i) => !late.has(i.categoria)), ...items.filter((i) => late.has(i.categoria))];
}

export function isAnswered(item: FlowItem, draft: QuizDraft): boolean {
  return item.tipo_respuesta === "likert_5"
    ? draft.likert[item.id] !== undefined
    : (draft.filters[item.id]?.length ?? 0) > 0;
}

export function countAnswered(items: readonly FlowItem[], draft: QuizDraft): number {
  return items.reduce((n, item) => n + (isAnswered(item, draft) ? 1 : 0), 0);
}

/** Index of the first unanswered item, or the last one if all are answered. */
export function resumeIndex(items: readonly FlowItem[], draft: QuizDraft): number {
  const missing = items.findIndex((item) => !isAnswered(item, draft));
  return missing === -1 ? Math.max(0, items.length - 1) : missing;
}

/**
 * Multi-select toggle where `exclusive` ("prefiero no decir") clears the rest
 * and any other choice clears `exclusive`.
 */
export function toggleOption(current: readonly string[], option: string, exclusive: string): string[] {
  if (current.includes(option)) return current.filter((o) => o !== option);
  if (option === exclusive) return [exclusive];
  return [...current.filter((o) => o !== exclusive), option];
}

export function buildSubmission(items: readonly FlowItem[], draft: QuizDraft) {
  const likert = items
    .filter((i) => i.tipo_respuesta === "likert_5")
    .map((i) => ({ itemId: i.id, value: draft.likert[i.id] }));
  const filters = items
    .filter((i) => i.tipo_respuesta === "seleccion_multiple")
    .map((i) => ({ itemId: i.id, selected: draft.filters[i.id] ?? [] }));
  if (likert.some((a) => a.value === undefined) || filters.some((a) => a.selected.length === 0)) {
    return null;
  }
  return { likert, filters };
}

/** Human label for a raw option id: "no_monogamia_etica" → "No monogamia ética". */
const OPTION_LABELS: Record<string, string> = {
  no_monogamia_etica: "No monogamia ética",
  anarquia_relacional: "Anarquía relacional",
  sin_definir: "Sin definir todavía",
  solo_amistad: "Solo amistad",
  agenero: "Agénero",
  todxs: "Todas las personas",
};

export function optionLabel(option: string): string {
  const known = OPTION_LABELS[option];
  if (known) return known;
  const text = option.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
