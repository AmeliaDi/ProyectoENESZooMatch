/**
 * Context for selecting an ánimo message. Pure types, no runtime dependencies.
 * The selection function receives all the data it needs to decide, so it stays
 * testable and free of side effects.
 */

import type { IdentityDto } from "@/contracts/identity";

/** Time of day, bucketed for message selection. */
export type MomentoDelDia = "manana" | "tarde" | "noche" | "madrugada";

/** Social context: what happened recently in the person's matches/chats. */
export type ContextoSocial =
  | { kind: "match_nuevo"; count: number }
  | { kind: "invitacion_chat"; count: number }
  | { kind: "sin_matches" }
  | { kind: "despues_de_quiz" }
  | { kind: "none" };

/** Published mood from the person's status (Phase 4 feature, may not exist yet). */
export type AnimoPublicado =
  | "cansancio"
  | "ansiedad"
  | "ganas_de_platicar"
  | "necesito_un_abrazo"
  | "alegria"
  | "concentracion"
  | null;

/** Seasonal context: which seasonal window (if any) the current date falls in. */
export type ContextoEstacional =
  | "inicio_semestre"
  | "fin_semestre"
  | "epoca_examenes"
  | "dia_de_muertos"
  | "fin_de_anio"
  | "vacaciones"
  | "cumpleanos_zooenes"
  | null;

/** First-entry context: what kind of "first" this is. */
export type PrimeraEntrada =
  | { kind: "tras_eclosion" }
  | { kind: "del_dia" }
  | { kind: "tras_varios_dias"; daysAway: number }
  | { kind: "none" };

/**
 * Full context for message selection. All fields are optional except `identity`
 * and `momento`, so the selector can degrade gracefully when data is missing.
 */
export interface AnimoContext {
  /** The person's fixed identity (animal, color, alias, state). */
  identity: IdentityDto;
  /** Current time of day. */
  momento: MomentoDelDia;
  /** Current date (YYYY-MM-DD) for seasonal selection and history dedup. */
  fecha: string;
  /** Social context (matches, invitations, quizzes). */
  social: ContextoSocial;
  /** Published mood from status (if the feature exists and the person opted in). */
  animo: AnimoPublicado;
  /** Seasonal context (if the date falls in a seasonal window). */
  estacional: ContextoEstacional;
  /** First-entry context (if this is a "first" of some kind). */
  primera: PrimeraEntrada;
  /** Whether the person has enabled seasonal messages in settings. */
  estacionalesActivos: boolean;
  /** Whether the person has enabled ánimo messages at all. */
  mensajesActivos: boolean;
}

/**
 * History of recently shown message IDs. Used to avoid repetition.
 * Only IDs are stored, not content (privacy).
 */
export interface AnimoHistory {
  /** Message IDs shown recently, oldest first. */
  shown: readonly string[];
  /** Maximum history size (from config). */
  maxSize: number;
}

/**
 * Frequency preference: how often messages may appear.
 * - "cada_sesion": once per browser session (default).
 * - "diaria": once per calendar day.
 * - "semanal": once per calendar week (ISO).
 * - "off": disabled — messages do not appear automatically.
 */
export type AnimoFrecuencia = "cada_sesion" | "diaria" | "semanal" | "off";

/**
 * Session state: tracks whether a message was shown in this session and when.
 */
export interface AnimoSession {
  /** Timestamp (ms) of the last message shown, or null if none. */
  lastShownAt: number | null;
  /** Date (YYYY-MM-DD) of the last message shown, for "diaria". */
  lastShownDate: string | null;
  /** ISO week string (YYYY-Www) of the last message shown, for "semanal". */
  lastShownWeek: string | null;
  /** Whether a message was shown in this browser session. */
  shownThisSession: boolean;
}
