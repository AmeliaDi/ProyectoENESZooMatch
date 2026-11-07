import type { ChatTrack, ConversationStage } from "@/contracts/chat";

/**
 * Copy of the chat lock (docs/GUIA_DE_TONO.md): calm, honest about what the
 * PIN protects, never a hint about the PIN itself. Checked by screens.test.ts.
 */
export const CHAT_COPY = {
  intro:
    "Un PIN simple para que tus chats queden entre tú y tu match. No cifra los mensajes: es un candado para quien tome tu dispositivo.",
  createTitle: "Crea tu PIN",
  createStep: "Escribe 4 dígitos que solo tú recuerdes.",
  confirmStep: "Escríbelo otra vez para confirmarlo.",
  weak: "Elige uno que solo tú recuerdes.",
  mismatch: "Los dos PIN no coinciden. Empecemos de nuevo.",
  unlockTitle: "Tus chats tienen candado",
  unlockStep: "Escribe tu PIN para abrirlos.",
  invalid: "Ese PIN no es.",
  pausedTitle: "Tómate un respiro",
  resetOnly: "Por cuidado, ahora solo puedes restablecer tu PIN.",
  forgot: "Olvidé mi PIN",
  empty: "Aquí vivirán tus chats cuando tú y un match acepten conversar.",
  emptyTitle: "Todavía no hay conversaciones",
  lock: "Cerrar el candado",
  pinLabel: "PIN de 4 dígitos",
  show: "Mostrar PIN",
  hide: "Ocultar PIN",
  recoveryTitle: "Restablecer tu PIN",
  recoveryBody:
    "Escribe tu matrícula. Por tu seguridad, tu PIN nuevo podrá crearse en 24 horas; mientras tanto tus chats quedan cerrados.",
  recoveryPending: "Alguien pidió restablecer tu PIN. Si no fuiste tú, cancélalo con tu PIN actual.",
  recoveryInvalid: "No pudimos verificar esos datos.",
  recoveryReady: "La espera terminó. Ya puedes crear tu PIN nuevo.",
  recoveryCancel: "Cancelar la solicitud",
  recoveryCancelled: "Listo: cancelaste la solicitud y tu PIN sigue igual.",
  noSession: "Entra con tu matrícula para usar tus chats.",
  unavailable: "Los chats no están disponibles por ahora. Intenta más tarde.",
  failed: "Algo no salió bien. Intenta de nuevo en un momento.",
} as const;

export { CONVERSATION_COPY, INTEREST_COPY, SAFETY_COPY, errorCopy } from "./conversation-copy";
import { CONVERSATION_COPY } from "./conversation-copy";

export function roundsStage(round: number, total: number): string {
  return `Pregunta ${round} de ${total}`;
}

export function trackLabel(track: ChatTrack): string {
  return track === "romance" ? CONVERSATION_COPY.romance : CONVERSATION_COPY.amistad;
}

/** The stage in words; rounds show how many are already done. */
export function stageLabel(stage: ConversationStage, completed: number): string {
  if (stage === "paused") return CONVERSATION_COPY.stagePaused;
  if (stage === "free") return CONVERSATION_COPY.stageFree;
  if (completed === 0) return CONVERSATION_COPY.stageRounds;
  return `${CONVERSATION_COPY.stageRounds} · ${completed} ${completed === 1 ? "ronda" : "rondas"}`;
}

/** Discreet "X/300" counter, read by screen readers as words. */
export function charsCounter(used: number, limit: number): { visual: string; spoken: string } {
  return { visual: `${used}/${limit}`, spoken: `${used} de ${limit} caracteres` };
}

export function charsLeft(left: number): string {
  if (left < 0) return `Te pasaste por ${-left} ${-left === 1 ? "carácter" : "caracteres"}.`;
  return `${left} ${left === 1 ? "carácter disponible" : "caracteres disponibles"}`;
}

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** `m:ss` under an hour, `h h m min` above (a long wait reads better in words). */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
  }
  return `${Math.floor(minutes / MINUTES_PER_HOUR)} h ${minutes % MINUTES_PER_HOUR} min`;
}

export function pausedMessage(seconds: number): string {
  return `${CHAT_COPY.pausedTitle}: puedes intentar de nuevo en ${formatCountdown(seconds)}.`;
}

export function attemptsMessage(left: number): string {
  if (left <= 0) return CHAT_COPY.invalid;
  const plural = left === 1 ? "intento" : "intentos";
  return `${CHAT_COPY.invalid} Te ${left === 1 ? "queda" : "quedan"} ${left} ${plural} antes de una pausa.`;
}

/**
 * Last resort only: a generic message plus the short reference that appears
 * in the server log, so a person can report it without anyone reading their
 * messages. The id is a random UUID, never derived from their data.
 */
export function failedWithReference(requestId?: string): string {
  return requestId ? `${CHAT_COPY.failed} (ref. ${requestId.slice(0, 8)})` : CHAT_COPY.failed;
}
