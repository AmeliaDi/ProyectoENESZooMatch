import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env.server";
import { hashMatricula, privateLoginEmail } from "@/lib/identity.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody, registrationRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  const parsed = registrationRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const env = getServerEnv();
  const admin = createAdminClient();
  const sessionClient = await createClient();
  if (!env || !admin || !sessionClient) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const matriculaHash = hashMatricula(parsed.data.matricula, env.MATRICULA_HMAC_SECRET);
  const email = privateLoginEmail(matriculaHash);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: "Registration unavailable" }, { status: 409 });
  }

  const userId = created.user.id;
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    matricula_hash: matriculaHash,
    role: "participant",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Registration unavailable" }, { status: 409 });
  }

  const { error: signInError } = await sessionClient.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (signInError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Registration unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "registration",
  limit: 5,
  windowSeconds: 600,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
