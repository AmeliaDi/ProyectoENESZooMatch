/**
 * Two-session smoke test of the chat against a running deploy (local dev or a
 * Vercel preview). It creates two synthetic accounts, walks signal → mutual
 * opening → PIN → three rounds → free chat, and validates EVERY reply with the
 * browser's own defensive parsers, because a server-side assertion on the raw
 * JSON cannot see a DTO the client silently drops.
 *
 *   CHAT_E2E_BASE=http://localhost:3124 vitest run scripts/qa/chat-e2e.test.ts
 *   CHAT_E2E_BASE=https://<preview>.vercel.app vitest run scripts/qa/chat-e2e.test.ts
 *
 * Without CHAT_E2E_BASE the suite skips, so `npm run check` stays offline.
 * Only the established fake matrícula range is used, and both accounts are
 * deleted afterwards. The trace prints method, path, status and content-type:
 * never aliases, message bodies, PINs or matrículas.
 */
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import { parseConversation, parseInbox, parseInterestStates } from "@/ui/chat/chat-parse";
import { formatIdentity } from "@/domain/identity/format-identity";
import { isHatched } from "@/ui/shared/parse-identity";

const BASE = (process.env.CHAT_E2E_BASE ?? "").replace(/\/$/, "");
const suite = BASE ? describe : describe.skip;

const bank = JSON.parse(readFileSync("data/microtest.json", "utf8")) as {
  items: Array<{ id: string; modulo: string; tipo_respuesta: string }>;
};
const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");
const likert = core.map((i, k) => ({ itemId: i.id, value: (k % 5) + 1 }));
const filters = [
  { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
  { itemId: "FIL2", selected: ["mujer"] },
  { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
];

const trace: string[] = [];
const sessions: string[] = [];

interface Reply {
  status: number;
  contentType: string;
  json: Record<string, unknown> | null;
  cookies: string[];
}

async function call(path: string, method: string, body?: unknown, cookie?: string): Promise<Reply> {
  const headers: Record<string, string> = { origin: BASE };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    redirect: "manual",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  } catch {
    json = null;
  }
  trace.push(`${method} ${path.split("?")[0] ?? path} → ${res.status} ${contentType.split(";")[0] ?? ""}${json ? "" : " NO-JSON"}`);
  const cookies = res.headers.getSetCookie().flatMap((c) => {
    const pair = c.split(";")[0];
    return pair && !pair.endsWith("=") ? [pair] : [];
  });
  return { status: res.status, contentType, json, cookies };
}

const get = (path: string, cookie: string) => call(path, "GET", undefined, cookie);
const post = (path: string, body: unknown, cookie: string) => call(path, "POST", body, cookie);

async function enter(matricula: string): Promise<string> {
  const reply = await call("/api/enter", "POST", { matricula });
  expect(reply.status, "enter synthetic account").toBe(200);
  const cookie = reply.cookies.join("; ");
  sessions.push(cookie);
  return cookie;
}

/** Every chat reply must be JSON: an HTML 404 or an empty body is the bug. */
function expectJson(reply: Reply, path: string): Record<string, unknown> {
  expect(reply.contentType, `${path} must answer JSON`).toContain("application/json");
  expect(reply.json, `${path} must answer a JSON object`).not.toBeNull();
  return reply.json!;
}

async function lockFor(cookie: string, pin: string): Promise<string> {
  const status = expectJson(await get("/api/chat/status", cookie), "status");
  const reply = status.hasPin === true
    ? await post("/api/chat/unlock", { pin }, cookie)
    : await post("/api/chat/pin", { pin, confirm: pin }, cookie);
  expect(reply.status, "open the chat lock").toBe(200);
  const lock = reply.cookies.find((c) => /lock/i.test(c));
  expect(lock, "lock cookie issued").toBeTruthy();
  return [cookie, lock].join("; ");
}

const aliasOf = (body: Record<string, unknown> | null): string | null => {
  const identity = (body?.identity ?? (body?.profile as Record<string, unknown> | undefined)?.identity) as
    | Record<string, unknown> | undefined;
  return typeof identity?.aliasCompleto === "string" ? identity.aliasCompleto : null;
};

interface Entry { track: string; id: string }

async function entryFor(cookie: string, alias: string | null): Promise<Entry | null> {
  if (!alias) return null;
  for (let i = 0; i < 8; i += 1) {
    const body = expectJson(await get("/api/result", cookie), "result");
    const matches = body.matches as Record<string, Array<Record<string, unknown>>> | undefined;
    for (const track of ["amistad", "romance"]) {
      const found = (matches?.[track] ?? []).find((m) => (m.identity as Record<string, unknown> | undefined)?.aliasCompleto === alias);
      if (typeof found?.id === "string") return { track, id: found.id };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

suite("chat smoke against a running deploy", () => {
  afterAll(async () => {
    for (const cookie of sessions) {
      await call("/api/privacy", "DELETE", undefined, cookie);
    }
    if (process.env.CHAT_E2E_TRACE) console.log(trace.join("\n"));
  });

  it("opens a chat between two people and both screens can read it", async () => {
    const a = await enter("426144891");
    const b = await enter("426144892");
    for (const cookie of [a, b]) {
      expect((await post("/api/quiz", { likert, filters }, cookie)).status, "quiz").toBe(200);
    }
    const nameA = aliasOf(expectJson(await get("/api/profile", a), "profile"));
    const nameB = aliasOf(expectJson(await get("/api/profile", b), "profile"));
    expect(nameA, "synthetic A hatched").toBeTruthy();
    expect(nameB, "synthetic B hatched").toBeTruthy();

    const aSeesB = await entryFor(a, nameB);
    const bSeesA = await entryFor(b, nameA);
    expect(aSeesB && bSeesA, "the two synthetic accounts must match each other").toBeTruthy();
    const track = aSeesB!.track;
    if (track === "romance") {
      for (const cookie of [a, b]) expect((await post("/api/interest/adult", {}, cookie)).status).toBe(200);
    }

    // A signals; B must see the invitation, and the inbox must survive the parser.
    const sent = expectJson(await post("/api/interest", { match: aSeesB!.id, track }, a), "signal A");
    expect(sent.state, "A signal is sent").toBe("sent");
    const bStates = parseInterestStates(expectJson(await get("/api/interest", b), "interest B"));
    expect(Object.values(bStates?.states ?? {}).some((s) => s.state === "invited"), "B sees the invitation").toBe(true);

    const bLock = await lockFor(b, "5926");
    const bInboxRaw = expectJson(await get("/api/chat/inbox", bLock), "inbox B");
    const bInbox = parseInbox(bInboxRaw);
    expect(bInbox, "B inbox parses").not.toBeNull();
    expect(bInbox!.invitations.length, "B sees the invitation in the inbox").toBe(1);

    // B answers with the same gesture: the conversation opens in one transaction.
    const opened = expectJson(await post("/api/interest", { match: bSeesA!.id, track }, b), "signal B");
    expect(opened.state, "mutual signal opens the chat").toBe("open");
    const id = opened.conversation;
    expect(typeof id, "conversation id returned").toBe("string");

    const aLock = await lockFor(a, "4817");
    const aInbox = parseInbox(expectJson(await get("/api/chat/inbox", aLock), "inbox A"));
    expect(aInbox, "A inbox parses").not.toBeNull();
    expect(aInbox!.conversations.some((c) => c.id === id), "A sees the new conversation without reloading").toBe(true);

    // Both sides read the same conversation, and the peer keeps a renderable name.
    for (const [cookie, expected] of [[aLock, nameB], [bLock, nameA]] as const) {
      const raw = expectJson(await get(`/api/chat/conversations/${id}`, cookie), "conversation");
      const view = parseConversation(raw);
      expect(view, "the conversation survives the browser parser").not.toBeNull();
      expect(isHatched(view!.peer.identity), "the peer is hatched, not an egg").toBe(true);
      expect(view!.peer.identity.aliasSufijo, "the frozen suffix travels to the client").toBeTruthy();
      expect(formatIdentity(view!.peer.identity).title).toBe(expected);
      expect(JSON.stringify(raw)).not.toContain("user_id");
    }

    // Three guided rounds, then free chat.
    for (let round = 0; round < 3; round += 1) {
      const viewA = parseConversation(expectJson(await get(`/api/chat/conversations/${id}`, aLock), "view A"));
      const viewB = parseConversation(expectJson(await get(`/api/chat/conversations/${id}`, bLock), "view B"));
      expect(viewA && viewB).not.toBeNull();
      const asker = viewA!.ask ? aLock : bLock;
      const other = asker === aLock ? bLock : aLock;
      const card = (asker === aLock ? viewA : viewB)!.ask?.suggestions[0];
      expect(card, `round ${round} has a card`).toBeTruthy();
      const asked = await post(`/api/chat/conversations/${id}/ask`, { promptId: card!.id }, asker);
      expect(asked.status, `ask round ${round}`).toBe(200);
      expect((await post(`/api/chat/conversations/${id}/answer`, { round, body: `ronda ${round} a` }, asker)).status).toBe(200);
      const sealed = parseConversation(expectJson(await get(`/api/chat/conversations/${id}`, other), "sealed"));
      expect(sealed!.rounds[round]?.theirs, "the other answer stays sealed").toBeNull();
      expect((await post(`/api/chat/conversations/${id}/answer`, { round, body: `ronda ${round} b` }, other)).status).toBe(200);
    }

    const free = parseConversation(expectJson(await get(`/api/chat/conversations/${id}`, aLock), "free stage"));
    expect(free!.stage, "three rounds open the free chat automatically").toBe("free");
    const message = "Smoke test ✨";
    const sentMessage = await post(`/api/chat/conversations/${id}/messages`, { body: message, clientKey: crypto.randomUUID() }, aLock);
    expect(sentMessage.status, "free message accepted").toBe(200);
    const seen = parseConversation(expectJson(await get(`/api/chat/conversations/${id}`, bLock), "B reads"));
    expect(seen!.messages.some((m) => m.body === message && !m.mine), "B reads A's message").toBe(true);

    // A third person's session cannot read it, and closing removes it for both.
    const stranger = await enter("426144895");
    const strangerLock = await lockFor(stranger, "7391");
    const intruder = await get(`/api/chat/conversations/${id}`, strangerLock);
    expect(intruder.status, "a non-participant reads nothing").toBe(404);
    expectJson(intruder, "intruder reply is JSON");
    expect((await call(`/api/chat/conversations/${id}`, "DELETE", undefined, aLock)).status).toBe(200);
    expect((await get(`/api/chat/conversations/${id}`, bLock)).status, "gone for the other side too").toBe(404);

    // No chat route may answer HTML or an empty body, even on a bad path.
    for (const path of ["/api/chat/inbox", "/api/chat/status", "/api/chat/does-not-exist"]) {
      const reply = await get(path, aLock);
      expect(reply.contentType, `${path} answers JSON even when it fails`).toContain("application/json");
    }
    expect(trace.filter((line) => line.includes("NO-JSON")), `non-JSON replies:\n${trace.join("\n")}`).toEqual([]);
  }, 240_000);
});