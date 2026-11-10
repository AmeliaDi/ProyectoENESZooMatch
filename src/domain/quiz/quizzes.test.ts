import { describe, expect, it } from "vitest";

import { CHAT_PROMPTS } from "@/config/chat-prompts";
import { OPT_OUT_LABEL, OPT_OUT_VALOR, type QuizDefinition, type QuizItem } from "@/config/quizzes";
import { ALL_QUIZZES } from "@/config/quiz-catalogue";
import {
  calcularCoincidencias,
  esOptOut,
  explicarCoincidencia,
  generarPreguntasSugeridas,
  MAX_PREGUNTAS_SUGERIDAS,
  otraPersonaDeConversacion,
  puedeAccederPicante,
  puedeCompartirPicante,
  valorGuardable,
  valorValido,
} from "./quizzes";

function item(item_id: string, opciones: readonly string[], extra: Partial<QuizItem> = {}): QuizItem {
  return {
    item_id,
    texto: `¿Qué dice el ítem ${item_id}?`,
    opciones: [...opciones, OPT_OUT_LABEL],
    multiple: false,
    dimensiones_relacionadas: ["estilo"],
    ...extra,
  };
}

function quiz(
  quiz_id: string,
  items: readonly QuizItem[],
  categoria: QuizDefinition["categoria"] = "gustos",
): QuizDefinition {
  return {
    quiz_id,
    revision: "1",
    categoria,
    titulo: "Un quiz de prueba",
    descripcion: "Solo para el test.",
    duracion_estimada_minutos: 1,
    items: [...items],
  };
}

describe("esOptOut", () => {
  it("reconoce el centinela, la etiqueta visible y el «no» en cualquier mayúscula", () => {
    expect(esOptOut(OPT_OUT_VALOR)).toBe(true);
    expect(esOptOut(OPT_OUT_LABEL)).toBe(true);
    expect(esOptOut("prefiero no decir")).toBe(true);
    expect(esOptOut("No")).toBe(true);
    expect(esOptOut("  no  ")).toBe(true);
  });

  it("no confunde una opción real que empieza con no", () => {
    expect(esOptOut("Nintendo Switch")).toBe(false);
    expect(esOptOut("No monogamia ética")).toBe(false);
    expect(esOptOut("Sí")).toBe(false);
  });
});

describe("valorGuardable", () => {
  it("guarda el centinela cuando se eligió la etiqueta visible", () => {
    expect(valorGuardable(item("plataforma", ["PC", "Consola"]), [OPT_OUT_LABEL])).toBe(OPT_OUT_VALOR);
  });

  it("rechaza lo que el ítem no declara y el vacío", () => {
    const plataforma = item("plataforma", ["PC", "Consola"]);
    expect(valorGuardable(plataforma, ["Vapor"])).toBeNull();
    expect(valorGuardable(plataforma, [])).toBeNull();
  });

  it("deja la selección simple sin separador, para no romper los renglones existentes", () => {
    expect(valorGuardable(item("plataforma", ["PC", "Consola"]), ["PC"])).toBe("PC");
  });

  it("ordena y deduplica las de un ítem múltiple", () => {
    const genero = item("genero_favorito", ["Rock", "Pop", "Regional"], { multiple: true });
    expect(valorGuardable(genero, ["Rock", "Pop"])).toBe("Pop; Rock");
    expect(valorGuardable(genero, ["Pop", "Pop"])).toBe("Pop");
  });

  it("no permite dos valores en un ítem de una sola respuesta", () => {
    expect(valorGuardable(item("ritmo", ["Mañana", "Noche"]), ["Mañana", "Noche"])).toBeNull();
  });

  it("el opt-out gana aunque venga mezclado con opciones", () => {
    const genero = item("genero_favorito", ["Rock", "Pop"], { multiple: true });
    expect(valorGuardable(genero, ["Rock", OPT_OUT_LABEL])).toBe(OPT_OUT_VALOR);
  });
});

describe("valorValido", () => {
  it("revalida lo que valorGuardable produjo", () => {
    const genero = item("genero_favorito", ["Rock", "Pop"], { multiple: true });
    expect(valorValido(genero, "Pop; Rock")).toBe(true);
    expect(valorValido(genero, OPT_OUT_VALOR)).toBe(true);
  });

  it("rechaza valores inventados, mal separados o vacíos", () => {
    const simple = item("plataforma", ["PC", "Consola"]);
    expect(valorValido(simple, "Z")).toBe(false);
    expect(valorValido(simple, "PC; Consola")).toBe(false);
    expect(valorValido(simple, "")).toBe(false);
    expect(valorValido(simple, "PC ;Consola")).toBe(false);
  });
});

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

  it("excluye el opt-out aunque ambas lo hayan elegido", () => {
    const respuestasA = [
      { item_id: "item1", valor: "no" },
      { item_id: "item2", valor: OPT_OUT_VALOR },
      { item_id: "item3", valor: "opcion_c" },
    ];
    const respuestasB = [
      { item_id: "item1", valor: "no" },
      { item_id: "item2", valor: OPT_OUT_VALOR },
      { item_id: "item3", valor: "opcion_c" },
    ];

    expect(calcularCoincidencias(respuestasA, respuestasB)).toEqual([{ item_id: "item3", valor: "opcion_c" }]);
  });

  it("excluye el «no» con mayúscula, que es la forma de los ítems de acuerdo", () => {
    const respuestasA = [
      { item_id: "escucha", valor: "No" },
      { item_id: "otro", valor: "Sí" },
    ];
    const respuestasB = [
      { item_id: "escucha", valor: "No" },
      { item_id: "otro", valor: "Sí" },
    ];

    expect(calcularCoincidencias(respuestasA, respuestasB)).toEqual([{ item_id: "otro", valor: "Sí" }]);
  });

  it("excluye la etiqueta visible si alguien la guardó tal cual", () => {
    const respuestasA = [{ item_id: "item1", valor: OPT_OUT_LABEL }];
    const respuestasB = [{ item_id: "item1", valor: OPT_OUT_LABEL }];

    expect(calcularCoincidencias(respuestasA, respuestasB)).toHaveLength(0);
  });

  it("devuelve array vacío si no hay coincidencias", () => {
    const respuestasA = [{ item_id: "item1", valor: "opcion_a" }];
    const respuestasB = [{ item_id: "item1", valor: "opcion_b" }];

    const coincidencias = calcularCoincidencias(respuestasA, respuestasB);

    expect(coincidencias).toHaveLength(0);
  });
});

describe("explicarCoincidencia", () => {
  it("cita la opción elegida", () => {
    const plataforma = item("plataforma", ["PC", "Consola"]);
    const definition = quiz("gaming_plataformas", [plataforma]);

    expect(explicarCoincidencia(definition, { item_id: "plataforma", valor: "PC" })).toBe("Coinciden en: PC");
  });

  it("une con «y» las opciones de un ítem múltiple", () => {
    const genero = item("genero_favorito", ["Rock", "Pop"], { multiple: true });
    const definition = quiz("gustos_musica", [genero]);

    expect(explicarCoincidencia(definition, { item_id: "genero_favorito", valor: "Pop; Rock" })).toBe(
      "Coinciden en: Pop y Rock",
    );
  });

  it("en los ítems de acuerdo cita el enunciado, no un «sí» suelto", () => {
    const escucha = item("escuchar", ["Sí", "Tal vez", "No"]);
    const definition = quiz("picante_dinamicas", [escucha]);

    expect(explicarCoincidencia(definition, { item_id: "escuchar", valor: "Sí" })).toBe(
      `Coinciden en: ${escucha.texto}`,
    );
  });

  it("no explica lo que no se comparte ni un ítem que el quiz no declara", () => {
    const plataforma = item("plataforma", ["PC", "Consola"]);
    const definition = quiz("gaming_plataformas", [plataforma]);

    expect(explicarCoincidencia(definition, { item_id: "plataforma", valor: OPT_OUT_VALOR })).toBeNull();
    expect(explicarCoincidencia(definition, { item_id: "plataforma", valor: "No" })).toBeNull();
    expect(explicarCoincidencia(definition, { item_id: "inexistente", valor: "PC" })).toBeNull();
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

describe("puedeCompartirPicante", () => {
  it("además del acceso pide el track romance activo", () => {
    expect(puedeCompartirPicante(null)).toBe(false);
    expect(
      puedeCompartirPicante({ mayor_de_edad: true, consentimiento_en: new Date(), track_romance_activo: false }),
    ).toBe(false);
    expect(
      puedeCompartirPicante({ mayor_de_edad: true, consentimiento_en: new Date(), track_romance_activo: true }),
    ).toBe(true);
  });
});

describe("generarPreguntasSugeridas", () => {
  it("sugiere una pregunta abierta por coincidencia", () => {
    const genero = item("genero_favorito", ["Rock", "Pop"], { multiple: true });
    const definition = quiz("gustos_musica", [genero]);

    const preguntas = generarPreguntasSugeridas(definition, [{ item_id: "genero_favorito", valor: "Rock" }]);

    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toMatch(/^¿.*\?$/);
    expect(preguntas[0]).not.toContain("Rock");
  });

  it("tope en MAX_PREGUNTAS_SUGERIDAS", () => {
    const definition = ALL_QUIZZES.find((q) => q.quiz_id === "gustos_musica")!;
    const coincidencias = definition.items.map((i) => ({ item_id: i.item_id, valor: i.opciones[0]! }));

    expect(generarPreguntasSugeridas(definition, coincidencias)).toHaveLength(MAX_PREGUNTAS_SUGERIDAS);
  });

  it("no repite la misma pregunta", () => {
    const definition = ALL_QUIZZES.find((q) => q.quiz_id === "gustos_musica")!;
    const coincidencias = definition.items.map((i) => ({ item_id: i.item_id, valor: i.opciones[0]! }));

    const preguntas = generarPreguntasSugeridas(definition, coincidencias);

    expect(preguntas.length).toBeGreaterThan(1);
    expect(new Set(preguntas).size).toBe(preguntas.length);
  });

  it("no sugiere nada sobre lo que no se comparte", () => {
    const plataforma = item("plataforma", ["PC", "Consola"]);
    const definition = quiz("gaming_plataformas", [plataforma]);

    expect(generarPreguntasSugeridas(definition, [{ item_id: "plataforma", valor: OPT_OUT_VALOR }])).toHaveLength(0);
    expect(generarPreguntasSugeridas(definition, [{ item_id: "plataforma", valor: "No" }])).toHaveLength(0);
  });

  it("toda sugerencia del catálogo está bien formada y no se repite", () => {
    for (const definition of ALL_QUIZZES) {
      const coincidencias = definition.items.map((i) => ({ item_id: i.item_id, valor: i.opciones[0]! }));
      const preguntas = generarPreguntasSugeridas(definition, coincidencias);

      expect(preguntas.length, definition.quiz_id).toBeLessThanOrEqual(MAX_PREGUNTAS_SUGERIDAS);
      expect(new Set(preguntas).size, definition.quiz_id).toBe(preguntas.length);
      for (const pregunta of preguntas) {
        expect(pregunta, definition.quiz_id).toMatch(/^¿.*\?$/);
        expect(pregunta, definition.quiz_id).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it("un quiz clásico con tres coincidencias saca tres preguntas distintas", () => {
    // Los de Picante no aplican: `picante_vanilla_kink` es de resultado personal y
    // `picante_dinamicas` emite llaves sintéticas, no los item_id del quiz.
    const clasicos = ALL_QUIZZES.filter((q) => q.categoria !== "picante" && !q.resultado_personal);
    expect(clasicos.length).toBe(14);

    for (const definition of clasicos) {
      const coincidencias = definition.items.slice(0, MAX_PREGUNTAS_SUGERIDAS).map((i) => ({
        item_id: i.item_id,
        valor: i.opciones[0]!,
      }));

      expect(generarPreguntasSugeridas(definition, coincidencias), definition.quiz_id).toHaveLength(
        MAX_PREGUNTAS_SUGERIDAS,
      );
    }
  });

  it("no duplica preguntas del banco de chat-prompts", () => {
    const banco = new Set<string>();
    for (const entrada of CHAT_PROMPTS.preguntas) {
      banco.add(entrada.texto.trim());
      for (const variante of entrada.variantes) banco.add(variante.trim());
    }
    expect(banco.size, "el banco de chat-prompts llegó vacío").toBeGreaterThan(0);

    for (const definition of ALL_QUIZZES) {
      const coincidencias = definition.items.map((i) => ({ item_id: i.item_id, valor: i.opciones[0]! }));
      for (const pregunta of generarPreguntasSugeridas(definition, coincidencias)) {
        expect(banco.has(pregunta.trim()), `duplicada: ${pregunta}`).toBe(false);
      }
    }
  });

  it("distingue los item_id que se repiten entre quizzes", () => {
    const busca = (quiz_id: string, item_id: string) =>
      ALL_QUIZZES.find((q) => q.quiz_id === quiz_id && q.items.some((i) => i.item_id === item_id));
    const gaming = busca("gaming_plataformas", "plataforma");
    const cine = busca("gustos_cine", "plataforma");
    expect(gaming, "falta gaming_plataformas/plataforma").toBeDefined();
    expect(cine, "falta gustos_cine/plataforma").toBeDefined();

    const deGaming = generarPreguntasSugeridas(gaming!, [{ item_id: "plataforma", valor: "PC" }]);
    const deCine = generarPreguntasSugeridas(cine!, [{ item_id: "plataforma", valor: "PC" }]);

    expect(deGaming[0]).not.toBe(deCine[0]);
  });
});

describe("otraPersonaDeConversacion", () => {
  /**
   * El panel del chat viaja con el id de la conversación, nunca con el de la
   * otra persona (`src/contracts/chat.ts` no reparte user ids). Este es el
   * único punto donde el servidor traduce uno al otro, así que su negativa
   * importa tanto como su afirmación.
   */
  const convo = { userA: "ana", userB: "bea" };

  it("dice quién es el par desde cualquiera de los dos lados", () => {
    expect(otraPersonaDeConversacion(convo, "ana")).toBe("bea");
    expect(otraPersonaDeConversacion(convo, "bea")).toBe("ana");
  });

  it("no deja mirar la conversación de un tercero", () => {
    expect(otraPersonaDeConversacion(convo, "cies")).toBeNull();
  });
});
