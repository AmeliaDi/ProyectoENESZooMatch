import { z } from "zod";

import { runUserAction } from "@/application/admin";
import { parseJsonBody } from "@/application/validation/common";
import { ADMIN_USER_ACTIONS } from "@/contracts/admin";
import { err } from "@/domain/shared";
import { adminRoute, pathIdAfter } from "@/infrastructure/admin/admin-route.server";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const actionSchema = z.strictObject({ action: z.enum(ADMIN_USER_ACTIONS) });
const SEGMENT = "users";

/** `{ action }` → reset_quiz | pause | resume | reset_chat_pin | delete, audited. */
const handlePost = adminRoute(async (gate, request) => {
  const id = pathIdAfter(request, SEGMENT);
  const body = actionSchema.safeParse(await parseJsonBody(request));
  if (!id || !body.success) return err("request.invalid" as const);
  return runUserAction(gate.actor, id, body.data.action, gate.context.deps);
});

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, { name: "admin-user-action", limit: 20, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
