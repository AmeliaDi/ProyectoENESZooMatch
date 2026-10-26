import { NextResponse } from "next/server";

import { enterWithMatricula } from "@/lib/matricula-session.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { availabilityRequestSchema, parseJsonBody } from "@/lib/validation";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  const parsed = availabilityRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await enterWithMatricula(parsed.data.matricula);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "enter",
  limit: 10,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
