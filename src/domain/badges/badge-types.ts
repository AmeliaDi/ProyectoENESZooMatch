/**
 * Badge system domain types.
 * Achievements that recognize milestones in the ZooMatch experience.
 * Pure types and logic, no framework dependencies.
 */

/** The five initial badge identifiers. */
export type BadgeId =
  | "primer_match"
  | "conversacion_completada"
  | "tres_rondas"
  | "chat_libre"
  | "semana_activa";

/** Badge definition: what it is and how to unlock it. */
export interface BadgeDefinition {
  /** Unique identifier. */
  id: BadgeId;
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
  | "calendario";

/** Conditions that trigger badge unlocking. */
export type BadgeCondition =
  | { tipo: "match_count"; min: number }
  | { tipo: "conversation_complete" }
  | { tipo: "round_count"; min: number }
  | { tipo: "chat_free_unlock" }
  | { tipo: "active_days"; min: number };

/** A badge that a person has earned. */
export interface EarnedBadge {
  /** Badge identifier. */
  id: BadgeId;
  /** When it was unlocked (ISO date string). */
  desbloqueadoEn: string;
}

/** Badge state for a person. */
export interface BadgeState {
  /** All badges the person has earned. */
  earned: readonly EarnedBadge[];
  /** Whether any badge was just unlocked (for animation). */
  justUnlocked: BadgeId | null;
}

/** Badge display metadata for the UI. */
export interface BadgeDisplay {
  id: BadgeId;
  nombre: string;
  descripcion: string;
  icono: BadgeIcon;
  unlocked: boolean;
  desbloqueadoEn: string | null;
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
  }
}

/** Progress counters used to evaluate badge conditions. */
export interface BadgeProgress {
  totalMatches: number;
  completedConversations: number;
  completedRounds: number;
  hasFreeChat: boolean;
  activeDays: number;
}

/** Map from BadgeIcon to the closest existing icon name in the icon system. */
export const BADGE_ICON_TO_ICON_NAME: Record<BadgeIcon, string> = {
  estrella: "check",
  chat: "chat",
  preguntas: "quiz",
  libertad: "amistad",
  calendario: "notification",
};
