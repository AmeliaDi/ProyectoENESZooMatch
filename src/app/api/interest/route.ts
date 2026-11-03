import { expressInterest, interestStates, withdrawInterest } from "@/application/chat";
import { parseJsonBody } from "@/application/validation/common";
import { interestSchema } from "@/application/validation/chat";
import { interestContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Me interesa conocerte" (docs/CHAT.md §10.1). Outside the chat lock on
 * purpose: it only reveals the viewer's own signals and whether a chat opened.
 */
async function handleGet() {
  const context = await interestContext();
  if (!context.ok) return errorResponse(context.error);
  const states = await interestStates(context.value.userId, context.value.deps);
  return states.ok ? jsonResponse(states.value) : errorResponse(states.error);
}

async function parsed(request: Request) {
  const body = interestSchema.safeParse(await parseJsonBody(request));
  return body.success ? body.data : null;
}

async function handlePost(request: Request) {
  const context = await interestContext();
  if (!context.ok) return errorResponse(context.error);
  const body = await parsed(request);
  if (!body) return errorResponse("request.invalid");
  const state = await expressInterest(context.value.userId, body, context.value.deps);
  return state.ok ? jsonResponse(state.value) : errorResponse(state.error);
}

async function handleDelete(request: Request) {
  const context = await interestContext();
  if (!context.ok) return errorResponse(context.error);
  const body = await parsed(request);
  if (!body) return errorResponse("request.invalid");
  const done = await withdrawInterest(context.value.userId, body, context.value.deps);
  return done.ok ? jsonResponse({ ok: true }) : errorResponse(done.error);
}

const methods = ["GET", "POST", "DELETE"] as const;

export const GET = withApiSecurity(handleGet, { name: "interest-read", limit: 30, windowSeconds: 60, methods });
export const POST = withApiSecurity(handlePost, { name: "interest-send", limit: 20, windowSeconds: 60, methods });
export const DELETE = withApiSecurity(handleDelete, { name: "interest-withdraw", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
