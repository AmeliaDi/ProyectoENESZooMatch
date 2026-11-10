import gustosData from "@/../data/quizzes/gustos.json";
import gamingData from "@/../data/quizzes/gaming.json";
import picanteData from "@/../data/quizzes/picante.json";
import vidaData from "@/../data/quizzes/vida.json";
import conexionData from "@/../data/quizzes/conexion.json";
import {
  QUIZ_CATEGORIES,
  QUIZ_FILE_SCHEMAS,
  type QuizCategory,
  type QuizDefinition,
} from "@/config/quizzes";

export type { QuizCategory };
export { QUIZ_CATEGORIES };

export type QuizCatalogue = Record<QuizCategory, QuizDefinition[]>;

const RAW: Record<QuizCategory, unknown> = {
  gustos: gustosData,
  gaming: gamingData,
  picante: picanteData,
  vida: vidaData,
  conexion: conexionData,
};

/** Se recorre en el orden declarado: así una categoría sin schema o sin archivo revienta al cargar. */
export const QUIZ_CATALOGUE: QuizCatalogue = Object.fromEntries(
  QUIZ_CATEGORIES.map((categoria) => [
    categoria,
    QUIZ_FILE_SCHEMAS[categoria].parse(RAW[categoria]).quizzes as QuizDefinition[],
  ]),
) as QuizCatalogue;

export const ALL_QUIZZES: QuizDefinition[] = QUIZ_CATEGORIES.flatMap(
  (categoria) => QUIZ_CATALOGUE[categoria],
);

export function findQuiz(quizId: string): QuizDefinition | null {
  return ALL_QUIZZES.find((q) => q.quiz_id === quizId) ?? null;
}

export interface QuizCategoryMeta {
  label: string;
  description: string;
  /** Icono pixel: la guía de tono prohíbe emojis en la interfaz. */
  icon: "quiz";
}

export const CATEGORY_META: Record<QuizCategory, QuizCategoryMeta> = {
  gustos: { label: "Gustos", description: "Música, cine, comida y viajes", icon: "quiz" },
  gaming: { label: "Gaming", description: "Plataformas, géneros y estilo de juego", icon: "quiz" },
  picante: { label: "Picante (18+)", description: "Coqueteo, romance e intimidad", icon: "quiz" },
  vida: { label: "Vida y planes", description: "Fin de semana, campus y humor", icon: "quiz" },
  conexion: { label: "Cómo te vinculas", description: "Novedad, cuidado y dilemas ligeros", icon: "quiz" },
};
