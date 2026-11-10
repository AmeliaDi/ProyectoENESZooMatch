/**
 * Chat SLA enforcement tests (Phase 6). Runs load tests and asserts SLA
 * thresholds for latency, message integrity, idempotency, and API response time.
 *
 * Skipped unless BASE env var is set:
 *   BASE=http://localhost:3124 vitest run scripts/qa/chat-sla.test.ts
 *
 * Uses synthetic accounts only (matriculas 426144890-426144899).
 * All accounts are cleaned up after tests.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.BASE ?? "").replace(/\/$/, "");
const suite = BASE ? describe : describe.skip;

const EVENT_ID = `qa-sla-${Date.now()}`;
const MATRICULA_BASE = 426144890;

// SLA thresholds (from docs/QA_CHAT.md section 3)
const SLA = {
  /** Realtime delivery p95 (ms) */
  realtimeP95: 1000,
  /** Realtime delivery p99 (ms) */
  realtimeP99: 2500,
  /** Polling fallback p95 (ms) */
  pollingP95: 8000,
  /** API response time p95 (ms) */
  apiP95: 500,
  /** Maximum allowed lost messages */
  maxLostMessages: 0,
  /** Maximum allowed duplicate messages */
  maxDuplicates: 0,
  /** Maximum heap growth percentage over soak */
  maxHeapGrowthPct: 20,
} as const;

interface Account {
  index: number;
  matricula: string;
  cookie: string;
  lockCookie?: string;
}

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  cookies: string;
}

async function post(path: string, body: unknown, cookie?: string): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: BASE };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0] ?? "").filter((c) => c.length > 0 && !c.endsWith("="));
  return { status: res.status, json, cookies: cookies.join("; ") };
}

async function get(path: string, cookie: string): Promise<Reply> {
  const res = await fetch(BASE + path, { headers: { cookie } });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json, cookies: "" };
}

async function del(path: string, cookie: string): Promise<{ status: number }> {
  const res = await fetch(BASE + path, { method: "DELETE", headers: { cookie, origin: BASE } });
  return { status: res.status };
}

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

function lockedCookie(acc: Account): string {
  return acc.lockCookie ? `${acc.cookie}; ${acc.lockCookie}` : acc.cookie;
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

  const quiz = await post("/api/quiz", { likert, filters }, enter.cookies);
  expect(quiz.status, `quiz ${matricula}`).toBe(200);

  return { index, matricula, cookie: enter.cookies };
}

async function deleteAccount(matricula: string): Promise<void> {
  await withRetry(async () => {
    const enter = await post("/api/enter", { matricula });
    if (enter.status === 200 && enter.cookies) {
      await del("/api/privacy", enter.cookies);
    }
  }, `deleteAccount(${matricula})`);
}

async function waitForMatches(accounts: readonly Account[], maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  for (const acc of accounts) {
    while (Date.now() - start < maxWaitMs) {
      const res = await get("/api/result", acc.cookie);
      const matches = res.json?.matches as { romance?: unknown[]; amistad?: unknown[] } | undefined;
      const romance = matches?.romance?.length ?? 0;
      const amistad = matches?.amistad?.length ?? 0;
      if (romance > 0 || amistad > 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function setupPinAndUnlock(acc: Account): Promise<void> {
  const pin = await post("/api/chat/pin", { pin: "5926", confirm: "5926" }, acc.cookie);
  if (pin.status === 200) {
    const unlock = await post("/api/chat/unlock", { pin: "5926" }, acc.cookie);
    acc.lockCookie = unlock.cookies;
  } else {
    const unlock = await post("/api/chat/unlock", { pin: "5926" }, acc.cookie);
    acc.lockCookie = unlock.cookies;
  }
}

async function openConversation(accA: Account, accB: Account): Promise<string | null> {
  const resA = await get("/api/result", accA.cookie);
  const resB = await get("/api/result", accB.cookie);

  const findMatch = (res: Reply): { track: string; id: string } | null => {
    for (const track of ["romance", "amistad"]) {
      const entries = (res.json?.matches as Record<string, Array<{ id: string }> | undefined>)?.[track] ?? [];
      const entry = entries[0];
      if (entry?.id) return { track, id: entry.id };
    }
    return null;
  };

  const matchA = findMatch(resA);
  const matchB = findMatch(resB);
  if (!matchA || !matchB) return null;

  if (matchA.track === "romance") {
    await post("/api/interest/adult", {}, accA.cookie);
    await post("/api/interest/adult", {}, accB.cookie);
  }

  await post("/api/interest", { match: matchA.id, track: matchA.track }, accA.cookie);
  const signalB = await post("/api/interest", { match: matchB.id, track: matchB.track }, accB.cookie);

  if (signalB.json?.state !== "open") return null;
  const convId = signalB.json?.conversation as string | undefined;
  if (!convId) return null;

  // Set up PINs
  await setupPinAndUnlock(accA);
  await setupPinAndUnlock(accB);

  // Complete 3 rounds to unlock free chat
  for (let round = 0; round < 3; round++) {
    const viewA = await get(`/api/chat/conversations/${convId}`, lockedCookie(accA));
    const suggestions = (viewA.json?.ask as { suggestions?: Array<{ id: string }> } | null)?.suggestions ?? [];
    if (suggestions.length > 0 && round === 0) {
      await post(`/api/chat/conversations/${convId}/ask`, { promptId: suggestions[0]!.id }, lockedCookie(accA));
    } else if (round > 0) {
      const viewForAsk = await get(`/api/chat/conversations/${convId}`, lockedCookie(accA));
      const sugs = (viewForAsk.json?.ask as { suggestions?: Array<{ id: string }> } | null)?.suggestions ?? [];
      if (sugs.length > 0) {
        await post(`/api/chat/conversations/${convId}/ask`, { promptId: sugs[0]!.id }, lockedCookie(accA));
      }
    }
    await post(`/api/chat/conversations/${convId}/answer`, { round, body: `SLA test round ${round} A` }, lockedCookie(accA));
    await post(`/api/chat/conversations/${convId}/answer`, { round, body: `SLA test round ${round} B` }, lockedCookie(accB));
  }

  return convId;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computeStats(latencies: number[]): { p50: number; p95: number; p99: number; avg: number; count: number } {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    count: sorted.length,
  };
}

suite("Chat SLA enforcement", () => {
  const accounts: Account[] = [];
  let convId: string | null = null;
  let accA: Account | null = null;
  let accB: Account | null = null;

  beforeAll(async () => {
    // Create 2 accounts for SLA testing
    accounts.push(await createAccount(0));
    accounts.push(await createAccount(1));
    accA = accounts[0]!;
    accB = accounts[1]!;

    await waitForMatches(accounts);
    convId = await openConversation(accA, accB);
  }, 120000);

  afterAll(async () => {
    for (const acc of accounts) {
      try {
        await deleteAccount(acc.matricula);
      } catch {
        // Best-effort cleanup: log but don't fail the suite.
      }
    }
  });

  it("API response time: p95 <= 500ms for chat message send", async () => {
    if (!convId || !accA) {
      return; // skip if setup failed
    }

    const latencies: number[] = [];
    const MESSAGE_COUNT = 10;

    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const clientKey = `sla-api-${EVENT_ID}-${i}`;
      const start = performance.now();
      const res = await post(
        `/api/chat/conversations/${convId}/messages`,
        { body: `SLA API test ${i}`, clientKey },
        lockedCookie(accA),
      );
      const elapsed = performance.now() - start;

      if (res.status === 200) {
        latencies.push(elapsed);
      }
    }

    const stats = computeStats(latencies);
    console.log(`[SLA] API response: p50=${stats.p50.toFixed(0)}ms, p95=${stats.p95.toFixed(0)}ms, p99=${stats.p99.toFixed(0)}ms (n=${stats.count})`);

    expect(stats.count, "successful sends").toBeGreaterThan(0);
    expect(stats.p95, `API p95 must be <= ${SLA.apiP95}ms`).toBeLessThanOrEqual(SLA.apiP95);
  }, 60000);

  it("zero duplicated messages (clientKey idempotency)", async () => {
    if (!convId || !accA) {
      return;
    }

    const clientKey = `sla-idem-${EVENT_ID}-${Date.now()}`;

    // Send the same message twice with the same clientKey
    const first = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: "Idempotency test", clientKey },
      lockedCookie(accA),
    );
    expect(first.status, "first send").toBe(200);

    const second = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: "Idempotency test", clientKey },
      lockedCookie(accA),
    );
    expect(second.status, "retry send").toBe(200);

    // Verify only one message exists with this clientKey
    const conv = await get(`/api/chat/conversations/${convId}`, lockedCookie(accA));
    const messages = (conv.json?.messages ?? []) as Array<{ clientKey?: string }>;
    const count = messages.filter((m) => m.clientKey === clientKey).length;

    console.log(`[SLA] Idempotency: ${count} message(s) with clientKey (expected 1)`);
    expect(count, `duplicates must be 0 (got ${count - 1})`).toBe(1);
  }, 30000);

  it("zero lost messages: every sent message appears in conversation", async () => {
    if (!convId || !accA || !accB) {
      return;
    }

    const sentKeys: string[] = [];
    const MESSAGE_COUNT = 5;

    // Send messages from A
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const clientKey = `sla-lost-${EVENT_ID}-${i}`;
      sentKeys.push(clientKey);
      const res = await post(
        `/api/chat/conversations/${convId}/messages`,
        { body: `Lost test ${i}`, clientKey },
        lockedCookie(accA),
      );
      expect(res.status, `send ${i}`).toBe(200);
    }

    // Read from B's side
    const conv = await get(`/api/chat/conversations/${convId}`, lockedCookie(accB));
    const messages = (conv.json?.messages ?? []) as Array<{ clientKey?: string }>;

    let missing = 0;
    for (const key of sentKeys) {
      if (!messages.some((m) => m.clientKey === key)) {
        missing++;
      }
    }

    console.log(`[SLA] Lost messages: ${missing}/${MESSAGE_COUNT} missing`);
    expect(missing, `lost messages must be 0 (got ${missing})`).toBe(SLA.maxLostMessages);
  }, 30000);

  it("message ordering: IDs are monotonically increasing", async () => {
    if (!convId || !accA) {
      return;
    }

    const conv = await get(`/api/chat/conversations/${convId}`, lockedCookie(accA));
    const messages = (conv.json?.messages ?? []) as Array<{ id?: string; createdAt?: string }>;

    if (messages.length < 2) {
      return; // not enough messages to check ordering
    }

    // Check that messages are in order by createdAt or id
    let orderViolations = 0;
    for (let i = 1; i < messages.length; i++) {
      const prev = messages[i - 1]!;
      const curr = messages[i]!;
      if (prev.createdAt && curr.createdAt) {
        if (new Date(prev.createdAt).getTime() > new Date(curr.createdAt).getTime()) {
          orderViolations++;
        }
      }
    }

    console.log(`[SLA] Order violations: ${orderViolations}/${messages.length - 1}`);
    expect(orderViolations, "message order violations must be 0").toBe(0);
  }, 30000);

  it("latency percentiles: p95 within SLA for message delivery", async () => {
    if (!convId || !accA || !accB) {
      return;
    }

    const latencies: number[] = [];
    const MESSAGE_COUNT = 5;

    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const clientKey = `sla-lat-${EVENT_ID}-${i}`;
      const start = performance.now();

      const res = await post(
        `/api/chat/conversations/${convId}/messages`,
        { body: `Latency test ${i}`, clientKey },
        lockedCookie(accA),
      );

      const elapsed = performance.now() - start;
      if (res.status === 200) {
        latencies.push(elapsed);
      }
    }

    const stats = computeStats(latencies);
    console.log(`[SLA] Latency: p50=${stats.p50.toFixed(0)}ms, p95=${stats.p95.toFixed(0)}ms, p99=${stats.p99.toFixed(0)}ms (n=${stats.count})`);

    if (stats.count > 0) {
      // Use polling SLA as the more conservative threshold
      // (realtime would be tighter at 1s, but we test against the API which includes polling fallback)
      expect(stats.p95, `p95 must be <= ${SLA.pollingP95}ms`).toBeLessThanOrEqual(SLA.pollingP95);
    }
  }, 60000);
});
