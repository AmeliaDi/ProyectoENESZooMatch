import { z } from "zod";

import {
  ALL_DIMENSIONS,
  type Category,
  type Dimension,
  type HardFilterField,
  type QuizItem,
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
    id: z.string().regex(/^[A-Z]{2}\d{2}$/),
    categoria: z.enum(CATEGORIES),
    subcategoria: z.string().min(1),
    texto: z.string().min(1),
    tipo_respuesta: z.enum(["likert_5", "seleccion_multiple"]),
    opciones: z.array(z.string().min(1)).nonempty().optional(),
    polaridad: z.enum(["positiva", "negativa"]).nullable(),
    pesos: z.partialRecord(dimension, z.union([z.literal(1), z.literal(-1)])),
    campo_perfil: z.enum(HARD_FILTER_FIELDS).optional(),
    track_romance: z.boolean(),
    track_amistad: z.boolean(),
    filtro_duro: z.boolean(),
    fuente_id: z.string().min(1),
  })
  .refine(
    (item) =>
      item.filtro_duro
        ? item.tipo_respuesta === "seleccion_multiple" &&
          item.opciones !== undefined &&
          item.campo_perfil !== undefined
        : item.tipo_respuesta === "likert_5" && Object.keys(item.pesos).length > 0,
    "hard filters need options + campo_perfil; Likert items need at least one weight",
  )
  .transform((item): QuizItem => {
    const { opciones, campo_perfil, ...rest } = item;
    return {
      ...rest,
      ...(opciones !== undefined ? { opciones: [...opciones] } : {}),
      ...(campo_perfil !== undefined ? { campo_perfil } : {}),
    };
  });

export const quizSchema = z
  .object({
    metadatos: z.object({ version: z.string().min(1) }).loose(),
    escala_likert: z
      .array(z.strictObject({ valor: z.number().int().min(1).max(5), etiqueta: z.string().min(1) }))
      .length(5),
    fuentes: z.array(z.object({ id: z.string().min(1), licencia: z.string().min(1) }).loose()),
    items: z.array(itemSchema).nonempty(),
  })
  .loose()
  .superRefine((quiz, ctx) => {
    const ids = new Set<string>();
    const sources = new Set(quiz.fuentes.map((source) => source.id));
    for (const item of quiz.items) {
      if (ids.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate item ${item.id}` });
      ids.add(item.id);
      if (!sources.has(item.fuente_id)) {
        ctx.addIssue({ code: "custom", message: `${item.id}: unknown source ${item.fuente_id}` });
      }
    }
  });

const QUIZ = loadConfig("microtest", quizSchema, raw);

/** Questionnaire items, in presentation order. */
export const QUIZ_ITEMS: readonly QuizItem[] = QUIZ.items;
/** Five-point Likert labels. */
export const LIKERT_SCALE: readonly { valor: number; etiqueta: string }[] = QUIZ.escala_likert;
export const QUIZ_VERSION: string = QUIZ.metadatos.version;
