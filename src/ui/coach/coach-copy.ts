/**
 * es-MX copy of the constellation's quick guide. Tú, neutral wording, titles
 * of at most five words (docs/GUIA_DE_TONO.md). No React: tested in Node.
 */

import { COACH_STEPS, stepCount, type CoachState, type CoachStepId } from "./coachmarks";

export const COACH_STEP_COPY: Readonly<Record<CoachStepId, { title: string; body: string }>> = {
  self: {
    title: "Este eres tú",
    body: "Tu animal brilla en dorado al centro de tu cielo.",
  },
  drag: {
    title: "Arrastra los nodos",
    body: "Mueve cualquier estrella: quienes tienen más afinidad estimada se acercan.",
  },
  tap: {
    title: "Toca un animal",
    body: "Abre su ficha para ver por qué conectan, área por área.",
  },
  tracks: {
    title: "Romance o Amistad",
    body: "Cambia de cielo con estas pestañas. Pellizca para acercar o alejar.",
  },
};

export const COACH_DESKTOP_TIPS: readonly string[] = [
  "Arrastra las estrellas: las de más afinidad se acercan.",
  "Haz clic en un animal para ver por qué conectan.",
  "Rueda del ratón, pellizco o los botones + y − para el zoom.",
  "Romance o Amistad: cambia de cielo con las pestañas.",
];

export const COACH_COPY = {
  regionLabel: "Guía rápida de tu constelación",
  desktopTitle: "Guía rápida",
  help: "Ver la guía rápida",
  next: "Siguiente",
  done: "Listo",
  back: "Atrás",
  skip: "Saltar la guía",
  close: "Cerrar la guía",
  never: "No volver a mostrar",
  gotIt: "Entendido",
  how: "Cómo se calcula",
  anonymity: "Nadie ve tu matrícula ni tus respuestas: solo tu animal y tu alias.",
  share: "Cambiar lo que compartes",
  closed: "Guía cerrada. Puedes abrirla otra vez con el botón de ayuda.",
} as const;

export const COACH_LINKS = {
  how: "/ajustes#como-se-calcula",
  share: "/ajustes",
} as const;

export function stepLabel(step: number, total: number): string {
  return `Paso ${step + 1} de ${total}`;
}

/** What the polite live region announces for the current state. */
export function coachAnnouncement(state: CoachState): string {
  if (!state.open) return state.closedBy ? COACH_COPY.closed : "";
  if (state.variant === "desktop") return `${COACH_COPY.desktopTitle}. ${COACH_DESKTOP_TIPS.join(" ")}`;
  const step = COACH_STEPS[state.step];
  if (!step) return "";
  const copy = COACH_STEP_COPY[step.id];
  return `${stepLabel(state.step, stepCount(state.variant))}. ${copy.title}. ${copy.body}`;
}
