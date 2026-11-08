import { timingSafeEqual } from "node:crypto";

import { runScheduledReconciliation } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorizedCron(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? process.env.MATRICULA_HMAC_SECRET ?? "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return errorResponse("auth.unauthorized");
  const result = await runScheduledReconciliation();
  if (!result.ok) return errorResponse(result.error);
  return jsonResponse({ ok: true, ...result.value });
}