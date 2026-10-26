import { NextResponse } from "next/server";

import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** v1 result reads are retired in favour of /api/result-v2. */
async function handleGone() {
  return NextResponse.json(
    { error: "Gone. Use /api/result-v2." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGone, {
  name: "result-v1-gone",
  limit: 60,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
