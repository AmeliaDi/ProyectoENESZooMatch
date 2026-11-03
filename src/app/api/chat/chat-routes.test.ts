import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MemoryStore,
  memoryChatPins,
  memoryMatriculas,
  plainPinHasher,
} from "@/application/testing/in-memory";
import { CHAT_CONFIG } from "@/config";
import { MS_PER_MINUTE, openLockSession } from "@/domain/chat";
import { err, ok } from "@/domain/shared";
import type { ChatContext } from "@/infrastructure/composition.server";
import { LOCK_COOKIE, encodeLockSession } from "@/infrastructure/chat/lock-cookie.server";

const mocks = vi.hoisted(() => ({ chatContext: vi.fn(), log: vi.fn() }));

vi.mock("@/infrastructure/composition.server", () => ({ chatContext: mocks.chatContext }));
vi.mock("@/infrastructure/observability/log.server", () => ({ logServerEvent: mocks.log }));
vi.mock("@/infrastructure/security/api.server", () => ({
  withApiSecurity: (handler: (request: Request) => Promise<Response>) => handler,
  createPreflightHandler: () => async () => new Response(null, { status: 204 }),
}));

import { GET as inbox } from "./inbox/route";
import { POST as lock } from "./lock/route";
import { POST as createPin } from "./pin/route";
import { DELETE as cancelRecovery, POST as requestRecovery } from "./recovery/route";
import { GET as status } from "./status/route";
import { POST as unlock } from "./unlock/route";

const USER = "user-1";
const PIN = "4826";
const PEPPER = "p".repeat(64);
const T0 = new Date("2026-11-02T12:00:00.000Z").getTime();

let store: MemoryStore;
let now: number;
let guard: number | null;

function context(userId = USER): ChatContext {
  return {
    userId,
    pepper: PEPPER,
    deps: {
      pins: memoryChatPins(store),
      hasher: plainPinHasher,
      matricula: memoryMatriculas(store),
      clock: { now: () => new Date(now) },
    },
    guardAddress: async () => guard,
  };
}

function request(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.cookie) headers.cookie = init.cookie;
  return new Request(`http://localhost/api/chat/${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function lockCookieOf(response: Response): string {
  const match = (response.headers.get("set-cookie") ?? "").match(new RegExp(`${LOCK_COOKIE}=([^;]*)`));
  return `${LOCK_COOKIE}=${match?.[1] ?? ""}`;
}

async function createAndOpen(): Promise<string> {
  const response = await createPin(request("pin", { method: "POST", body: { pin: PIN, confirm: PIN } }));
  expect(response.status).toBe(200);
  return lockCookieOf(response);
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new MemoryStore();
  store.matriculas.set(USER, "000000001");
  now = T0;
  guard = 0;
  mocks.chatContext.mockImplementation(async () => ok(context()));
});

describe("GET /api/chat/inbox", () => {
  it("answers chat.locked and no data without a lock session", async () => {
    await createAndOpen();
    const response = await inbox(request("inbox"));
    expect(response.status).toBe(423);
    const body = await response.json();
    expect(body).toMatchObject({ code: "chat.locked" });
    expect(body).not.toHaveProperty("conversations");
  });

  it("opens with the cookie issued by the PIN and renews it", async () => {
    const cookie = await createAndOpen();
    const response = await inbox(request("inbox", { cookie }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ conversations: [] });
    expect(response.headers.get("set-cookie")).toContain(LOCK_COOKIE);
  });

  it("locks after the idle window", async () => {
    const cookie = await createAndOpen();
    now += CHAT_CONFIG.lock.idleMinutes * MS_PER_MINUTE;
    expect((await inbox(request("inbox", { cookie }))).status).toBe(423);
  });

  it("rejects a tampered cookie and one from another person", async () => {
    await createAndOpen();
    const other = encodeLockSession(openLockSession("user-2", new Date(now), CHAT_CONFIG.lock), PEPPER);
    expect((await inbox(request("inbox", { cookie: `${LOCK_COOKIE}=${other}` }))).status).toBe(423);
    const forged = encodeLockSession(openLockSession(USER, new Date(now), CHAT_CONFIG.lock), "q".repeat(64));
    expect((await inbox(request("inbox", { cookie: `${LOCK_COOKIE}=${forged}` }))).status).toBe(423);
  });

  it("stays closed during a recovery request even with a valid cookie", async () => {
    const cookie = await createAndOpen();
    await requestRecovery(request("recovery", { method: "POST", body: { matricula: "000000001" } }));
    const response = await inbox(request("inbox", { cookie }));
    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({ code: "chat.recovery_pending" });
  });

  it("is unavailable without the pepper, never crashing", async () => {
    mocks.chatContext.mockResolvedValue(err("service.unavailable"));
    expect((await inbox(request("inbox"))).status).toBe(503);
  });
});

describe("PIN routes", () => {
  it("fail closed when the address guard is down", async () => {
    guard = null;
    const response = await unlock(request("unlock", { method: "POST", body: { pin: PIN } }));
    expect(response.status).toBe(503);
  });

  it("pause when the address guard locks", async () => {
    guard = 120;
    const response = await unlock(request("unlock", { method: "POST", body: { pin: PIN } }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
  });

  it("reject malformed bodies before touching the guard", async () => {
    guard = null;
    const response = await unlock(request("unlock", { method: "POST", body: { pin: "48a6", extra: 1 } }));
    expect(response.status).toBe(400);
  });

  it("answer a wrong PIN generically with the attempts left", async () => {
    await createAndOpen();
    const response = await unlock(request("unlock", { method: "POST", body: { pin: "1357" } }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "chat.pin_invalid", attemptsLeft: 4 });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("wrong matrícula gets a generic error", async () => {
    await createAndOpen();
    const response = await requestRecovery(request("recovery", { method: "POST", body: { matricula: "000000002" } }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "chat.recovery_invalid" });
  });

  it("cancel a recovery with the current PIN", async () => {
    await createAndOpen();
    await requestRecovery(request("recovery", { method: "POST", body: { matricula: "000000001" } }));
    const response = await cancelRecovery(request("recovery", { method: "DELETE", body: { pin: PIN } }));
    expect(response.status).toBe(200);
  });

  it("never put the PIN or matrícula in logs or DTOs", async () => {
    const cookie = await createAndOpen();
    const bodies = [
      await (await unlock(request("unlock", { method: "POST", body: { pin: PIN } }))).text(),
      await (await unlock(request("unlock", { method: "POST", body: { pin: "1357" } }))).text(),
      await (await status(request("status", { cookie }))).text(),
      await (await requestRecovery(request("recovery", { method: "POST", body: { matricula: "000000001" } }))).text(),
    ];
    const logged = JSON.stringify(mocks.log.mock.calls);
    for (const text of [...bodies, logged]) {
      expect(text).not.toContain(PIN);
      expect(text).not.toContain("1357");
      expect(text).not.toContain("000000001");
      expect(text).not.toContain(USER);
    }
  });
});

describe("status and lock", () => {
  it("reports no PIN, then unlocked with the cookie", async () => {
    await expect((await status(request("status"))).json()).resolves.toMatchObject({ hasPin: false, unlocked: false });
    const cookie = await createAndOpen();
    await expect((await status(request("status", { cookie }))).json()).resolves.toMatchObject({ hasPin: true, unlocked: true });
    await expect((await status(request("status"))).json()).resolves.toMatchObject({ hasPin: true, unlocked: false });
  });

  it("lock clears the cookie without a body (sendBeacon)", async () => {
    const response = await lock(new Request("http://localhost/api/chat/lock", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
