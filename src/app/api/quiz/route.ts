import { submitQuiz } from "@/application/submit-quiz";
import { parseJsonBody } from "@/application/validation/common";
import { quizSubmissionSchema } from "@/application/validation/quiz";
import { quizContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePost(request: Request) {
  const parsed = quizSubmissionSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");

  const context = await quizContext();
  if (!context.ok) return errorResponse(context.error);

  const { likert, filters, inclusiveMode, clientKey } = parsed.data;
  const result = await submitQuiz(
    { userId: context.value.userId, submission: { likert, filters }, inclusiveMode, clientKey },
    context.value.deps,
  );
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "quiz-submission",
  limit: 8,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
