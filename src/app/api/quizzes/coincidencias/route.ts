import { z } from "zod";

import { obtenerCoincidencias, type QuizError } from "@/application/quiz/actions";
import { ALL_QUIZZES } from "@/config/quiz-catalogue";
import { otraPersonaDeConversacion, type QuizCoincidencia } from "@/domain/quiz/quizzes";
import { supabaseConversationRepository } from "@/infrastructure/chat/conversation-repository";
import { supabaseQuizRepository } from "@/infrastructure/quiz/quiz-repository";
import { withApiSecurity, createPreflightHandler } from "@/infrastructure/security/api.server";
import { quizzesRompehielosContext } from "@/infrastructure/composition.server";

const methods = ["GET"] as const;

const querySchema = z.object({
  conversacion: z.string().min(1),
  quiz_ids: z.string().min(1),
});

/** El catálogo entero es la cota natural: nadie puede pedir más que eso. */
const MAX_QUIZZES = ALL_QUIZZES.length;

function mapError(error: QuizError): { codigo: string; status: number } {
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

  const parsed = querySchema.safeParse({
    conversacion: url.searchParams.get("conversacion"),
    quiz_ids: url.searchParams.get("quiz_ids"),
  });
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

  // Viaja el id de la conversación, nunca el de la otra persona: el contrato del
  // chat no reparte user ids al cliente, así que aquí se resuelve quién es el par
  // y se verifica a la vez que quien pregunta es parte de esa conversación.
  const fila = await supabaseConversationRepository(ctx.admin).findFor(parsed.data.conversacion, ctx.personaId);
  if (!fila.ok || !fila.value) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.sin_permiso", mensaje: "quiz.sin_permiso", requestId: "" } },
      { status: 403 },
    );
  }
  const otraPersona = otraPersonaDeConversacion(fila.value, ctx.personaId);
  if (!otraPersona) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.sin_permiso", mensaje: "quiz.sin_permiso", requestId: "" } },
      { status: 403 },
    );
  }

  const solicitados = [...new Set(parsed.data.quiz_ids.split(",").map((id) => id.trim()).filter(Boolean))];
  if (solicitados.length === 0 || solicitados.length > MAX_QUIZZES) {
    return Response.json(
      { ok: false, error: { codigo: "quiz.muchos_quizzes", mensaje: "Lista de quizzes inválida", requestId: "" } },
      { status: 400 },
    );
  }

  // Una petición por conversación: el panel recorre el catálogo completo y, quiz
  // por quiz, se comería el límite de peticiones en dos chats abiertos.
  const resultados = await Promise.all(
    solicitados.map(async (quizId) => {
      const result = await obtenerCoincidencias(repo, ctx, otraPersona, quizId);
      return { quizId, result };
    }),
  );

  const porQuiz: Record<string, QuizCoincidencia[]> = {};
  for (const { quizId, result } of resultados) {
    if (!result.ok) {
      const mapped = mapError(result.error);
      return Response.json(
        { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
        { status: mapped.status },
      );
    }
    porQuiz[quizId] = result.value;
  }

  return Response.json(
    { ok: true, data: { por_quiz: porQuiz } },
    { headers: { "cache-control": "no-store" } },
  );
}, { name: "quiz-coincidencias", limit: 30, windowSeconds: 60, methods });

export const GET = handleGet;
export const OPTIONS = createPreflightHandler(methods);
