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

/** Copy of the conversations between matches (docs/CHAT.md). Checked by screens.test.ts. */
export const CONVERSATION_COPY = {
  inboxTitle: "Tus conversaciones",
  romance: "Romance",
  amistad: "Amistad",
  stageInvite: "Invitación al chat libre",
  stageFree: "Chat libre",
  stageRounds: "Rondas de preguntas",
  unread: "Nuevo",
  myTurn: "Te toca",

  loading: "Abriendo tus conversaciones…",
  loadingOne: "Abriendo la conversación…",
  back: "Volver a tus conversaciones",
  goneTitle: "Esta conversación ya no está disponible",
  goneBody: "A veces las conversaciones terminan, y está bien.",
  roundsIntro: "Cada quien responde a su ritmo. Las respuestas se muestran cuando ambxs respondieron.",
  yourAnswer: "Tu respuesta",
  theirAnswer: "Su respuesta",
  theirPending: "Su respuesta aparece cuando ambxs respondan.",
  pastRounds: "Ver sus rondas de preguntas",
  answerLabel: "Escribe tu respuesta",
  answerSend: "Enviar respuesta",
  inviteTitle: "¿Quieren seguir platicando con libertad?",
  inviteBody: "El chat libre se abre solo si las dos personas lo eligen.",
  inviteAccept: "Sí, quiero seguir",
  inviteWaiting: "Esperando a que la otra persona también quiera.",
  freeTitle: "Chat libre",
  freeEmpty: "Aquí aparecerán sus mensajes. Escribe cuando quieras.",
  messagesLabel: "Mensajes",
  mine: "Tú",
  messageLabel: "Escribe un mensaje",
  messageSend: "Enviar",
  leave: "Retirarme",
  leaveTitle: "¿Quieres retirarte?",
  leaveBody: "Puedes retirarte sin explicar nada. La conversación desaparecerá para las dos personas.",
  leaveConfirm: "Sí, retirarme",
  leaveCancel: "Seguir aquí",
  tooLong: "Es un poco largo. Intenta acortarlo.",
  emptyText: "Escribe algo antes de enviarlo.",
  invalidReply: "No pudimos leer la respuesta. Intenta de nuevo en un momento.",
  retry: "Intentar de nuevo",
} as const;

/** Copy of the interest signal in the detail sheet. */
export const INTEREST_COPY = {
  send: "Me interesa conocerte",
  sent: "Tu señal está enviada. Si también le interesa, se abrirá un chat. Nadie ve tu señal si no es mutua.",
  withdraw: "Retirar señal",
  withdrawn: "Listo: retiraste tu señal.",
  open: "¡Se abrió un chat!",
  openLink: "Ir a tus chats",
  loading: "Revisando tus señales…",
  gone: "Esta persona ya no aparece entre tus matches. Así pasa a veces, y está bien.",
  noSession: "Entra con tu matrícula para enviar una señal.",
  failed: "No pudimos guardar tu señal. Intenta de nuevo en un momento.",
  retry: "Intentar de nuevo",
} as const;

export function roundsStage(round: number, total: number): string {
  return `Ronda ${round} de ${total}`;
}

export function trackLabel(track: ChatTrack): string {
  return track === "romance" ? CONVERSATION_COPY.romance : CONVERSATION_COPY.amistad;
}

/** The stage in words; without progress the rounds stage stays generic. */
export function stageLabel(stage: ConversationStage, progress: { round: number; total: number } | null): string {
  if (stage === "invite") return CONVERSATION_COPY.stageInvite;
  if (stage === "free") return CONVERSATION_COPY.stageFree;
  return progress ? roundsStage(progress.round, progress.total) : CONVERSATION_COPY.stageRounds;
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
