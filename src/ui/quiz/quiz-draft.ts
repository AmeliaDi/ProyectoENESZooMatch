/** Local-storage key for the in-progress questionnaire. */
export const QUIZ_STORAGE_KEY = "zoomatch:quiz-draft";

export type QuizDraft = {
  likert: Partial<Record<string, 1 | 2 | 3 | 4 | 5>>;
  filters: Partial<Record<string, string[]>>;
  /** Sensitive Likert items answered with "prefiero no decir" (never sent, ADR-016). */
  skipped: string[];
};

export const CATEGORY_LABELS: Record<string, string> = {
  personalidad_bigfive: "Tu personalidad",
  personalidad_mbti: "Tu forma de pensar",
  identidad_filtros: "Tu identidad y lo que buscas",
  afinidad_cultural: "Tus gustos y pasiones",
  intimidad_afecto: "Tu forma de amar",
  valores_relacionales: "Tus valores",
};

/**
 * Name of each scoring family, used to title the quizzes the core is split
 * into (ADR-045). Keys are the category ids of data/matching-config.json, plus
 * the two groups the split adds: items no scoring category owns, and the
 * sensitive tail that closes the questionnaire.
 */
export const GROUP_LABELS: Record<string, string> = {
  personalidad: "Tu personalidad",
  valores: "Tus valores",
  dealbreakers: "Tus límites",
  relacional: "Cómo te vinculas",
  estilo: "Tus gustos y planes",
  big_five: "El puente Big Five",
  conflicto: "Cómo discutes",
  apego: "Tu forma de apego",
  afecto: "Cómo das cariño",
  mbti: "Tu forma de pensar",
  eneagrama: "Lo que te mueve",
  otros: "Otras preguntas",
  sensible: "Tu identidad y lo que buscas",
};

export function groupLabel(id: string): string {
  const label = GROUP_LABELS[id];
  if (label) return label;
  const text = id.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Parses a stored draft, dropping anything malformed instead of throwing. */
export function parseQuizDraft(raw: string | null): QuizDraft {
  const empty: QuizDraft = { likert: {}, filters: {}, skipped: [] };
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;

  const likert: QuizDraft["likert"] = {};
  if (isRecord(parsed.likert)) {
    for (const [key, value] of Object.entries(parsed.likert)) {
      if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
        likert[key] = value;
      }
    }
  }

  const filters: QuizDraft["filters"] = {};
  if (isRecord(parsed.filters)) {
    for (const [key, value] of Object.entries(parsed.filters)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        filters[key] = value as string[];
      }
    }
  }

  const skipped = Array.isArray(parsed.skipped)
    ? parsed.skipped.filter((v): v is string => typeof v === "string" && likert[v] === undefined)
    : [];

  return { likert, filters, skipped };
}
