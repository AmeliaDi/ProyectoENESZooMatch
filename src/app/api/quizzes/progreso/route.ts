import { obtenerProgreso, type QuizError } from "@/application/quiz/actions";
import { supabaseQuizRepository } from "@/infrastructure/quiz/quiz-repository";
import { withApiSecurity, createPreflightHandler } from "@/infrastructure/security/api.server";
import { quizzesRompehielosContext } from "@/infrastructure/composition.server";

const methods = ["GET"] as const;

function mapError(error: QuizError): { codigo: string; status: number } {
  switch (error) {
    case "quiz.no_identidad":
      return { codigo: "quiz.no_identidad", status: 403 };
    default:
      return { codigo: "quiz.error", status: 500 };
  }
}

/** Cuántas respuestas hay por quiz propio, en una sola lectura. */
const handleGet = withApiSecurity(async () => {
  const ctxResult = await quizzesRompehielosContext();
  if (!ctxResult.ok || !ctxResult.value.admin) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.no_autorizado", mensaje: "No autorizado", requestId: "" } },
      { status: 401 },
    );
  }

  const ctx = ctxResult.value;
  const repo = supabaseQuizRepository(ctx.admin);

  const result = await obtenerProgreso(repo, ctx);
  if (!result.ok) {
    const mapped = mapError(result.error);
    return Response.json(
      { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
      { status: mapped.status },
    );
  }

  return Response.json(
    { ok: true, data: { progreso: result.value } },
    { headers: { "cache-control": "no-store" } },
  );
}, { name: "quiz-progreso", limit: 30, windowSeconds: 60, methods });

export const GET = handleGet;
export const OPTIONS = createPreflightHandler(methods);
