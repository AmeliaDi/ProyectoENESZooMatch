"use client";

/**
 * Mini aviso de los cambios en los quizzes (B10).
 *
 * Es el dueño del caso `unstamped`: un perfil anterior al sello de medición no
 * puede recibir la re-toma mínima, porque el plan se calcula comparando el banco
 * con el que esa persona respondió y sin sello ese banco es desconocido (regla 1
 * de ADR-052, `src/domain/psychometrics/retake-registry.ts`). Sin este aviso, las
 * personas que ya existían no se enteraban de nada. Con sello y versión pendiente
 * quien invita es `MathUpdateNotice`, así que aquí se guarda para no poner el
 * mismo botón dos veces en la misma pantalla.
 *
 * Los números y los títulos que se leen aquí se derivan del banco vigente, no se
 * escriben a mano: `quiz-changes-notice.test` es lo que impide que el aviso
 * prometa algo que el cuestionario ya no hace.
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { EXPERIENCE, MATCHING_CONFIG } from "@/config";
import { CORE_ITEMS, QUIZ_VERSION, isSkippableItem } from "@/config/quiz";
import type { ProfileDto } from "@/contracts/profile";
import { Button } from "@/ui/kit/button";
import { Frame } from "@/ui/kit/surfaces";
import { groupLabel } from "@/ui/quiz/quiz-draft";
import { coreQuizSegments, presentationOrder, segmentGroupId } from "@/ui/quiz/quiz-flow";

const DISMISS_KEY = "zm-quiz-changes-seen";

/** Los mismos segmentos que responde la persona, contados desde el banco vigente. */
const SEGMENTS = coreQuizSegments(
  presentationOrder(
    CORE_ITEMS.map((item) => ({ ...item, skippable: isSkippableItem(item) })),
    EXPERIENCE.quiz.sensitiveCategories,
  ),
  MATCHING_CONFIG.categories,
  {
    maxItemsPerQuiz: EXPERIENCE.quiz.maxItemsPerQuiz,
    sensitiveCategories: EXPERIENCE.quiz.sensitiveCategories,
  },
);

export const QUIZ_CHANGES_SIZES: readonly number[] = SEGMENTS.map((segment) => segment.items.length);

/**
 * Familias de puntuación donde el banco 2.2 trajo reactivos nuevos. Se nombran
 * con `groupLabel`, el mismo título que la persona ve en la cabecera del quiz,
 * para que el aviso y el cuestionario digan lo mismo. `quiz-changes-notice.test`
 * lo ancla contra los ítems reales del banco.
 */
const GREW_IN = ["valores", "estilo"] as const;

/** Título del quiz que cierra el cuestionario: el de las preguntas sensibles. */
const LAST_SEGMENT = SEGMENTS.at(-1);
const SENSITIVE_TITLE = groupLabel(LAST_SEGMENT ? segmentGroupId(LAST_SEGMENT) : "sensible");

/**
 * Firma del contenido. Se deriva del corte y del banco, no de un número escrito a
 * mano: si mañana cambia la repartición o la versión del banco, la firma cambia y
 * el aviso vuelve a aparecer una vez.
 */
export const QUIZ_CHANGES_SIGNATURE = `${SEGMENTS.length}-quizzes-${QUIZ_VERSION}`;

export const QUIZ_CHANGES_COPY = {
  title: "Qué cambió en los quizzes",
  intro: "Afinamos la forma de medir el perfil. Esto es lo nuevo:",
  split: `El cuestionario ahora son ${SEGMENTS.length} quizzes cortos (${joinLast(QUIZ_CHANGES_SIZES)} reactivos) en lugar de una sola tanda larga.`,
  added: `Agregamos preguntas en ${GREW_IN.map((group) => `«${groupLabel(group).toLowerCase()}»`).join(" y ")}.`,
  identity:
    "Las opciones de identidad son aditivas y varias preguntas se reescribieron para que se puedan leer en voz alta.",
  sensitive: `Identidad e intimidad se preguntan al final, en el quiz «${SENSITIVE_TITLE.toLowerCase()}».`,
  cta: "Volver a responder",
  note: `Es opcional y serían los ${SEGMENTS.length} quizzes otra vez. Tu perfil se sigue calculando con lo que ya contestaste.`,
  dismiss: "Ya lo vi",
} as const;


function joinLast(numbers: readonly number[]): string {
  if (numbers.length < 2) return String(numbers[0] ?? 0);
  return `${numbers.slice(0, -1).join(", ")} y ${numbers[numbers.length - 1]}`;
}

export type QuizChangesView = "show" | "hidden";

export function quizChangesFor({
  measurement,
  dismissed,
}: {
  measurement: ProfileDto["measurement"];
  dismissed: string | null;
}): QuizChangesView {
  if (measurement.stamped) return "hidden";
  if (dismissed === QUIZ_CHANGES_SIGNATURE) return "hidden";
  return "show";
}

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: el aviso vuelve la próxima vez, que es el modo seguro.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function QuizChangesNotice({ measurement }: { measurement: ProfileDto["measurement"] }) {
  // En el servidor la firma ya vista es la vigente: el aviso entra después de la
  // hidratación, no parpadea al revés ni se pierde quien ya lo descartó.
  const dismissed = useSyncExternalStore(
    subscribe,
    () => read(DISMISS_KEY),
    () => QUIZ_CHANGES_SIGNATURE,
  );

  if (quizChangesFor({ measurement, dismissed }) === "hidden") return null;

  return (
    <Frame title={QUIZ_CHANGES_COPY.title}>
      <p className="zm-detail__muted">{QUIZ_CHANGES_COPY.intro}</p>
      <ul className="zm-detail__talk">
        <li>{QUIZ_CHANGES_COPY.split}</li>
        <li>{QUIZ_CHANGES_COPY.added}</li>
        <li>{QUIZ_CHANGES_COPY.identity}</li>
        <li>{QUIZ_CHANGES_COPY.sensitive}</li>
      </ul>
      <div className="zm-math__actions">
        <Link href="/cuestionario" className="zm-box zm-btn zm-btn--primary">
          {QUIZ_CHANGES_COPY.cta}
        </Link>
        <Button variant="ghost" onClick={() => write(DISMISS_KEY, QUIZ_CHANGES_SIGNATURE)}>
          {QUIZ_CHANGES_COPY.dismiss}
        </Button>
      </div>
      <p className="zm-result__fine">{QUIZ_CHANGES_COPY.note}</p>
    </Frame>
  );
}

