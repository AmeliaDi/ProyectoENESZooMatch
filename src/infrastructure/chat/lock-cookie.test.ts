import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";
import { openLockSession } from "@/domain/chat";

import {
  LOCK_COOKIE,
  clearLockCookie,
  decodeLockSession,
  encodeLockSession,
  readCookie,
  setLockCookie,
} from "./lock-cookie.server";

const PEPPER = "p".repeat(64);
const T0 = new Date("2026-11-02T12:00:00.000Z");
const session = openLockSession("user-1", T0, CHAT_CONFIG.lock);

describe("lock-session cookie", () => {
  it("skips a cleared duplicate and reads the live value", () => {
    const request = new Request("https://x.test/api/chat/inbox", {
      headers: { cookie: `${LOCK_COOKIE}=; other=1; ${LOCK_COOKIE}=live.sig` },
    });
    expect(readCookie(request, LOCK_COOKIE)).toBe("live.sig");
  });
  it("round-trips a signed payload", () => {
    expect(decodeLockSession(encodeLockSession(session, PEPPER), PEPPER)).toEqual(session);
  });

  it("rejects tampered, re-signed with another key or malformed values", () => {
    const value = encodeLockSession(session, PEPPER);
    const [body, signature] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ ...session, uid: "user-2" })).toString("base64url");
    expect(decodeLockSession(`${forged}.${signature}`, PEPPER)).toBeNull();
    expect(decodeLockSession(`${body}.${signature}x`, PEPPER)).toBeNull();
    expect(decodeLockSession(encodeLockSession(session, "q".repeat(64)), PEPPER)).toBeNull();
    expect(decodeLockSession(`${value}.extra`, PEPPER)).toBeNull();
    expect(decodeLockSession("garbage", PEPPER)).toBeNull();
    expect(decodeLockSession(undefined, PEPPER)).toBeNull();
  });

  it("is httpOnly, SameSite=Strict and scoped to /api/chat", () => {
    const response = NextResponse.json({});
    setLockCookie(response, session, T0, PEPPER);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${LOCK_COOKIE}=`);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=strict/i);
    expect(header).toContain("Path=/api/chat");
    expect(header).toContain(`Max-Age=${CHAT_CONFIG.lock.maxMinutes * 60}`);
  });

  it("clears with the same name and path", () => {
    const response = NextResponse.json({});
    clearLockCookie(response);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${LOCK_COOKIE}=;`);
    expect(header).toContain("Path=/api/chat");
    expect(header).toContain("Max-Age=0");
  });

  it("reads one cookie out of the header", () => {
    const request = new Request("http://localhost/api/chat/inbox", { headers: { cookie: `a=1; ${LOCK_COOKIE}=x.y; b=2` } });
    expect(readCookie(request, LOCK_COOKIE)).toBe("x.y");
  });
});
