/**
 * `GET /api/quizzes/coincidencias` resuelve el par en el servidor a partir del id
 * de la conversación. Aquí se prueba la compuerta, no el cálculo: que lo que viaja
 * por la URL nunca es un `user_id`, que quien no participa no lee nada, y que la
 * lectura de respuestas no ocurre hasta pasar el filtro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuizRepository } from "@/application/quiz/ports";
import { ok } from "@/domain/shared";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  findFor: vi.fn(),
  getSharing: vi.fn(),
  checkMatch: vi.fn(),
  getCoincidencias: vi.fn(),
}));

vi.mock("@/infrastructure/security/api.server", () => ({
  withApiSecurity: (handler: (request: Request) => Promise<Response>) => handler,
  createPreflightHandler: () => async () => new Response(null, { status: 204 }),
}));
vi.mock("@/infrastructure/composition.server", () => ({ quizzesRompehielosContext: mocks.context }));
vi.mock("@/infrastructure/chat/conversation-repository", () => ({
  supabaseConversationRepository: () => ({ findFor: mocks.findFor }),
}));
vi.mock("@/infrastructure/quiz/quiz-repository", () => ({
  supabaseQuizRepository: () => repo,
}));

import { ALL_QUIZZES } from "@/config/quiz-catalogue";

import { GET } from "./route";

const YO = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const TERCERA = "33333333-3333-4333-8333-333333333333";
const CONVO = "44444444-4444-4444-8444-444444444444";

/** El panel del chat nunca escribe ni lee por este camino: si lo hace, el test ruge. */
const NO_VISITA = (metodo: string) => async () => {
  throw new Error(`la ruta de coincidencias no debía tocar ${metodo}`);
};

const repo: QuizRepository = {
  getSharing: mocks.getSharing,
  checkMatch: mocks.checkMatch,
  getCoincidencias: mocks.getCoincidencias,
  saveAnswer: NO_VISITA("saveAnswer"),
  saveAnswers: NO_VISITA("saveAnswers"),
  getAnswers: NO_VISITA("getAnswers"),
  deleteAnswers: NO_VISITA("deleteAnswers"),
  countAnswersByQuiz: NO_VISITA("countAnswersByQuiz"),
  markCompleted: NO_VISITA("markCompleted"),
  getAttempts: NO_VISITA("getAttempts"),
  setSharing: NO_VISITA("setSharing"),
  savePicanteConsent: NO_VISITA("savePicanteConsent"),
  getPicanteConsent: NO_VISITA("getPicanteConsent"),
};

function url(params: Record<string, string>): Request {
  return new Request(`http://localhost/api/quizzes/coincidencias?${new URLSearchParams(params)}`);
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(ok({ personaId: YO, tieneIdentidad: true, admin: {} }));
  mocks.findFor.mockResolvedValue(ok({ id: CONVO, userA: YO, userB: OTRA }));
  mocks.getSharing.mockResolvedValue("compartir_coincidencias_con_matches");
  mocks.checkMatch.mockResolvedValue(true);
  mocks.getCoincidencias.mockResolvedValue([{ item_id: "generos", valor: "rock" }]);
});

describe("GET /api/quizzes/coincidencias", () => {
  it("usa la conversación para saber quién es el par", async () => {
    const response = await GET(url({ conversacion: CONVO, quiz_ids: "gustos_musica" }));

    expect(response.status).toBe(200);
    expect(mocks.findFor).toHaveBeenCalledWith(CONVO, YO);
    expect(mocks.getCoincidencias).toHaveBeenCalledWith(YO, OTRA, "gustos_musica");
  });

  it("un `otra_persona` en la URL no cambia quién es el par", async () => {
    const response = await GET(
      url({ conversacion: CONVO, quiz_ids: "gustos_musica", otra_persona: TERCERA }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getCoincidencias).toHaveBeenCalledWith(YO, OTRA, "gustos_musica");
  });

  it("quien no es parte de la conversación no lee coincidencias", async () => {
    mocks.findFor.mockResolvedValue(ok(null));

    const response = await GET(url({ conversacion: CONVO, quiz_ids: "gustos_musica" }));

    expect(response.status).toBe(403);
    expect((await body(response)).error).toMatchObject({ codigo: "quiz.sin_permiso" });
    expect(mocks.getCoincidencias).not.toHaveBeenCalled();
  });

  it("una fila donde nadie es el que pregunta tampoco entrega nada", async () => {
    mocks.findFor.mockResolvedValue(ok({ id: CONVO, userA: TERCERA, userB: OTRA }));

    const response = await GET(url({ conversacion: CONVO, quiz_ids: "gustos_musica" }));

    expect(response.status).toBe(403);
    expect(mocks.getSharing).not.toHaveBeenCalled();
  });

  it("sin identidad no hay coincidencias que mostrar", async () => {
    mocks.context.mockResolvedValue(ok({ personaId: YO, tieneIdentidad: false, admin: {} }));

    const response = await GET(url({ conversacion: CONVO, quiz_ids: "gustos_musica" }));

    expect(response.status).toBe(403);
    expect((await body(response)).error).toMatchObject({ codigo: "quiz.no_identidad" });
  });

  it("sin sesión no llega ni a buscar la conversación", async () => {
    mocks.context.mockResolvedValue(ok({ personaId: YO, tieneIdentidad: true, admin: null }));

    const response = await GET(url({ conversacion: CONVO, quiz_ids: "gustos_musica" }));

    expect(response.status).toBe(401);
    expect(mocks.findFor).not.toHaveBeenCalled();
  });

  it("exige los dos parámetros", async () => {
    const faltante = await GET(url({ quiz_ids: "gustos_musica" }));
    expect(faltante.status).toBe(400);
    expect((await body(faltante)).error).toMatchObject({ codigo: "quiz.falta_parametros" });

    const vacio = await GET(url({ conversacion: CONVO, quiz_ids: "" }));
    expect(vacio.status).toBe(400);
  });

  it("rechaza más quizzes de los que existen", async () => {
    const demasido = Array.from({ length: ALL_QUIZZES.length + 1 }, (_, i) => `quiz_${i}`).join(",");

    const response = await GET(url({ conversacion: CONVO, quiz_ids: demasido }));

    expect(response.status).toBe(400);
    expect((await body(response)).error).toMatchObject({ codigo: "quiz.muchos_quizzes" });
    expect(mocks.getCoincidencias).not.toHaveBeenCalled();
  });

  it("responde los quizzes pedidos en una sola lectura por quiz", async () => {
    const response = await GET(url({ conversacion: CONVO, quiz_ids: "gustos_musica,gustos_cine,gustos_musica" }));

    expect(response.status).toBe(200);
    expect(Object.keys(((await body(response)).data as { por_quiz: Record<string, unknown> }).por_quiz).sort()).toEqual([
      "gustos_cine",
      "gustos_musica",
    ]);
    expect(mocks.getCoincidencias).toHaveBeenCalledTimes(2);
  });
});
