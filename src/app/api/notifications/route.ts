import { NextResponse } from "next/server";
import { z } from "zod";

import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation";
import { notificationIdsSchema } from "@/lib/validation-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  read: z.boolean(),
  created_at: z.string(),
});

async function handleGet(request: Request) {
  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeRead = new URL(request.url).searchParams.get("all") === "true";

  const { data, error } = await client.rpc("get_my_notifications", {
    p_unread_only: !includeRead,
  });

  if (error) {
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 503 });
  }

  const parsed = z.array(notificationSchema).safeParse(data ?? []);
  if (!parsed.success) {
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    { notifications: parsed.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function handlePatch(request: Request) {
  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = notificationIdsSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data, error } = await client.rpc("mark_notifications_read", {
    p_ids: parsed.data.ids,
  });

  if (error) {
    return NextResponse.json({ error: "Unable to update notifications" }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true, marked: typeof data === "number" ? data : 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["GET", "PATCH"] as const;

export const GET = withApiSecurity(handleGet, {
  name: "notifications-read",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const PATCH = withApiSecurity(handlePatch, {
  name: "notifications-write",
  limit: 30,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
