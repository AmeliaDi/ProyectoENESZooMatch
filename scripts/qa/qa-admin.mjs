// Admin console QA against a deployment (ADR-036). Needs an admin account
// prepared beforehand; credentials come ONLY from the environment:
//   BASE=https://… QA_ADMIN_MATRICULA=… QA_ADMIN_PIN=… node scripts/qa/qa-admin.mjs
// Optional QA_TARGET_MATRICULA: a disposable participant account that the run
// resets, pauses/resumes and finally DELETES. Never use a real person's matrícula.
const BASE = process.env.BASE ?? "http://localhost:3000";
const MATRICULA = process.env.QA_ADMIN_MATRICULA ?? "";
const PIN = process.env.QA_ADMIN_PIN ?? "";
const TARGET = process.env.QA_TARGET_MATRICULA ?? "";
let failures = 0;

function check(name, ok, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
}

const headers = (cookie = "") => ({ "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) });
const call = (path, init = {}, cookie = "") => fetch(`${BASE}${path}`, { ...init, headers: headers(cookie), redirect: "manual" });

function cookieOf(response, name) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    if (pair.startsWith(`${name}=`) && pair.length > name.length + 1) return pair;
  }
  return "";
}

async function unauthorized() {
  for (const [path, method] of [["/api/admin/session", "GET"], ["/api/admin/users", "GET"], ["/api/admin/audit", "GET"], ["/api/admin/reports", "GET"], ["/api/admin/metrics", "GET"]]) {
    check(`${method} ${path} without session → 401`, (await call(path, { method })).status === 401);
  }
  const forged = "zm_admin_session=eyJ1aWQiOiJ4In0.forged";
  check("forged cookie → 401", (await call("/api/admin/users", {}, forged)).status === 401);
  const wrong = await call("/api/admin/login", { method: "POST", body: JSON.stringify({ matricula: "100000001", pin: "4826" }) });
  check("unknown matrícula → 401 admin.invalid", wrong.status === 401 && (await wrong.json()).code === "admin.invalid");
  const malformed = await call("/api/admin/login", { method: "POST", body: JSON.stringify({ matricula: "12", pin: "x" }) });
  check("malformed login → 401 (uniform)", malformed.status === 401);
}

async function login() {
  const res = await call("/api/admin/login", { method: "POST", body: JSON.stringify({ matricula: MATRICULA, pin: PIN }) });
  const cookie = cookieOf(res, "zm_admin_session");
  const raw = (res.headers.getSetCookie?.() ?? []).join(" | ");
  check("admin login → 200 + cookie", res.status === 200 && Boolean(cookie));
  check("cookie is HttpOnly, SameSite=Strict, Path=/api/admin", /HttpOnly/i.test(raw) && /SameSite=Strict/i.test(raw) && /Path=\/api\/admin/i.test(raw));
  return cookie;
}

async function findTarget(cookie, alias) {
  const res = await call(`/api/admin/users?q=${encodeURIComponent(alias)}`, {}, cookie);
  const body = await res.json();
  return body.users?.find((u) => u.alias === alias) ?? null;
}

async function targetFlow(cookie) {
  const enter = await fetch(`${BASE}/api/enter`, { method: "POST", headers: headers(), body: JSON.stringify({ matricula: TARGET }) });
  check("target account entered", enter.ok);
  const list = await call("/api/admin/users?page=0", {}, cookie);
  const page = await list.json();
  check("users page lists accounts without matrícula/hash", list.ok && Array.isArray(page.users) && !/matricula|hash|latent|theta/i.test(JSON.stringify(page)));
  const target = page.users.find((u) => !u.alias && !u.quizCompletedAt) ?? null;
  if (!target) return check("found the fresh target account", false);
  for (const action of ["pause", "resume"]) {
    const res = await call(`/api/admin/users/${target.id}`, { method: "POST", body: JSON.stringify({ action }) }, cookie);
    check(`action ${action} → 200`, res.ok);
  }
  const bad = await call(`/api/admin/users/${target.id}`, { method: "POST", body: JSON.stringify({ action: "nuke" }) }, cookie);
  check("unknown action → 400", bad.status === 400);
  const del = await call(`/api/admin/users/${target.id}`, { method: "POST", body: JSON.stringify({ action: "delete" }) }, cookie);
  check("delete target → 200", del.ok);
  const again = await call(`/api/admin/users/${target.id}`, { method: "POST", body: JSON.stringify({ action: "pause" }) }, cookie);
  check("acting on a deleted account → 404", again.status === 404);
}

async function auditFlow(cookie) {
  const res = await call("/api/admin/audit", {}, cookie);
  const body = await res.json();
  const actions = (body.entries ?? []).map((e) => e.action);
  check("audit lists login", res.ok && actions.includes("login"));
  if (TARGET) check("audit lists delete_user, pause_user, resume_user", ["delete_user", "pause_user", "resume_user"].every((a) => actions.includes(a)));
  check("audit never carries matrícula or PIN", !JSON.stringify(body).includes(MATRICULA) && !JSON.stringify(body).includes(`"${PIN}"`));
  const reports = await call("/api/admin/reports?status=abierto", {}, cookie);
  check("reports page → 200", reports.ok);
  const metrics = await call("/api/admin/metrics", {}, cookie);
  check("metrics → 200 via console session", metrics.ok);
}

await unauthorized();
if (MATRICULA && PIN) {
  const cookie = await login();
  if (cookie) {
    const session = await call("/api/admin/session", {}, cookie);
    check("session → alias", session.ok && "alias" in (await session.json()));
    const selfDelete = await findTarget(cookie, "__none__");
    check("search with no match → empty", selfDelete === null);
    if (TARGET) await targetFlow(cookie);
    await auditFlow(cookie);
    const out = await call("/api/admin/logout", { method: "POST" }, cookie);
    check("logout clears the cookie", out.ok && /zm_admin_session=;/.test((out.headers.getSetCookie?.() ?? []).join(" ")));
  }
}
console.log(failures === 0 ? "ADMIN QA OK" : `ADMIN QA FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
