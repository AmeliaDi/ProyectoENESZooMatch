import { refineProfile } from "@/application/refine-profile";
import { parseJsonBody } from "@/application/validation/common";
import { refineSubmissionSchema } from "@/application/validation/quiz";
import { refineContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePost(request: Request) {
  const parsed = refineSubmissionSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");

  const context = await refineContext();
  if (!context.ok) return errorResponse(context.error);

  const result = await refineProfile(
    { userId: context.value.userId, module: parsed.data.module, likert: parsed.data.likert },
    context.value.deps,
  );
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "quiz-refine",
  limit: 8,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
