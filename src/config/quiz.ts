import { z } from "zod";

import {
  ALL_DIMENSIONS,
  ITEM_FLAGS,
  ITEM_ORIGINS,
  QUIZ_MODULE_IDS,
  type Category,
  type Dimension,
  type HardFilterField,
  type QuizItem,
  type QuizModuleId,
} from "@/types/microtest";

import raw from "../../data/microtest.json";
import { loadConfig } from "./load";

const CATEGORIES = [
  "personalidad_bigfive",
  "personalidad_mbti",
  "identidad_filtros",
  "afinidad_cultural",
  "intimidad_afecto",
  "valores_relacionales",
] as const satisfies readonly Category[];

const HARD_FILTER_FIELDS = [
  "orientacion_sexual",
  "identidad_genero",
  "tipo_relacion_busca",
] as const satisfies readonly HardFilterField[];

const dimension = z.enum(ALL_DIMENSIONS as [Dimension, ...Dimension[]]);

const itemSchema = z
  .strictObject({
    id: z.string().regex(/^[A-Z]{1,3}\d{1,2}$/),
    categoria: z.enum(CATEGORIES),
    subcategoria: z.string().min(1),
    texto: z.string().min(1).max(140),
    tipo_respuesta: z.enum(["likert_5", "seleccion_multiple"]),
    opciones: z.array(z.string().min(1)).nonempty().optional(),
    polaridad: z.enum(["positiva", "negativa"]).nullable(),
    pesos: z.partialRecord(dimension, z.union([z.literal(1), z.literal(-1)])),
    campo_perfil: z.enum(HARD_FILTER_FIELDS).optional(),
    track_romance: z.boolean(),
    track_amistad: z.boolean(),
    filtro_duro: z.boolean(),
    fuente_id: z.string().min(1),
    modulo: z.enum(QUIZ_MODULE_IDS),
    capa: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    factor: z.string().min(1),
    faceta: z.string().min(1).optional(),
    origen: z.enum(ITEM_ORIGINS),
    banderas: z.array(z.enum(ITEM_FLAGS)),
  })
  .refine(
    (item) =>
      item.filtro_duro
        ? item.tipo_respuesta === "seleccion_multiple" &&
          item.opciones !== undefined &&
          item.campo_perfil !== undefined &&
          item.capa === 0
        : item.tipo_respuesta === "likert_5" && item.polaridad !== null && item.capa > 0,
    "hard filters need options + campo_perfil (layer 0); Likert items need a polarity (layer > 0)",
  )
  .transform((item): QuizItem => {
    const { opciones, campo_perfil, faceta, ...rest } = item;
    return {
      ...rest,
      banderas: [...item.banderas],
      ...(opciones !== undefined ? { opciones: [...opciones] } : {}),
      ...(campo_perfil !== undefined ? { campo_perfil } : {}),
      ...(faceta !== undefined ? { faceta } : {}),
    };
  });

const moduleSchema = z.strictObject({
  id: z.enum(QUIZ_MODULE_IDS),
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
});

export const quizSchema = z
  .object({
    metadatos: z.object({ version: z.string().min(1) }).loose(),
    escala_likert: z
      .array(z.strictObject({ valor: z.number().int().min(1).max(5), etiqueta: z.string().min(1) }))
      .length(5),
    modulos: z.array(moduleSchema).nonempty(),
    fuentes: z.array(z.object({ id: z.string().min(1), licencia: z.string().min(1) }).loose()),
    items: z.array(itemSchema).nonempty(),
  })
  .loose()
  .superRefine((quiz, ctx) => {
    const ids = new Set<string>();
    const sources = new Set(quiz.fuentes.map((source) => source.id));
    const modules = new Set(quiz.modulos.map((module) => module.id));
    for (const item of quiz.items) {
      if (ids.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate item ${item.id}` });
      ids.add(item.id);
      if (!sources.has(item.fuente_id)) {
        ctx.addIssue({ code: "custom", message: `${item.id}: unknown source ${item.fuente_id}` });
      }
      if (!modules.has(item.modulo)) {
        ctx.addIssue({ code: "custom", message: `${item.id}: undeclared module ${item.modulo}` });
      }
      if (item.filtro_duro && item.modulo !== "nucleo") {
        ctx.addIssue({ code: "custom", message: `${item.id}: hard filters belong to the core` });
      }
    }
  });

const QUIZ = loadConfig("microtest", quizSchema, raw);

/** Every questionnaire item: core first (presentation order), then optional modules. */
export const QUIZ_ITEMS: readonly QuizItem[] = QUIZ.items;
/** Mandatory core items, in presentation order. */
export const CORE_ITEMS: readonly QuizItem[] = QUIZ.items.filter((item) => item.modulo === "nucleo");
/** Optional deepening modules ("¿quieres afinar tu perfil?"), excluding the core. */
export const QUIZ_MODULES: readonly { id: QuizModuleId; titulo: string; descripcion: string }[] =
  QUIZ.modulos.filter((module) => module.id !== "nucleo");
/** Five-point Likert labels. */
export const LIKERT_SCALE: readonly { valor: number; etiqueta: string }[] = QUIZ.escala_likert;
export const QUIZ_VERSION: string = QUIZ.metadatos.version;

/** True when a core Likert item may be skipped ("prefiero no decir", ADR-016). */
export function isSkippableItem(item: QuizItem): boolean {
  return item.tipo_respuesta === "likert_5" && item.banderas.includes("SENS");
}
