import { z } from "zod";

/**
 * Esquemas Zod para los quizzes rompehielos (Gustos, Gaming, Picante).
 * No alteran el modelo psicométrico; son una capa aparte de diversión.
 */

const quizItemSchema = z.object({
  item_id: z.string().min(1),
  texto: z.string().min(1),
  opciones: z.array(z.string().min(1)).min(1),
  multiple: z.boolean().default(false),
  dimensiones_relacionadas: z.array(z.string()).default([]),
  direccion: z.enum(["A", "V"]).optional(), // A = aventurero, V = vanilla (solo quiz 3)
  seguridad: z.boolean().optional(), // banderas de seguridad (solo quiz 4)
});

const quizDefinitionSchema = z.object({
  quiz_id: z.string().min(1),
  revision: z.string().min(1),
  categoria: z.enum(["gustos", "gaming", "picante"]),
  nivel: z.number().int().min(1).max(2).optional(), // solo para Picante
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
  duracion_estimada_minutos: z.number().positive(),
  resultado_personal: z.boolean().optional(), // true = no genera coincidencias (quiz 3)
  items: z.array(quizItemSchema).min(1),
});

export const gustosSchema = z.object({
  version: z.string(),
  etiqueta: z.string(),
  fuente: z.string(),
  quizzes: z.array(quizDefinitionSchema.extend({ categoria: z.literal("gustos") })).min(1),
});

export const gamingSchema = z.object({
  version: z.string(),
  etiqueta: z.string(),
  fuente: z.string(),
  quizzes: z.array(quizDefinitionSchema.extend({ categoria: z.literal("gaming") })).min(1),
});

export const picanteSchema = z.object({
  version: z.string(),
  etiqueta: z.string(),
  fuente: z.string(),
  quizzes: z.array(quizDefinitionSchema.extend({ categoria: z.literal("picante"), nivel: z.number().int().min(1).max(2) })).min(1),
});

export type QuizItem = z.infer<typeof quizItemSchema>;
export type QuizDefinition = z.infer<typeof quizDefinitionSchema>;
export type GustosConfig = z.infer<typeof gustosSchema>;
export type GamingConfig = z.infer<typeof gamingSchema>;
export type PicanteConfig = z.infer<typeof picanteSchema>;
