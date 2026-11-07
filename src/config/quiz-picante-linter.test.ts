import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { picanteSchema } from "@/config/quizzes";

/**
 * Linter de contenido para el set picante (18+).
 * Verifica que los ítems cumplan los guardarraíles:
 * - No hay términos explícitos o prohibidos
 * - Nivel 2 requiere segunda confirmación (documentado en el quiz)
 * - Tono sugerente pero respetuoso, sin descripciones gráficas
 * - Todas las opciones incluyen "Prefiero no decir"
 */

const FORBIDDEN_TERMS = [
  // Términos explícitos que nunca deben aparecer
  // Nota: "ano" se busca como palabra completa para evitar falsos positivos con "mano"
  "sexo", "sexual", "orgasmo", "erección", "vagina", "pene", "\\bano\\b",
  "pornografía", "porno", "desnudo", "desnuda",
  "violación", "abuso", "coerción", "presión",
  "menor", "adolescente", "niñ", // cualquier referencia a menores
  "droga", "alcohol", "sustancia",
  "sangre", "dolor", "daño", "herida",
  "humillación", "vergüenza", "degradación",
  "raza", "etnia", "discapacidad", // fetichización
  "foto", "selfie", "imagen íntima", // presión para compartir
];

const REQUIRED_OPTIONS = ["Prefiero no decir"];

describe("picante content linter", () => {
  const picantePath = resolve(process.cwd(), "data/quizzes/picante.json");
  const raw = JSON.parse(readFileSync(picantePath, "utf8"));
  const parsed = picanteSchema.parse(raw);

  it("no contiene términos prohibidos en textos u opciones", () => {
    for (const quiz of parsed.quizzes) {
      for (const item of quiz.items) {
        const text = `${item.texto} ${item.opciones.join(" ")}`.toLowerCase();
        for (const term of FORBIDDEN_TERMS) {
          // Usar regex para términos con \b (word boundary)
          if (term.includes("\\b")) {
            const regex = new RegExp(term, "i");
            expect(text, `Ítem ${item.item_id} en quiz ${quiz.quiz_id} contiene término prohibido: "${term}"`).not.toMatch(regex);
          } else {
            expect(text, `Ítem ${item.item_id} en quiz ${quiz.quiz_id} contiene término prohibido: "${term}"`).not.toContain(term);
          }
        }
      }
    }
  });

  it("todas las opciones incluyen 'Prefiero no decir'", () => {
    for (const quiz of parsed.quizzes) {
      for (const item of quiz.items) {
        const hasOptOut = item.opciones.some((opt) => REQUIRED_OPTIONS.some((req) => opt.toLowerCase().includes(req.toLowerCase())));
        expect(hasOptOut, `Ítem ${item.item_id} en quiz ${quiz.quiz_id} no incluye opción de salida`).toBe(true);
      }
    }
  });

  it("nivel 2 existe y está documentado como requiriendo segunda confirmación", () => {
    const nivel2 = parsed.quizzes.find((q) => q.nivel === 2);
    expect(nivel2, "Debe existir un quiz de nivel 2").toBeDefined();
    expect(nivel2?.descripcion, "El nivel 2 debe mencionar que requiere segunda confirmación").toMatch(/segunda confirmación|confirmación independiente/i);
  });

  it("los textos tienen tono cálido y respetuoso, sin descripciones gráficas", () => {
    for (const quiz of parsed.quizzes) {
      for (const item of quiz.items) {
        // Verificar que no hay descripciones de actos, cuerpos o fluidos
        const text = item.texto.toLowerCase();
        expect(text, `Ítem ${item.item_id} tiene texto demasiado explícito`).not.toMatch(/cuerpo|acto|posición|fluido|penetración/);
      }
    }
  });

  it("no hay duplicación con el banco de preguntas del chat", () => {
    // Este test se asegura de que las preguntas de picante no repitan las de chat-prompts.json
    const chatPromptsPath = resolve(process.cwd(), "data/chat-prompts.json");
    const chatPrompts = JSON.parse(readFileSync(chatPromptsPath, "utf8"));
    const chatTexts = new Set(chatPrompts.preguntas.map((p: { texto: string }) => p.texto.toLowerCase()));

    for (const quiz of parsed.quizzes) {
      for (const item of quiz.items) {
        expect(chatTexts.has(item.texto.toLowerCase()), `Ítem ${item.item_id} duplica una pregunta del chat`).toBe(false);
      }
    }
  });

  it("las dimensiones relacionadas no incluyen dimensiones del modelo psicométrico", () => {
    // Los quizzes no deben alterar el matching, así que no deben referenciar dimensiones psicométricas
    const PSYCHOMETRIC_DIMENSIONS = ["hexaco", "big_five", "mbti", "enneagram", "apego", "valores"];
    for (const quiz of parsed.quizzes) {
      for (const item of quiz.items) {
        for (const dim of item.dimensiones_relacionadas) {
          expect(PSYCHOMETRIC_DIMENSIONS.some((psy) => dim.toLowerCase().includes(psy)), `Ítem ${item.item_id} referencia dimensión psicométrica: ${dim}`).toBe(false);
        }
      }
    }
  });
});
