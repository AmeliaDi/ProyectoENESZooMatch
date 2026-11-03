import { clearLockCookie } from "@/infrastructure/chat/lock-cookie.server";
import { jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";
import { createClient } from "@/infrastructure/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public sign-out: always succeeds, even without a session (idempotent). */
async function handlePost() {
  const client = await createClient();
  await client?.auth.signOut({ scope: "local" }).catch(() => undefined);
  const response = jsonResponse({ ok: true });
  clearLockCookie(response);
  return response;
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "exit",
  limit: 20,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
