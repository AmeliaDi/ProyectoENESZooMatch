/**
 * Deriving badge progress from rows the app already stores (M-14).
 *
 * Nothing here reads a database or writes one: the caller hands over the
 * numbers the chat and quiz rules already produce, plus the timestamps of what
 * this person did. That is also why a derived badge has no date to show — no
 * column stores the day a logro was earned (`docs/INSIGNIAS.md` §5 and §6).
 */

import { BADGES } from "@/config/badges";

import { BADGE_CATALOG } from "./badge-catalog";
import { checkBadgeUnlock, type BadgeProgress } from "./badge-types";

/** What one conversation says about this person, already reduced by the chat rules. */
export interface BadgeConversationTally {
  /** Rounds both sides answered or passed. */
  answeredRounds: number;
  /** Rounds the chat itself counts as completed, clock reveal included. */
  completedRounds: number;
  /** Whether the conversation reached free chat. */
  freeChat: boolean;
}

export interface BadgeFacts {
  totalMatches: number;
  quizzesCompleted: number;
  conversations: readonly BadgeConversationTally[];
  /** Every timestamp of something this person did: the five sources of `docs/INSIGNIAS.md` §3. */
  activity: readonly Date[];
  now: Date;
}

type Politica = typeof BADGES.politica;

const MS_PER_DAY = 86_400_000;

/** `en-CA` renders the parts in ISO order, which is the key the days are deduplicated on. */
const DAY_LOCALE = "en-CA";

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(DAY_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Distinct calendar days inside the window, counted in the zone of the person:
 * a day is a day on their calendar, not a UTC slice of the server.
 */
function activeDays(facts: BadgeFacts, politica: Politica): number {
  const from = facts.now.getTime() - (politica.ventana_actividad_dias - 1) * MS_PER_DAY;
  const days = new Set<string>();
  for (const at of facts.activity) {
    if (at.getTime() < from) continue;
    days.add(dayKey(at, politica.zona_horaria));
  }
  return days.size;
}

export function badgeProgress(facts: BadgeFacts, politica: Politica = BADGES.politica): BadgeProgress {
  return {
    totalMatches: facts.totalMatches,
    completedConversations: facts.conversations.filter((c) => c.answeredRounds >= 1).length,
    completedRounds: facts.conversations.reduce((furthest, c) => Math.max(furthest, c.completedRounds), 0),
    hasFreeChat: facts.conversations.some((c) => c.freeChat),
    activeDays: activeDays(facts, politica),
    quizzesCompleted: facts.quizzesCompleted,
  };
}

/**
 * The ids the person has, in catalogue order.
 *
 * Nothing returns a date: while the state is derived, no row stores the day a
 * logro was earned, and the persisted catalogue — the other half of M-14 — is
 * the only thing that could add one, together with the copy that shows it.
 */
export function unlockedBadgeIds(progress: BadgeProgress): string[] {
  return BADGE_CATALOG.filter((badge) => checkBadgeUnlock(badge, progress)).map((badge) => badge.id);
}
