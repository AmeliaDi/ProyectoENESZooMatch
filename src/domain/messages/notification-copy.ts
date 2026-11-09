/**
 * ZooMatch — Notification Copy Generator
 * Warm, poetic notification copy for the affective notification system.
 *
 * Two rules hold this module together.
 *
 * 1. One name route. Every name that reaches these templates is already
 *    formatted by `formatIdentity()` in the application layer. Nothing here
 *    concatenates an animal with a colour: that is the second calculation
 *    route the golden rule forbids, and the reason one person used to appear
 *    under two different names.
 * 2. One copy route, and it says what was measured. `NOTIFICATION_COPY` is the
 *    only place a notification sentence is written; the `notify_matches`
 *    function in Supabase repeats these exact templates (pinned by
 *    `notification-copy.test.ts`) and fills the same `{slots}`. Nothing here
 *    promises a relational outcome: the engine estimates affinity between two
 *    response vectors, so the copy says that, and leaves what people do with
 *    it to the conversation.
 */

import type { NotificationType, MatchTrack } from "@/types/microtest";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationContext {
  /** Canonical display name of the viewer (identity, never rebuilt here). */
  userName: string;
  matchCount: number;
  /** Canonical display names of the matches, best first. */
  matches?: readonly string[] | undefined;
  track?: MatchTrack | undefined;
}

export interface NotificationCopy {
  title: string;
  body: string;
}

/** Placeholders filled by both this module and `notify_matches`. */
export interface CopySlots {
  nombre?: string;
  /** Absent or `undefined` when the match hides its name behind the result. */
  match?: string | undefined;
  n?: number | string;
}

// ─── The copy ─────────────────────────────────────────────────────────────────

/**
 * Every sentence a notification can show. Titles never name a count, so the
 * same title works for one match or for ten.
 */
export const NOTIFICATION_COPY = {
  title_romance: "Tu energía resonó en el hábitat",
  title_amistad_one: "Tu vibra resonó con alguien",
  title_amistad_many: "Tu vibra resonó con el campus",
  title_no_match: "Aún no hay resonancias en el hábitat",
  title_welcome: "Tu perfil ya brilla en el hábitat",
  title_identity: "Tu nombre ya está decidido",
  romance_one:
    "Tu energía de {nombre} quedó arriba del filtro junto a {match}. La afinidad estimada es alta; lo que puedan hacer con eso se ve platicando.",
  romance_one_hidden:
    "Tu energía de {nombre} quedó arriba del filtro. La afinidad estimada es alta; el nombre de quien es lo ves en tu resultado.",
  romance_many:
    "Tu energía de {nombre} quedó arriba del filtro junto a {n} personas del campus. La afinidad estimada es alta con cada una de esas personas; lo que puedan hacer con eso se ve platicando.",
  amistad_one:
    "Tu energía de {nombre} resonó arriba del filtro de amistad junto a {match}. Los puntos en común ya están; si la amistad cuaja se nota en la conversación.",
  amistad_one_hidden:
    "Tu energía de {nombre} resonó arriba del filtro de amistad. Los puntos en común ya están; el nombre de quien es lo ves en tu resultado.",
  amistad_many:
    "Tu energía de {nombre} resonó arriba del filtro de amistad con {n} personas del campus. Hay amistades con terreno compartido; lo que sigue se ve platicando.",
  no_match:
    "Todavía no aparece nadie arriba del filtro. No es un veredicto sobre ti ni sobre el amor: cuando entre más gente al hábitat, esto se mueve.",
  welcome:
    "Tu esencia de {nombre} ya está registrada y tu nombre queda fijo: ya no cambia. Cuando alguien compatible entre al hábitat, te lo avisamos.",
  identity:
    "Revisamos tu identidad con la regla nueva y tu nombre quedó fijo: {nombre}. Ya no cambia, aunque completes más módulos.",
} as const;

export type NotificationCopyKey = keyof typeof NOTIFICATION_COPY;

/** The comforting no-match message. Used when no one exceeds the threshold. */
export const NO_MATCH_MESSAGE = NOTIFICATION_COPY.no_match;

// ─── Main Generator ───────────────────────────────────────────────────────────

/** Fill `{slots}` exactly like `replace(...)` does inside `notify_matches`. */
export function fillCopy(template: string, slots: CopySlots): string {
  return template
    .replaceAll("{nombre}", slots.nombre ?? "")
    .replaceAll("{match}", slots.match ?? "")
    .replaceAll("{n}", String(slots.n ?? ""));
}

/**
 * Generates notification copy from the shared templates.
 * All messages use warm, poetic, validating tone and describe the estimated
 * affinity; never a relationship that will happen.
 */
export function generateNotificationCopy(
  type: NotificationType,
  context: NotificationContext
): NotificationCopy {
  switch (type) {
    case "match_romance":
      return matchCopy("romance", context);
    case "match_amistad":
      return matchCopy("amistad", context);
    case "no_match":
      return { title: NOTIFICATION_COPY.title_no_match, body: NO_MATCH_MESSAGE };
    case "welcome":
      return generateWelcomeMessage(context.userName);
    case "identity":
      return nameFrozenMessage(context.userName);
    default:
      return generateWelcomeMessage(context.userName);
  }
}

function matchCopy(track: "romance" | "amistad", context: NotificationContext): NotificationCopy {
  const { userName, matchCount, matches } = context;
  const slots: CopySlots = { nombre: userName, match: matches?.[0], n: matchCount };

  if (track === "romance") {
    if (matchCount > 1) return { title: NOTIFICATION_COPY.title_romance, body: fillCopy(NOTIFICATION_COPY.romance_many, slots) };
    const key = matchCount === 1 && slots.match ? "romance_one" : "romance_one_hidden";
    return { title: NOTIFICATION_COPY.title_romance, body: fillCopy(NOTIFICATION_COPY[key], slots) };
  }

  if (matchCount > 1) {
    return { title: NOTIFICATION_COPY.title_amistad_many, body: fillCopy(NOTIFICATION_COPY.amistad_many, slots) };
  }
  const key = matchCount === 1 && slots.match ? "amistad_one" : "amistad_one_hidden";
  return { title: NOTIFICATION_COPY.title_amistad_one, body: fillCopy(NOTIFICATION_COPY[key], slots) };
}

// ─── Welcome and identity ─────────────────────────────────────────────────────

/**
 * Welcome message shown once, right after the egg hatches. The name it uses is
 * the frozen one: from this moment it does not move again.
 */
export function generateWelcomeMessage(userName: string): NotificationCopy {
  return {
    title: NOTIFICATION_COPY.title_welcome,
    body: fillCopy(NOTIFICATION_COPY.welcome, { nombre: userName }),
  };
}

/**
 * Copy for people whose name was corrected by the fase 6 backfill. It says the
 * two things that matter: what happened and that it will not happen again.
 */
export function nameFrozenMessage(userName: string): NotificationCopy {
  return {
    title: NOTIFICATION_COPY.title_identity,
    body: fillCopy(NOTIFICATION_COPY.identity, { nombre: userName }),
  };
}
