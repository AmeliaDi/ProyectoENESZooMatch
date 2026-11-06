import { auditAlias } from "@/application/admin";
import { clearAdminSession, requireAdmin } from "@/infrastructure/admin/admin-session.server";
import { jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Always clears the cookie; audits the logout when the session was valid. */
async function handlePost(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.ok) {
    const { actor, context } = gate.value;
    await context.console.recordAudit({ adminId: actor.userId, adminAlias: auditAlias(actor.identity), action: "logout" });
  }
  const response = jsonResponse({ ok: true });
  clearAdminSession(response);
  return response;
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "admin-logout", limit: 10, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
