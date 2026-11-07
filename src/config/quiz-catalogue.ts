import gustosData from "@/../data/quizzes/gustos.json";
import gamingData from "@/../data/quizzes/gaming.json";
import picanteData from "@/../data/quizzes/picante.json";
import { gustosSchema, gamingSchema, picanteSchema, type QuizDefinition } from "@/config/quizzes";

export type QuizCategory = "gustos" | "gaming" | "picante";

export interface QuizCatalogue {
  gustos: QuizDefinition[];
  gaming: QuizDefinition[];
  picante: QuizDefinition[];
}

const parsed = {
  gustos: gustosSchema.parse(gustosData),
  gaming: gamingSchema.parse(gamingData),
  picante: picanteSchema.parse(picanteData),
};

export const QUIZ_CATALOGUE: QuizCatalogue = {
  gustos: parsed.gustos.quizzes,
  gaming: parsed.gaming.quizzes,
  picante: parsed.picante.quizzes,
};

export const ALL_QUIZZES: QuizDefinition[] = [
  ...QUIZ_CATALOGUE.gustos,
  ...QUIZ_CATALOGUE.gaming,
  ...QUIZ_CATALOGUE.picante,
];

export function findQuiz(quizId: string): QuizDefinition | null {
  return ALL_QUIZZES.find((q) => q.quiz_id === quizId) ?? null;
}

export const CATEGORY_META: Record<QuizCategory, { label: string; description: string; icon: string }> = {
  gustos: { label: "Gustos", description: "Música, cine, comida y viajes", icon: "🎵" },
  gaming: { label: "Gaming", description: "Plataformas, géneros y estilo de juego", icon: "🎮" },
  picante: { label: "Picante (18+)", description: "Coqueteo, romance e intimidad", icon: "🌶️" },
};
