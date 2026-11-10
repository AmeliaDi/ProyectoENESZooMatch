import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_QUIZZES,
  CATEGORY_META,
  QUIZ_CATALOGUE,
  QUIZ_CATEGORIES,
  findQuiz,
} from "@/config/quiz-catalogue";
import { OPT_OUT_LABEL } from "@/config/quizzes";

/** Cuántos quizzes tiene cada categoría: se toca a propósito, no de rebote. */
const ESPERADO: Record<(typeof QUIZ_CATEGORIES)[number], number> = {
  gustos: 4,
  gaming: 4,
  vida: 3,
  conexion: 3,
  picante: 4,
};

describe("quiz-catalogue", () => {
  it("loads every category from JSON", () => {
    for (const category of QUIZ_CATEGORIES) {
      expect(QUIZ_CATALOGUE[category], category).toHaveLength(ESPERADO[category]);
    }
  });

  it("declares where each set came from and points at a section that exists", () => {
    const doc = readFileSync(resolve(process.cwd(), "docs/QUIZZES.md"), "utf8");
    const secciones = new Set(
      [...doc.matchAll(/^#{2,3} (\d+(?:\.\d+)?)\.? /gm)].map((m) => m[1]!),
    );

    for (const categoria of QUIZ_CATEGORIES) {
      const archivo = JSON.parse(
        readFileSync(resolve(process.cwd(), `data/quizzes/${categoria}.json`), "utf8"),
      ) as { etiqueta?: string; fuente?: string };
      expect(archivo.etiqueta, categoria).toBe("supuesto_diseno");
      const cita = /docs\/QUIZZES\.md §(\d+(?:\.\d+)?)/.exec(archivo.fuente ?? "");
      expect(cita, `${categoria} no cita docs/QUIZZES.md`).not.toBeNull();
      expect(secciones.has(cita![1]!), `${categoria} cita §${cita![1]} y esa sección no existe`).toBe(true);
    }
  });

  it("ALL_QUIZZES contains all quizzes from all categories", () => {
    const total = QUIZ_CATEGORIES.reduce((sum, c) => sum + QUIZ_CATALOGUE[c].length, 0);
    expect(ALL_QUIZZES).toHaveLength(total);
  });

  it("findQuiz returns the correct quiz by id", () => {
    const quiz = findQuiz("gustos_musica");
    expect(quiz).not.toBeNull();
    expect(quiz?.quiz_id).toBe("gustos_musica");
    expect(quiz?.categoria).toBe("gustos");
  });

  it("findQuiz returns null for unknown quiz id", () => {
    expect(findQuiz("nonexistent_quiz")).toBeNull();
  });

  it("every quiz declares the category its file belongs to", () => {
    for (const quiz of ALL_QUIZZES) {
      expect(quiz.quiz_id.startsWith(`${quiz.categoria}_`), quiz.quiz_id).toBe(true);
      expect(quiz.revision).toBeTruthy();
      expect(quiz.titulo).toBeTruthy();
      expect(quiz.descripcion).toBeTruthy();
      expect(quiz.duracion_estimada_minutos).toBeGreaterThan(0);
      expect(quiz.items.length).toBeGreaterThan(0);
    }
  });

  it("no quiz id repeats across categories", () => {
    const ids = ALL_QUIZZES.map((quiz) => quiz.quiz_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item ends with the way out", () => {
    for (const quiz of ALL_QUIZZES) {
      for (const item of quiz.items) {
        expect(item.opciones.at(-1), `${quiz.quiz_id}/${item.item_id}`).toBe(OPT_OUT_LABEL);
        expect(item.texto).toBeTruthy();
        expect(item.opciones.length).toBeGreaterThan(1);
        expect(typeof item.multiple).toBe("boolean");
      }
    }
  });

  it("the icebreaker sets stay short: 8 to 10 items and under two minutes", () => {
    for (const category of ["vida", "conexion"] as const) {
      for (const quiz of QUIZ_CATALOGUE[category]) {
        expect(quiz.items.length, quiz.quiz_id).toBeGreaterThanOrEqual(8);
        expect(quiz.items.length, quiz.quiz_id).toBeLessThanOrEqual(10);
        expect(quiz.duracion_estimada_minutos, quiz.quiz_id).toBeLessThanOrEqual(2);
      }
    }
  });

  it("titles are five words at most and carry no final period", () => {
    for (const quiz of ALL_QUIZZES) {
      expect(quiz.titulo.split(/\s+/).length, quiz.quiz_id).toBeLessThanOrEqual(5);
      expect(quiz.titulo.endsWith("."), quiz.quiz_id).toBe(false);
    }
  });

  it("no quiz text carries an emoji or a legacy icon", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const quiz of ALL_QUIZZES) {
      const blob = `${quiz.titulo} ${quiz.descripcion} ${quiz.items
        .map((item) => `${item.texto} ${item.opciones.join(" ")}`)
        .join(" ")}`;
      expect(emoji.test(blob), quiz.quiz_id).toBe(false);
    }
    for (const meta of Object.values(CATEGORY_META)) {
      expect(emoji.test(`${meta.label} ${meta.description}`), meta.label).toBe(false);
    }
  });

  it("Picante quizzes have a nivel field", () => {
    for (const quiz of QUIZ_CATALOGUE.picante) {
      expect(quiz.nivel).toBeDefined();
      expect([1, 2]).toContain(quiz.nivel);
    }
  });

  it("CATEGORY_META covers every category and is shown in catalogue order", () => {
    expect(Object.keys(CATEGORY_META).sort()).toEqual([...QUIZ_CATEGORIES].sort());
    for (const category of QUIZ_CATEGORIES) {
      expect(CATEGORY_META[category].label, category).toBeTruthy();
      expect(CATEGORY_META[category].description, category).toBeTruthy();
    }
  });

  it("every item id is unique inside its quiz", () => {
    for (const quiz of ALL_QUIZZES) {
      const ids = quiz.items.map((item) => item.item_id);
      expect(new Set(ids).size, quiz.quiz_id).toBe(ids.length);
    }
  });
});
