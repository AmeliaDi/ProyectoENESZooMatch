/**
 * Progress of the optional deepening modules ("¿quieres afinar tu perfil?").
 * A module is complete when it has at least one answer and every
 * non-sensitive item is answered; sensitive items may stay unanswered
 * ("prefiero no decir") and are never imputed. A module made only of
 * sensitive items is therefore complete after its first answer.
 */
import type { QuizItem, QuizModuleId } from "@/types/microtest";

export interface ModuleProgress {
  readonly id: QuizModuleId;
  readonly answered: number;
  readonly total: number;
  readonly complete: boolean;
}

const isRequired = (item: QuizItem) => item.tipo_respuesta === "likert_5" && !item.banderas.includes("SENS");

export function moduleProgress(
  items: readonly QuizItem[],
  modules: readonly QuizModuleId[],
  answeredIds: ReadonlySet<string>,
): ModuleProgress[] {
  return modules.map((id) => {
    const own = items.filter((item) => item.modulo === id && item.tipo_respuesta === "likert_5");
    const answered = own.filter((item) => answeredIds.has(item.id)).length;
    const complete = own.filter(isRequired).every((item) => answeredIds.has(item.id));
    return { id, answered, total: own.length, complete: answered > 0 && complete };
  });
}

export function completedModules(
  items: readonly QuizItem[],
  modules: readonly QuizModuleId[],
  answeredIds: ReadonlySet<string>,
): QuizModuleId[] {
  return moduleProgress(items, modules, answeredIds).flatMap((m) => (m.complete ? [m.id] : []));
}

/** First incomplete module in the configured order (`null` when all are done). */
export function suggestedModule(
  order: readonly QuizModuleId[],
  completed: ReadonlySet<QuizModuleId>,
): QuizModuleId | null {
  return order.find((id) => !completed.has(id)) ?? null;
}
