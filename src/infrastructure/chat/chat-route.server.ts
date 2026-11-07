/**
 * Route-side helpers of the chat lock: context resolution, the per-address
 * guard and `requireChatLock`, the gate every chat data route must pass.
 */
import type { NextResponse } from "next/server";
import type { z } from "zod";

import { LOCK_POLICY, assertChatOpen } from "@/application/chat";
import type { AppFailure } from "@/application/errors";
import { parseJsonBody } from "@/application/validation/common";
import { checkLockSession, openLockSession, touchLockSession, type LockSession } from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";
import { clientAddress } from "@/infrastructure/auth/access-guard.server";
import { chatContext, type ChatContext } from "@/infrastructure/composition.server";
import { errorResponse, jsonResponse } from "@/infrastructure/http/chat-responses";
import { logServerEvent } from "@/infrastructure/observability/log.server";

import { LOCK_COOKIE, clearLockCookie, decodeLockSession, readCookie, setLockCookie } from "./lock-cookie.server";

export async function resolveChat(): Promise<Result<ChatContext, NextResponse>> {
  const context = await chatContext();
  return context.ok ? context : err(errorResponse(context.error));
}

/** Fails closed: an unavailable guard blocks the attempt. */
export async function guardChatAddress(request: Request, context: ChatContext): Promise<NextResponse | null> {
  const retryAfter = await context.guardAddress(clientAddress(request.headers));
  if (retryAfter === null) {
    logServerEvent("error", "chat.guard_unavailable");
    return errorResponse("service.unavailable");
  }
  if (retryAfter > 0) {
    logServerEvent("warn", "chat.guard_locked", { retryAfter });
    return errorResponse({ code: "chat.pin_paused", retryAfter });
  }
  return null;
}

/** Context for routes that evaluate a PIN or matrícula: session + address guard. */
export async function guardedChat(request: Request): Promise<Result<ChatContext, NextResponse>> {
  const resolved = await resolveChat();
  if (!resolved.ok) return resolved;
  const blocked = await guardChatAddress(request, resolved.value);
  return blocked ? err(blocked) : resolved;
}

export async function parseChatBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S> | null> {
  const parsed = schema.safeParse(await parseJsonBody(request));
  return parsed.success ? parsed.data : null;
}

/** The valid lock session of this request, or `null` (missing, forged, other user, expired). */
export function readLockSession(request: Request, context: ChatContext): LockSession | null {
  const session = decodeLockSession(readCookie(request, LOCK_COOKIE), context.pepper);
  if (!session) return null;
  const check = checkLockSession(session, context.userId, context.deps.clock.now(), LOCK_POLICY);
  return check === "open" ? session : null;
}

/** Success body plus a fresh lock session: the PIN was just proven or set. */
export function openedResponse(context: ChatContext, body: unknown = { ok: true }): NextResponse {
  const now = context.deps.clock.now();
  const response = jsonResponse(body);
  setLockCookie(response, openLockSession(context.userId, now, LOCK_POLICY), now, context.pepper);
  return response;
}

export function failureResponse(failure: AppFailure): NextResponse {
  logServerEvent("info", "chat.refused", { code: failure.code });
  return errorResponse(failure);
}

export interface OpenChat {
  context: ChatContext;
  /** Renews the idle window on the outgoing response. */
  renew(response: NextResponse): NextResponse;
}

function locked(failure: AppFailure = { code: "chat.locked" }): NextResponse {
  const response = errorResponse(failure);
  clearLockCookie(response);
  return response;
}

/**
 * Gate for every chat route that returns or accepts chat data: a session,
 * a valid lock session for the same user, and no pending recovery.
 * Any failure answers without data.
 */
export async function requireChatLock(request: Request): Promise<Result<OpenChat, NextResponse>> {
  const resolved = await resolveChat();
  if (!resolved.ok) return resolved;
  const context = resolved.value;
  const session = readLockSession(request, context);
  if (!session) return err(locked());
  const open = await assertChatOpen(context.userId, context.deps);
  if (!open.ok) return err(locked(open.error));
  return ok({
    context,
    renew(response) {
      const now = context.deps.clock.now();
      setLockCookie(response, touchLockSession(session, now), now, context.pepper);
      return response;
    },
  });
}
