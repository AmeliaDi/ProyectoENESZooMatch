import { z } from "zod";

/**
 * Esquemas Zod de los quizzes rompehielos.
 * No alteran el modelo psicométrico: son una capa aparte de diversión,
 * coincidencias y conversación, con visibilidad privada por defecto.
 */

/** En este orden se muestran en el hub: el 18+ hasta el final. */
export const QUIZ_CATEGORIES = ["gustos", "gaming", "vida", "conexion", "picante"] as const;

export type QuizCategory = (typeof QUIZ_CATEGORIES)[number];

/**
 * Opción de salida que cierra TODA lista de opciones. Es la etiqueta visible;
 * al guardarse se convierte en `OPT_OUT_VALOR`, que es lo que la base ya filtra
 * para que nadie coincida en algo que prefirió no decir.
 */
export const OPT_OUT_LABEL = "Prefiero no decir";
export const OPT_OUT_VALOR = "prefiero_no_decir";

const quizItemSchema = z
  .object({
    item_id: z.string().min(1),
    texto: z.string().min(1),
    opciones: z.array(z.string().min(1)).min(2),
    multiple: z.boolean().default(false),
    dimensiones_relacionadas: z.array(z.string()).default([]),
    direccion: z.enum(["A", "V"]).optional(), // A = aventurero, V = vanilla (solo Picante)
    seguridad: z.boolean().optional(), // banderas de seguridad (solo Picante)
  })
  .refine((item) => item.opciones.at(-1) === OPT_OUT_LABEL, {
    message: `la última opción debe ser exactamente "${OPT_OUT_LABEL}"`,
    path: ["opciones"],
  });

const quizDefinitionSchema = z.object({
  quiz_id: z.string().min(1),
  revision: z.string().min(1),
  categoria: z.enum(QUIZ_CATEGORIES),
  nivel: z.number().int().min(1).max(2).optional(), // solo para Picante
  titulo: z.string().min(1),
  descripcion: z.string().min(1),
  duracion_estimada_minutos: z.number().positive(),
  resultado_personal: z.boolean().optional(), // true = no genera coincidencias (Picante vanilla)
  items: z.array(quizItemSchema).min(1),
});

/** Un archivo `data/quizzes/<categoria>.json`: envoltura fija + quizzes de una sola categoría. */
function quizFileSchema<T extends QuizCategory>(categoria: T) {
  return z.object({
    version: z.string(),
    etiqueta: z.string(),
    fuente: z.string(),
    quizzes: z.array(quizDefinitionSchema.extend({ categoria: z.literal(categoria) })).min(1),
  });
}

export const gustosSchema = quizFileSchema("gustos");
export const gamingSchema = quizFileSchema("gaming");
export const vidaSchema = quizFileSchema("vida");
export const conexionSchema = quizFileSchema("conexion");

/** Picante exige `nivel` declarado en cada quiz: el nivel 2 trae segunda confirmación. */
export const picanteSchema = z.object({
  version: z.string(),
  etiqueta: z.string(),
  fuente: z.string(),
  quizzes: z
    .array(quizDefinitionSchema.extend({ categoria: z.literal("picante"), nivel: z.number().int().min(1).max(2) }))
    .min(1),
});

export const QUIZ_FILE_SCHEMAS = {
  gustos: gustosSchema,
  gaming: gamingSchema,
  picante: picanteSchema,
  vida: vidaSchema,
  conexion: conexionSchema,
} as const satisfies Record<QuizCategory, z.ZodTypeAny>;

export type QuizItem = z.infer<typeof quizItemSchema>;
export type QuizDefinition = z.infer<typeof quizDefinitionSchema>;
export type GustosConfig = z.infer<typeof gustosSchema>;
export type GamingConfig = z.infer<typeof gamingSchema>;
export type PicanteConfig = z.infer<typeof picanteSchema>;
export type VidaConfig = z.infer<typeof vidaSchema>;
export type ConexionConfig = z.infer<typeof conexionSchema>;
