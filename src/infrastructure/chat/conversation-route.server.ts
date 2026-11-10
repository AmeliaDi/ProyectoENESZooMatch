/**
 * Shared plumbing of `/api/chat/conversations/[id]/*`: the chat lock gate,
 * the id taken from the path (route handlers are wrapped by withChatApiSecurity,
 * which only forwards the request) and the uniform result → response mapping.
 */
import type { NextResponse } from "next/server";
import type { z } from "zod";

import type { ConversationDeps } from "@/application/chat";
import type { AppError, AppFailure } from "@/application/errors";
import { conversationIdSchema } from "@/application/validation/chat";
import { err, ok, type Result } from "@/domain/shared";
import { errorResponse, jsonResponse } from "@/infrastructure/http/chat-responses";

import { parseChatBody, requireChatLock, type OpenChat } from "./chat-route.server";

const SEGMENT = "conversations";

/** The `[id]` segment right after `/conversations/`, if it is a UUID. */
export function conversationIdOf(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/");
  const at = parts.indexOf(SEGMENT);
  const id = at >= 0 ? parts[at + 1] : undefined;
  return id && conversationIdSchema.safeParse(id).success ? id : null;
}

export function conversationDeps(open: OpenChat): ConversationDeps {
  return {
    conversations: open.context.conversations,
    clock: open.context.deps.clock,
    questions: open.context.coincidences,
  };
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

/** `void` success → `{ ok: true }` body. */
export function okBody(result: Result<void, AppError>): Result<{ ok: true }, AppError> {
  return result.ok ? ok({ ok: true }) : result;
}

/** POST body → use case, with the conversation deps; invalid body → `request.invalid`. */
export function conversationAction<S extends z.ZodType, T>(
  schema: S,
  run: (id: string, viewer: string, body: z.output<S>, deps: ConversationDeps) => Promise<Result<T, AppError>>,
) {
  return (request: Request) =>
    withConversation(request, async (open, id) => {
      const body = await parseChatBody(request, schema);
      if (body === null) return err("request.invalid" as const);
      return run(id, open.context.userId, body, conversationDeps(open));
    });
}
