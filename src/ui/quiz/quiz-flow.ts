/**
 * Pure quiz flow: presentation order, answer bookkeeping, the split of the
 * core into quizzes and payload building. No React, so every rule is
 * unit-tested in Node.
 */

import type { CategoryConfig } from "@/types/matching-config";

import type { QuizDraft } from "./quiz-draft";

export interface FlowItem {
  id: string;
  categoria: string;
  tipo_respuesta: string;
  opciones?: readonly string[] | undefined;
  /** Sensitive Likert item that accepts "prefiero no decir" (ADR-016). */
  skippable?: boolean | undefined;
  /** Hard-filter field the multi-select answers (layer 0). */
  campo_perfil?: string | undefined;
}

/** Draft answers keyed by hard-filter field (input of `romanceOptOut`). */
export function draftFilters(items: readonly FlowItem[], draft: QuizDraft): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const item of items) if (item.campo_perfil) out[item.campo_perfil] = draft.filters[item.id] ?? [];
  return out;
}

/**
 * Keeps the questionnaire order but moves the sensitive block to the end, as
 * the design asks ("lo sensible al final"): the categories declared sensitive
 * and the items that offer "prefiero no decir". Anything that already sits in
 * the bank's tail stays in that order, which is what keeps two questions about
 * the same wish apart once the flow is cut into quizzes.
 */
export function presentationOrder<T extends FlowItem>(
  items: readonly T[],
  sensitive: readonly string[],
): T[] {
  const late = (item: T) => sensitive.includes(item.categoria) || item.skippable === true;
  return [...items.filter((i) => !late(i)), ...items.filter(late)];
}

export function isAnswered(item: FlowItem, draft: QuizDraft): boolean {
  if (item.tipo_respuesta !== "likert_5") return (draft.filters[item.id]?.length ?? 0) > 0;
  return draft.likert[item.id] !== undefined || (item.skippable === true && draft.skipped.includes(item.id));
}

/**
 * A core item seen by the segmentation: it needs the latent factor it measures
 * (to know which scoring category owns it) and its sensitivity flags.
 */
export interface SegmentItem extends FlowItem {
  texto: string;
  factor: string;
  banderas: readonly string[];
  /** Layer-0 eligibility question: asked last, never scored. */
  filtro_duro?: boolean | undefined;
}

export interface QuizSegment {
  /** "test-1", "test-2"… in the order the flow shows them. */
  id: string;
  /** Scoring families inside this quiz, config order, `sensible` last. */
  grupos: readonly { id: string; items: number }[];
  items: readonly SegmentItem[];
}

const OTROS_GRUPO = "otros";
const SENSIBLE_GRUPO = "sensible";

/**
 * Splits the mandatory core into quizzes of at most `maxItemsPerQuiz`
 * questions (ADR-045), cutting where the score cuts: while a construct family
 * fits under the cap it stays inside one quiz, so no quiz boundary splits a
 * measurement (I9) and each quiz has one subject to name it.
 *
 * Groups follow the declaration order of the scoring config — heaviest
 * construct families first — and everything sensitive (SENS items and the
 * layer-0 filters) is collected into a final group, so it is still asked
 * last. Inside a quiz the delivered presentation order is kept, which is what
 * preserves the rotation that stops two items of one factor from touching.
 */
export function coreQuizSegments(
  items: readonly SegmentItem[],
  categories: Readonly<Record<string, CategoryConfig>>,
  options: { readonly maxItemsPerQuiz: number; readonly sensitiveCategories: readonly string[] },
): QuizSegment[] {
  const owner = new Map<string, string>();
  for (const [id, category] of Object.entries(categories)) {
    for (const factor of Object.keys(category.factors)) owner.set(factor, id);
  }
  const sensibles = new Set(options.sensitiveCategories);
  const position = new Map(items.map((item, index) => [item.id, index]));
  const groupOrder = [...Object.keys(categories), OTROS_GRUPO, SENSIBLE_GRUPO];
  const groups = new Map<string, SegmentItem[]>();
  for (const item of items) {
    const late = sensibles.has(item.categoria) || item.filtro_duro === true || item.banderas.includes("SENS");
    const group = late ? SENSIBLE_GRUPO : owner.get(item.factor) ?? OTROS_GRUPO;
    const bucket = groups.get(group);
    if (bucket) bucket.push(item);
    else groups.set(group, [item]);
  }

  const segments: QuizSegment[] = [];
  const units: { id: string; items: SegmentItem[] }[] = [];
  for (const group of groupOrder) {
    const bucket = groups.get(group);
    if (!bucket?.length) continue;
    // A family longer than the cap is cut by position. The cap is the promise
    // made to the person; keeping one family in one quiz is only how the cut
    // is normally chosen, and it never outranks the cap.
    for (let start = 0; start < bucket.length; start += options.maxItemsPerQuiz) {
      units.push({ id: group, items: bucket.slice(start, start + options.maxItemsPerQuiz) });
    }
  }
  let current: { grupos: { id: string; items: number }[]; items: SegmentItem[] } | null = null;
  for (const unit of units) {
    if (current && current.items.length + unit.items.length <= options.maxItemsPerQuiz) {
      current = {
        grupos: [...current.grupos, { id: unit.id, items: unit.items.length }],
        items: [...current.items, ...unit.items],
      };
    } else {
      if (current) segments.push(pack(segments.length + 1, current, position));
      current = { grupos: [{ id: unit.id, items: unit.items.length }], items: unit.items };
    }
  }
  if (current) segments.push(pack(segments.length + 1, current, position));
  return segments;
}

function pack(
  index: number,
  content: { grupos: { id: string; items: number }[]; items: SegmentItem[] },
  position: ReadonlyMap<string, number>,
): QuizSegment {
  return {
    id: `test-${index}`,
    grupos: content.grupos,
    items: [...content.items].sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)),
  };
}

/**
 * Which family names a quiz: the sensitive one when it is present (its label
 * is what tells people identity data is coming), otherwise the family that
 * contributes the most questions.
 */
export function segmentGroupId(segment: QuizSegment): string {
  const sensible = segment.grupos.find((group) => group.id === SENSIBLE_GRUPO);
  if (sensible) return sensible.id;
  return segment.grupos.reduce((best, group) => (group.items > best.items ? group : best), segment.grupos[0]!)
    .id;
}

/** Quiz and question of the first unanswered item, so a draft resumes where it stopped. */
export function resumePosition(
  segments: readonly QuizSegment[],
  draft: QuizDraft,
): { quiz: number; index: number } {
  for (const [quiz, segment] of segments.entries()) {
    const index = segment.items.findIndex((item) => !isAnswered(item, draft));
    if (index !== -1) return { quiz, index };
  }
  const last = segments.length - 1;
  return { quiz: Math.max(0, last), index: Math.max(0, (segments[last]?.items.length ?? 1) - 1) };
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

/** Marks or unmarks a sensitive Likert item as "prefiero no decir" (clears its value). */
export function toggleSkip(draft: QuizDraft, itemId: string): QuizDraft {
  if (draft.skipped.includes(itemId)) {
    return { ...draft, skipped: draft.skipped.filter((id) => id !== itemId) };
  }
  const likert = { ...draft.likert };
  delete likert[itemId];
  return { ...draft, likert, skipped: [...draft.skipped, itemId] };
}

export function buildSubmission(items: readonly FlowItem[], draft: QuizDraft) {
  if (items.some((item) => !isAnswered(item, draft))) return null;
  const likert = items.flatMap((i) => {
    const value = i.tipo_respuesta === "likert_5" ? draft.likert[i.id] : undefined;
    return value === undefined ? [] : [{ itemId: i.id, value }];
  });
  const filters = items
    .filter((i) => i.tipo_respuesta === "seleccion_multiple")
    .map((i) => ({ itemId: i.id, selected: draft.filters[i.id] ?? [] }));
  return { likert, filters };
}

/** Human label for a raw option id: "no_monogamia_etica" → "No monogamia ética". */
const OPTION_LABELS: Record<string, string> = {
  no_monogamia_etica: "No monogamia ética",
  anarquia_relacional: "Anarquía relacional",
  sin_definir: "Sin definir todavía",
  solo_amistad: "Solo amistad",
  "no binarie": "No binarie",
};

export function optionLabel(option: string): string {
  const known = OPTION_LABELS[option];
  if (known) return known;
  const text = option.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
