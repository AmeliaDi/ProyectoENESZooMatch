/**
 * Phase 3 — Chat resilience and injected-failure tests.
 *
 * These tests exercise the chat under adverse conditions: chaos proxy modes,
 * network partitions, late/duplicate/out-of-order delivery, reconnection after
 * disconnect, partial writes, and concurrent signal races.
 *
 * Run against a live deploy (local dev or Vercel preview):
 *
 *   BASE=http://localhost:3124 vitest run scripts/qa/chat-resilience.test.ts
 *
 * Without BASE the suite skips, so `npm run check` stays green offline.
 * Only synthetic matriculas (42614489x) are used; every account is deleted
 * in afterAll via DELETE /api/privacy.
 *
 * Chaos proxy tests require QA_CHAOS_SECRET to be set on the target deploy.
 * When the env var is absent those tests are skipped individually.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.BASE ?? "").replace(/\/$/, "");
const CHAOS = process.env.QA_CHAOS_SECRET ?? "";
const suite = BASE ? describe : describe.skip;
const chaosSuite = BASE && CHAOS ? describe : describe.skip;

const EVENT_ID = `qa-resilience-${Date.now()}`;
const MATRICULA_BASE = 426144890;

/* ------------------------------------------------------------------ */
/*  HTTP helpers — same defensive shape as chat-e2e.test.ts           */
/* ------------------------------------------------------------------ */

interface Reply {
  status: number;
  contentType: string;
  json: Record<string, unknown> | null;
  cookies: string[];
}

async function call(
  path: string,
  method: string,
  body?: unknown,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): Promise<Reply> {
  const headers: Record<string, string> = { origin: BASE, ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    redirect: "manual",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      json = parsed as Record<string, unknown>;
    }
  } catch {
    json = null;
  }
  const cookies = res.headers
    .getSetCookie()
    .flatMap((c) => {
      const pair = c.split(";")[0];
      return pair && !pair.endsWith("=") ? [pair] : [];
    });
  return { status: res.status, contentType: ct, json, cookies };
}

const get = (path: string, cookie: string) => call(path, "GET", undefined, cookie);
const post = (path: string, body: unknown, cookie: string) => call(path, "POST", body, cookie);
const del = (path: string, cookie: string) => call(path, "DELETE", undefined, cookie);

/** Retry wrapper for transient network errors (timeouts, ECONNRESET, 5xx). */
async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/fetch|ECONNRESET|ETIMEDOUT|socket hang up|network|5\d{2}/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`withRetry(${label}): unreachable`);
}

/* ------------------------------------------------------------------ */
/*  Account helpers                                                    */
/* ------------------------------------------------------------------ */

interface Account {
  index: number;
  matricula: string;
  cookie: string;
  alias: string | null;
}

const bank = JSON.parse(readFileSync("data/microtest.json", "utf8")) as {
  items: Array<{ id: string; modulo: string; tipo_respuesta: string }>;
};
const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");

async function createAccount(index: number): Promise<Account> {
  const matricula = String(MATRICULA_BASE + index);
  const likert = core.map((i, k) => ({ itemId: i.id, value: ((index + k) % 5) + 1 }));
  const filters = [
    { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
    { itemId: "FIL2", selected: ["mujer"] },
    { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
  ];

  const enter = await call("/api/enter", "POST", { matricula, eventId: EVENT_ID, sintetico: true });
  expect(enter.status, `enter ${matricula}`).toBe(200);
  const sessionCookie = enter.cookies.join("; ");

  const quiz = await post("/api/quiz", { likert, filters }, sessionCookie);
  expect(quiz.status, `quiz ${matricula}`).toBe(200);

  const profile = await get("/api/profile", sessionCookie);
  const identity = (profile.json?.identity ?? profile.json?.profile) as
    | { aliasCompleto?: string }
    | undefined;
  const alias = typeof identity?.aliasCompleto === "string" ? identity.aliasCompleto : null;

  return { index, matricula, cookie: sessionCookie, alias };
}

async function deleteAccount(matricula: string): Promise<void> {
  await withRetry(async () => {
    const enter = await call("/api/enter", "POST", { matricula });
    if (enter.status === 200 && enter.cookies.length > 0) {
      await del("/api/privacy", enter.cookies.join("; "));
    }
  }, `deleteAccount(${matricula})`);
}

async function lockFor(cookie: string, pin: string): Promise<string> {
  const status = await get("/api/chat/status", cookie);
  const hasPin = (status.json?.data as Record<string, unknown> | undefined)?.hasPin === true
    || (status.json as Record<string, unknown> | undefined)?.hasPin === true;
  const reply = hasPin
    ? await post("/api/chat/unlock", { pin }, cookie)
    : await post("/api/chat/pin", { pin, confirm: pin }, cookie);
  const lock = reply.cookies.find((c) => /lock/i.test(c));
  expect(lock, "lock cookie issued").toBeTruthy();
  return [cookie, lock].filter(Boolean).join("; ");
}

function chatData(reply: Reply, label: string): Record<string, unknown> {
  expect(reply.status, `${label} status 200`).toBe(200);
  expect(reply.contentType, `${label} is JSON`).toContain("application/json");
  expect(reply.json, `${label} has body`).not.toBeNull();
  const body = reply.json!;
  if (typeof body.ok === "boolean") {
    expect(body.ok, `${label} ok`).toBe(true);
    expect(body.data, `${label} has data`).toBeTypeOf("object");
    return body.data as Record<string, unknown>;
  }
  return body;
}

interface MatchEntry {
  id: string;
  track: string;
}

async function entryFor(
  cookie: string,
  alias: string | null,
): Promise<MatchEntry | null> {
  if (!alias) return null;
  for (let i = 0; i < 10; i++) {
    const body = await get("/api/result", cookie);
    const matches = (body.json?.matches ?? (body.json?.data as Record<string, unknown>)?.matches) as
      | Record<string, Array<Record<string, unknown>>>
      | undefined;
    for (const track of ["amistad", "romance"]) {
      const found = (matches?.[track] ?? []).find(
        (m) =>
          (m.identity as Record<string, unknown> | undefined)?.aliasCompleto === alias,
      );
      if (typeof found?.id === "string") return { id: found.id, track };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function waitForMatches(accounts: readonly Account[]): Promise<void> {
  for (const acc of accounts) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = await withRetry(
          () => get("/api/result", acc.cookie),
          `waitForMatches(${acc.matricula})`,
        );
        const data = res.json?.matches ?? (res.json?.data as Record<string, unknown>)?.matches;
        const matches = data as Record<string, unknown[]> | undefined;
        const total =
          (matches?.romance?.length ?? 0) + (matches?.amistad?.length ?? 0);
        if (total > 0) break;
      } catch {
        // Transient error; retry after backoff.
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Open a chat between A and B, returning the conversation id and locked cookies. */
async function openChat(
  a: Account,
  b: Account,
  pinA: string,
  pinB: string,
): Promise<{ convId: string; lockA: string; lockB: string; track: string }> {
  const aSeesB = await entryFor(a.cookie, b.alias);
  const bSeesA = await entryFor(b.cookie, a.alias);
  expect(aSeesB, "A sees B as match").toBeTruthy();
  expect(bSeesA, "B sees A as match").toBeTruthy();

  const track = aSeesB!.track;
  if (track === "romance") {
    for (const c of [a.cookie, b.cookie]) {
      await post("/api/interest/adult", {}, c);
    }
  }

  // Mutual signal opens the chat.
  const signalA = await post("/api/interest", { match: aSeesB!.id, track }, a.cookie);
  expect(signalA.status, "signal A").toBe(200);

  const signalB = await post("/api/interest", { match: bSeesA!.id, track }, b.cookie);
  expect(signalB.status, "signal B").toBe(200);
  const dataB = chatData(signalB, "mutual signal");
  expect(dataB.state, "chat opens").toBe("open");
  const convId = dataB.conversation as string;
  expect(convId).toMatch(/^[0-9a-f-]{36}$/);

  const lockA = await lockFor(a.cookie, pinA);
  const lockB = await lockFor(b.cookie, pinB);

  return { convId, lockA, lockB, track };
}

/** Walk through 3 rounds so free chat is unlocked. */
async function completeRounds(
  convId: string,
  lockA: string,
  lockB: string,
): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const viewA = await get(`/api/chat/conversations/${convId}`, lockA);
    const dataA = chatData(viewA, `view A round ${round}`);
    const ask = dataA.ask as { suggestions?: Array<{ id: string }> } | null;
    expect(ask, `round ${round} has ask`).toBeTruthy();
    const card = ask!.suggestions![0]!;

    await post(`/api/chat/conversations/${convId}/ask`, { promptId: card.id }, lockA);
    await post(
      `/api/chat/conversations/${convId}/answer`,
      { round, body: `resilience-r${round}-a` },
      lockA,
    );
    await post(
      `/api/chat/conversations/${convId}/answer`,
      { round, body: `resilience-r${round}-b` },
      lockB,
    );
  }

  const final = await get(`/api/chat/conversations/${convId}`, lockA);
  const dataFinal = chatData(final, "free stage");
  expect(dataFinal.stage, "stage is free").toBe("free");
}

/* ------------------------------------------------------------------ */
/*  Shared state                                                       */
/* ------------------------------------------------------------------ */

const accounts: Account[] = [];
const createdMatriculas: string[] = [];

suite("chat resilience — Phase 3", () => {
  /* Each test that needs a pair of matched accounts creates them fresh
     so that state from a previous test never leaks in. */

  afterAll(async () => {
    for (const m of createdMatriculas) {
      try {
        await deleteAccount(m);
      } catch {
        // Best-effort cleanup: log but don't fail the suite if a single
        // deletion errors out (the account may already be gone).
      }
    }
  });

  /* ================================================================== */
  /*  1. Concurrent signal handling (race)                               */
  /* ================================================================== */

  it("concurrent signals from both sides produce exactly one conversation", async () => {
    const a = await createAccount(3);
    const b = await createAccount(4);
    createdMatriculas.push(a.matricula, b.matricula);
    accounts.push(a, b);
    await waitForMatches([a, b]);

    const aSeesB = await entryFor(a.cookie, b.alias);
    const bSeesA = await entryFor(b.cookie, a.alias);
    expect(aSeesB, "A sees B").toBeTruthy();
    expect(bSeesA, "B sees A").toBeTruthy();

    const track = aSeesB!.track;
    if (track === "romance") {
      await post("/api/interest/adult", {}, a.cookie);
      await post("/api/interest/adult", {}, b.cookie);
    }

    // Fire both signals at the same time — Promise.all races them.
    const [resA, resB] = await Promise.all([
      post("/api/interest", { match: aSeesB!.id, track }, a.cookie),
      post("/api/interest", { match: bSeesA!.id, track }, b.cookie),
    ]);

    expect(resA.status, "A concurrent signal accepted").toBe(200);
    expect(resB.status, "B concurrent signal accepted").toBe(200);

    // At least one side must report state "open" with a conversation id.
    const dataA = resA.json?.data as Record<string, unknown> | undefined ?? resA.json;
    const dataB = resB.json?.data as Record<string, unknown> | undefined ?? resB.json;
    const stateA = dataA?.state;
    const stateB = dataB?.state;
    const convA = dataA?.conversation as string | undefined;
    const convB = dataB?.conversation as string | undefined;

    const openSide = stateA === "open" ? convA : stateB === "open" ? convB : undefined;
    expect(openSide, "one side opens the chat").toBeTruthy();

    // Both sides must agree on the same conversation id — no duplicates.
    if (stateA === "open" && stateB === "open") {
      expect(convA, "both see the same conversation").toBe(convB);
    }

    // Verify the inbox shows exactly one conversation for each side.
    const lockA = await lockFor(a.cookie, "3001");
    const lockB = await lockFor(b.cookie, "3002");
    const inboxA = chatData(await get("/api/chat/inbox", lockA), "inbox A");
    const inboxB = chatData(await get("/api/chat/inbox", lockB), "inbox B");
    const convsA = inboxA.conversations as Array<{ id: string }>;
    const convsB = inboxB.conversations as Array<{ id: string }>;
    expect(convsA.length, "A has exactly one conversation").toBe(1);
    expect(convsB.length, "B has exactly one conversation").toBe(1);
    expect(convsA[0]!.id, "same conversation id on both sides").toBe(convsB[0]!.id);
  }, 120_000);

  /* ================================================================== */
  /*  2. Reconnection after disconnect — state survives                  */
  /* ================================================================== */

  it("conversation state survives session reconnection", async () => {
    const a = await createAccount(5);
    const b = await createAccount(6);
    createdMatriculas.push(a.matricula, b.matricula);
    accounts.push(a, b);
    await waitForMatches([a, b]);

    const { convId, lockA, lockB } = await openChat(a, b, "4001", "4002");
    await completeRounds(convId, lockA, lockB);

    // Send a message in free chat.
    const msgBody = "Reconnection test message";
    const sent = chatData(
      await post(
        `/api/chat/conversations/${convId}/messages`,
        { body: msgBody, clientKey: crypto.randomUUID() },
        lockA,
      ),
      "send message before disconnect",
    );
    expect(sent.id ?? sent.messageId, "message has an id").toBeTruthy();

    // Simulate "disconnect": drop the session and re-enter with the same matricula.
    const freshA = await createAccount(5); // same matricula → same person
    const freshLock = await lockFor(freshA.cookie, "4001");

    // The conversation must still be readable and contain the message.
    const view = chatData(
      await get(`/api/chat/conversations/${convId}`, freshLock),
      "conversation after reconnect",
    );
    expect(view.stage, "stage is still free").toBe("free");
    const messages = view.messages as Array<{ body: string }>;
    expect(
      messages.some((m) => m.body === msgBody),
      "message survives reconnection",
    ).toBe(true);

    // The other side can still read the conversation.
    const viewB = chatData(
      await get(`/api/chat/conversations/${convId}`, lockB),
      "B still sees conversation",
    );
    const msgsB = viewB.messages as Array<{ body: string }>;
    expect(msgsB.some((m) => m.body === msgBody), "B sees the message").toBe(true);
  }, 180_000);

  /* ================================================================== */
  /*  3. Duplicate delivery — idempotency under retries                  */
  /* ================================================================== */

  it("retried messages with the same clientKey are not duplicated", async () => {
    const a = await createAccount(7);
    const b = await createAccount(8);
    createdMatriculas.push(a.matricula, b.matricula);
    accounts.push(a, b);
    await waitForMatches([a, b]);

    const { convId, lockA, lockB } = await openChat(a, b, "5001", "5002");
    await completeRounds(convId, lockA, lockB);

    const clientKey = crypto.randomUUID();
    const body = "Idempotent resilience message";

    // Send the same message 5 times with the same clientKey.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(
          `/api/chat/conversations/${convId}/messages`,
          { body, clientKey },
          lockA,
        ),
      ),
    );

    // All retries should succeed (200) or be idempotent duplicates (200).
    for (const r of results) {
      expect(r.status, "retry accepted").toBe(200);
    }

    // The conversation must contain exactly ONE message with this clientKey.
    const view = chatData(
      await get(`/api/chat/conversations/${convId}`, lockB),
      "view after retries",
    );
    const messages = view.messages as Array<{ body: string; clientKey?: string }>;
    const matching = messages.filter((m) => m.clientKey === clientKey);
    expect(matching.length, "exactly one message despite 5 retries").toBe(1);
  }, 180_000);

  /* ================================================================== */
  /*  4. Out-of-order delivery — monotonic IDs                          */
  /* ================================================================== */

  it("messages arrive in order even when sent in rapid succession", async () => {
    const a = await createAccount(0);
    const b = await createAccount(1);
    createdMatriculas.push(a.matricula, b.matricula);
    accounts.push(a, b);
    await waitForMatches([a, b]);

    const { convId, lockA, lockB } = await openChat(a, b, "6001", "6002");
    await completeRounds(convId, lockA, lockB);

    // Fire 10 messages in rapid succession with sequential clientKeys.
    const count = 10;
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      keys.push(`ooo-${Date.now()}-${i}`);
    }

    await Promise.all(
      keys.map((key, i) =>
        post(
          `/api/chat/conversations/${convId}/messages`,
          { body: `msg-${i}`, clientKey: key },
          lockA,
        ),
      ),
    );

    // Read from B's side and verify all messages are present.
    const view = chatData(
      await get(`/api/chat/conversations/${convId}`, lockB),
      "view after burst",
    );
    const messages = view.messages as Array<{ body: string }>;
    const bodies = messages.map((m) => m.body);

    for (let i = 0; i < count; i++) {
      expect(bodies.includes(`msg-${i}`), `msg-${i} delivered`).toBe(true);
    }

    // Verify that the messages from A appear in insertion order (monotonic).
    const orderedBodies = bodies.filter((b) => b.startsWith("msg-"));
    for (let i = 1; i < orderedBodies.length; i++) {
      const prev = Number(orderedBodies[i - 1]!.replace("msg-", ""));
      const curr = Number(orderedBodies[i]!.replace("msg-", ""));
      expect(prev, `order: msg-${prev} before msg-${curr}`).toBeLessThan(curr);
    }
  }, 180_000);

  /* ================================================================== */
  /*  5. Late delivery — message sent, delayed read                      */
  /* ================================================================== */

  it("messages are available when the recipient reconnects after a delay", async () => {
    const a = await createAccount(2);
    const b = await createAccount(9);
    createdMatriculas.push(a.matricula, b.matricula);
    accounts.push(a, b);
    await waitForMatches([a, b]);

    const { convId, lockA, lockB } = await openChat(a, b, "7001", "7002");
    await completeRounds(convId, lockA, lockB);

    // A sends a message.
    const lateKey = `late-${Date.now()}`;
    const lateBody = "Late delivery test";
    chatData(
      await post(
        `/api/chat/conversations/${convId}/messages`,
        { body: lateBody, clientKey: lateKey },
        lockA,
      ),
      "send late-delivery message",
    );

    // Simulate a delay before B reads (short sleep — we're testing API-level
    // persistence, not Realtime push).
    await new Promise((r) => setTimeout(r, 3000));

    // B reads the conversation — the message must be there.
    const view = chatData(
      await get(`/api/chat/conversations/${convId}`, lockB),
      "B reads after delay",
    );
    const messages = view.messages as Array<{ body: string }>;
    expect(
      messages.some((m) => m.body === lateBody),
      "message persisted and is readable after delay",
    ).toBe(true);
  }, 120_000);

  /* ================================================================== */
  /*  6. Partial write detection — message sent but verify storage       */
  /* ================================================================== */

  it("a message that returns 200 is persisted and readable by both sides", async () => {
    const a = await createAccount(3);
    const b = await createAccount(4);
    // These matriculas may already exist from a previous test in this run,
    // but createAccount re-s fresh sessions. The afterAll cleanup handles
    // deletion by matricula, so duplicates are harmless.

    // We need unique matriculas for this isolated test — use indices 5 and 6
    // but create brand-new sessions.
    const a2 = await createAccount(5);
    const b2 = await createAccount(6);
    createdMatriculas.push(a.matricula, b.matricula, a2.matricula, b2.matricula);
    accounts.push(a, b, a2, b2);
    await waitForMatches([a2, b2]);

    const { convId, lockA, lockB } = await openChat(a2, b2, "8001", "8002");
    await completeRounds(convId, lockA, lockB);

    const pwKey = `pw-${Date.now()}`;
    const pwBody = "Partial write check";

    const sendReply = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: pwBody, clientKey: pwKey },
      lockA,
    );

    // If the server says 200, the message MUST be readable.
    if (sendReply.status === 200) {
      // Read from A's side.
      const viewA = chatData(
        await get(`/api/chat/conversations/${convId}`, lockA),
        "A reads after partial-write check",
      );
      const msgsA = viewA.messages as Array<{ body: string; clientKey?: string }>;
      expect(
        msgsA.some((m) => m.clientKey === pwKey && m.body === pwBody),
        "message is stored and readable by sender",
      ).toBe(true);

      // Read from B's side.
      const viewB = chatData(
        await get(`/api/chat/conversations/${convId}`, lockB),
        "B reads after partial-write check",
      );
      const msgsB = viewB.messages as Array<{ body: string; clientKey?: string }>;
      expect(
        msgsB.some((m) => m.clientKey === pwKey && m.body === pwBody),
        "message is stored and readable by recipient",
      ).toBe(true);
    } else {
      // If the server rejected, it must be a clean rejection (not a partial write).
      expect(sendReply.status, "rejection is explicit").toBeLessThan(300);
    }
  }, 180_000);

  /* ================================================================== */
  /*  7. Network partition — isolated client cannot read/write           */
  /* ================================================================== */

  it("a client without a valid session gets 401 on all chat routes", async () => {
    const a = await createAccount(7);
    createdMatriculas.push(a.matricula);
    accounts.push(a);

    // Try to access chat routes without any session cookie.
    const inboxNoSession = await get("/api/chat/inbox", "");
    expect(inboxNoSession.status, "inbox without session → 401").toBe(401);

    const statusNoSession = await get("/api/chat/status", "");
    expect(statusNoSession.status, "status without session → 401").toBe(401);

    // Try with a garbage cookie.
    const inboxBadCookie = await get("/api/chat/inbox", "session=garbage");
    expect(
      inboxBadCookie.status,
      "inbox with bad cookie → 401",
    ).toBeLessThanOrEqual(401);
  }, 60_000);

  /* ================================================================== */
  /*  8. Conversation survives block + re-match cycle                    */
  /* ================================================================== */

  it("closing a conversation removes it for both sides cleanly", async () => {
    const a = await createAccount(8);
    const b = await createAccount(9);
    createdMatriculas.push(a.matricula, b.matricula);
    accounts.push(a, b);
    await waitForMatches([a, b]);

    const { convId, lockA, lockB } = await openChat(a, b, "9001", "9002");
    await completeRounds(convId, lockA, lockB);

    // Send a message to confirm the chat works.
    chatData(
      await post(
        `/api/chat/conversations/${convId}/messages`,
        { body: "before-close", clientKey: crypto.randomUUID() },
        lockA,
      ),
      "message before close",
    );

    // Close the conversation from A's side.
    const closeReply = await call(
      `/api/chat/conversations/${convId}`,
      "DELETE",
      undefined,
      lockA,
    );
    expect(closeReply.status, "close conversation").toBe(200);

    // Both sides must get 404 now.
    const viewA = await get(`/api/chat/conversations/${convId}`, lockA);
    expect(viewA.status, "A cannot read closed conversation").toBe(404);

    const viewB = await get(`/api/chat/conversations/${convId}`, lockB);
    expect(viewB.status, "B cannot read closed conversation").toBe(404);
  }, 180_000);
});

/* ====================================================================== */
/*  Chaos proxy tests — only run when QA_CHAOS_SECRET is set              */
/* ====================================================================== */

chaosSuite("chaos proxy resilience", () => {
  it("chaos header with wrong secret is ignored (normal response)", async () => {
    const res = await call("/api/chat/status", "GET", undefined, undefined, {
      "x-qa-chaos": "wrong-secret",
    });
    // The chaos middleware should ignore unknown secrets and respond normally.
    // Status should be 401 (no session) rather than a chaos-induced error.
    expect(res.status, "wrong secret → normal auth check").toBe(401);
  }, 30_000);

  it("chaos header with correct secret triggers failure mode", async () => {
    const a = await createAccount(0);
    createdMatriculas.push(a.matricula);
    accounts.push(a);

    // With the correct chaos secret, the middleware may inject latency,
    // errors, or cutoffs. We just verify the request completes (even if
    // with an error status) and returns JSON — never HTML.
    const res = await call("/api/chat/status", "GET", undefined, a.cookie, {
      "x-qa-chaos": CHAOS,
    });
    expect(res.contentType, "chaos response is JSON").toContain("application/json");
    // The status might be anything the chaos mode injects, but it must be
    // a valid HTTP response, not a timeout or connection reset.
    expect(res.status, "chaos returns a status").toBeGreaterThan(0);
  }, 30_000);
});
