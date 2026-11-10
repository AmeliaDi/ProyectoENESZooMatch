import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ALL_QUIZZES, QUIZ_CATEGORIES, QUIZ_CATALOGUE } from "@/config/quiz-catalogue";

const RAIZ = process.cwd();

/**
 * CRITICAL INVARIANT: Quiz dimensions must NEVER overlap with psychometric
 * dimensions. Quizzes are for fun and icebreaking; they must not affect
 * the matching algorithm in any way.
 *
 * This test ensures that no quiz item references any psychometric dimension.
 */

const PSYCHOMETRIC_DIMENSIONS = [
  "hexaco",
  "big_five",
  "mbti",
  "enneagram",
  "apego",
  "valores",
  "atraccion",
  "vinculo",
  "proyecto_relacional",
];

const ALLOWED_DIMS = new Set(["personalidad", "estilo", "estilo_de_vida", "gustos"]);

describe("quiz-psychometric isolation", () => {
  const psychometricDimSet = new Set(PSYCHOMETRIC_DIMENSIONS);

  it("the catalogue really covers every declared category", () => {
    expect(ALL_QUIZZES).toHaveLength(QUIZ_CATEGORIES.reduce((n, c) => n + QUIZ_CATALOGUE[c].length, 0));
    expect(new Set(ALL_QUIZZES.map((quiz) => quiz.categoria))).toEqual(new Set(QUIZ_CATEGORIES));
  });

  it("no quiz item references a psychometric dimension", () => {
    const violations: string[] = [];

    for (const quiz of ALL_QUIZZES) {
      for (const item of quiz.items) {
        for (const dim of item.dimensiones_relacionadas) {
          if (psychometricDimSet.has(dim)) {
            violations.push(`${quiz.quiz_id}/${item.item_id} → ${dim}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("quiz dimensions are limited to allowed categories", () => {
    const violations: string[] = [];

    for (const quiz of ALL_QUIZZES) {
      for (const item of quiz.items) {
        for (const dim of item.dimensiones_relacionadas) {
          if (!ALLOWED_DIMS.has(dim)) {
            violations.push(`${quiz.quiz_id}/${item.item_id} → ${dim}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("the dilemmas quiz never calls itself values, even though it reads like one", () => {
    const dilemas = QUIZ_CATALOGUE.conexion.find((quiz) => quiz.quiz_id === "conexion_valores_situaciones");
    expect(dilemas).toBeDefined();
    for (const item of dilemas!.items) {
      expect(item.dimensiones_relacionadas, item.item_id).not.toContain("valores");
    }
  });
});

/**
 * El aislamiento también es de código: completar un rompehielos no puede cambiar
 * el puntaje ni la identidad porque la capa de quizzes nunca importa el motor.
 * Es la prueba barata de la regla «los quizzes no entran al puntaje»: si alguien
 * enchufa un import hacia `matching`, `psychometrics` o `identity`, esto truena.
 */

/** Carpetas y archivos de la capa rompehielos, sin la UI (allí convive el test psicométrico). */
const CAPA_QUIZ = [
  "src/domain/quiz",
  "src/application/quiz",
  "src/infrastructure/quiz",
  "src/app/api/quizzes",
];
const ARCHIVOS_QUIZ = ["src/config/quizzes.ts", "src/config/quiz-catalogue.ts"];

const PROHIBIDO = [
  "@/domain/matching",
  "@/config/matching",
  "@/domain/psychometrics",
  "@/domain/identity",
  "@/application/identity",
  "@/application/get-result",
  "@/application/submit-quiz",
  "@/application/retake",
  "@/application/refine",
  "@/contracts/identity",
  "@/contracts/result",
  "@/types/microtest",
  "@/types/matching-config",
];

function archivosFuente(directorio: string): string[] {
  const ruta = join(RAIZ, directorio);
  if (!statSync(ruta).isDirectory()) return [directorio];
  return readdirSync(ruta).flatMap((entrada) => {
    const hijo = `${directorio}/${entrada}`;
    if (statSync(join(RAIZ, hijo)).isDirectory()) return archivosFuente(hijo);
    return /\.(ts|tsx)$/.test(entrada) && !entrada.endsWith(".test.ts") ? [hijo] : [];
  });
}

function importesDe(archivo: string): string[] {
  const codigo = readFileSync(join(RAIZ, archivo), "utf8");
  return [...codigo.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

describe("quiz layer has no import path to the score", () => {
  const archivos = [...CAPA_QUIZ.flatMap(archivosFuente), ...ARCHIVOS_QUIZ];

  it("the scan really covers the write path", () => {
    expect(new Set(archivos).size).toBe(archivos.length);
    for (const clave of [
      "src/config/quizzes.ts",
      "src/config/quiz-catalogue.ts",
      "src/domain/quiz/quizzes.ts",
      "src/application/quiz/actions.ts",
      "src/infrastructure/quiz/quiz-repository.ts",
      "src/app/api/quizzes/route.ts",
    ]) {
      expect(archivos, clave).toContain(clave);
    }
  });

  it("no quiz file imports the engine, the psychometrics or the identity", () => {
    const violaciones: string[] = [];
    for (const archivo of archivos) {
      for (const importe of importesDe(archivo)) {
        if (PROHIBIDO.some((p) => importe === p || importe.startsWith(`${p}/`))) {
          violaciones.push(`${archivo} → ${importe}`);
        }
      }
    }
    expect(violaciones).toEqual([]);
  });

  it("the domain and application layers stay out of infrastructure and UI", () => {
    const violaciones: string[] = [];
    for (const archivo of archivos) {
      if (!archivo.startsWith("src/domain/quiz") && !archivo.startsWith("src/application/quiz")) continue;
      for (const importe of importesDe(archivo)) {
        if (importe.startsWith("@/infrastructure") || importe.startsWith("@/ui")) {
          violaciones.push(`${archivo} → ${importe}`);
        }
      }
    }
    expect(violaciones).toEqual([]);
  });
});

/**
 * «Nada de contenido en logs»: una respuesta de quiz no debe salir de las tablas
 * hacia la consola, ni siquiera en un mensaje de error.
 */
describe("quiz layer keeps answers out of the logs", () => {
  it("no quiz file writes to the console", () => {
    const violaciones: string[] = [];
    for (const archivo of [...CAPA_QUIZ.flatMap(archivosFuente), ...ARCHIVOS_QUIZ]) {
      const codigo = readFileSync(join(RAIZ, archivo), "utf8");
      if (/console\.(log|info|warn|error|debug)/.test(codigo)) violaciones.push(archivo);
    }
    expect(violaciones).toEqual([]);
  });

  it("the repository fails with a code, not with the payload", () => {
    const codigo = readFileSync(join(RAIZ, "src/infrastructure/quiz/quiz-repository.ts"), "utf8");
    const lanzados = [...codigo.matchAll(/throw new Error\(([^)]*)\)/g)].map((m) => m[1]!.trim());
    expect(lanzados.length).toBeGreaterThan(0);
    for (const lanzamiento of lanzados) {
      expect(lanzamiento, lanzamiento).toMatch(/^"[a-z_. ]+"$/);
    }
  });
});

describe("the chat panel identifies a conversation, not a person", () => {
  /**
   * `src/contracts/chat.ts` nunca manda el `user_id` de la otra persona al cliente, así que el
   * panel de coincidencias no lo puede recibir: lo que viaja es el id de la conversación y el
   * servidor traduce. Si alguien vuelve a aceptar `otra_persona` en la ruta, esta prueba lo
   * trapaca antes de que se convierta en una forma de mirar parejas ajenas.
   */
  const RUTA = "src/app/api/quizzes/coincidencias/route.ts";
  const PANEL = "src/ui/chat/quiz-coincidencias.tsx";

  it("the route resolves the peer from the conversation and never trusts a person id", () => {
    const codigo = readFileSync(join(RAIZ, RUTA), "utf8");
    expect(codigo).toContain("otraPersonaDeConversacion(fila.value, ctx.personaId)");
    expect(codigo).toContain(".findFor(parsed.data.conversacion, ctx.personaId)");
    expect(codigo).not.toContain("otra_persona");
  });

  it("the client asks with the conversation id only", () => {
    const codigo = readFileSync(join(RAIZ, PANEL), "utf8");
    expect(codigo).toContain("conversacion: conversationId");
    expect(codigo).not.toMatch(/otra_persona|peerId/);
  });

  it("Picante never reaches the chat panel", () => {
    const codigo = readFileSync(join(RAIZ, PANEL), "utf8");
    for (const categoria of ["gustos", "gaming", "vida", "conexion"]) {
      expect(codigo, categoria).toContain(`QUIZ_CATALOGUE.${categoria}`);
    }
    expect(codigo).not.toContain("QUIZ_CATALOGUE.picante");
  });
});
