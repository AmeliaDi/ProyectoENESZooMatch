import { listUsers } from "@/application/admin";
import { adminRoute, pageParam } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `?q=<alias>&page=<n>` → one page of accounts (no matrícula, hash or answers). */
const handleGet = adminRoute((gate, request) =>
  listUsers(new URL(request.url).searchParams.get("q") ?? "", pageParam(request), gate.context.deps),
);

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "admin-users", limit: 60, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
