import { getChatActivity } from "@/application/chat";
import { CHAT_CONFIG } from "@/config";
import { failureResponse, resolveChat } from "@/infrastructure/chat/chat-route.server";
import { jsonResponse } from "@/infrastructure/http/responses";
import { createPreflightHandler, withApiSecurity } from "@/infrastructure/security/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `ChatActivityDto`: recent security events (kind + time) and the aggregate
 * of recent failed attempts. No IP, device, PIN or message content.
 */
async function handleGet() {
  const resolved = await resolveChat();
  if (!resolved.ok) return resolved.error;
  const activity = await getChatActivity(resolved.value.userId, CHAT_CONFIG.activity.limit, resolved.value.deps);
  return activity.ok ? jsonResponse(activity.value) : failureResponse(activity.error);
}

const methods = ["GET"] as const;

export const GET = withApiSecurity(handleGet, { name: "chat-activity", limit: 30, windowSeconds: 60, methods });
export const OPTIONS = createPreflightHandler(methods);
