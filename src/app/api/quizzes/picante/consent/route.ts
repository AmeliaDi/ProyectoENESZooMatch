import { z } from "zod";

import { darConsentimientoPicante } from "@/application/quiz/actions";
import { supabaseQuizRepository } from "@/infrastructure/quiz/quiz-repository";
import { withApiSecurity, createPreflightHandler } from "@/infrastructure/security/api.server";
import { quizzesRompehielosContext } from "@/infrastructure/composition.server";

const methods = ["POST"] as const;

const consentBodySchema = z.object({
  mayor_de_edad: z.boolean(),
});

function mapError(error: string): { codigo: string; status: number } {
  switch (error) {
    case "quiz.no_identidad":
      return { codigo: "quiz.no_identidad", status: 403 };
    case "quiz.picante.requisitos":
      return { codigo: "quiz.picante.requisitos", status: 403 };
    default:
      return { codigo: "quiz.error", status: 500 };
  }
}

const handlePost = withApiSecurity(async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = consentBodySchema.safeParse(body);

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

  const result = await darConsentimientoPicante(repo, ctx, parsed.data.mayor_de_edad);
  if (!result.ok) {
    const mapped = mapError(result.error);
    return Response.json(
      { ok: false, error: { codigo: mapped.codigo, mensaje: mapped.codigo, requestId: "" } },
      { status: mapped.status },
    );
  }

  return Response.json({ ok: true, data: { consentimiento: true } }, { status: 201, headers: { "cache-control": "no-store" } });
}, { name: "quiz-picante-consent", limit: 10, windowSeconds: 60, methods });

export const POST = handlePost;
export const OPTIONS = createPreflightHandler(methods);
