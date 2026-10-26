import { NextResponse } from "next/server";

import { getAdminContext } from "@/lib/admin-auth.server";
import { recomputeAllMatchesV2 } from "@/lib/matching-recompute.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handlePost() {
  const context = await getAdminContext();
  if (context.status === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (context.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (context.status === "unavailable") {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  try {
    const pairs = await recomputeAllMatchesV2(admin);
    return NextResponse.json({ ok: true, pairs: pairs.length });
  } catch {
    return NextResponse.json({ error: "Unable to recompute matches" }, { status: 503 });
  }
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "admin-recompute-v2",
  limit: 5,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
