/**
 * Status (animo) feature domain types.
 * "Hoy me siento..." status picker: pure types, no framework dependencies.
 */

import type { AnimoPublicado } from "@/config/animo";

/** A person's published mood status. */
export interface StatusState {
  /** The current mood, or null if not set. */
  animo: AnimoPublicado | null;
  /** Whether the status is visible to matches. Default true. */
  visible: boolean;
  /** Timestamp (ms) of when the status was last updated. */
  updatedAt: number;
}

/** Display metadata for a mood option in the picker. */
export interface StatusOption {
  /** The mood key (matches AnimoPublicado). */
  key: AnimoPublicado;
  /** Human-readable label in Spanish (es-MX). */
  label: string;
  /** Short description of when this mood fits. */
  hint: string;
  /** Icon name from the existing icon system. */
  icon: StatusIcon;
}

/** Pixel-art icons for moods, drawn in the existing icon system style. */
export type StatusIcon =
  | "cansancio"
  | "ansiedad"
  | "ganas_de_platicar"
  | "necesito_un_abrazo"
  | "alegria"
  | "concentracion";

/** Copy for the status picker UI. */
export const STATUS_COPY = {
  title: "Hoy me siento...",
  privacyLabel: "Mostrar estado en mis matches",
  privacyHint: "Cuando esta activo, tu animalito muestra como te sientes en tu carta.",
  clearLabel: "Quitar estado",
  emptyHint: "Elige como te sientes hoy. Es opcional.",
} as const;

/** Copy for each mood option. No forbidden words, warm tone. */
export const STATUS_OPTION_COPY: Record<AnimoPublicado, { label: string; hint: string }> = {
  cansancio: {
    label: "Cansancio",
    hint: "Un dia pesado, me cuesta arrancar",
  },
  ansiedad: {
    label: "Ansiedad",
    hint: "La mente no para, necesito calma",
  },
  ganas_de_platicar: {
    label: "Ganas de platicar",
    hint: "Tengo energia para conversar",
  },
  necesito_un_abrazo: {
    label: "Necesito un abrazo",
    hint: "Un poco de carino cae bien",
  },
  alegria: {
    label: "Alegria",
    hint: "Hoy me siento de buenas",
  },
  concentracion: {
    label: "Concentracion",
    hint: "Enfocado, modo estudio",
  },
};
