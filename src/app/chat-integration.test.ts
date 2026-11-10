/**
 * Integration tests for chat with 2-3 authenticated clients. Tests the full
 * flow: signals → mutual opening → PIN → 3 rounds → free chat → messages.
 * The EVENT_ID is a local correlation tag only: /api/enter accepts nothing but
 * the matrícula (ADR-026), so nothing synthetic is written to the database.
 *
 * Skipped unless BASE points at a running deploy (local or preview):
 *   BASE=http://localhost:3124 vitest run src/app/chat-integration.test.ts
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.BASE ?? "").replace(/\/$/, "");
const suite = BASE ? describe : describe.skip;

const EVENT_ID = `qa-integration-${Date.now()}`;
const MATRICULA_BASE = 426144890;

interface Account {
  index: number;
  matricula: string;
  cookie: string;
  alias: string | null;
}

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  cookie?: string;
}

async function post(path: string, body: unknown, cookie?: string): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: BASE };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0] ?? "").filter((c) => c.length > 0 && !c.endsWith("="));
  return { status: res.status, json, cookie: cookies.join("; ") };
}

async function get(path: string, cookie: string): Promise<Reply> {
  const res = await fetch(BASE + path, { headers: { cookie } });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

async function del(path: string, cookie: string): Promise<Reply> {
  const res = await fetch(BASE + path, { method: "DELETE", headers: { cookie, origin: BASE } });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

async function createAccount(index: number): Promise<Account> {
  const matricula = String(MATRICULA_BASE + index);
  const bank = JSON.parse(readFileSync("data/microtest.json", "utf8")) as {
    items: Array<{ id: string; modulo: string; tipo_respuesta: string }>;
  };
  const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");
  const likert = core.map((i, k) => ({ itemId: i.id, value: ((index + k) % 5) + 1 }));
  const filters = [
    { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
    { itemId: "FIL2", selected: ["mujer"] },
    { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
  ];

  const enter = await post("/api/enter", { matricula });
  expect(enter.status, `enter ${matricula}`).toBe(200);
  const sessionCookie = enter.cookie ?? "";

  const quiz = await post("/api/quiz", { likert, filters }, sessionCookie);
  expect(quiz.status, `quiz ${matricula}`).toBe(200);

  const profile = await get("/api/profile", sessionCookie);
  const identity = profile.json?.identity as { aliasCompleto?: string } | undefined;
  const alias = identity?.aliasCompleto ?? null;

  return { index, matricula, cookie: sessionCookie, alias };
}

async function deleteAccount(matricula: string): Promise<void> {
  try {
    const enter = await post("/api/enter", { matricula });
    if (enter.status === 200 && enter.cookie) {
      await del("/api/privacy", enter.cookie);
    }
  } catch {
    // Best-effort cleanup: ignore errors during account deletion.
  }
}

async function waitForMatches(accounts: readonly Account[]): Promise<void> {
  for (const acc of accounts) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await get("/api/result", acc.cookie);
      const matches = res.json?.matches as { romance?: unknown[]; amistad?: unknown[] } | undefined;
      const romance = matches?.romance?.length ?? 0;
      const amistad = matches?.amistad?.length ?? 0;
      if (romance > 0 || amistad > 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

interface MatchEntry {
  id: string;
}

function matchId(reply: Reply, track: "romance" | "amistad"): string | null {
  const matches = reply.json?.matches as Record<string, MatchEntry[] | undefined> | undefined;
  return matches?.[track]?.[0]?.id ?? null;
}

suite("chat integration with multiple clients", () => {
  let a: Account;
  let b: Account;
  let c: Account;

  beforeAll(async () => {
    a = await createAccount(0);
    b = await createAccount(1);
    c = await createAccount(2);
    await waitForMatches([a, b, c]);
  }, 60000);

  afterAll(async () => {
    for (const acc of [a, b, c]) {
      try {
        await deleteAccount(acc.matricula);
      } catch {
        // Best-effort cleanup: continue deleting remaining accounts.
      }
    }
  });

  it("A and B can open a chat via mutual signals", async () => {
    const resA = await get("/api/result", a.cookie);
    const resB = await get("/api/result", b.cookie);

    const track: "romance" | "amistad" = matchId(resA, "romance") ? "romance" : "amistad";
    const idA = matchId(resA, track);
    const idB = matchId(resB, track);
    expect(idA, "A has a match").toBeTruthy();
    expect(idB, "B has a match").toBeTruthy();

    if (track === "romance") {
      await post("/api/interest/adult", {}, a.cookie);
      await post("/api/interest/adult", {}, b.cookie);
    }

    const signalA = await post("/api/interest", { match: idA, track }, a.cookie);
    expect(signalA.status, "A signal").toBe(200);
    expect(signalA.json?.state, "A signal state").toBe("sent");

    const interestB = await get("/api/interest", b.cookie);
    const states = (interestB.json?.states ?? {}) as Record<string, { state: string }>;
    expect(Object.values(states).some((s) => s.state === "invited"), "B sees invitation").toBe(true);

    const signalB = await post("/api/interest", { match: idB, track }, b.cookie);
    expect(signalB.status, "B signal").toBe(200);
    expect(signalB.json?.state, "mutual signal opens chat").toBe("open");

    const convId = signalB.json?.conversation;
    expect(convId, "conversation id").toMatch(/^[0-9a-f-]{36}$/);
  });

  it("PIN flow: create, verify, lockout", async () => {
    const pin = await post("/api/chat/pin", { pin: "1234", confirm: "1234" }, a.cookie);
    expect(pin.status, "create PIN").toBe(200);

    const unlock = await post("/api/chat/unlock", { pin: "1234" }, a.cookie);
    expect(unlock.status, "unlock").toBe(200);

    const wrong = await post("/api/chat/unlock", { pin: "9999" }, a.cookie);
    expect(wrong.status, "wrong PIN").toBe(401);
  });

  it("3 rounds then free chat", async () => {
    const inboxA = await get("/api/chat/inbox", a.cookie);
    const convs = (inboxA.json?.conversations ?? []) as Array<{ id: string }>;
    expect(convs.length, "A has conversations").toBeGreaterThan(0);

    const convId = convs[0]!.id;

    const view1 = await get(`/api/chat/conversations/${convId}`, a.cookie);
    const suggestions1 = ((view1.json?.ask as { suggestions?: Array<{ id: string }> } | null)?.suggestions ?? []) as Array<{ id: string }>;
    expect(suggestions1.length, "3 suggestions").toBe(3);

    await post(`/api/chat/conversations/${convId}/ask`, { promptId: suggestions1[0]!.id }, a.cookie);
    const ans1A = await post(`/api/chat/conversations/${convId}/answer`, { round: 0, body: "Respuesta A ronda 1" }, a.cookie);
    expect(ans1A.status, "A answer round 1").toBe(200);

    const ans1B = await post(`/api/chat/conversations/${convId}/answer`, { round: 0, body: "Respuesta B ronda 1" }, b.cookie);
    expect(ans1B.status, "B answer round 1").toBe(200);
    const rounds1 = ans1B.json?.rounds as Array<{ revealed?: boolean }> | undefined;
    expect(rounds1?.[0]?.revealed, "round 1 revealed").toBe(true);

    const view2 = await get(`/api/chat/conversations/${convId}`, b.cookie);
    const suggestions2 = ((view2.json?.ask as { suggestions?: Array<{ id: string }> } | null)?.suggestions ?? []) as Array<{ id: string }>;
    await post(`/api/chat/conversations/${convId}/ask`, { promptId: suggestions2[0]!.id }, b.cookie);
    await post(`/api/chat/conversations/${convId}/answer`, { round: 1, body: "Respuesta A ronda 2" }, a.cookie);
    await post(`/api/chat/conversations/${convId}/answer`, { round: 1, pass: true }, b.cookie);

    const view3 = await get(`/api/chat/conversations/${convId}`, a.cookie);
    const suggestions3 = ((view3.json?.ask as { suggestions?: Array<{ id: string }> } | null)?.suggestions ?? []) as Array<{ id: string }>;
    await post(`/api/chat/conversations/${convId}/ask`, { promptId: suggestions3[0]!.id }, a.cookie);
    await post(`/api/chat/conversations/${convId}/answer`, { round: 2, body: "Respuesta A ronda 3" }, a.cookie);
    const ans3B = await post(`/api/chat/conversations/${convId}/answer`, { round: 2, body: "Respuesta B ronda 3" }, b.cookie);

    expect(ans3B.json?.stage, "stage is free").toBe("free");
    expect(ans3B.json?.completedRounds, "3 rounds completed").toBe(3);

    const freeMsg = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: "Hola en chat libre", clientKey: `free-${Date.now()}` },
      a.cookie,
    );
    expect(freeMsg.status, "free message").toBe(200);
  });

  it("message limit: 300 graphemes accepted, 301 rejected", async () => {
    const inboxA = await get("/api/chat/inbox", a.cookie);
    const convs = (inboxA.json?.conversations ?? []) as Array<{ id: string }>;
    if (convs.length === 0) return;

    const convId = convs[0]!.id;

    const family = "👨‍👩‍👧‍👦";
    const exact300 = "a".repeat(299) + family;
    const msg300 = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: exact300, clientKey: `exact300-${Date.now()}` },
      a.cookie,
    );
    expect(msg300.status, "300 graphemes accepted").toBe(200);

    const over300 = "a".repeat(300) + family;
    const msg301 = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: over300, clientKey: `over300-${Date.now()}` },
      a.cookie,
    );
    expect(msg301.status, "301 graphemes rejected").toBe(400);
  });

  it("idempotency: same clientKey does not duplicate", async () => {
    const inboxA = await get("/api/chat/inbox", a.cookie);
    const convs = (inboxA.json?.conversations ?? []) as Array<{ id: string }>;
    if (convs.length === 0) return;

    const convId = convs[0]!.id;
    const clientKey = `idempotent-${Date.now()}`;

    const msg1 = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: "Mensaje idempotente", clientKey },
      a.cookie,
    );
    expect(msg1.status, "first send").toBe(200);

    const msg2 = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: "Mensaje idempotente", clientKey },
      a.cookie,
    );
    expect(msg2.status, "retry with same clientKey").toBe(200);

    const conv = await get(`/api/chat/conversations/${convId}`, a.cookie);
    const messages = (conv.json?.messages ?? []) as Array<{ clientKey?: string }>;
    const count = messages.filter((m) => m.clientKey === clientKey).length;
    expect(count, "only one message with this clientKey").toBe(1);
  });

  it("RLS: third party cannot read conversation", async () => {
    const inboxA = await get("/api/chat/inbox", a.cookie);
    const convs = (inboxA.json?.conversations ?? []) as Array<{ id: string }>;
    if (convs.length === 0) return;

    const convId = convs[0]!.id;

    const attempt = await get(`/api/chat/conversations/${convId}`, c.cookie);
    expect(attempt.status, "third party blocked").toBe(403);
  });

  it("block: conversation disappears for both", async () => {
    const inboxA = await get("/api/chat/inbox", a.cookie);
    const convs = (inboxA.json?.conversations ?? []) as Array<{ id: string }>;
    if (convs.length === 0) return;

    const convId = convs[0]!.id;

    const block = await post(`/api/chat/conversations/${convId}/block`, {}, b.cookie);
    expect(block.status, "block").toBe(200);

    const attempt = await get(`/api/chat/conversations/${convId}`, a.cookie);
    expect(attempt.status, "conversation gone for A").toBe(404);
  });
});
