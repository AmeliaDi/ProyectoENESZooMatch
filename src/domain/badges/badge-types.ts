/**
 * Badge system domain types.
 * Achievements that recognize milestones in the ZooMatch experience.
 * Pure types and logic, no framework dependencies.
 */

/**
 * Badge identifiers live in `data/badges.json`, so the catalogue is the only
 * list and the code never keeps a second one that can fall behind.
 */

/** Badge definition: what it is and how to unlock it. */
export interface BadgeDefinition {
  /** Unique identifier. */
  id: string;
  /** Human-readable name in Spanish (es-MX). */
  nombre: string;
  /** Short description of how to earn it. */
  descripcion: string;
  /** Icon name from the existing pixel icon system. */
  icono: BadgeIcon;
  /** Condition that must be met to unlock. */
  condicion: BadgeCondition;
}

/** Pixel-art icons for badges. */
export type BadgeIcon =
  | "estrella"
  | "chat"
  | "preguntas"
  | "libertad"
  | "calendario"
  | "rompehielos";

/** Conditions that trigger badge unlocking. */
export type BadgeCondition =
  | { tipo: "match_count"; min: number }
  | { tipo: "conversation_complete" }
  | { tipo: "round_count"; min: number }
  | { tipo: "chat_free_unlock" }
  | { tipo: "active_days"; min: number }
  | { tipo: "quizzes_completados"; min: number };

/** Progress counters used to evaluate badge conditions. */
export interface BadgeProgress {
  totalMatches: number;
  completedConversations: number;
  /** Rounds fully answered in the conversation that got furthest, not a sum. */
  completedRounds: number;
  hasFreeChat: boolean;
  activeDays: number;
  quizzesCompleted: number;
}

/**
 * Check if a badge should be unlocked given current progress.
 * Pure function, no side effects.
 */
export function checkBadgeUnlock(
  badge: BadgeDefinition,
  progress: BadgeProgress,
): boolean {
  switch (badge.condicion.tipo) {
    case "match_count":
      return progress.totalMatches >= badge.condicion.min;
    case "conversation_complete":
      return progress.completedConversations >= 1;
    case "round_count":
      return progress.completedRounds >= badge.condicion.min;
    case "chat_free_unlock":
      return progress.hasFreeChat;
    case "active_days":
      return progress.activeDays >= badge.condicion.min;
    case "quizzes_completados":
      return progress.quizzesCompleted >= badge.condicion.min;
  }
}

