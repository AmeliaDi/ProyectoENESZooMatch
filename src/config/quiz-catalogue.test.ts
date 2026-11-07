import { describe, expect, it } from "vitest";

import { QUIZ_CATALOGUE, ALL_QUIZZES, findQuiz, CATEGORY_META } from "@/config/quiz-catalogue";

describe("quiz-catalogue", () => {
  it("loads all three categories from JSON", () => {
    expect(QUIZ_CATALOGUE.gustos.length).toBe(4);
    expect(QUIZ_CATALOGUE.gaming.length).toBe(4);
    expect(QUIZ_CATALOGUE.picante.length).toBe(4);
  });

  it("ALL_QUIZZES contains all quizzes from all categories", () => {
    const total = QUIZ_CATALOGUE.gustos.length + QUIZ_CATALOGUE.gaming.length + QUIZ_CATALOGUE.picante.length;
    expect(ALL_QUIZZES.length).toBe(total);
  });

  it("findQuiz returns the correct quiz by id", () => {
    const quiz = findQuiz("gustos_musica");
    expect(quiz).not.toBeNull();
    expect(quiz?.quiz_id).toBe("gustos_musica");
    expect(quiz?.categoria).toBe("gustos");
  });

  it("findQuiz returns null for unknown quiz id", () => {
    const quiz = findQuiz("nonexistent_quiz");
    expect(quiz).toBeNull();
  });

  it("every quiz has required fields", () => {
    for (const quiz of ALL_QUIZZES) {
      expect(quiz.quiz_id).toBeTruthy();
      expect(quiz.revision).toBeTruthy();
      expect(quiz.categoria).toMatch(/^(gustos|gaming|picante)$/);
      expect(quiz.titulo).toBeTruthy();
      expect(quiz.descripcion).toBeTruthy();
      expect(quiz.duracion_estimada_minutos).toBeGreaterThan(0);
      expect(quiz.items.length).toBeGreaterThan(0);
    }
  });

  it("every item has required fields", () => {
    for (const quiz of ALL_QUIZZES) {
      for (const item of quiz.items) {
        expect(item.item_id).toBeTruthy();
        expect(item.texto).toBeTruthy();
        expect(item.opciones.length).toBeGreaterThan(0);
        expect(typeof item.multiple).toBe("boolean");
      }
    }
  });

  it("Picante quizzes have a nivel field", () => {
    for (const quiz of QUIZ_CATALOGUE.picante) {
      expect(quiz.nivel).toBeDefined();
      expect([1, 2]).toContain(quiz.nivel);
    }
  });

  it("CATEGORY_META has entries for all categories", () => {
    expect(CATEGORY_META.gustos).toBeDefined();
    expect(CATEGORY_META.gaming).toBeDefined();
    expect(CATEGORY_META.picante).toBeDefined();
  });
});
