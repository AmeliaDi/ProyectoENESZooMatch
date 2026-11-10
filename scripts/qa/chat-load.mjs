/**
 * Chat load test (Phase 5): creates N synthetic accounts, opens conversations
 * between pairs, sends messages concurrently, measures latency percentiles,
 * reports SLA compliance, and cleans up accounts afterwards.
 *
 * Usage:
 *   npm run qa:chat:load
 *   QA_CONCURRENCY=50 QA_MESSAGES_PER_PAIR=20 node scripts/qa/chat-load.mjs
 *
 * Environment:
 *   BASE:               Deploy URL (default: http://localhost:3124)
 *   QA_CONCURRENCY:     Number of concurrent conversations (default: 10, max: 50)
 *   QA_MESSAGES_PER_PAIR: Messages per conversation pair (default: 10)
 *   QA_SOAK_MIN:        Soak duration in minutes; 0 disables soak (default: 0)
 *   QA_EVENT_ID:        Event ID tag (default: qa-load-YYYYMMDD-HHMMSS)
 */

const BASE = (process.env.BASE ?? "http://localhost:3124").replace(/\/$/, "");
const CONCURRENCY = Math.min(Number(process.env.QA_CONCURRENCY ?? 10), 50);
const MESSAGES_PER_PAIR = Number(process.env.QA_MESSAGES_PER_PAIR ?? 10);
const SOAK_MIN = Number(process.env.QA_SOAK_MIN ?? 0);
const EVENT_ID = process.env.QA_EVENT_ID ?? `qa-load-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

const MATRICULA_BASE = 426144890;
const MATRICULA_MAX = 426144899;
const MAX_ACCOUNTS = MATRICULA_MAX - MATRICULA_BASE + 1;

const { readFileSync } = await import("node:fs");
const bank = JSON.parse(readFileSync("data/microtest.json", "utf8"));
const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");

function generateLikert(seed) {
  return core.map((i, k) => ({ itemId: i.id, value: ((seed + k) % 5) + 1 }));
}

const FILTERS = [
  { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
  { itemId: "FIL2", selected: ["mujer"] },
  { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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
async function withRetry(fn, label, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const msg = err?.message ?? String(err);
      if (/fetch|ECONNRESET|ETIMEDOUT|socket hang up|network|5\d{2}/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`withRetry(${label}): unreachable`);
}

// ── Account management ────────────────────────────────────────────────────────

async function createAccount(index) {
  const matricula = String(MATRICULA_BASE + index);
  const likert = generateLikert(index);

  const enter = await post("/api/enter", { matricula });
  if (enter.status !== 200) throw new Error(`enter ${matricula}: ${enter.status}`);
  const cookie = enter.cookies;

  const quiz = await post("/api/quiz", { likert, filters: FILTERS }, cookie);
  if (quiz.status !== 200) throw new Error(`quiz ${matricula}: ${quiz.status}`);

  return { index, matricula, cookie };
}

async function deleteAccount(matricula) {
  await withRetry(async () => {
    const enter = await post("/api/enter", { matricula });
    if (enter.status === 200 && enter.cookies) {
      await del("/api/privacy", enter.cookies);
    }
  }, `deleteAccount(${matricula})`);
}

async function waitForMatches(accounts, maxWaitMs = 30000) {
  const start = Date.now();
  for (const acc of accounts) {
    while (Date.now() - start < maxWaitMs) {
      const res = await get("/api/result", acc.cookie);
      const romance = res.json?.matches?.romance?.length ?? 0;
      const amistad = res.json?.matches?.amistad?.length ?? 0;
      if (romance > 0 || amistad > 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ── Conversation setup ────────────────────────────────────────────────────────

async function openConversation(accA, accB) {
  const resA = await get("/api/result", accA.cookie);
  const resB = await get("/api/result", accB.cookie);

  const findMatch = (res) => {
    for (const track of ["romance", "amistad"]) {
      const entries = res.json?.matches?.[track] ?? [];
      const entry = entries.find((m) => {
        const alias = m.identity?.aliasCompleto;
        return alias != null;
      });
      if (entry) return { track, id: entry.id };
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
  const convId = signalB.json?.conversation;
  if (!convId) return null;

  // Set up PIN for both to unlock chat
  for (const acc of [accA, accB]) {
    const pin = await post("/api/chat/pin", { pin: "5926", confirm: "5926" }, acc.cookie);
    if (pin.status === 200) {
      const unlock = await post("/api/chat/unlock", { pin: "5926" }, acc.cookie);
      acc.lockCookie = unlock.cookies;
    } else {
      // PIN may already exist, try unlock directly
      const unlock = await post("/api/chat/unlock", { pin: "5926" }, acc.cookie);
      acc.lockCookie = unlock.cookies;
    }
  }

  // Complete 3 rounds to unlock free chat
  for (let round = 0; round < 3; round++) {
    const viewA = await get(`/api/chat/conversations/${convId}`, accA.lockCookie ? `${accA.cookie}; ${accA.lockCookie}` : accA.cookie);
    const suggestions = viewA.json?.ask?.suggestions ?? [];
    if (suggestions.length > 0) {
      await post(`/api/chat/conversations/${convId}/ask`, { promptId: suggestions[0].id }, accA.lockCookie ? `${accA.cookie}; ${accA.lockCookie}` : accA.cookie);
    }
    await post(`/api/chat/conversations/${convId}/answer`, { round, body: `Load test round ${round} A` }, accA.lockCookie ? `${accA.cookie}; ${accA.lockCookie}` : accA.cookie);
    await post(`/api/chat/conversations/${convId}/answer`, { round, body: `Load test round ${round} B` }, accB.lockCookie ? `${accB.cookie}; ${accB.lockCookie}` : accB.cookie);
  }

  return { convId, track: matchA.track, accA, accB };
}

// ── Latency measurement ───────────────────────────────────────────────────────

function measureLatency() {
  const start = performance.now();
  return () => performance.now() - start;
}

async function sendMessage(convId, cookie, clientKey) {
  const latency = measureLatency();
  const res = await post(
    `/api/chat/conversations/${convId}/messages`,
    { body: `Load test msg ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, clientKey },
    cookie,
  );
  return { status: res.status, latencyMs: latency() };
}

// ── Percentile computation ────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computeStats(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0, count: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    count: sorted.length,
  };
}

// ── Memory tracking ───────────────────────────────────────────────────────────

function getHeapUsage() {
  const mem = process.memoryUsage();
  return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
}

// ── Main load test ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[Load] Event ID: ${EVENT_ID}`);
  console.log(`[Load] Base URL: ${BASE}`);
  console.log(`[Load] Concurrency: ${CONCURRENCY} conversations`);
  console.log(`[Load] Messages per pair: ${MESSAGES_PER_PAIR}`);
  console.log(`[Load] Soak duration: ${SOAK_MIN} min`);

  // Determine how many accounts we need (pairs of 2)
  const pairsNeeded = Math.min(CONCURRENCY, Math.floor(MAX_ACCOUNTS / 2));
  const accountsNeeded = pairsNeeded * 2;

  console.log(`\n[Load] Creating ${accountsNeeded} synthetic accounts (${pairsNeeded} pairs)...`);
  const accounts = [];
  for (let i = 0; i < accountsNeeded; i++) {
    try {
      accounts.push(await createAccount(i));
    } catch (err) {
      console.warn(`[Load] Failed to create account ${i}: ${err.message}`);
    }
  }

  if (accounts.length < 2) {
    console.error("[Load] Not enough accounts created, aborting.");
    process.exit(1);
  }

  console.log(`[Load] Created ${accounts.length} accounts, waiting for matches...`);
  await waitForMatches(accounts);

  // Open conversations between pairs
  console.log(`\n[Load] Opening conversations between pairs...`);
  const conversations = [];
  const actualPairs = Math.floor(accounts.length / 2);

  for (let i = 0; i < actualPairs; i++) {
    const accA = accounts[i * 2];
    const accB = accounts[i * 2 + 1];
    try {
      const conv = await openConversation(accA, accB);
      if (conv) {
        conversations.push(conv);
        console.log(`[Load] Pair ${i + 1}/${actualPairs}: conversation opened (${conv.convId})`);
      } else {
        console.warn(`[Load] Pair ${i + 1}/${actualPairs}: could not open conversation`);
      }
    } catch (err) {
      console.warn(`[Load] Pair ${i + 1}/${actualPairs}: error - ${err.message}`);
    }
  }

  if (conversations.length === 0) {
    console.error("[Load] No conversations opened, aborting.");
    for (const acc of accounts) {
      try { await deleteAccount(acc.matricula); } catch { /* best effort */ }
    }
    process.exit(1);
  }

  console.log(`\n[Load] ${conversations.length} conversations ready, starting load test...`);

  // ── Phase 1: Concurrent message sending ───────────────────────────────────
  const allLatencies = [];
  const errors = [];
  const sentKeys = new Set();
  const startTime = Date.now();

  // Send messages concurrently across all conversations
  const sendPromises = [];
  for (const conv of conversations) {
    const cookie = conv.accA.lockCookie ? `${conv.accA.cookie}; ${conv.accA.lockCookie}` : conv.accA.cookie;
    for (let m = 0; m < MESSAGES_PER_PAIR; m++) {
      const clientKey = `load-${EVENT_ID}-${conv.convId}-${m}`;
      sentKeys.add(clientKey);
      sendPromises.push(
        sendMessage(conv.convId, cookie, clientKey).then((result) => ({
          convId: conv.convId,
          clientKey,
          ...result,
        })),
      );
    }
  }

  // Execute all sends with controlled concurrency
  const BATCH_SIZE = Math.min(sendPromises.length, CONCURRENCY);
  for (let i = 0; i < sendPromises.length; i += BATCH_SIZE) {
    const batch = sendPromises.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((p) => p));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.status === 200) {
        allLatencies.push(r.value.latencyMs);
      } else if (r.status === "fulfilled") {
        errors.push({ clientKey: r.value.clientKey, status: r.value.status });
      } else {
        errors.push({ error: r.reason?.message ?? "unknown" });
      }
    }
  }

  const loadDuration = Date.now() - startTime;
  const sendStats = computeStats(allLatencies);

  console.log(`\n[Load] ── Phase 1: Concurrent Send Results ──`);
  console.log(`[Load] Duration: ${(loadDuration / 1000).toFixed(1)}s`);
  console.log(`[Load] Messages sent: ${allLatencies.length}`);
  console.log(`[Load] Errors: ${errors.length}`);
  console.log(`[Load] Latency p50: ${sendStats.p50.toFixed(0)}ms`);
  console.log(`[Load] Latency p95: ${sendStats.p95.toFixed(0)}ms`);
  console.log(`[Load] Latency p99: ${sendStats.p99.toFixed(0)}ms`);
  console.log(`[Load] Latency avg: ${sendStats.avg.toFixed(0)}ms`);
  console.log(`[Load] Latency min: ${sendStats.min.toFixed(0)}ms`);
  console.log(`[Load] Latency max: ${sendStats.max.toFixed(0)}ms`);

  // ── Phase 2: Idempotency check ────────────────────────────────────────────
  console.log(`\n[Load] ── Phase 2: Idempotency Check ──`);
  let duplicates = 0;
  if (conversations.length > 0) {
    const conv = conversations[0];
    const cookie = conv.accA.lockCookie ? `${conv.accA.cookie}; ${conv.accA.lockCookie}` : conv.accA.cookie;
    const idemKey = `idem-${EVENT_ID}-check`;
    const first = await sendMessage(conv.convId, cookie, idemKey);
    const second = await sendMessage(conv.convId, cookie, idemKey);

    if (first.status === 200 && second.status === 200) {
      const convCheck = await get(`/api/chat/conversations/${conv.convId}`, cookie);
      const messages = convCheck.json?.messages ?? [];
      const count = messages.filter((m) => m.clientKey === idemKey).length;
      duplicates = count - 1; // should be 0
      console.log(`[Load] Idempotency: sent twice with same clientKey, messages in DB: ${count} (duplicates: ${duplicates})`);
    }
  }

  // ── Phase 3: Soak test (optional) ─────────────────────────────────────────
  let soakStats = null;
  if (SOAK_MIN > 0) {
    console.log(`\n[Load] ── Phase 3: Soak Test (${SOAK_MIN} min) ──`);
    const soakStart = Date.now();
    const soakEnd = soakStart + SOAK_MIN * 60 * 1000;
    const soakLatencies = [];
    const soakErrors = [];
    let soakCycle = 0;

    const initialHeap = getHeapUsage();
    console.log(`[Soak] Initial heap: ${(initialHeap.heapUsed / 1024 / 1024).toFixed(1)} MB`);

    while (Date.now() < soakEnd) {
      soakCycle++;
      for (const conv of conversations) {
        const cookie = conv.accA.lockCookie ? `${conv.accA.cookie}; ${conv.accA.lockCookie}` : conv.accA.cookie;
        const clientKey = `soak-${EVENT_ID}-${soakCycle}-${conv.convId}`;
        const result = await sendMessage(conv.convId, cookie, clientKey);
        if (result.status === 200) {
          soakLatencies.push(result.latencyMs);
        } else {
          soakErrors.push(result.status);
        }
      }

      if (soakCycle % 5 === 0) {
        const heap = getHeapUsage();
        const elapsed = ((Date.now() - soakStart) / 60000).toFixed(1);
        console.log(`[Soak] Cycle ${soakCycle} (${elapsed}min): heap=${(heap.heapUsed / 1024 / 1024).toFixed(1)}MB, msgs=${soakLatencies.length}`);
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    const finalHeap = getHeapUsage();
    const heapGrowthPct = ((finalHeap.heapUsed - initialHeap.heapUsed) / initialHeap.heapUsed) * 100;
    soakStats = {
      ...computeStats(soakLatencies),
      errors: soakErrors.length,
      cycles: soakCycle,
      heapGrowthPct,
      initialHeapMB: initialHeap.heapUsed / 1024 / 1024,
      finalHeapMB: finalHeap.heapUsed / 1024 / 1024,
    };

    console.log(`\n[Soak] Final heap: ${(finalHeap.heapUsed / 1024 / 1024).toFixed(1)} MB`);
    console.log(`[Soak] Heap growth: ${heapGrowthPct.toFixed(1)}%`);
    console.log(`[Soak] Total messages: ${soakLatencies.length}`);
    console.log(`[Soak] Total errors: ${soakErrors.length}`);
    if (soakLatencies.length > 0) {
      console.log(`[Soak] Latency p50: ${soakStats.p50.toFixed(0)}ms`);
      console.log(`[Soak] Latency p95: ${soakStats.p95.toFixed(0)}ms`);
      console.log(`[Soak] Latency p99: ${soakStats.p99.toFixed(0)}ms`);
    }
  }

  // ── SLA Report ────────────────────────────────────────────────────────────
  console.log(`\n[Load] ══════════════════════════════════════════════`);
  console.log(`[Load]              SLA COMPLIANCE REPORT`);
  console.log(`[Load] ══════════════════════════════════════════════`);

  const slaResults = [];

  // API response time: p95 <= 500ms
  const apiP95Ok = sendStats.p95 <= 500;
  slaResults.push({ metric: "API response p95", value: `${sendStats.p95.toFixed(0)}ms`, threshold: "<= 500ms", pass: apiP95Ok });

  // Zero duplicated messages
  const noDuplicates = duplicates === 0;
  slaResults.push({ metric: "Duplicated messages", value: String(duplicates), threshold: "= 0", pass: noDuplicates });

  // Memory leak detection (soak only)
  if (soakStats) {
    const noLeak = soakStats.heapGrowthPct <= 20;
    slaResults.push({ metric: "Heap growth (soak)", value: `${soakStats.heapGrowthPct.toFixed(1)}%`, threshold: "<= 20%", pass: noLeak });
  }

  // Print table
  console.log(`[Load]`);
  console.log(`[Load] | Metric | Value | Threshold | Status |`);
  console.log(`[Load] |--------|-------|-----------|--------|`);
  for (const sla of slaResults) {
    console.log(`[Load] | ${sla.metric} | ${sla.value} | ${sla.threshold} | ${sla.pass ? "PASS" : "FAIL"} |`);
  }

  const allPassed = slaResults.every((s) => s.pass);
  console.log(`\n[Load] Overall: ${allPassed ? "ALL SLAs PASSED" : "SOME SLAs FAILED"}`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log(`\n[Load] Cleaning up ${accounts.length} accounts...`);
  for (const acc of accounts) {
    try {
      await deleteAccount(acc.matricula);
    } catch {
      // Best-effort cleanup: log but continue deleting remaining accounts.
      console.warn(`[Load] Warning: cleanup failed for ${acc.matricula}`);
    }
  }

  console.log(`[Load] Teardown complete.`);

  // Output machine-readable JSON summary
  const summary = {
    eventId: EVENT_ID,
    timestamp: new Date().toISOString(),
    config: { concurrency: CONCURRENCY, messagesPerPair: MESSAGES_PER_PAIR, soakMin: SOAK_MIN },
    results: {
      conversationsOpened: conversations.length,
      messagesSent: allLatencies.length,
      errors: errors.length,
      latency: sendStats,
      duplicates,
      soak: soakStats,
    },
    sla: slaResults,
    allPassed,
  };

  console.log(`\n[Load] JSON summary:`);
  console.log(JSON.stringify(summary, null, 2));

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[Load] Fatal error:", err);
  process.exit(1);
});
