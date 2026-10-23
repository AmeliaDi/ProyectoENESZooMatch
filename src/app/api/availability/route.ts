import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env.server";
import { hashMatricula } from "@/lib/identity.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { availabilityRequestSchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  const parsed = availabilityRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const env = getServerEnv();
  const admin = createAdminClient();
  if (!env || !admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const matriculaHash = hashMatricula(parsed.data.matricula, env.MATRICULA_HMAC_SECRET);
  const { data, error } = await admin.rpc("is_matricula_available", {
    p_matricula_hash: matriculaHash,
  });

  if (error || typeof data !== "boolean") {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    { available: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "availability",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
