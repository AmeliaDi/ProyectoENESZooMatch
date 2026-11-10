import { describe, expect, it } from "vitest";

import type { PicanteConsent, QuizAnswer, QuizCoincidencia, SharingLevel } from "@/domain/quiz/quizzes";
import { OPT_OUT_VALOR } from "@/config/quizzes";
import { ALL_QUIZZES } from "@/config/quiz-catalogue";
import {
  borrarQuiz,
  completarQuiz,
  completarQuizPicanteNivel2,
  obtenerCoincidencias,
  obtenerProgreso,
} from "./actions";
import type { QuizContext, QuizRepository } from "./ports";

const YO = "persona-yo";
const OTRA = "persona-otra";
const COMPARTIDO: SharingLevel = "compartir_coincidencias_con_matches";

/**
 * Repositorio de juguete: guarda lo mismo que guardaría la base y anota cada
 * método invocado. Las anotaciones son las que prueban que completar un quiz
 * rompehielos no toca el puntaje ni la identidad.
 */
class RepoFalso implements QuizRepository {
  respuestas = new Map<string, QuizAnswer[]>();
  intentos: string[] = [];
  visibilidad = new Map<string, SharingLevel>();
  consentimientos = new Map<string, PicanteConsent | null>();
  coincidenciasDeBase: QuizCoincidencia[] = [];
  llamadas: string[] = [];
  hayMatch = true;

  private clave(personaId: string, quizId: string) {
    return `${personaId}/${quizId}`;
  }

  private anota(que: string) {
    this.llamadas.push(que);
  }

  async saveAnswer(personaId: string, quizId: string, itemId: string, valor: string): Promise<void> {
    this.anota("saveAnswer");
    const actual = this.respuestas.get(this.clave(personaId, quizId)) ?? [];
    this.respuestas.set(this.clave(personaId, quizId), [...actual.filter((a) => a.item_id !== itemId), { item_id: itemId, valor }]);
  }

  async saveAnswers(personaId: string, quizId: string, answers: readonly QuizAnswer[]): Promise<void> {
    this.anota("saveAnswers");
    this.respuestas.set(this.clave(personaId, quizId), [...answers]);
  }

  async getAnswers(personaId: string, quizId: string): Promise<QuizAnswer[]> {
    this.anota("getAnswers");
    return this.respuestas.get(this.clave(personaId, quizId)) ?? [];
  }

  async deleteAnswers(personaId: string, quizId: string | null): Promise<void> {
    this.anota("deleteAnswers");
    if (quizId === null) {
      this.respuestas.clear();
      this.intentos = [];
      return;
    }
    this.respuestas.delete(this.clave(personaId, quizId));
    this.intentos = this.intentos.filter((q) => q !== quizId);
  }

  async markCompleted(personaId: string, quizId: string, revision: string): Promise<void> {
    this.anota("markCompleted");
    this.intentos.push(quizId);
    void personaId;
    void revision;
  }

  async getAttempts(personaId: string): Promise<Array<{ quiz_id: string; revision: string; completado_en: Date }>> {
    this.anota("getAttempts");
    void personaId;
    return this.intentos.map((quiz_id) => ({ quiz_id, revision: "1", completado_en: new Date(0) }));
  }

  async setSharing(personaId: string, quizId: string, nivel: SharingLevel): Promise<void> {
    this.anota("setSharing");
    this.visibilidad.set(this.clave(personaId, quizId), nivel);
  }

  async getSharing(personaId: string, quizId: string): Promise<SharingLevel | null> {
    this.anota("getSharing");
    return this.visibilidad.get(this.clave(personaId, quizId)) ?? null;
  }

  async getCoincidencias(yoId: string, otraPersonaId: string, quizId: string): Promise<QuizCoincidencia[]> {
    this.anota("getCoincidencias");
    void yoId;
    void otraPersonaId;
    void quizId;
    return this.coincidenciasDeBase;
  }

  async checkMatch(personaIdA: string, personaIdB: string): Promise<boolean> {
    this.anota("checkMatch");
    void personaIdA;
    void personaIdB;
    return this.hayMatch;
  }

  async savePicanteConsent(personaId: string, mayorDeEdad: boolean, trackRomanceActivo: boolean): Promise<void> {
    this.anota("savePicanteConsent");
    this.consentimientos.set(personaId, {
      mayor_de_edad: mayorDeEdad,
      consentimiento_en: new Date(0),
      track_romance_activo: trackRomanceActivo,
    });
  }

  async getPicanteConsent(personaId: string): Promise<PicanteConsent | null> {
    this.anota("getPicanteConsent");
    return this.consentimientos.get(personaId) ?? null;
  }

  async countAnswersByQuiz(personaId: string): Promise<Record<string, number>> {
    this.anota("countAnswersByQuiz");
    const conteo: Record<string, number> = {};
    for (const [clave, respuestas] of this.respuestas) {
      if (!clave.startsWith(`${personaId}/`)) continue;
      conteo[clave.split("/")[1]!] = respuestas.length;
    }
    return conteo;
  }

  respuestasDe(personaId: string, quizId: string): QuizAnswer[] {
    return this.respuestas.get(this.clave(personaId, quizId)) ?? [];
  }
}

const ctx = (tieneIdentidad = true): QuizContext => ({ personaId: YO, tieneIdentidad });

function quizDe(quizId: string) {
  const definition = ALL_QUIZZES.find((q) => q.quiz_id === quizId);
  if (!definition) throw new Error(`el catálogo no trae ${quizId}`);
  return definition;
}

/** La primera opción declarada de cada ítem: un valor que la base aceptaría. */
function respuestasValidas(quizId: string): QuizAnswer[] {
  return quizDe(quizId).items.map((i) => ({ item_id: i.item_id, valor: i.opciones[0]! }));
}

describe("completarQuiz", () => {
  it("guarda y marca el intento sin tocar nada más", async () => {
    const repo = new RepoFalso();

    const resultado = await completarQuiz(repo, ctx(), "vida_humor", "1", respuestasValidas("vida_humor"));

    expect(resultado.ok).toBe(true);
    expect(repo.respuestasDe(YO, "vida_humor")).toHaveLength(quizDe("vida_humor").items.length);
    expect(repo.intentos).toEqual(["vida_humor"]);
    expect([...new Set(repo.llamadas)].sort()).toEqual(["markCompleted", "saveAnswers"]);
  });

  it("rechaza un item_id que el quiz no declara y no escribe a medias", async () => {
    const repo = new RepoFalso();
    const answers = [...respuestasValidas("vida_humor").slice(0, 3), { item_id: "respuesta_inventada", valor: "Ironía y sarcasmo" }];

    const resultado = await completarQuiz(repo, ctx(), "vida_humor", "1", answers);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("quiz.item_no_declarado");
    expect(repo.llamadas).toEqual([]);
    expect(repo.intentos).toEqual([]);
  });

  it("rechaza un valor que no es una opción del ítem", async () => {
    const repo = new RepoFalso();

    const resultado = await completarQuiz(repo, ctx(), "vida_humor", "1", [
      { item_id: "estilo_de_humor", valor: "Ironía" },
    ]);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("quiz.valor_no_valido");
    expect(repo.llamadas).toEqual([]);
  });

  it("acepta el centinela del opt-out tal como lo produce la interfaz", async () => {
    const repo = new RepoFalso();

    const resultado = await completarQuiz(repo, ctx(), "vida_humor", "1", [
      { item_id: "estilo_de_humor", valor: OPT_OUT_VALOR },
    ]);

    expect(resultado.ok).toBe(true);
    expect(repo.respuestasDe(YO, "vida_humor")).toEqual([{ item_id: "estilo_de_humor", valor: OPT_OUT_VALOR }]);
  });

  it("sin identidad no hay escritura", async () => {
    const repo = new RepoFalso();

    const resultado = await completarQuiz(repo, ctx(false), "vida_humor", "1", respuestasValidas("vida_humor"));

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("quiz.no_identidad");
    expect(repo.llamadas).toEqual([]);
  });
});

describe("completarQuizPicanteNivel2", () => {
  it("valida antes de escribir, así un rechazo no deja respuestas sueltas", async () => {
    const repo = new RepoFalso();
    await repo.savePicanteConsent(YO, true, true);

    const resultado = await completarQuizPicanteNivel2(
      repo,
      ctx(),
      "picante_nivel2",
      "1",
      [{ item_id: "no_existe", valor: "Sí" }],
      true,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("quiz.item_no_declarado");
    expect(repo.respuestasDe(YO, "picante_nivel2")).toEqual([]);
  });

  it("sin la segunda confirmación no escribe ni una respuesta", async () => {
    const repo = new RepoFalso();
    await repo.savePicanteConsent(YO, true, true);

    const resultado = await completarQuizPicanteNivel2(
      repo,
      ctx(),
      "picante_nivel2",
      "1",
      respuestasValidas("picante_nivel2"),
      false,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("quiz.picante.nivel2.sin_confirmacion");
    expect(repo.llamadas.filter((l) => l === "saveAnswers")).toEqual([]);
  });
});

describe("borrarQuiz", () => {
  it("borra un quiz sin tocar los demás", async () => {
    const repo = new RepoFalso();
    await completarQuiz(repo, ctx(), "vida_humor", "1", respuestasValidas("vida_humor"));
    await completarQuiz(repo, ctx(), "gustos_musica", "1", respuestasValidas("gustos_musica"));

    const resultado = await borrarQuiz(repo, ctx(), "vida_humor");

    expect(resultado.ok).toBe(true);
    expect(repo.respuestasDe(YO, "vida_humor")).toEqual([]);
    expect(repo.respuestasDe(YO, "gustos_musica")).toHaveLength(quizDe("gustos_musica").items.length);
    expect(repo.intentos).toEqual(["gustos_musica"]);
  });

  it("con null barre todos los quizzes y sus intentos", async () => {
    const repo = new RepoFalso();
    await completarQuiz(repo, ctx(), "vida_humor", "1", respuestasValidas("vida_humor"));
    await completarQuiz(repo, ctx(), "gustos_musica", "1", respuestasValidas("gustos_musica"));

    expect((await borrarQuiz(repo, ctx(), null)).ok).toBe(true);
    expect(repo.respuestas.size).toBe(0);
    expect(repo.intentos).toEqual([]);
  });
});

describe("obtenerProgreso", () => {
  it("cuenta los quizzes en una sola lectura", async () => {
    const repo = new RepoFalso();
    await completarQuiz(repo, ctx(), "vida_humor", "1", respuestasValidas("vida_humor"));

    const resultado = await obtenerProgreso(repo, ctx());

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.value["vida_humor"]).toBe(quizDe("vida_humor").items.length);
      expect(resultado.value["gustos_musica"] ?? 0).toBe(0);
    }
    expect(repo.llamadas.filter((l) => l === "countAnswersByQuiz")).toHaveLength(1);
  });

  it("sin identidad no devuelve progreso", async () => {
    const repo = new RepoFalso();

    const resultado = await obtenerProgreso(repo, ctx(false));

    expect(resultado.ok).toBe(false);
    expect(repo.llamadas).toEqual([]);
  });
});

describe("obtenerCoincidencias", () => {
  const dosEnCompartido = async (repo: RepoFalso, quizId: string) => {
    await repo.setSharing(YO, quizId, COMPARTIDO);
    await repo.setSharing(OTRA, quizId, COMPARTIDO);
  };

  it("no comparte si yo no activé la visibilidad", async () => {
    const repo = new RepoFalso();
    repo.coincidenciasDeBase = [{ item_id: "estilo_de_humor", valor: "Ironía y sarcasmo" }];

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "vida_humor");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.value).toEqual([]);
    expect(repo.llamadas).not.toContain("getCoincidencias");
  });

  it("no comparte si la otra persona no la activó", async () => {
    const repo = new RepoFalso();
    await repo.setSharing(YO, "vida_humor", COMPARTIDO);
    repo.coincidenciasDeBase = [{ item_id: "estilo_de_humor", valor: "Ironía y sarcasmo" }];

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "vida_humor");

    if (resultado.ok) expect(resultado.value).toEqual([]);
    expect(repo.llamadas).not.toContain("getCoincidencias");
  });

  it("sin match no hay coincidencias aunque ambas compartan", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "vida_humor");
    repo.coincidenciasDeBase = [{ item_id: "estilo_de_humor", valor: "Ironía y sarcasmo" }];
    repo.hayMatch = false;

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "vida_humor");

    if (resultado.ok) expect(resultado.value).toEqual([]);
  });

  it("un «No» que se escapa de la RPC nunca llega como coincidencia", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "picante_nivel1");
    // `quiz_coincidencias` compara contra la minúscula 'no'; los ítems de acuerdo
    // guardan 'No', así que la base sí puede devolverlos.
    repo.coincidenciasDeBase = [
      { item_id: "hablar_intimidad", valor: "No" },
      { item_id: "coqueteo_poco_a_poco", valor: "Sí" },
    ];

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "picante_nivel1");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.value).toEqual([{ item_id: "coqueteo_poco_a_poco", valor: "Sí" }]);
  });

  it("el quiz de resultado personal jamás produce coincidencias", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "picante_vanilla_kink");
    repo.coincidenciasDeBase = [{ item_id: "juego_sensorial", valor: "Sí" }];

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "picante_vanilla_kink");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.value).toEqual([]);
  });

  it("las dinámicas no leen respuestas si falta el consentimiento de alguna", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "picante_dinamicas");
    await repo.savePicanteConsent(YO, true, true);
    await repo.saveAnswers(YO, "picante_dinamicas", respuestasValidas("picante_dinamicas"));
    await repo.saveAnswers(OTRA, "picante_dinamicas", respuestasValidas("picante_dinamicas"));
    repo.llamadas = [];

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "picante_dinamicas");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.value).toEqual([]);
    expect(repo.llamadas).not.toContain("getAnswers");
  });

  it("las dinámicas no leen respuestas si el rastro de romance está apagado", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "picante_dinamicas");
    for (const persona of [YO, OTRA]) {
      repo.consentimientos.set(persona, {
        mayor_de_edad: true,
        consentimiento_en: new Date(0),
        track_romance_activo: false,
      });
    }
    repo.llamadas = [];

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "picante_dinamicas");

    if (resultado.ok) expect(resultado.value).toEqual([]);
    expect(repo.llamadas).not.toContain("getAnswers");
  });

  it("con consentimiento mutuo las dinámicas hablan en prosa, nunca con la respuesta cruda", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "picante_dinamicas");
    for (const persona of [YO, OTRA]) {
      await repo.savePicanteConsent(persona, true, true);
    }
    const si = quizDe("picante_dinamicas").items.map((i) => ({ item_id: i.item_id, valor: "Sí" }));
    await repo.saveAnswers(YO, "picante_dinamicas", si);
    await repo.saveAnswers(OTRA, "picante_dinamicas", si);

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "picante_dinamicas");

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.length).toBeGreaterThan(0);
    expect(new Set(resultado.value.map((c) => c.item_id))).toEqual(
      new Set(["iniciativa_complementaria", "alternar_compatible", "juegos_control", "restricciones_suaves", "roles_apodos"]),
    );
    for (const coincidencia of resultado.value) {
      expect(coincidencia.valor).toBe("dinámicas compatibles para explorar");
    }
  });

  it("una bandera de seguridad en «No» apaga las dinámicas", async () => {
    const repo = new RepoFalso();
    await dosEnCompartido(repo, "picante_dinamicas");
    for (const persona of [YO, OTRA]) {
      await repo.savePicanteConsent(persona, true, true);
    }
    const si = quizDe("picante_dinamicas").items.map((i) => ({ item_id: i.item_id, valor: "Sí" }));
    await repo.saveAnswers(YO, "picante_dinamicas", si);
    await repo.saveAnswers(OTRA, "picante_dinamicas", [
      ...si.filter((a) => a.item_id !== "pactar_limites"),
      { item_id: "pactar_limites", valor: "No" },
    ]);

    const resultado = await obtenerCoincidencias(repo, ctx(), OTRA, "picante_dinamicas");

    if (resultado.ok) expect(resultado.value).toEqual([]);
  });
});
