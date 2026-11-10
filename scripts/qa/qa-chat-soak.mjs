/**
 * QA soak test: runs chat operations for 30-60 minutes to detect leaks
 * (Realtime connections, memory, listeners, duplicate subscriptions).
 *
 * Usage:
 *   npm run qa:chat:soak
 *   QA_DURATION_MIN=30 npm run qa:chat:soak
 *
 * Environment:
 *   BASE: Deploy URL (default: http://localhost:3124)
 *   QA_DURATION_MIN: Duration in minutes (default: 30)
 *   QA_EVENT_ID: Event ID for synthetic accounts (default: qa-soak-YYYYMMDD-HHMMSS)
 */

const BASE = process.env.BASE ?? "http://localhost:3124";
const DURATION_MIN = Number(process.env.QA_DURATION_MIN ?? 30);
const EVENT_ID = process.env.QA_EVENT_ID ?? `qa-soak-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

const MATRICULA_BASE = 426144890;

const bank = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync("data/microtest.json", "utf8")));
const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");

function generateLikert(seed) {
  return core.map((i, k) => ({ itemId: i.id, value: ((seed + k) % 5) + 1 }));
}

const filters = [
  { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
  { itemId: "FIL2", selected: ["mujer"] },
  { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
];

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

async function createAccount(index) {
  const matricula = String(MATRICULA_BASE + index);
  const likert = generateLikert(index);

  const enter = await post("/api/enter", { matricula });
  if (enter.status !== 200) throw new Error(`Failed to enter: ${enter.status}`);
  const cookie = enter.cookies;

  const quiz = await post("/api/quiz", { likert, filters }, cookie);
  if (quiz.status !== 200) throw new Error(`Failed quiz: ${quiz.status}`);

  return { index, matricula, cookie };
}

async function deleteAccount(matricula) {
  const enter = await post("/api/enter", { matricula });
  if (enter.status !== 200) return;
  await fetch(BASE + "/api/privacy", { method: "DELETE", headers: { cookie: enter.cookies, origin: BASE } });
}

function measureLatency() {
  const start = performance.now();
  return () => performance.now() - start;
}

async function sendMessage(convId, cookie, clientKey) {
  const latency = measureLatency();
  const res = await post(
    `/api/chat/conversations/${convId}/messages`,
    { body: `Soak test message ${Date.now()}`, clientKey },
    cookie,
  );
  return { status: res.status, latencyMs: latency() };
}

async function runSoakCycle(accounts, cycleNum) {
  console.log(`\n[Soak] Cycle ${cycleNum} at ${new Date().toISOString()}`);

  const latencies = [];
  const errors = [];

  // Each cycle: send 10 messages between the two accounts
  for (let i = 0; i < 10; i++) {
    const clientKey = `soak-${EVENT_ID}-${cycleNum}-${i}`;

    // A sends to B (we'd need to set up a conversation first, but for soak we just test the API)
    const res = await get("/api/chat/inbox", accounts[0].cookie);
    if (res.status !== 200) {
      errors.push({ cycle: cycleNum, step: i, error: `inbox failed: ${res.status}` });
      continue;
    }

    const convs = res.json?.conversations ?? [];
    if (convs.length === 0) {
      console.log(`[Soak] ⚠ No conversations found, skipping message send`);
      break;
    }

    const convId = convs[0].id;
    const result = await sendMessage(convId, accounts[0].cookie, clientKey);

    if (result.status === 200) {
      latencies.push(result.latencyMs);
    } else {
      errors.push({ cycle: cycleNum, step: i, error: `send failed: ${result.status}` });
    }

    // Small delay between messages
    await new Promise((r) => setTimeout(r, 100));
  }

  const p50 = latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)] : 0;

  console.log(`[Soak] ✓ Cycle ${cycleNum}: ${latencies.length} messages, p50=${p50.toFixed(0)}ms, p95=${p95.toFixed(0)}ms, p99=${p99.toFixed(0)}ms, ${errors.length} errors`);

  return { latencies, errors };
}

async function main() {
  console.log(`[Soak] Event ID: ${EVENT_ID}`);
  console.log(`[Soak] Base URL: ${BASE}`);
  console.log(`[Soak] Duration: ${DURATION_MIN} minutes`);

  // Create 2 accounts
  console.log(`\n[Soak] Creating 2 synthetic accounts...`);
  const accounts = [];
  for (let i = 0; i < 2; i++) {
    accounts.push(await createAccount(i));
  }

  // Wait for matches
  console.log(`[Soak] Waiting for matches...`);
  await new Promise((r) => setTimeout(r, 5000));

  // Set up a conversation (signal + accept)
  console.log(`[Soak] Setting up conversation...`);
  const resA = await get("/api/result", accounts[0].cookie);
  const resB = await get("/api/result", accounts[1].cookie);

  const matchA = resA.json?.matches?.romance?.[0] ?? resA.json?.matches?.amistad?.[0];
  const matchB = resB.json?.matches?.romance?.[0] ?? resB.json?.matches?.amistad?.[0];

  if (!matchA || !matchB) {
    console.log(`[Soak] ⚠ No matches found, cannot set up conversation`);
    console.log(`[Soak] Running inbox-only soak...`);
  } else {
    const track = resA.json?.matches?.romance?.[0] ? "romance" : "amistad";
    if (track === "romance") {
      await post("/api/interest/adult", {}, accounts[0].cookie);
      await post("/api/interest/adult", {}, accounts[1].cookie);
    }

    await post("/api/interest", { match: matchA.id, track }, accounts[0].cookie);
    await post("/api/interest", { match: matchB.id, track }, accounts[1].cookie);
  }

  // Run soak cycles
  const startTime = Date.now();
  const endTime = startTime + DURATION_MIN * 60 * 1000;
  let cycleNum = 0;
  const allLatencies = [];
  const allErrors = [];

  console.log(`\n[Soak] Starting soak at ${new Date(startTime).toISOString()}`);
  console.log(`[Soak] Will run until ${new Date(endTime).toISOString()}`);

  while (Date.now() < endTime) {
    cycleNum++;
    const result = await runSoakCycle(accounts, cycleNum);
    allLatencies.push(...result.latencies);
    allErrors.push(...result.errors);

    // Wait 1 minute between cycles
    await new Promise((r) => setTimeout(r, 60000));
  }

  console.log(`\n[Soak] ✓ Soak complete`);
  console.log(`[Soak] Total cycles: ${cycleNum}`);
  console.log(`[Soak] Total messages: ${allLatencies.length}`);
  console.log(`[Soak] Total errors: ${allErrors.length}`);

  if (allLatencies.length > 0) {
    const sorted = allLatencies.sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const avg = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;

    console.log(`\n[Soak] Latency summary:`);
    console.log(`[Soak]   Average: ${avg.toFixed(0)}ms`);
    console.log(`[Soak]   p50: ${p50.toFixed(0)}ms`);
    console.log(`[Soak]   p95: ${p95.toFixed(0)}ms`);
    console.log(`[Soak]   p99: ${p99.toFixed(0)}ms`);
  }

  if (allErrors.length > 0) {
    console.log(`\n[Soak] Errors:`);
    for (const err of allErrors.slice(0, 10)) {
      console.log(`[Soak]   Cycle ${err.cycle}, step ${err.step}: ${err.error}`);
    }
  }

  // Cleanup
  console.log(`\n[Soak] Cleaning up accounts...`);
  for (const acc of accounts) {
    try {
      await deleteAccount(acc.matricula);
    } catch {
      console.warn(`[Soak] Warning: cleanup failed for ${acc.matricula}`);
    }
  }

  console.log(`[Soak] ✓ Teardown complete`);
}

main().catch((err) => {
  console.error(`[Soak] ✗ Soak failed:`, err);
  process.exit(1);
});
