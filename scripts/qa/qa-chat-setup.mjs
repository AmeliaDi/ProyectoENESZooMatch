/**
 * QA harness for chat testing: creates N synthetic accounts with varied
 * profiles, known romance/amistad matches, and returns session credentials.
 * All accounts are tagged with event_id and bandera sintetico.
 *
 * Usage:
 *   npm run qa:chat:setup
 *   QA_N=4 npm run qa:chat:setup
 *
 * Environment:
 *   BASE: Deploy URL (default: http://localhost:3124)
 *   QA_N: Number of synthetic accounts to create (default: 2)
 *   QA_EVENT_ID: Optional event ID tag (default: qa-chat-YYYYMMDD-HHMMSS)
 */

const BASE = process.env.BASE ?? "http://localhost:3124";
const QA_N = Number(process.env.QA_N ?? 2);
const EVENT_ID = process.env.QA_EVENT_ID ?? `qa-chat-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

// Synthetic matrícula range: 426144890-426144899
const MATRICULA_BASE = 426144890;

const bank = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync("data/microtest.json", "utf8")));
const core = bank.items.filter((i) => i.modulo === "nucleo" && i.tipo_respuesta === "likert_5");

function generateLikert(seed) {
  return core.map((i, k) => ({ itemId: i.id, value: ((seed + k) % 5) + 1 }));
}

const FILTERS_VARIANTS = [
  [
    { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
    { itemId: "FIL2", selected: ["mujer"] },
    { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
  ],
  [
    { itemId: "FIL1", selected: ["mujeres", "hombres"] },
    { itemId: "FIL2", selected: ["hombre"] },
    { itemId: "FIL3", selected: ["relacion_abierta"] },
  ],
  [
    { itemId: "FIL1", selected: ["personas no binarias"] },
    { itemId: "FIL2", selected: ["persona no binaria"] },
    { itemId: "FIL3", selected: ["bisexual"] },
  ],
  [
    { itemId: "FIL1", selected: ["hombres", "mujeres", "personas no binarias"] },
    { itemId: "FIL2", selected: ["mujer"] },
    { itemId: "FIL3", selected: ["heterosexual"] },
  ],
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
  const filters = FILTERS_VARIANTS[index % FILTERS_VARIANTS.length];

  console.log(`\n[QA] Creating account ${index + 1}/${QA_N}: matrícula ${matricula}`);

  // Enter
  const enter = await post("/api/enter", { matricula, eventId: EVENT_ID, sintetico: true });
  if (enter.status !== 200) {
    throw new Error(`Failed to enter: ${enter.status} ${JSON.stringify(enter.json)}`);
  }
  const cookie = enter.cookies;

  // Quiz
  const quiz = await post("/api/quiz", { likert, filters }, cookie);
  if (quiz.status !== 200) {
    throw new Error(`Failed quiz: ${quiz.status} ${JSON.stringify(quiz.json)}`);
  }

  // Profile
  const profile = await get("/api/profile", cookie);
  const alias = profile.json?.identity?.aliasCompleto ?? null;

  console.log(`[QA] ✓ Account ${index + 1} created: ${alias}`);

  return { index, matricula, cookie, alias, eventId: EVENT_ID };
}

async function waitForMatches(accounts) {
  console.log(`\n[QA] Waiting for matches to compute...`);
  const results = [];

  for (const acc of accounts) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await get("/api/result", acc.cookie);
      const romance = res.json?.matches?.romance?.length ?? 0;
      const amistad = res.json?.matches?.amistad?.length ?? 0;

      if (romance > 0 || amistad > 0) {
        console.log(`[QA] ✓ ${acc.alias}: ${romance} romance, ${amistad} amistad`);
        results.push({ ...acc, romance, amistad, result: res.json });
        break;
      }

      if (attempt === 9) {
        console.log(`[QA] ⚠ ${acc.alias}: no matches after 10 attempts`);
        results.push({ ...acc, romance: 0, amistad: 0, result: res.json });
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}

async function main() {
  console.log(`[QA] Event ID: ${EVENT_ID}`);
  console.log(`[QA] Base URL: ${BASE}`);
  console.log(`[QA] Creating ${QA_N} synthetic accounts...`);

  const accounts = [];
  for (let i = 0; i < QA_N; i++) {
    accounts.push(await createAccount(i));
  }

  const results = await waitForMatches(accounts);

  console.log(`\n[QA] ✓ Setup complete`);
  console.log(`[QA] Event ID: ${EVENT_ID}`);
  console.log(`[QA] Accounts created: ${results.length}`);

  // Output credentials (in memory only, never logged to file)
  const credentials = results.map((r) => ({
    index: r.index,
    matricula: r.matricula,
    alias: r.alias,
    cookie: r.cookie,
    eventId: r.eventId,
    romance: r.romance,
    amistad: r.amistad,
  }));

  console.log(`\n[QA] Credentials (use in tests):`);
  console.log(JSON.stringify(credentials, null, 2));

  return credentials;
}

main().catch((err) => {
  console.error(`[QA] ✗ Setup failed:`, err);
  process.exit(1);
});
