/**
 * Console session (ADR-036): a signed, httpOnly, SameSite=Strict cookie scoped
 * to `/api/admin`, independent of the participant's Supabase session. Same
 * format as the chat lock cookie but signed under its own key label, so one
 * can never be replayed as the other. Idle and hard expiry from config.
 */
import type { NextResponse } from "next/server";

import type { AdminActor } from "@/application/admin";
import { EGG_IDENTITY_DTO } from "@/application/identity-dto";
import { ADMIN_CONFIG } from "@/config";
import { checkLockSession, lockSessionMaxAge, openLockSession, touchLockSession, type LockSession } from "@/domain/chat";
import { err, ok, type Result } from "@/domain/shared";
import { adminConsoleContext, type AdminConsoleContext } from "@/infrastructure/composition.server";
import { decodeLockSession, encodeLockSession, readCookie } from "@/infrastructure/chat/lock-cookie.server";
import { errorResponse } from "@/infrastructure/http/responses";

export const ADMIN_COOKIE = "zm_admin_session";
export const ADMIN_COOKIE_PATH = "/api/admin";
const KEY_LABEL = "admin-console-session";
const POLICY = ADMIN_CONFIG.session;

type CookieWriter = Pick<NextResponse, "cookies">;

const baseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: ADMIN_COOKIE_PATH,
});

function writeSession(response: CookieWriter, session: LockSession, now: Date, pepper: string): void {
  response.cookies.set(ADMIN_COOKIE, encodeLockSession(session, pepper, KEY_LABEL), {
    ...baseOptions(),
    maxAge: lockSessionMaxAge(session, now),
  });
}

export function openAdminSession(response: CookieWriter, userId: string, context: AdminConsoleContext): void {
  const now = context.clock.now();
  writeSession(response, openLockSession(userId, now, POLICY), now, context.pepper);
}

export function clearAdminSession(response: CookieWriter): void {
  response.cookies.set(ADMIN_COOKIE, "", { ...baseOptions(), maxAge: 0 });
}

/** The valid session of this request, or `null` (missing, forged, idle, expired). */
export function readAdminSession(request: Request, context: AdminConsoleContext): LockSession | null {
  const session = decodeLockSession(readCookie(request, ADMIN_COOKIE), context.pepper, KEY_LABEL);
  if (!session) return null;
  return checkLockSession(session, session.uid, context.clock.now(), POLICY) === "open" ? session : null;
}

export interface AdminGate {
  context: AdminConsoleContext;
  actor: AdminActor;
  /** Renews the idle window on the outgoing response. */
  renew(response: NextResponse): NextResponse;
}

function unauthorized(): NextResponse {
  const response = errorResponse("auth.unauthorized");
  clearAdminSession(response);
  return response;
}

/**
 * Gate of every console route: a valid signed session AND the role still
 * present in `user_roles` (revoking the role ends the session at once).
 */
export async function requireAdmin(request: Request): Promise<Result<AdminGate, NextResponse>> {
  const context = await adminConsoleContext();
  if (!context.ok) return err(errorResponse(context.error));
  const session = readAdminSession(request, context.value);
  if (!session) return err(unauthorized());
  const role = await context.value.console.isAdmin(session.uid);
  if (!role.ok) return err(errorResponse(role.error));
  if (!role.value) return err(unauthorized());
  const user = await context.value.console.findUser(session.uid);
  // An unreadable name stays an egg: the console shows no identity rather
  // than a guessed one.
  const identity = user.ok ? (user.value?.identity ?? EGG_IDENTITY_DTO) : EGG_IDENTITY_DTO;
  return ok({
    context: context.value,
    actor: { userId: session.uid, identity },
    renew(response) {
      const now = context.value.clock.now();
      writeSession(response, touchLockSession(session, now), now, context.value.pepper);
      return response;
    },
  });
}
