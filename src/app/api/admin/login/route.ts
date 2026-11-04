import { z } from "zod";

import { adminLogin } from "@/application/admin";
import { parseJsonBody, matriculaSchema } from "@/application/validation/common";
import { ADMIN_CONFIG } from "@/config";
import { openAdminSession } from "@/infrastructure/admin/admin-session.server";
import { clientAddress } from "@/infrastructure/auth/access-guard.server";
import { adminConsoleContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";
import { logServerEvent } from "@/infrastructure/observability/log.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.strictObject({
  matricula: matriculaSchema,
  pin: z.string().regex(new RegExp(`^[0-9]{${ADMIN_CONFIG.pin.length}}$`)),
});

/**
 * `{ matricula, pin }` → console session cookie. Any wrong part answers the
 * same `admin.invalid`; a running pause answers `admin.paused` + retryAfter.
 */
async function handlePost(request: Request) {
  const parsed = loginSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return errorResponse("admin.invalid");
  const context = await adminConsoleContext();
  if (!context.ok) return errorResponse(context.error);

  const retryAfter = await context.value.guardAddress(clientAddress(request.headers));
  if (retryAfter === null) return errorResponse("service.unavailable");
  if (retryAfter > 0) return errorResponse({ code: "admin.paused", retryAfter });

  const result = await adminLogin(parsed.data.matricula, parsed.data.pin, context.value.login);
  if (!result.ok) {
    logServerEvent("warn", "admin.login_refused", { code: result.error.code });
    return errorResponse(result.error);
  }
  const response = jsonResponse({ ok: true });
  openAdminSession(response, result.value.userId, context.value);
  return response;
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "admin-login", limit: 10, windowSeconds: 900, methods });
export const OPTIONS = createPreflightHandler(methods);
