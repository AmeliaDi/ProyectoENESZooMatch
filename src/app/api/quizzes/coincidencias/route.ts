import { z } from "zod";

import { obtenerCoincidencias } from "@/application/quiz/actions";
import { supabaseQuizRepository } from "@/infrastructure/quiz/quiz-repository";
import { withApiSecurity, createPreflightHandler } from "@/infrastructure/security/api.server";
import { quizzesRompehielosContext } from "@/infrastructure/composition.server";

const methods = ["GET"] as const;

const querySchema = z.object({
  quiz_id: z.string().min(1),
  otra_persona: z.string().min(1),
});

function mapError(error: string): { codigo: string; status: number } {
  switch (error) {
    case "quiz.no_identidad":
      return { codigo: "quiz.no_identidad", status: 403 };
    case "quiz.no_encontrado":
      return { codigo: "quiz.no_encontrado", status: 404 };
    case "quiz.sin_permiso":
      return { codigo: "quiz.sin_permiso", status: 403 };
    default:
      return { codigo: "quiz.error", status: 500 };
  }
}

const handleGet = withApiSecurity(async (request) => {
  const url = new URL(request.url);
  const quizId = url.searchParams.get("quiz_id");
  const otraPersona = url.searchParams.get("otra_persona");

  const parsed = querySchema.safeParse({ quiz_id: quizId, otra_persona: otraPersona });
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.falta_parametros", mensaje: "Faltan parámetros requeridos", requestId: "" } },
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

  const result = await obtenerCoincidencias(repo, ctx, parsed.data.otra_persona, parsed.data.quiz_id);
  if (!result.ok) {
    const mapped = mapError(result.error);
    return Response.json(
      { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
      { status: mapped.status },
    );
  }

  return Response.json(
    { ok: true, data: { coincidencias: result.value } },
    { headers: { "cache-control": "no-store" } },
  );
}, { name: "quiz-coincidencias", limit: 30, windowSeconds: 60, methods });

export const GET = handleGet;
export const OPTIONS = createPreflightHandler(methods);
