import { retakeProfile, retakeView } from "@/application/retake-profile";
import { parseJsonBody } from "@/application/validation/common";
import { retakeSubmissionSchema } from "@/application/validation/quiz";
import { retakeContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

/**
 * Re-toma mínima (ADR-054). `GET` dice qué preguntas tocan —o por qué no tocan
 * ninguna— y `POST` re-estima con esas respuestas y las intactas guardadas.
 * La pantalla nunca decide el plan: lo pide, y el servidor responde con el sello
 * de esa persona, no con el banco vigente.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

async function handleGet() {
  const context = await retakeContext();
  if (!context.ok) return errorResponse(context.error);
  const view = await retakeView(context.value.deps, context.value.userId);
  return view.ok ? jsonResponse(view.value) : errorResponse(view.error);
}

async function handlePost(request: Request) {
  const parsed = retakeSubmissionSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");

  const context = await retakeContext();
  if (!context.ok) return errorResponse(context.error);

  const { likert, filters } = parsed.data;
  const result = await retakeProfile({ userId: context.value.userId, likert, filters }, context.value.deps);
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

const methods = ["GET", "POST"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "quiz-retake-plan",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const POST = withApiSecurity(handlePost, {
  name: "quiz-retake",
  limit: 8,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
