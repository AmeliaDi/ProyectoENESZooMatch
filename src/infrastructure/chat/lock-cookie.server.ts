/**
 * Signed lock-session cookie (docs/CHAT.md §3). httpOnly, SameSite=Strict and
 * scoped to `/api/chat`, so pages and scripts never see it. The payload is
 * signed with a key derived from the pepper and bound to the Supabase user id.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextResponse } from "next/server";
import { z } from "zod";

import { lockSessionMaxAge, type LockSession } from "@/domain/chat";

export const LOCK_COOKIE = "zm_chat_lock";
export const LOCK_COOKIE_PATH = "/api/chat";
const KEY_LABEL = "chat-lock-session";

const sessionSchema = z.strictObject({
  uid: z.string().min(1).max(64),
  iat: z.number().int().nonnegative(),
  lastSeen: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

function signingKey(pepper: string, label: string): Buffer {
  return createHmac("sha256", pepper).update(label, "utf8").digest();
}

function sign(body: string, pepper: string, label: string): string {
  return createHmac("sha256", signingKey(pepper, label)).update(body, "utf8").digest("base64url");
}

/** `label` separates keys: a chat lock cookie never validates as another session. */
export function encodeLockSession(session: LockSession, pepper: string, label = KEY_LABEL): string {
  const body = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${body}.${sign(body, pepper, label)}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function parsePayload(body: string): LockSession | null {
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `null` for a missing, malformed or tampered cookie. */
export function decodeLockSession(value: string | undefined, pepper: string, label = KEY_LABEL): LockSession | null {
  if (!value) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(signature, sign(body, pepper, label))) return null;
  return parsePayload(body);
}

/** First non-empty value: a cleared duplicate (`name=`) must not hide a live one. */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === name && value) return value;
  }
  return undefined;
}

type CookieWriter = Pick<NextResponse, "cookies">;

const baseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: LOCK_COOKIE_PATH,
});

export function setLockCookie(response: CookieWriter, session: LockSession, now: Date, pepper: string): void {
  response.cookies.set(LOCK_COOKIE, encodeLockSession(session, pepper), {
    ...baseOptions(),
    maxAge: lockSessionMaxAge(session, now),
  });
}

/** Also used by `/api/exit` and `/api/enter`: same name and path. */
export function clearLockCookie(response: CookieWriter): void {
  response.cookies.set(LOCK_COOKIE, "", { ...baseOptions(), maxAge: 0 });
}
