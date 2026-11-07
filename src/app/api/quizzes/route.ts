import { z } from "zod";

import { completarQuiz, obtenerRespuestas, borrarQuiz, type QuizError } from "@/application/quiz/actions";
import type { QuizAnswer } from "@/domain/quiz/quizzes";
import { supabaseQuizRepository } from "@/infrastructure/quiz/quiz-repository";
import { withApiSecurity, createPreflightHandler } from "@/infrastructure/security/api.server";
import { quizzesRompehielosContext } from "@/infrastructure/composition.server";
import { ok, err, type Result } from "@/domain/shared";

const answerSchema = z.object({
  item_id: z.string().min(1),
  valor: z.string().min(1),
});

const completarBodySchema = z.object({
  quiz_id: z.string().min(1),
  revision: z.string().min(1),
  answers: z.array(answerSchema).min(1),
});

const borrarBodySchema = z.object({
  quiz_id: z.string().nullable(),
});

const sharingBodySchema = z.object({
  quiz_id: z.string().min(1),
  nivel: z.enum(["privado", "compartir_coincidencias_con_matches"]),
});

const methods = ["GET", "POST", "DELETE"] as const;

function mapError(error: QuizError): { codigo: string; status: number } {
  switch (error) {
    case "quiz.no_identidad":
      return { codigo: "quiz.no_identidad", status: 403 };
    case "quiz.no_encontrado":
      return { codigo: "quiz.no_encontrado", status: 404 };
    case "quiz.sin_permiso":
      return { codigo: "quiz.sin_permiso", status: 403 };
    case "quiz.picante.requisitos":
      return { codigo: "quiz.picante.requisitos", status: 403 };
    case "quiz.picante.nivel2.sin_confirmacion":
      return { codigo: "quiz.picante.nivel2.sin_confirmacion", status: 400 };
  }
}

const handleGet = withApiSecurity(async (request) => {
  const url = new URL(request.url);
  const quizId = url.searchParams.get("quiz_id");

  if (!quizId) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.falta_quiz_id", mensaje: "Falta el parámetro quiz_id", requestId: "" } },
      { status: 400 },
    );
  }

  const ctxResult = await quizzesRompehielosContext();
  if (!ctxResult.ok || !ctxResult.value.admin) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.no_autorizado", mensaje: "No autorizado", requestId: "" } },
      { status: 401 },
    );
  }

  const ctx = ctxResult.value;
  const repo = supabaseQuizRepository(ctx.admin);

  const result = await obtenerRespuestas(repo, ctx, quizId);
  if (!result.ok) {
    const mapped = mapError(result.error);
    return Response.json(
      { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
      { status: mapped.status },
    );
  }

  return Response.json({ ok: true, data: { answers: result.value } }, { headers: { "cache-control": "no-store" } });
}, { name: "quiz-read", limit: 30, windowSeconds: 60, methods });

const handlePost = withApiSecurity(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = completarBodySchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.body_invalido", mensaje: "Cuerpo de la petición inválido", requestId: "" } },
      { status: 400 },
    );
  }

  const ctxResult = await quizzesRompehielosContext();
  if (!ctxResult.ok || !ctxResult.value.admin) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.no_autorizado", mensaje: "No autorizado", requestId: "" } },
      { status: 401 },
    );
  }

  const ctx = ctxResult.value;
  const repo = supabaseQuizRepository(ctx.admin);
  const answers: QuizAnswer[] = parsed.data.answers;

  const result = await completarQuiz(repo, ctx, parsed.data.quiz_id, parsed.data.revision, answers);
  if (!result.ok) {
    const mapped = mapError(result.error);
    return Response.json(
      { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
      { status: mapped.status },
    );
  }

  return Response.json({ ok: true, data: { completado: true } }, { status: 201, headers: { "cache-control": "no-store" } });
}, { name: "quiz-complete", limit: 20, windowSeconds: 60, methods });

const handleDelete = withApiSecurity(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = borrarBodySchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.body_invalido", mensaje: "Cuerpo de la petición inválido", requestId: "" } },
      { status: 400 },
    );
  }

  const ctxResult = await quizzesRompehielosContext();
  if (!ctxResult.ok || !ctxResult.value.admin) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.no_autorizado", mensaje: "No autorizado", requestId: "" } },
      { status: 401 },
    );
  }

  const ctx = ctxResult.value;
  const repo = supabaseQuizRepository(ctx.admin);

  const result = await borrarQuiz(repo, ctx, parsed.data.quiz_id);
  if (!result.ok) {
    const mapped = mapError(result.error);
    return Response.json(
      { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
      { status: mapped.status },
    );
  }

  return Response.json({ ok: true, data: { borrado: true } }, { headers: { "cache-control": "no-store" } });
}, { name: "quiz-delete", limit: 20, windowSeconds: 60, methods });

export const GET = handleGet;
export const POST = handlePost;
export const DELETE = handleDelete;
export const OPTIONS = createPreflightHandler(methods);
