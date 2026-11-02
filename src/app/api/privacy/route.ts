import { deleteMyData, getPrivacyState, setProfilePaused, setShowAvatarDetail } from "@/application/privacy";
import { parseJsonBody } from "@/application/validation/common";
import { privacyUpdateSchema } from "@/application/validation/quiz";
import { privacyContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet() {
  const context = await privacyContext();
  if (!context.ok) return errorResponse(context.error);
  const result = await getPrivacyState(context.value.userId, context.value.deps);
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

async function handlePatch(request: Request) {
  const context = await privacyContext();
  if (!context.ok) return errorResponse(context.error);
  const parsed = privacyUpdateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("request.invalid");
  const { userId, deps } = context.value;
  if ("showAvatarDetail" in parsed.data) {
    const shown = await setShowAvatarDetail(userId, parsed.data.showAvatarDetail, deps);
    return shown.ok ? jsonResponse({ showAvatarDetail: parsed.data.showAvatarDetail }) : errorResponse(shown.error);
  }
  const result = await setProfilePaused(userId, parsed.data.paused, deps);
  return result.ok ? jsonResponse(result.value) : errorResponse(result.error);
}

async function handleDelete() {
  const context = await privacyContext();
  if (!context.ok) return errorResponse(context.error);
  const result = await deleteMyData(context.value.userId, context.value.deps);
  if (!result.ok) return errorResponse(result.error);
  await context.value.signOut();
  return jsonResponse({ ok: true, ...result.value });
}

const methods = ["GET", "PATCH", "DELETE"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "privacy-read",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const PATCH = withApiSecurity(handlePatch, {
  name: "privacy-write",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const DELETE = withApiSecurity(handleDelete, {
  name: "privacy-delete",
  limit: 3,
  windowSeconds: 300,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
