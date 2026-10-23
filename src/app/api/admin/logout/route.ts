import { NextResponse } from "next/server";

import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function handlePost() {
  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  await client.auth.signOut();
  return NextResponse.json({ ok: true });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "admin-logout",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
