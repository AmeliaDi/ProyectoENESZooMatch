import { z } from "zod";

import { MATCH_CATEGORY_IDS } from "@/types/matching-config";

import raw from "../../data/chat-prompts.json";
import { loadConfig } from "./load";

/** Longest question text (one idea, readable on a phone card). */
export const MAX_PROMPT_CHARS = 200;
const MAX_VARIANTS = 3;

export const PROMPT_CATEGORIES = [
  "humor",
  "curiosidad",
  "estilo_de_vida",
  "valores",
  "comunicacion",
  "gustos",
  "suenos",
  "campus",
] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];
export type PromptTrack = "romance" | "amistad" | "ambos";
export type PromptLevel = 1 | 2 | 3;

const promptSchema = z.strictObject({
  id: z.string().regex(/^[par][0-9]{3}$/),
  track: z.enum(["romance", "amistad", "ambos"]),
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  categoria: z.enum(PROMPT_CATEGORIES),
  texto: z.string().min(1).max(MAX_PROMPT_CHARS),
  /** Model layers the question leans on; used to prioritise what connects the pair. */
  dimensiones_relacionadas: z.array(z.enum(MATCH_CATEGORY_IDS)).min(1),
  sensible: z.literal(false),
  variantes: z.array(z.string().min(1).max(MAX_PROMPT_CHARS)).max(MAX_VARIANTS),
});

/**
 * Guided question bank (docs/CHAT.md §11). An icebreaker, not an instrument:
 * it never feeds the matching model. Linted by chat-prompts.test.ts.
 */
export const chatPromptsSchema = z
  .strictObject({
    version: z.string().min(1),
    etiqueta: z.literal("supuesto_diseno"),
    fuente: z.string().min(1),
    preguntas: z.array(promptSchema).min(1),
  })
  .refine((bank) => new Set(bank.preguntas.map((p) => p.id)).size === bank.preguntas.length, {
    message: "prompt ids must be unique",
  });

export type ChatPromptBank = z.output<typeof chatPromptsSchema>;
export type ChatPrompt = ChatPromptBank["preguntas"][number];

export const CHAT_PROMPTS = loadConfig("chat-prompts", chatPromptsSchema, raw);
