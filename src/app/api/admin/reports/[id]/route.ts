import { z } from "zod";

import { reviewReport } from "@/application/admin";
import { parseJsonBody } from "@/application/validation/common";
import { err, ok } from "@/domain/shared";
import { adminRoute, pathIdAfter } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewSchema = z.strictObject({ status: z.enum(["revisado", "cerrado"]) });
const SEGMENT = "reports";

/** `{ status }` → moves the report and records it in both audit trails. */
const handlePost = adminRoute(async (gate, request) => {
  const id = pathIdAfter(request, SEGMENT);
  const body = reviewSchema.safeParse(await parseJsonBody(request));
  if (!id || !body.success) return err("request.invalid" as const);
  const done = await reviewReport(gate.actor, id, body.data.status, gate.context.deps);
  return done.ok ? ok({ ok: true }) : done;
});

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "admin-report-review", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
