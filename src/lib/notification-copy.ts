/**
 * ZooMatch — Notification Copy Generator
 * Warm, poetic notification message templates for the affective notification system.
 */

import type { NotificationType, MatchTrack } from "@/types/microtest";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationContext {
  userAnimal: string;
  userColor: string;
  matchCount: number;
  matches?: Array<{ animal: string; color: string; similarity: number }>;
  track?: MatchTrack;
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
      return generateWelcomeMessage(context.userAnimal, context.userColor);
    default:
      return generateWelcomeMessage(context.userAnimal, context.userColor);
  }
}

// ─── Romance Match ────────────────────────────────────────────────────────────

function generateRomanceMatchCopy(context: NotificationContext): NotificationCopy {
  const { userAnimal, userColor, matchCount, matches } = context;

  if (matchCount === 1 && matches && matches.length >= 1) {
    const match = matches[0];
    return {
      title: "El universo conspir\u00f3 a tu favor \ud83d\udcab",
      body: `Tienes a un ser extraordinario en el campus con quien podr\u00edas tener una qu\u00edmica incre\u00edble. Tu energ\u00eda de ${userAnimal} ${userColor} combin\u00f3 a la perfecci\u00f3n con ${match.animal} ${match.color}.`,
    };
  }

  if (matchCount > 1) {
    return {
      title: "El universo conspir\u00f3 a tu favor \ud83d\udcab",
      body: `Tienes a ${matchCount} seres extraordinarios en el campus con los que podr\u00edas tener una qu\u00edmica incre\u00edble. Tu energ\u00eda de ${userAnimal} ${userColor} reson\u00f3 con cada unx de ellxs.`,
    };
  }

  // Fallback single match without details
  return {
    title: "El universo conspir\u00f3 a tu favor \ud83d\udcab",
    body: `Tu energ\u00eda de ${userAnimal} ${userColor} encontr\u00f3 una resonancia especial en el campus. Hay alguien con quien la qu\u00edmica fluye de forma \u00fanica.`,
  };
}

// ─── Friendship Match ─────────────────────────────────────────────────────────

function generateFriendshipMatchCopy(context: NotificationContext): NotificationCopy {
  const { userAnimal, userColor, matchCount, matches } = context;

  if (matchCount === 1 && matches && matches.length >= 1) {
    const match = matches[0];
    return {
      title: "Tu vibra reson\u00f3 con alguien \u2728",
      body: `Tu energ\u00eda de ${userAnimal} ${userColor} conect\u00f3 con ${match.animal} ${match.color}. Hay una qu\u00edmica de amistad que vale la pena explorar \u2014 sus personalidades se complementan de forma \u00fanica.`,
    };
  }

  if (matchCount > 1) {
    return {
      title: "Tu vibra reson\u00f3 con el campus \u2728",
      body: `Tu energ\u00eda de ${userAnimal} ${userColor} reson\u00f3 con ${matchCount} personas del campus. Hay amistades esperando florecer \u2014 sus personalidades y gustos se complementan de forma hermosa.`,
    };
  }

  // Fallback single match without details
  return {
    title: "Tu vibra reson\u00f3 con alguien \u2728",
    body: `Tu energ\u00eda de ${userAnimal} ${userColor} encontr\u00f3 una conexi\u00f3n de amistad genuina en el campus. Hay alguien cuyo esp\u00edritu complementa el tuyo.`,
  };
}

// ─── No Match ─────────────────────────────────────────────────────────────────

function generateNoMatchCopy(): NotificationCopy {
  return {
    title: "Tu momento llegar\u00e1 \ud83c\udf31",
    body: NO_MATCH_MESSAGE,
  };
}

// ─── Welcome Message ──────────────────────────────────────────────────────────

/**
 * Welcome message shown after profile creation.
 */
export function generateWelcomeMessage(animal: string, color: string): NotificationCopy {
  return {
    title: "Tu perfil ya brilla en el h\u00e1bitat \ud83c\udf1f",
    body: `Tu esencia de ${animal} ${color} ya est\u00e1 registrada. Cuando alguien compatible entre al h\u00e1bitat, el universo te lo har\u00e1 saber.`,
  };
}
