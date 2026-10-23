import { NextResponse } from "next/server";
import { z } from "zod";

import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createClient } from "@/lib/supabase/server";

const matchSchema = z.object({
  alias: z.string(),
  similarity: z.number().min(0).max(1),
  justification: z.array(
    z.object({
      dimension: z.string(),
      affinity: z.number().min(0).max(1),
    }),
  ),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGet() {
  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profileResult, matchesResult] = await Promise.all([
    client
      .from("profiles")
      .select(
        "alias, archetypes(id, mbti_code, nickname, role_name, traits, animal, palette, primary_color, readable_combination)",
      )
      .eq("id", userData.user.id)
      .maybeSingle(),
    client.rpc("get_my_matches"),
  ]);

  if (profileResult.error || matchesResult.error || !profileResult.data) {
    return NextResponse.json({ error: "Result unavailable" }, { status: 503 });
  }

  const parsedMatches = z.array(matchSchema).safeParse(matchesResult.data ?? []);
  if (!parsedMatches.success) {
    return NextResponse.json({ error: "Result unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    {
      alias: profileResult.data.alias,
      archetype: profileResult.data.archetypes,
      matches: parsedMatches.data,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "result",
  limit: 60,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
