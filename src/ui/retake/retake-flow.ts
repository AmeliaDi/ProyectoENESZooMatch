/**
 * Reglas puras de la re-toma mínima (B9.2, ADR-054): el plan convertido en una
 * lista de preguntas, el borrador reanudable y el texto de cada estado. Sin
 * React, para que cada regla se pueda probar en Node.
 *
 * Las preguntas se aplanan: el bloque sigue siendo la unidad que se valida (I9
 * dice que la posterior de un factor se estima junta), pero la pantalla no
 * necesita nombrar factores para preguntar en orden. No se inventan títulos:
 * tres de los cuatro factores del plan vigente no tienen etiqueta legible.
 */
import { EXPERIENCE, LIKERT_SCALE } from "@/config";
import type { RetakeBlockDto, RetakeItemDto, RetakeViewDto } from "@/contracts/retake";

import { parseQuizDraft, type QuizDraft } from "../quiz/quiz-draft";
import { optionLabel, type FlowItem } from "../quiz/quiz-flow";

/** Una pregunta del plan, en la forma que las reglas compartidas del test ya entienden. */
export interface RetakeQuestion extends FlowItem {
  readonly texto: string;
  /** Ofrece «Prefiero no decir»; saltarla retira la respuesta guardada en lugar de conservarla a medias. */
  readonly sensible: boolean;
  readonly opciones: readonly string[];
}

/**
 * Bajo el prefijo de afinación a propósito: `device-drafts` borra toda clave que
 * empiece con `EXPERIENCE.refine.draftKey:` cuando entra otra persona en el
 * mismo dispositivo (ADR-023), y ningún módulo de afinación se llama «retoma».
 */
export const RETAKE_DRAFT_KEY = `${EXPERIENCE.refine.draftKey}:retoma`;

export const LIKERT_OPTIONS = LIKERT_SCALE.map((option) => ({ value: option.valor, label: option.etiqueta }));

export const RETAKE_COPY = {
  title: "Actualizamos algunas preguntas",
  body: "Solo te volvemos a preguntar lo que cambió y tú ya habías contestado. Todo lo demás de tu perfil sigue igual.",
  sensitive: "Entre ellas hay preguntas sobre identidad, vínculo y planes de crianza. Puedes marcar «Prefiero no decir».",
  retired: (count: number) => `También retiramos ${count} ${count === 1 ? "pregunta" : "preguntas"} que ya no usamos.`,
  save: "Guardar",
  saving: "Guardando",
  pause: "Pausar",
} as const;

export interface RetakeStatusCopy {
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly href: string;
}

/** Cuatro estados sin preguntas, cuatro explicaciones. Ninguna deja a nadie fuera del pool. */
export function statusFor(view: Exclude<RetakeViewDto, { status: "plan" }>): RetakeStatusCopy {
  switch (view.status) {
    case "current":
      return {
        title: "Tu perfil ya está al día",
        body: "No hay preguntas que repetir con la versión actual de las cuentas. Si quieres afinar otra parte, hazlo desde tu carta.",
        cta: "Ir a mi carta",
        href: "/perfil",
      };
    case "unstamped":
      return {
        title: "No tienes nada que repetir",
        body: "Tu perfil se actualizó solo, con la nueva matemática. Nadie tiene que volver a contestar por un cambio de cálculo.",
        cta: "Ver mi carta",
        href: "/perfil",
      };
    case "unknown":
      return {
        title: "Aún no hay re-toma para ti",
        body: "Tu perfil se midió con una versión que todavía no tiene preguntas preparadas. Puedes afinar un módulo desde tu carta.",
        cta: "Afinar mi perfil",
        href: "/afinar",
      };
    case "capped":
      return {
        title: "La actualización pide demasiadas preguntas",
        body: `Serían ${view.total} preguntas. Preferimos no ofrecerte una lista tan larga: tu perfil sigue buscando mientras se decide una actualización más amable.`,
        cta: "Afinar mi perfil",
        href: "/afinar",
      };
  }
}

export const isPlan = (view: RetakeViewDto): view is Extract<RetakeViewDto, { status: "plan" }> =>
  view.status === "plan";

/**
 * La respuesta de `/api/quiz/retake` entra por aquí antes de tocar la pantalla:
 * un `status` que no conocemos o un plan sin bloques se trata como un fallo de
 * red, no como un plan vacío. Preguntar de más es peor que no preguntar.
 */
export function parseRetakeView(value: unknown): RetakeViewDto | null {
  if (typeof value !== "object" || value === null) return null;
  const view = value as Record<string, unknown>;
  switch (view.status) {
    case "current":
    case "unstamped":
    case "unknown":
      return { status: view.status };
    case "capped":
      return typeof view.total === "number" ? { status: "capped", total: view.total } : null;
    case "plan": {
      const { blocks, total, retired, level } = view;
      if (!Array.isArray(blocks) || !blocks.every(isBlock)) return null;
      if (typeof total !== "number" || typeof retired !== "number") return null;
      if (level !== "T1" && level !== "T2" && level !== "T3") return null;
      return { status: "plan", level, blocks, total, retired };
    }
    default:
      return null;
  }
}

const isItem = (value: unknown): value is RetakeItemDto => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.texto !== "string") return false;
  if (item.tipo !== "likert" && item.tipo !== "filtro") return false;
  if (item.opciones !== null && !Array.isArray(item.opciones)) return false;
  return typeof item.sensible === "boolean";
};

const isBlock = (value: unknown): value is RetakeBlockDto => {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  return typeof block.factor === "string" && Array.isArray(block.items) && block.items.every(isItem);
};

function questionOf(item: RetakeItemDto): RetakeQuestion {
  return {
    id: item.id,
    // Sin categoría real: el plan no se recorta por categoría e `isAnswered` no la usa.
    categoria: "retoma",
    tipo_respuesta: item.tipo === "filtro" ? "seleccion_multiple" : "likert_5",
    opciones: item.opciones ?? [],
    skippable: item.sensible,
    sensible: item.sensible,
    texto: item.texto,
  };
}

export function questionsOf(view: Extract<RetakeViewDto, { status: "plan" }>): RetakeQuestion[] {
  return view.blocks.flatMap((block) => block.items.map(questionOf));
}

/** La línea que abre el quiz: por qué le preguntan esto otra vez a esa persona. */
export function introOf(view: Extract<RetakeViewDto, { status: "plan" }>): string {
  const parts: string[] = [RETAKE_COPY.body];
  if (view.retired > 0) parts.push(RETAKE_COPY.retired(view.retired));
  const asksPrivate = questionsOf(view).some((item) => item.sensible || item.tipo_respuesta === "seleccion_multiple");
  if (asksPrivate) parts.push(RETAKE_COPY.sensitive);
  return parts.join(" ");
}

/** El id crudo del banco no se muestra tal cual: «no_monogamia_etica» → «No monogamia ética». */
export const filterOptions = (question: RetakeQuestion) =>
  question.opciones.map((option) => ({
    value: option,
    label: optionLabel(option),
    ...(option === EXPERIENCE.quiz.exclusiveOption ? { icon: "privacy" as const } : {}),
  }));

/**
 * Un borrador guardado vuelve solo con las preguntas de este plan: si el plan
 * cambió o se envió a medias, lo que ya no se pregunta no debe regresar a la
 * pantalla ni colarse en el envío.
 */
export function parseRetakeDraft(raw: string | null, questions: readonly RetakeQuestion[]): QuizDraft {
  const draft = parseQuizDraft(raw);
  const ids = new Set(questions.map((question) => question.id));
  const likert: QuizDraft["likert"] = {};
  for (const [id, value] of Object.entries(draft.likert)) {
    if (ids.has(id) && value !== undefined) likert[id] = value;
  }
  const filters: QuizDraft["filters"] = {};
  for (const [id, value] of Object.entries(draft.filters)) {
    if (ids.has(id) && value !== undefined && value.length > 0) filters[id] = value;
  }
  return { likert, filters, skipped: draft.skipped.filter((id) => ids.has(id)) };
}
