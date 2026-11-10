import { z } from "zod";

import { PARAM_LABELS } from "@/types/matching-config";

import raw from "../../data/badges.json";
import { loadConfig } from "./load";

/**
 * `data/badges.json`: the badge catalogue, the copy of its section and the
 * policy that derives progress from rows the app already stores. Thresholds are
 * design assumptions, so each one carries its label and the section of
 * `docs/INSIGNIAS.md` that states what it means.
 */

const BADGE_ICONS = ["estrella", "chat", "preguntas", "libertad", "calendario", "rompehielos"] as const;
/**
 * The five stamps the read model already carries, so deriving a day of
 * activity never needs a new column: a finished quiz
 * (`quiz_attempts.completado_en`), a round this person opened
 * (`conversation_rounds.created_at`), a message they wrote
 * (`conversation_messages.created_at`), the day they opened a conversation
 * (`conversations.seen_a`/`seen_b`) and the last action of a conversation when
 * it was theirs (`conversations.updated_at` + `last_actor`).
 *
 * "Answered a round" is deliberately absent: `answersOf()` reads the answer
 * rows without their `created_at`, and a day of answering is already a day the
 * person opened the conversation. Counting it separately would mean widening a
 * port that every chat screen uses, for a day the seen/last-actor pair covers.
 */
const ACTIVITY_SOURCES = ["quiz_completado", "ronda_abierta", "mensaje_enviado", "chat_visto", "ultima_accion_propia"] as const;

/** docs/QUIZZES.md §5.3: three words at most, so the chip never wraps into noise. */
const MAX_NOMBRE_WORDS = 3;
/** docs/QUIZZES.md §5.3: one line of at most 80 characters. */
const MAX_DESCRIPCION_CHARS = 80;

function annotated<T extends z.ZodType>(value: T) {
  return z
    .strictObject({ valor: value, etiqueta: z.enum(PARAM_LABELS), fuente: z.string().min(1) })
    .transform((leaf) => (leaf as unknown as { valor: z.output<T> }).valor);
}

const min = annotated(z.number().int().min(1).max(30));

const condition = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("match_count"), min }),
  z.strictObject({ tipo: z.literal("conversation_complete") }),
  z.strictObject({ tipo: z.literal("round_count"), min }),
  z.strictObject({ tipo: z.literal("chat_free_unlock") }),
  z.strictObject({ tipo: z.literal("active_days"), min }),
  z.strictObject({ tipo: z.literal("quizzes_completados"), min }),
]);

const badge = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    nombre: z.string().trim().min(1),
    descripcion: z.string().trim().min(1),
    icono: z.enum(BADGE_ICONS),
    condicion: condition,
  })
  .refine((b) => b.nombre.split(/\s+/).length <= MAX_NOMBRE_WORDS, `nombre de ${MAX_NOMBRE_WORDS} palabras o menos`)
  .refine((b) => b.descripcion.length <= MAX_DESCRIPCION_CHARS, `descripcion de ${MAX_DESCRIPCION_CHARS} caracteres o menos`);

export const badgesSchema = z
  .strictObject({
    version: z.string().min(1),
    copy: z.strictObject({
      titulo: z.string().trim().min(1).max(40),
      pista_vacia: z.string().trim().min(1).max(120),
      etiqueta_bloqueada: z.string().trim().min(1).max(24),
      etiqueta_desbloqueada: z.string().trim().min(1).max(24),
      nota_derivada: z.string().trim().min(1).max(120),
    }),
    politica: z.strictObject({
      /** Day boundaries are computed in this zone: the calendar of a person, not of the server. */
      zona_horaria: annotated(z.string().min(1)),
      ventana_actividad_dias: annotated(z.number().int().min(7).max(90)),
      tope_mensajes_ventana: annotated(z.number().int().min(50).max(500)),
      fuentes_actividad: z.array(z.enum(ACTIVITY_SOURCES)).length(ACTIVITY_SOURCES.length),
    }),
    insignias: z.array(badge).min(1),
  })
  .refine((c) => new Set(c.insignias.map((b) => b.id)).size === c.insignias.length, "unique badge ids")
  .refine(
    (c) => new Set(c.insignias.map((b) => b.icono)).size === c.insignias.length,
    "two badges cannot share an icon: the grid is read by shape, not by position",
  );

export type BadgesConfig = z.output<typeof badgesSchema>;
export type BadgeConfig = BadgesConfig["insignias"][number];
export type BadgeConditionConfig = BadgeConfig["condicion"];
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const BADGES: Readonly<BadgesConfig> = loadConfig("badges", badgesSchema, raw);
