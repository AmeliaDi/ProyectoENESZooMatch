import { bumpCounter } from "@/application/admin";
import { counterMoveSchema } from "@/contracts/admin";
import { adminRoute } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";
import { err } from "@/domain/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `{ "key": "ligues" | "novios", "delta"?: n, "set"?: n }` → one manual tally
 * move. The body is checked against the same rule the database enforces, so a
 * request that asks for both a step and a correction never reaches it; the
 * clamp at zero and the audit row are the base's job, not this route's.
 */
const handlePost = adminRoute(async (gate, request) => {
  const body = await request.json().catch(() => null);
  const move = counterMoveSchema.safeParse(body);
  if (!move.success) return err("request.invalid");
  return bumpCounter(gate.actor.userId, move.data, gate.context.deps);
});

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "admin-counters", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
