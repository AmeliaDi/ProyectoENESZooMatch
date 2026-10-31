import { listNotifications, markNotificationsRead } from "@/application/notifications";
import { parseJsonBody } from "@/application/validation/common";
import { notificationIdsSchema } from "@/application/validation/quiz";
import { notificationContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet(request: Request) {
  const context = await notificationContext();
  if (!context.ok) return errorResponse(context.error);

  const includeRead = new URL(request.url).searchParams.get("all") === "true";
  const result = await listNotifications(includeRead, context.value);
  return result.ok
    ? jsonResponse({ notifications: result.value })
    : errorResponse(result.error);
}

async function handlePatch(request: Request) {
  const context = await notificationContext();
  if (!context.ok) return errorResponse(context.error);

  const parsed = notificationIdsSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");

  const result = await markNotificationsRead(parsed.data.ids, context.value);
  return result.ok
    ? jsonResponse({ ok: true, marked: result.value })
    : errorResponse(result.error);
}

const methods = ["GET", "PATCH"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "notifications-read",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const PATCH = withApiSecurity(handlePatch, {
  name: "notifications-write",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
