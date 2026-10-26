import { NextResponse } from "next/server";
import { z } from "zod";

import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation/common";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const runtime = "nodejs";

async function handlePost(request: Request) {
  const parsed = loginSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: login, error: loginError } = await client.auth.signInWithPassword(parsed.data);
  if (loginError || !login.user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { data: role, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", login.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || role?.role !== "admin") {
    await client.auth.signOut();
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "admin-login",
  limit: 5,
  windowSeconds: 900,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
