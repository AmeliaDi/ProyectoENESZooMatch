import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MemoryStore,
  memoryChatPins,
  memoryMatriculas,
  plainPinHasher,
} from "@/application/testing/in-memory";
import { ConversationStore, memoryConversations } from "@/application/testing/memory-conversations";
import { CHAT_CONFIG } from "@/config";
import { MS_PER_MINUTE, openLockSession, type CoincidenceQuestion } from "@/domain/chat";
import { err, ok } from "@/domain/shared";
import type { ChatContext } from "@/infrastructure/composition.server";
import { LOCK_COOKIE, encodeLockSession } from "@/infrastructure/chat/lock-cookie.server";

const mocks = vi.hoisted(() => ({ chatContext: vi.fn(), log: vi.fn() }));

vi.mock("@/infrastructure/composition.server", () => ({ chatContext: mocks.chatContext }));
vi.mock("@/infrastructure/observability/log.server", () => ({ logServerEvent: mocks.log }));
vi.mock("@/infrastructure/security/api.server", () => ({
  withChatApiSecurity: (handler: (request: Request) => Promise<Response>) => handler,
  createChatPreflightHandler: () => async () => new Response(null, { status: 204 }),
}));

import { POST as answer } from "./conversations/[id]/answer/route";
import { POST as ask } from "./conversations/[id]/ask/route";
import { POST as message } from "./conversations/[id]/messages/route";
import { DELETE as leave, GET as conversation } from "./conversations/[id]/route";
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
let conversations: ConversationStore;
let now: number;
let guard: number | null;
let shared: CoincidenceQuestion[];

function context(userId = USER): ChatContext {
  return {
    userId,
    pepper: PEPPER,
    conversations: memoryConversations(conversations),
    coincidences: { of: async () => shared },
    matches: { listFor: async () => ok([]) },
    digest: (s) => s,
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

/** The chat surface answers `{ok:true,data}` / `{ok:false,error:{codigo,…}}`. */
async function dataOf(response: Promise<Response> | Response): Promise<Record<string, unknown>> {
  const body = (await (await response).json()) as { ok: boolean; data: Record<string, unknown> };
  expect(body.ok).toBe(true);
  return body.data;
}

async function errorOf(response: Promise<Response> | Response): Promise<Record<string, unknown>> {
  const body = (await (await response).json()) as { ok: boolean; error: Record<string, unknown> };
  expect(body.ok).toBe(false);
  expect(body.error.requestId).toBeTypeOf("string");
  return body.error;
}

async function createAndOpen(): Promise<string> {
  const response = await createPin(request("pin", { method: "POST", body: { pin: PIN, confirm: PIN } }));
  expect(response.status).toBe(200);
  return lockCookieOf(response);
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new MemoryStore();
  conversations = new ConversationStore();
  store.matriculas.set(USER, "000000001");
  now = T0;
  guard = 0;
  shared = [];
  mocks.chatContext.mockImplementation(async () => ok(context()));
});

describe("GET /api/chat/inbox", () => {
  it("answers chat.locked and no data without a lock session", async () => {
    await createAndOpen();
    const response = await inbox(request("inbox"));
    expect(response.status).toBe(423);
    const body = (await response.clone().json()) as Record<string, unknown>;
    expect(await errorOf(response)).toMatchObject({ codigo: "chat.locked" });
    expect(body).not.toHaveProperty("conversations");
    expect(body).not.toHaveProperty("data");
  });

  it("opens with the cookie issued by the PIN and renews it", async () => {
    const cookie = await createAndOpen();
    const response = await inbox(request("inbox", { cookie }));
    expect(response.status).toBe(200);
    expect(await dataOf(response)).toEqual({ conversations: [], invitations: [] });
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
    expect(await errorOf(response)).toMatchObject({ codigo: "chat.recovery_pending" });
  });

  it("is unavailable without the pepper, never crashing", async () => {
    mocks.chatContext.mockResolvedValue(err("service.unavailable"));
    expect((await inbox(request("inbox"))).status).toBe(503);
  });
});

describe("conversation routes", () => {
  const OTHER = "user-2";

  async function seeded(): Promise<string> {
    conversations.addMatch("amistad", USER, OTHER);
    const repo = memoryConversations(conversations);
    await repo.expressInterest(OTHER, USER, "amistad");
    const opened = await repo.expressInterest(USER, OTHER, "amistad");
    if (!opened.ok || opened.value.kind !== "open") throw new Error("expected open");
    return opened.value.conversationId;
  }

  it("read and write nothing without an open lock", async () => {
    const id = await seeded();
    await createAndOpen();
    const read = await conversation(request(`conversations/${id}`));
    expect(read.status).toBe(423);
    expect(await read.json()).not.toHaveProperty("data");
    const write = await answer(request(`conversations/${id}/answer`, { method: "POST", body: { round: 0, body: "hola" } }));
    expect(write.status).toBe(423);
    expect(conversations.answers).toEqual([]);
    expect((await leave(request(`conversations/${id}`, { method: "DELETE" }))).status).toBe(423);
    expect(conversations.conversations.size).toBe(1);
  });

  it("serve the conversation and its sealed answers with the lock open", async () => {
    const id = await seeded();
    const cookie = await createAndOpen();
    const listed = await inbox(request("inbox", { cookie }));
    expect(((await dataOf(listed)).conversations as unknown[]).length).toBe(1);
    await memoryConversations(conversations).openRound(id, 0, OTHER, { promptId: "p001" }, new Date(now));
    const sent = await answer(request(`conversations/${id}/answer`, { method: "POST", cookie, body: { round: 0, body: "hola" } }));
    expect(sent.status).toBe(200);
    expect(((await dataOf(sent)).rounds as Record<string, unknown>[])[0]).toMatchObject({ mine: "hola", theirs: null, revealed: false });
  });

  it("ask with an unknown card is invalid and an open card is accepted", async () => {
    const id = await seeded();
    const cookie = await createAndOpen();
    let view = await dataOf(conversation(request(`conversations/${id}`, { cookie })));
    if (!view.ask) {
      // The other person asks first in this conversation: play their round so it is USER's turn.
      const repo = memoryConversations(conversations);
      await repo.openRound(id, 0, OTHER, { promptId: "p001" }, new Date(now));
      await repo.saveAnswer(id, OTHER, 0, { body: "x" }, new Date(now));
      await repo.saveAnswer(id, USER, 0, { body: "y" }, new Date(now));
      view = await dataOf(conversation(request(`conversations/${id}`, { cookie })));
    }
    expect((view.ask as { suggestions: unknown[] }).suggestions).toHaveLength(CHAT_CONFIG.conversation.rounds.suggestions);
    const bad = await ask(request(`conversations/${id}/ask`, { method: "POST", cookie, body: { promptId: "p999" } }));
    expect(bad.status).toBe(400);
    const good = await ask(request(`conversations/${id}/ask`, { method: "POST", cookie, body: { promptId: (view.ask as { suggestions: { id: string }[] }).suggestions[0]!.id } }));
    expect(good.status).toBe(200);
  });

  it("answers a coincidence card by its text and refuses a question typed by hand", async () => {
    const SHARED = "¿Qué playlist o álbum te sabes de memoria?";
    shared = [{ text: SHARED, category: "gustos" }];
    const id = await seeded();
    const cookie = await createAndOpen();
    let view = await dataOf(conversation(request(`conversations/${id}`, { cookie })));
    if (!view.ask) {
      const repo = memoryConversations(conversations);
      await repo.openRound(id, 0, OTHER, { promptId: "p001" }, new Date(now));
      await repo.saveAnswer(id, OTHER, 0, { body: "x" }, new Date(now));
      await repo.saveAnswer(id, USER, 0, { body: "y" }, new Date(now));
      view = await dataOf(conversation(request(`conversations/${id}`, { cookie })));
    }
    const cards = (view.ask as { suggestions: Record<string, unknown>[] }).suggestions;
    expect(cards[0]).toMatchObject({ text: SHARED, origin: "coincidence" });
    const typed = await errorOf(ask(request(`conversations/${id}/ask`, { method: "POST", cookie, body: { customText: "¿Cuál es tu nombre real?" } })));
    expect(typed.codigo).toBe("chat.conflict");
    const asked = await ask(request(`conversations/${id}/ask`, { method: "POST", cookie, body: { customText: SHARED } }));
    expect(asked.status).toBe(200);
    expect(((await dataOf(asked)).rounds as Record<string, unknown>[])[0]).toMatchObject({ question: SHARED });
  });

  it("answer not found for malformed or foreign ids", async () => {
    await seeded();
    const cookie = await createAndOpen();
    expect((await conversation(request("conversations/not-a-uuid", { cookie }))).status).toBe(404);
    const foreign = "00000000-0000-4000-8000-999999999999";
    expect((await conversation(request(`conversations/${foreign}`, { cookie }))).status).toBe(404);
  });

  it("reject unknown body fields", async () => {
    const id = await seeded();
    const cookie = await createAndOpen();
    const response = await message(request(`conversations/${id}/messages`, { method: "POST", cookie, body: { body: "x", author: OTHER } }));
    expect(response.status).toBe(400);
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
    expect(await errorOf(response)).toMatchObject({ codigo: "chat.pin_invalid", intentosRestantes: 4 });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("wrong matrícula gets a generic error", async () => {
    await createAndOpen();
    const response = await requestRecovery(request("recovery", { method: "POST", body: { matricula: "000000002" } }));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toMatchObject({ codigo: "chat.recovery_invalid" });
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
    expect(await dataOf(status(request("status")))).toMatchObject({ hasPin: false, unlocked: false });
    const cookie = await createAndOpen();
    expect(await dataOf(status(request("status", { cookie })))).toMatchObject({ hasPin: true, unlocked: true });
    expect(await dataOf(status(request("status")))).toMatchObject({ hasPin: true, unlocked: false });
  });

  it("lock clears the cookie without a body (sendBeacon)", async () => {
    const response = await lock(new Request("http://localhost/api/chat/lock", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
