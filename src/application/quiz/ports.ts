import type { QuizAnswer, QuizCoincidencia, SharingLevel } from "@/domain/quiz/quizzes";

/**
 * Puertos del dominio de quizzes.
 * Definen las operaciones que la infraestructura debe implementar.
 */

export interface QuizRepository {
  // Respuestas
  saveAnswer(personaId: string, quizId: string, itemId: string, valor: string): Promise<void>;
  saveAnswers(personaId: string, quizId: string, answers: readonly QuizAnswer[]): Promise<void>;
  getAnswers(personaId: string, quizId: string): Promise<QuizAnswer[]>;
  deleteAnswers(personaId: string, quizId: string | null): Promise<void>;

  // Intentos
  markCompleted(personaId: string, quizId: string, revision: string): Promise<void>;
  getAttempts(personaId: string): Promise<Array<{ quiz_id: string; revision: string; completado_en: Date }>>;

  // Visibilidad
  setSharing(personaId: string, quizId: string, nivel: SharingLevel): Promise<void>;
  getSharing(personaId: string, quizId: string): Promise<SharingLevel | null>;

  // Coincidencias
  getCoincidencias(yoId: string, otraPersonaId: string, quizId: string): Promise<QuizCoincidencia[]>;
  checkMatch(personaIdA: string, personaIdB: string): Promise<boolean>;

  // Picante
  savePicanteConsent(
    personaId: string,
    mayorDeEdad: boolean,
    trackRomanceActivo: boolean,
  ): Promise<void>;
  getPicanteConsent(
    personaId: string,
  ): Promise<{ mayor_de_edad: boolean; consentimiento_en: Date; track_romance_activo: boolean } | null>;
}

export interface QuizContext {
  personaId: string;
  tieneIdentidad: boolean;
}
