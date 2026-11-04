import { recomputeAudited } from "@/application/admin";
import { adminRoute } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const handlePost = adminRoute((gate) => recomputeAudited(gate.actor, gate.context.deps));

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "admin-recompute", limit: 5, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
