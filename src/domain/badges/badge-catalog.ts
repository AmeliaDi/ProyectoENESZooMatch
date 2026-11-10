/**
 * Badge catalog: the five initial badges with their definitions.
 * Pure data, no runtime dependencies.
 */

import type { BadgeDefinition } from "./badge-types";

export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  {
    id: "primer_match",
    nombre: "Primer match",
    descripcion: "Conseguiste tu primera conexion en el cielo",
    icono: "estrella",
    condicion: { tipo: "match_count", min: 1 },
  },
  {
    id: "conversacion_completada",
    nombre: "Primera conversacion",
    descripcion: "Completaste una ronda de preguntas con alguien",
    icono: "chat",
    condicion: { tipo: "conversation_complete" },
  },
  {
    id: "tres_rondas",
    nombre: "Tres rondas",
    descripcion: "Llegaste a tres rondas de preguntas en una conversacion",
    icono: "preguntas",
    condicion: { tipo: "round_count", min: 3 },
  },
  {
    id: "chat_libre",
    nombre: "Chat libre",
    descripcion: "Desbloqueaste el chat libre con alguien",
    icono: "libertad",
    condicion: { tipo: "chat_free_unlock" },
  },
  {
    id: "semana_activa",
    nombre: "Semana activa",
    descripcion: "Siete dias activos en el cielo, no hace falta que sean uno tras otro",
    icono: "calendario",
    condicion: { tipo: "active_days", min: 7 },
  },
] as const;

/** Copy for the badge section on the profile page. */
export const BADGE_SECTION_COPY = {
  title: "Tus logros",
  emptyHint: "Aun no tienes logros desbloqueados. Cada conexion en el cielo te acerca a uno.",
  lockedLabel: "Bloqueado",
  unlockedLabel: "Desbloqueado",
} as const;

/** Lookup a badge definition by id. */
export function getBadgeDefinition(id: string): BadgeDefinition | null {
  return BADGE_CATALOG.find((b) => b.id === id) ?? null;
}
