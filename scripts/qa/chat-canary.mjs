/**
 * Chat canary test (Phase 8): lightweight production monitoring script.
 *
 * Creates 2 synthetic accounts, walks through the full chat flow
 * (enter → quiz → signal → chat open → 1 message → cleanup), measures
 * total time (must be < 30s), and reports success/failure as JSON to
 * stdout for monitoring systems (Datadog, PagerDuty, Grafana, etc.).
 *
 * Designed to run every 5 minutes via cron or CI schedule.
 *
 * Usage:
 *   npm run qa:chat:canary
 *   BASE=https://your-deploy.vercel.app node --no-warnings scripts/qa/chat-canary.mjs
 *
 * Environment:
 *   BASE:               Deploy URL (REQUIRED — exits 0 with skip message if absent)
 *   QA_CANARY_TIMEOUT:  Total timeout in seconds (default: 30)
 *   QA_CANARY_PIN:      PIN for test accounts (default: "5926")
 *
 * Exit codes:
 *   0 — success (or skip when BASE is not set)
 *   1 — failure (SLA breach or error)
 *
 * Output: JSON object to stdout (one line) for machine consumption.
 * Human-readable logs go to stderr so they don't pollute the JSON.
 */

const BASE = (process.env.BASE ?? "").replace(/\/$/, "");
const TIMEOUT_S = Number(process.env.QA_CANARY_TIMEOUT ?? 30);
const PIN = process.env.QA_CANARY_PIN ?? "5926";
const MATRICULA_A = "426144893";
const MATRICULA_B = "426144894";
const EVENT_ID = `qa-canary-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

const { readFileSync } = await import("node:fs");
const bank = JSON.parse(readFileSync("data/microtest.json", "utf8"));
const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");

// ── Logging (stderr for human, stdout reserved for JSON result) ───────────────

function log(msg) {
  process.stderr.write(`[Canary] ${msg}\n`);
}

// ── HTTP helpers with retry ──────────────────────────────────────────────────

async function post(path, body, cookie) {
  const headers = { "content-type": "application/json", origin: BASE };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));
  return { status: res.status, json, cookies: cookies.join("; ") };
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, { headers: { cookie } });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function del(path, cookie) {
  const res = await fetch(BASE + path, { method: "DELETE", headers: { cookie, origin: BASE } });
  return { status: res.status };
}

/** Retry wrapper for transient network errors (timeouts, ECONNRESET, 5xx). */
async function withRetry(fn, label, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const msg = err?.message ?? String(err);
      if (/fetch|ECONNRESET|ETIMEDOUT|socket hang up|network|5\d{2}/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`withRetry(${label}): unreachable`);
}

// ── Account helpers ──────────────────────────────────────────────────────────

async function createAccount(matricula, index) {
  const likert = core.map((i, k) => ({ itemId: i.id, value: ((index + k) % 5) + 1 }));
  const filters = [
    { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
    { itemId: "FIL2", selected: ["mujer"] },
    { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
  ];

  const enter = await withRetry(
    () => post("/api/enter", { matricula }),
    `enter(${matricula})`,
  );
  if (enter.status !== 200) throw new Error(`enter ${matricula}: ${enter.status}`);
  const cookie = enter.cookies;

  const quiz = await withRetry(
    () => post("/api/quiz", { likert, filters }, cookie),
    `quiz(${matricula})`,
  );
  if (quiz.status !== 200) throw new Error(`quiz ${matricula}: ${quiz.status}`);

  return { matricula, cookie };
}

async function deleteAccount(matricula) {
  try {
    const enter = await post("/api/enter", { matricula });
    if (enter.status === 200 && enter.cookies) {
      await del("/api/privacy", enter.cookies);
    }
  } catch {
    // Best-effort cleanup: log but don't throw.
    log(`Warning: cleanup failed for ${matricula}`);
  }
}

async function waitForMatches(acc, maxWaitMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await get("/api/result", acc.cookie);
    const romance = res.json?.matches?.romance?.length ?? 0;
    const amistad = res.json?.matches?.amistad?.length ?? 0;
    if (romance > 0 || amistad > 0) return res.json;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`waitForMatches(${acc.matricula}): timeout after ${maxWaitMs}ms`);
}

async function lockWithPin(cookie) {
  const pin = await post("/api/chat/pin", { pin: PIN, confirm: PIN }, cookie);
  if (pin.status === 200) {
    const unlock = await post("/api/chat/unlock", { pin: PIN }, cookie);
    return unlock.cookies;
  }
  // PIN may already exist — try unlock directly.
  const unlock = await post("/api/chat/unlock", { pin: PIN }, cookie);
  return unlock.cookies;
}

// ── Main canary flow ─────────────────────────────────────────────────────────

async function runCanary() {
  const startTime = Date.now();
  const steps = {};
  let accA = null;
  let accB = null;

  // Ensure cleanup runs even if a step throws.
  const cleanup = async () => {
    for (const acc of [accA, accB]) {
      if (acc) await deleteAccount(acc.matricula);
    }
  };

  try {
    // Step 1: Create 2 synthetic accounts
    let t = Date.now();
    accA = await createAccount(MATRICULA_A, 3);
    accB = await createAccount(MATRICULA_B, 4);
    steps.createAccounts = Date.now() - t;

    // Check overall timeout
    if (Date.now() - startTime > TIMEOUT_S * 1000) {
      throw new Error(`Timeout: exceeded ${TIMEOUT_S}s after createAccounts`);
    }

    // Step 2: Wait for matches
    t = Date.now();
    const [resultA, resultB] = await Promise.all([
      waitForMatches(accA),
      waitForMatches(accB),
    ]);
    steps.waitForMatches = Date.now() - t;

    if (Date.now() - startTime > TIMEOUT_S * 1000) {
      throw new Error(`Timeout: exceeded ${TIMEOUT_S}s after waitForMatches`);
    }

    // Find a common match between A and B
    const findMatchEntry = (result) => {
      for (const track of ["romance", "amistad"]) {
        const entries = result?.matches?.[track] ?? [];
        const entry = entries.find((m) => m.identity?.aliasCompleto != null);
        if (entry) return { track, id: entry.id };
      }
      return null;
    };

    const matchA = findMatchEntry(resultA);
    const matchB = findMatchEntry(resultB);
    if (!matchA || !matchB) throw new Error("No mutual match found between canary accounts");

    // Step 3: Open chat via mutual signals
    t = Date.now();
    if (matchA.track === "romance") {
      await post("/api/interest/adult", {}, accA.cookie);
      await post("/api/interest/adult", {}, accB.cookie);
    }

    await post("/api/interest", { match: matchA.id, track: matchA.track }, accA.cookie);
    const signalB = await post("/api/interest", { match: matchB.id, track: matchB.track }, accB.cookie);

    if (signalB.json?.state !== "open") {
      throw new Error(`Chat did not open: state=${signalB.json?.state}`);
    }
    const convId = signalB.json?.conversation;
    if (!convId) throw new Error("No conversation id returned");
    steps.openChat = Date.now() - t;

    if (Date.now() - startTime > TIMEOUT_S * 1000) {
      throw new Error(`Timeout: exceeded ${TIMEOUT_S}s after openChat`);
    }

    // Step 4: PIN + 3 rounds to unlock free chat
    t = Date.now();
    const [lockA, lockB] = await Promise.all([
      lockWithPin(accA.cookie),
      lockWithPin(accB.cookie),
    ]);

    for (let round = 0; round < 3; round++) {
      const viewA = await get(`/api/chat/conversations/${convId}`, lockA);
      const suggestions = viewA.json?.ask?.suggestions ?? [];
      if (suggestions.length > 0) {
        await post(`/api/chat/conversations/${convId}/ask`, { promptId: suggestions[0].id }, lockA);
      }
      await post(`/api/chat/conversations/${convId}/answer`, { round, body: `canary-r${round}-a` }, lockA);
      await post(`/api/chat/conversations/${convId}/answer`, { round, body: `canary-r${round}-b` }, lockB);
    }
    steps.pinAndRounds = Date.now() - t;

    if (Date.now() - startTime > TIMEOUT_S * 1000) {
      throw new Error(`Timeout: exceeded ${TIMEOUT_S}s after pinAndRounds`);
    }

    // Step 5: Send 1 message in free chat
    t = Date.now();
    const msg = await post(
      `/api/chat/conversations/${convId}/messages`,
      { body: "Canary test message", clientKey: `canary-${Date.now()}` },
      lockA,
    );
    if (msg.status !== 200) throw new Error(`Message send failed: ${msg.status}`);
    steps.sendMessage = Date.now() - t;

    const totalMs = Date.now() - startTime;
    const success = totalMs < TIMEOUT_S * 1000;

    await cleanup();

    return {
      success,
      totalMs,
      steps,
      eventId: EVENT_ID,
      timestamp: new Date().toISOString(),
      error: success ? null : `Total time ${totalMs}ms exceeded timeout ${TIMEOUT_S * 1000}ms`,
    };
  } catch (err) {
    const totalMs = Date.now() - startTime;
    await cleanup();
    return {
      success: false,
      totalMs,
      steps,
      eventId: EVENT_ID,
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

if (!BASE) {
  // No BASE URL — skip gracefully (exit 0 so CI stays green).
  const skipResult = {
    success: true,
    skipped: true,
    reason: "BASE not set — canary skipped",
    timestamp: new Date().toISOString(),
    totalMs: 0,
    steps: {},
  };
  console.log(JSON.stringify(skipResult));
  process.exit(0);
}

log(`Starting canary against ${BASE} (timeout: ${TIMEOUT_S}s)`);

const result = await runCanary();

// Output machine-readable JSON to stdout (single line for log parsers).
console.log(JSON.stringify(result));

if (!result.success) {
  log(`FAILED: ${result.error}`);
  process.exit(1);
} else {
  log(`OK: completed in ${result.totalMs}ms`);
  process.exit(0);
}
