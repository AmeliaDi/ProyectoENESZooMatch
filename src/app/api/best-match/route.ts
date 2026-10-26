import { NextResponse } from "next/server";

import { getBestMatches } from "@/lib/scoring/best-match.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet() {
  const client = await createClient();
  if (!client) {
    return NextResponse.json(
      { status: "unavailable", message: "Service unavailable", matches: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json(
      { status: "unauthorized", matches: [] },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { status: "unavailable", message: "Service unavailable", matches: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await getBestMatches(admin, userData.user.id);
    if (result.status !== "ok") {
      return NextResponse.json(
        { status: result.status, message: result.message, matches: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        matches: result.matches.map(
          ({ alias, animal, color, scoreFinal, breakdown, partial, missing, explanation }) => ({
            alias,
            animal,
            color,
            scoreFinal,
            breakdown,
            partial,
            missing,
            explanation,
          }),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", message: "Service unavailable", matches: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "best-match",
  limit: 60,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
