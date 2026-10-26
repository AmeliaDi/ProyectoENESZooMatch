import { NextResponse } from "next/server";

import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * v1 quiz submission is retired. The v2 flow is the only supported path; keeping
 * the route as a cheap 410 closes the orphaned write surface without breaking
 * clients that still probe it.
 */
async function handleGone() {
  return NextResponse.json(
    { error: "Gone. Use /api/quiz-v2." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handleGone, {
  name: "quiz-submission-v1-gone",
  limit: 8,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
