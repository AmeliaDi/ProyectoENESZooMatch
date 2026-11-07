import { describe, expect, it } from "vitest";

import { calcularCoincidencias, puedeAccederPicante, generarPreguntasSugeridas } from "./quizzes";
import type { QuizDefinition } from "@/config/quizzes";

describe("calcularCoincidencias", () => {
  it("devuelve solo ítems donde ambas respondieron lo mismo", () => {
    const respuestasA = [
      { item_id: "item1", valor: "opcion_a" },
      { item_id: "item2", valor: "opcion_b" },
      { item_id: "item3", valor: "opcion_c" },
    ];
    const respuestasB = [
      { item_id: "item1", valor: "opcion_a" }, // coincide
      { item_id: "item2", valor: "opcion_x" }, // no coincide
      { item_id: "item3", valor: "opcion_c" }, // coincide
    ];

    const coincidencias = calcularCoincidencias(respuestasA, respuestasB);

    expect(coincidencias).toHaveLength(2);
    expect(coincidencias).toEqual([
      { item_id: "item1", valor: "opcion_a" },
      { item_id: "item3", valor: "opcion_c" },
    ]);
  });

  it("excluye respuestas 'no' y 'prefiero_no_decir'", () => {
    const respuestasA = [
      { item_id: "item1", valor: "no" },
      { item_id: "item2", valor: "prefiero_no_decir" },
      { item_id: "item3", valor: "opcion_c" },
    ];
    const respuestasB = [
      { item_id: "item1", valor: "no" }, // ambas dijeron no, pero se excluye
      { item_id: "item2", valor: "prefiero_no_decir" }, // ambas dijeron prefiero_no_decir, pero se excluye
      { item_id: "item3", valor: "opcion_c" }, // coincide y no es excluyente
    ];

    const coincidencias = calcularCoincidencias(respuestasA, respuestasB);

    expect(coincidencias).toHaveLength(1);
    expect(coincidencias[0]).toEqual({ item_id: "item3", valor: "opcion_c" });
  });

  it("devuelve array vacío si no hay coincidencias", () => {
    const respuestasA = [{ item_id: "item1", valor: "opcion_a" }];
    const respuestasB = [{ item_id: "item1", valor: "opcion_b" }];

    const coincidencias = calcularCoincidencias(respuestasA, respuestasB);

    expect(coincidencias).toHaveLength(0);
  });
});

describe("puedeAccederPicante", () => {
  it("requiere consentimiento y mayoría de edad", () => {
    expect(puedeAccederPicante(null)).toBe(false);
    expect(
      puedeAccederPicante({ mayor_de_edad: false, consentimiento_en: new Date(), track_romance_activo: true }),
    ).toBe(false);
  });

  it("permite acceso cuando hay consentimiento y es mayor de edad", () => {
    expect(
      puedeAccederPicante({ mayor_de_edad: true, consentimiento_en: new Date(), track_romance_activo: true }),
    ).toBe(true);
    expect(
      puedeAccederPicante({ mayor_de_edad: true, consentimiento_en: new Date(), track_romance_activo: false }),
    ).toBe(true);
  });
});

describe("generarPreguntasSugeridas", () => {
  it("genera preguntas basadas en las coincidencias", () => {
    const quiz: QuizDefinition = {
      quiz_id: "gustos_musica",
      revision: "1",
      categoria: "gustos",
      titulo: "Tu vibra musical",
      descripcion: "Descubre cómo te mueves con la música.",
      duracion_estimada_minutos: 2,
      items: [
        {
          item_id: "genero_favorito",
          texto: "¿Qué género musical te acompaña más?",
          opciones: ["Pop", "Rock"],
          multiple: true,
          dimensiones_relacionadas: ["estilo"],
        },
      ],
    };

    const coincidencias = [{ item_id: "genero_favorito", valor: "Rock" }];

    const preguntas = generarPreguntasSugeridas(quiz, coincidencias);

    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain("Rock");
    expect(preguntas[0]).toContain("artista");
  });

  it("limita a máximo 3 preguntas sugeridas", () => {
    const quiz: QuizDefinition = {
      quiz_id: "gustos_musica",
      revision: "1",
      categoria: "gustos",
      titulo: "Tu vibra musical",
      descripcion: "Descubre cómo te mueves con la música.",
      duracion_estimada_minutos: 2,
      items: Array.from({ length: 10 }, (_, i) => ({
        item_id: `item${i}`,
        texto: `Pregunta ${i}`,
        opciones: ["Opción A", "Opción B"],
        multiple: false,
        dimensiones_relacionadas: [],
      })),
    };

    const coincidencias = Array.from({ length: 10 }, (_, i) => ({
      item_id: `item${i}`,
      valor: "Opción A",
    }));

    const preguntas = generarPreguntasSugeridas(quiz, coincidencias);

    expect(preguntas.length).toBeLessThanOrEqual(3);
  });
});
