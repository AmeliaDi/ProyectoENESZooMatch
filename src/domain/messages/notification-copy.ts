/**
 * ZooMatch — Notification Copy Generator
 * Warm, poetic notification message templates for the affective notification system.
 *
 * Every name that reaches these templates is already formatted by
 * `formatIdentity()` in the application layer. Nothing here concatenates an
 * animal with a colour: that is the second calculation route the golden rule
 * forbids, and the reason one person used to appear under two different names.
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

// ─── Constants ────────────────────────────────────────────────────────────────

/** The comforting no-match message. Used when no one exceeds the threshold. */
export const NO_MATCH_MESSAGE =
  "aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor \u003c3";

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generates notification copy based on type and context.
 * All messages use warm, poetic, validating tone.
 * NEVER uses clinical/technical language.
 */
export function generateNotificationCopy(
  type: NotificationType,
  context: NotificationContext
): NotificationCopy {
  switch (type) {
    case "match_romance":
      return generateRomanceMatchCopy(context);
    case "match_amistad":
      return generateFriendshipMatchCopy(context);
    case "no_match":
      return generateNoMatchCopy();
    case "welcome":
      return generateWelcomeMessage(context.userName);
    case "identity":
      return nameFrozenMessage(context.userName);
    default:
      return generateWelcomeMessage(context.userName);
  }
}

// ─── Romance Match ────────────────────────────────────────────────────────────

function generateRomanceMatchCopy(context: NotificationContext): NotificationCopy {
  const { userName, matchCount, matches } = context;
  const match = matches?.[0];

  if (matchCount === 1 && match) {
    return {
      title: "El universo conspir\u00f3 a tu favor",
      body: `Tienes a un ser extraordinario en el campus con quien podr\u00edas tener una qu\u00edmica incre\u00edble. Tu energ\u00eda de ${userName} resuen\u00f3 con ${match}.`,
    };
  }

  if (matchCount > 1) {
    return {
      title: "El universo conspir\u00f3 a tu favor",
      body: `Tienes a ${matchCount} seres extraordinarios en el campus con los que podr\u00edas tener una qu\u00edmica incre\u00edble. Tu energ\u00eda de ${userName} reson\u00f3 con cada unx de ellxs.`,
    };
  }

  return {
    title: "El universo conspir\u00f3 a tu favor",
    body: `Tu energ\u00eda de ${userName} encontr\u00f3 una resonancia especial en el campus. Hay alguien con quien la qu\u00edmica fluye de forma \u00fanica.`,
  };
}

// ─── Friendship Match ─────────────────────────────────────────────────────────

function generateFriendshipMatchCopy(context: NotificationContext): NotificationCopy {
  const { userName, matchCount, matches } = context;
  const match = matches?.[0];

  if (matchCount === 1 && match) {
    return {
      title: "Tu vibra reson\u00f3 con alguien",
      body: `Tu energ\u00eda de ${userName} conect\u00f3 con ${match}. Hay una qu\u00edmica de amistad que vale la pena explorar \u2014 sus personalidades se complementan de forma \u00fanica.`,
    };
  }

  if (matchCount > 1) {
    return {
      title: "Tu vibra reson\u00f3 con el campus",
      body: `Tu energ\u00eda de ${userName} reson\u00f3 con ${matchCount} personas del campus. Hay amistades esperando florecer \u2014 sus personalidades y gustos se complementan de forma hermosa.`,
    };
  }

  return {
    title: "Tu vibra reson\u00f3 con alguien",
    body: `Tu energ\u00eda de ${userName} encontr\u00f3 una conexi\u00f3n de amistad genuina en el campus. Hay alguien cuyo esp\u00edritu complementa el tuyo.`,
  };
}

// ─── No Match ─────────────────────────────────────────────────────────────────

function generateNoMatchCopy(): NotificationCopy {
  return {
    title: "Tu momento llegar\u00e1",
    body: NO_MATCH_MESSAGE,
  };
}

// ─── Welcome Message ──────────────────────────────────────────────────────────

/**
 * Welcome message shown once, right after the egg hatches. The name it uses is
 * the frozen one: from this moment it never changes again.
 */
export function generateWelcomeMessage(userName: string): NotificationCopy {
  return {
    title: "Tu perfil ya brilla en el h\u00e1bitat",
    body: `Tu esencia de ${userName} ya est\u00e1 registrada y tu nombre queda fijo para siempre; ya no cambia. Cuando alguien compatible entre al h\u00e1bitat, el universo te lo har\u00e1 saber.`,
  };
}

/**
 * Copy for people whose name was corrected by the fase 6 backfill. It says the
 * two things that matter: what happened and that it will not happen again.
 */
export function nameFrozenMessage(userName: string): NotificationCopy {
  return {
    title: "Tu nombre ya est\u00e1 decidido",
    body: `Revisamos tu identidad con la regla nueva y tu nombre qued\u00f3 fijo para siempre: ${userName}. Ya no cambia, aunque completes más módulos.`,
  };
}
