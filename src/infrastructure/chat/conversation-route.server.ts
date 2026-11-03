/**
 * Shared plumbing of `/api/chat/conversations/[id]/*`: the chat lock gate,
 * the id taken from the path (route handlers are wrapped by withApiSecurity,
 * which only forwards the request) and the uniform result → response mapping.
 */
import type { NextResponse } from "next/server";

import type { AppError, AppFailure } from "@/application/errors";
import { conversationIdSchema } from "@/application/validation/chat";
import type { Result } from "@/domain/shared";
import { errorResponse, jsonResponse } from "@/infrastructure/http/responses";

import { requireChatLock, type OpenChat } from "./chat-route.server";

const SEGMENT = "conversations";

/** The `[id]` segment right after `/conversations/`, if it is a UUID. */
export function conversationIdOf(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/");
  const at = parts.indexOf(SEGMENT);
  const id = at >= 0 ? parts[at + 1] : undefined;
  return id && conversationIdSchema.safeParse(id).success ? id : null;
}

/**
 * Runs `run` only with an open lock and a well-formed id. Any id that is not
 * the viewer's answers `chat.not_found`, the same as a missing one.
 */
export async function withConversation<T>(
  request: Request,
  run: (open: OpenChat, id: string) => Promise<Result<T, AppError | AppFailure>>,
): Promise<NextResponse> {
  const open = await requireChatLock(request);
  if (!open.ok) return open.error;
  const id = conversationIdOf(request);
  if (!id) return open.value.renew(errorResponse("chat.not_found"));
  const result = await run(open.value, id);
  return open.value.renew(result.ok ? jsonResponse(result.value ?? { ok: true }) : errorResponse(result.error));
}
