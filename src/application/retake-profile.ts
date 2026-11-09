/**
 * Re-toma mínima (B9.2, ADR-054): el plan publicado en `data/retake-plans.json`
 * convertido en preguntas reales.
 *
 * Tres cosas distinguen este flujo del cuestionario completo y del «afina tu
 * perfil» por módulos:
 *
 * 1. Se selecciona **por sello**, no por voluntad: solo quien tiene una
 *    `params_version` con plan aplicable recibe preguntas. Un perfil anterior al
 *    sello, o de un banco sin plan publicado, no entra aquí (regla 1 de ADR-052:
 *    no vuelvas a preguntar lo que sigue siendo válido).
 * 2. Se re-preguntan **respuestas que ya existían**. Un ítem nuevo del banco
 *    nunca forma parte de una re-toma: nadie respondió algo que aún no se
 *    preguntaba, y estrenar preguntas es otro costo distinto.
 * 3. Se escribe por la misma ruta que el test completo (`submitQuiz`), así que
 *    el sello, el recálculo de pares y los avisos no pueden quedar atrás.
 *
 * El merge es lo delicado: las respuestas intactas se conservan tal cual y las
 * re-preguntadas las reemplazan —o se retiran, si la persona prefiere no
 * contestar. Una respuesta vieja a un enunciado que ya no dice lo mismo no vale
 * la pena conservarla: medio ítem viejo junto a medio nuevo sale peor medida.
 */
import { isSkippableItem } from "@/config";
import type { RetakeItemDto, RetakeViewDto } from "@/contracts/retake";
import { MICROTEST_ITEMS } from "@/domain/matching";
import { err, ok, type Result } from "@/domain/shared";
import { isAskable, lookupRetake, type RetakeRegistry, type ShippedRetakePlan } from "@/domain/psychometrics/retake-registry";
import type { LikertValue, QuizItem, QuizSubmission } from "@/types/microtest";

import type { QuizSubmittedDto } from "./dto";
import type { AppError } from "./errors";
import type { ProfileRepository, StoredAnswer } from "./ports";
import { submitQuiz, type SubmitQuizDeps } from "./submit-quiz";

/** Las respuestas del plan: lo único que mira el merge. */
export interface RetakeAnswers {
  likert: ReadonlyArray<{ itemId: string; value: LikertValue }>;
  filters: ReadonlyArray<{ itemId: string; selected: readonly string[] }>;
}

export interface RetakeInput extends RetakeAnswers {
  userId: string;
}

export interface RetakeDeps extends SubmitQuizDeps {
  profiles: SubmitQuizDeps["profiles"] & Pick<ProfileRepository, "loadAnswers" | "loadParamsVersion">;
  /** La tabla publicada por `scripts/matching/retake-plans.mjs`. */
  plans: RetakeRegistry;
  /** Banco vigente (`QUIZ_VERSION`): el `to` con el que se busca el plan. */
  bankVersion: string;
}

const itemById = new Map<string, QuizItem>(MICROTEST_ITEMS.map((item) => [item.id, item]));
const BANK_IDS = new Set(MICROTEST_ITEMS.map((item) => item.id));
const isLikert = (v: number | undefined): v is LikertValue => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

/**
 * Lo que esta persona **sí contestó** dentro del plan, en el orden del banco.
 * Un ítem que nunca respondió no se re-pregunta: eso sería afinar, no retomar.
 */
export function pendingOf(plan: ShippedRetakePlan, stored: readonly StoredAnswer[]): string[] {
  const answered = new Set(stored.map((answer) => answer.itemId));
  return plan.reask.filter((id) => answered.has(id) && itemById.has(id));
}

/**
 * Respuestas guardadas con las re-preguntadas encima; las del plan que no se
 * contestaron se retiran en lugar de conservarse. `null` cuando el envío toca un
 * ítem que no está en el plan, repite un ítem, o deja sin cubrir un ítem no
 * sensible: media familia nueva y media vieja se estima peor que la familia
 * vieja entera (I9).
 */
export function mergeRetake(
  stored: readonly StoredAnswer[],
  answers: RetakeAnswers,
  pending: readonly string[],
): QuizSubmission | null {
  const asked = new Set(pending);
  const byItem = new Map<string, { value?: LikertValue; selected?: readonly string[] }>();
  for (const a of answers.likert) {
    if (!asked.has(a.itemId) || byItem.has(a.itemId)) return null;
    byItem.set(a.itemId, { value: a.value });
  }
  for (const a of answers.filters) {
    if (!asked.has(a.itemId) || byItem.has(a.itemId)) return null;
    byItem.set(a.itemId, { selected: a.selected });
  }

  for (const [id, answer] of byItem) {
    const item = itemById.get(id);
    if (!item) return null;
    if ("value" in answer) {
      if (item.tipo_respuesta !== "likert_5" || !isLikert(answer.value)) return null;
    } else if (item.tipo_respuesta !== "seleccion_multiple") return null;
  }

  // Cada ítem del plan se re-contesta o se retira, salvo los sensibles: saltarse
  // una pregunta íntima nunca puede obligar a declarar nada.
  for (const id of asked) {
    const item = itemById.get(id);
    if (item && !byItem.has(id) && !isSkippableItem(item)) return null;
  }

  const kept = stored.filter((a) => !asked.has(a.itemId));
  return {
    likert: [
      ...kept.flatMap((a) => (isLikert(a.value) ? [{ itemId: a.itemId, value: a.value }] : [])),
      ...[...byItem].flatMap(([id, a]) => (a.value !== undefined ? [{ itemId: id, value: a.value }] : [])),
    ],
    filters: [
      ...kept.flatMap((a) => (a.selected ? [{ itemId: a.itemId, selected: [...a.selected] }] : [])),
      ...[...byItem].flatMap(([id, a]) => (a.selected ? [{ itemId: id, selected: [...a.selected] }] : [])),
    ],
  };
}

function viewOf(id: string): RetakeItemDto | null {
  const item = itemById.get(id);
  if (!item) return null;
  const filtro = item.tipo_respuesta === "seleccion_multiple";
  if (!filtro && item.tipo_respuesta !== "likert_5") return null;
  return {
    id: item.id,
    texto: item.texto,
    tipo: filtro ? "filtro" : "likert",
    opciones: filtro ? (item.opciones ?? []) : null,
    sensible: isSkippableItem(item),
  };
}

const asItem = (view: RetakeItemDto | null): view is RetakeItemDto => view !== null;

/** El plan convertido en preguntas para esta persona concreta. */
export function retakePlanOf(stored: readonly StoredAnswer[], plan: ShippedRetakePlan): RetakeViewDto {
  const pending = new Set(pendingOf(plan, stored));
  const blocks = plan.blocks
    .map((block) => ({
      factor: block.factor,
      items: block.items.filter((id) => pending.has(id)).map(viewOf).filter(asItem),
    }))
    .filter((block) => block.items.length > 0);
  const total = blocks.reduce((sum, block) => sum + block.items.length, 0);
  if (total === 0) return { status: "current" };
  return { status: "plan", level: plan.level, blocks, total, retired: plan.retired.length };
}

/** Lo que ve la pantalla: si hay plan, cuáles son sus preguntas; si no, por qué. */
export async function retakeView(deps: RetakeDeps, userId: string): Promise<Result<RetakeViewDto, AppError>> {
  const stamp = await deps.profiles.loadParamsVersion(userId);
  if (!stamp.ok) return stamp;
  const lookup = lookupRetake(deps.plans, stamp.value, deps.bankVersion);
  if (lookup.status !== "plan") return ok({ status: lookup.status });
  if (lookup.plan.overCap) return ok({ status: "capped", total: lookup.plan.reask.length });
  if (!isAskable(lookup.plan, BANK_IDS)) return ok({ status: "unknown" });
  const stored = await deps.profiles.loadAnswers(userId);
  if (!stored.ok) return stored;
  return ok(retakePlanOf(stored.value, lookup.plan));
}

/** Re-pregunta lo mínimo y re-estima: la misma ruta de escritura que el test. */
export async function retakeProfile(
  input: RetakeInput,
  deps: RetakeDeps,
): Promise<Result<QuizSubmittedDto, AppError>> {
  const stamp = await deps.profiles.loadParamsVersion(input.userId);
  if (!stamp.ok) return stamp;
  const lookup = lookupRetake(deps.plans, stamp.value, deps.bankVersion);
  if (lookup.status !== "plan") return err("quiz.retake_none");
  const plan = lookup.plan;
  if (!isAskable(plan, BANK_IDS)) return err("quiz.retake_none");

  const completed = await deps.profiles.isQuizCompleted(input.userId);
  if (!completed.ok) return completed;
  if (!completed.value) return err("quiz.not_completed");

  const stored = await deps.profiles.loadAnswers(input.userId);
  if (!stored.ok) return stored;
  const pending = pendingOf(plan, stored.value);
  if (pending.length === 0) return err("quiz.retake_none");
  const submission = mergeRetake(stored.value, input, pending);
  if (!submission) return err("request.invalid");
  return submitQuiz({ userId: input.userId, submission }, deps);
}
