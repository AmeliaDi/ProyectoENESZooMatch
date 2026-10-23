import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env.server";
import { hashMatricula, privateLoginEmail } from "@/lib/identity.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";
import { availabilityRequestSchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function handlePost(request: Request) {
  const parsed = availabilityRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const env = getServerEnv();
  const admin = createAdminClient();
  const sessionClient = await createClient();
  if (!env || !admin || !sessionClient) {
    return unavailable();
  }

  const matriculaHash = hashMatricula(parsed.data.matricula, env.MATRICULA_HMAC_SECRET);

  // 1. Find the account created during registration (v1 profiles table).
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("matricula_hash", matriculaHash)
    .maybeSingle();

  if (profileError) {
    return unavailable();
  }
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const userId = profile.id;
  const email = privateLoginEmail(matriculaHash);

  // 2. Re-open a session without the original (never stored) password:
  //    generate a magic link with the service role, then verify its token hash
  //    on the cookie-based server client so the SSR session cookies are set.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = link?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    return unavailable();
  }

  const { error: sessionError } = await sessionClient.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (sessionError) {
    return unavailable();
  }

  // 3. Decide the destination based on whether the v2 quiz is already complete.
  const { data: profileV2, error: profileV2Error } = await admin
    .from("profiles_v2")
    .select("quiz_completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileV2Error) {
    return unavailable();
  }

  const hasQuiz = Boolean(profileV2?.quiz_completed_at);

  return NextResponse.json(
    {
      ok: true,
      hasQuiz,
      redirect: hasQuiz ? "/resultado-v2" : "/cuestionario-v2",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "login",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
