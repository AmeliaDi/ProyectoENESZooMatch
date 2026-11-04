import { ok } from "@/domain/shared";
import { adminRoute } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who is signed in (alias only); 401 without a console session. */
const handleGet = adminRoute(async (gate) => ok({ alias: gate.actor.alias }));

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "admin-session", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
