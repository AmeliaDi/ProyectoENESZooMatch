// QA general de API contra BASE (dev o producción). Solo matrículas falsas
// (42614489x) y las borra al final con DELETE /api/privacy.
// Uso: BASE=https://zooenes.vercel.app node scripts/qa/qa-api.mjs
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3124";
const bank = JSON.parse(readFileSync("data/microtest.json", "utf8"));
const core = bank.items.filter((i) => i.modulo === "nucleo");
const likert = (v) => core.filter((i) => i.tipo_respuesta === "likert_5").map((i, k) => ({ itemId: i.id, value: ((v + k) % 5) + 1 }));
const filters = [
  { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
  { itemId: "FIL2", selected: ["mujer"] },
  { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
];
const rows = [];
const row = (check, got, ok) => rows.push(`| ${check} | ${got} | ${ok ? "OK" : "FALLA"} |`);
const post = (path, body, cookie) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

async function enter(m, cookie) {
  const r = await post("/api/enter", { matricula: m }, cookie);
  const live = r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));
  return { status: r.status, cookie: live.join("; "), setCookie: r.headers.getSetCookie() };
}

for (const p of ["/", "/cuestionario", "/resultado", "/perfil", "/ajustes", "/afinar?modulo=intereses", "/evidencia", "/admin/login"]) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  row(`GET ${p}`, r.status, r.status === 200 || r.status === 307);
}
const nf = await fetch(BASE + "/no-existe-esta-ruta");
row("GET ruta inexistente", nf.status, nf.status === 404);
for (const p of ["/dev/avatars", "/dev/ui", "/dev/physics"]) {
  const r = await fetch(BASE + p);
  row(`GET ${p} (${BASE.includes("localhost") ? "dev" : "prod"})`, r.status, BASE.includes("localhost") ? r.status === 200 : r.status === 404);
}
for (const [p, m] of [["/api/profile", "GET"], ["/api/result", "GET"], ["/api/privacy", "GET"], ["/api/notifications", "GET"], ["/api/admin/metrics", "GET"]]) {
  const r = await fetch(BASE + p, { method: m });
  row(`${m} ${p} sin sesión`, r.status, r.status === 401 || r.status === 403);
}
// ADR-023/026: exactamente 9 dígitos, sin normalización permisiva; la matrícula es la única credencial.
for (const bad of ["12", "ab", "!!!!!", "", "AB1234", "42614489A", "4261-44891", "4261448911", "４２６１４４８９１"]) {
  const r = await enter(bad);
  row(`enter matrícula inválida «${bad}»`, r.status, r.status === 400);
}
const extraKey = await post("/api/enter", { matricula: "426144891", accessKey: "vieja-clave" });
row("enter con campo accessKey extra", extraKey.status, extraKey.status === 400);
const xo = await fetch(BASE + "/api/enter", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ matricula: "426144890" }) });
row("enter con Origin ajeno", xo.status, xo.status === 403);

const a = await enter("426144891");
const b = await enter("426144892");
row("enter matrícula nueva (falsa)", `${a.status}/${b.status}`, a.status === 200 && b.status === 200);
const again = await enter("426144891");
row("enter misma matrícula de nuevo", again.status, again.status === 200);
const third = await enter("426144892");
const exit = await post("/api/exit", {}, third.cookie);
row("POST /api/exit", exit.status, exit.status === 200);
const incomplete = await post("/api/quiz", { likert: likert(1).slice(0, 10), filters }, a.cookie);
row("quiz incompleto", incomplete.status, incomplete.status === 400);
for (const s of [a, b]) {
  const r = await post("/api/quiz", { likert: likert(2), filters }, s.cookie);
  row("quiz completo", r.status, r.status === 200);
}
const firstAlias = (await (await post("/api/quiz", { likert: likert(0), filters }, a.cookie)).json()).profile?.alias;
const retake = (await (await post("/api/quiz", { likert: likert(2), filters }, a.cookie)).json()).profile?.alias;
row("alias fijo al rehacer el test (ADR-024)", retake === firstAlias ? "igual" : "cambió", Boolean(firstAlias) && retake === firstAlias);
const get = (p, s) => fetch(BASE + p, { headers: { cookie: s.cookie } });
const res = await get("/api/result", a);
const resJson = await res.json();
const raw = JSON.stringify(resJson);
const leaks = ["theta", '"se"', "latent", "vector", "answers", "matricula", "hash", "user_id", "userId"].filter((k) => raw.includes(k));
row("GET /api/result", res.status, res.status === 200);
row("result sin θ/SE/vectores/respuestas/ids", leaks.join(",") || "ninguno", leaks.length === 0);
row("matches romance/amistad", `${resJson.matches?.romance?.length}/${resJson.matches?.amistad?.length}`, true);
const prof = await get("/api/profile", a);
const profRaw = await prof.clone().text();
const pLeaks = ["theta", '"se"', "latent", "answers", "matricula", "hash", "userId"].filter((k) => profRaw.includes(k));
row("GET /api/profile", prof.status, prof.status === 200);
row("profile sin datos crudos", pLeaks.join(",") || "ninguno", pLeaks.length === 0);
const priv = await get("/api/privacy", a);
row("GET /api/privacy", priv.status, priv.status === 200);
const pause = await fetch(BASE + "/api/privacy", { method: "PATCH", headers: { "content-type": "application/json", origin: BASE, cookie: b.cookie }, body: JSON.stringify({ paused: true }) });
row("PATCH pausar perfil", pause.status, pause.status === 200);
const resAfter = await (await get("/api/result", a)).json();
const hidden = !JSON.stringify(resAfter).includes(JSON.stringify(resJson.matches?.romance?.[0]?.alias ?? "§"));
row("perfil pausado deja de aparecer", hidden ? "sí" : "no", hidden || !resJson.matches?.romance?.length);
const notif = await get("/api/notifications", a);
row("GET /api/notifications", notif.status, notif.status === 200);

// PIN del chat (ADR-029): candado por persona, sin datos sin candado.
const withLock = (s, lock) => ({ cookie: [s.cookie, lock].filter(Boolean).join("; ") });
const lockCookie = (r) => r.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => /lock/i.test(c) && !/=$/.test(c)) ?? "";
const st0 = await (await get("/api/chat/status", a)).json();
row("chat status sin PIN", `hasPin=${st0.hasPin}`, st0.hasPin === false && st0.unlocked === false);
const inbox0 = await get("/api/chat/inbox", a);
const inbox0Body = await inbox0.text();
row("inbox sin candado: bloqueado y sin datos", inbox0.status, inbox0.status === 423 && !inbox0Body.includes("conversations"));
const weak = await post("/api/chat/pin", { pin: "1234", confirm: "1234" }, a.cookie);
row("PIN trivial rechazado", weak.status, weak.status === 400 || weak.status === 422);
const mismatch = await post("/api/chat/pin", { pin: "4817", confirm: "4871" }, a.cookie);
row("PIN sin confirmar igual", mismatch.status, mismatch.status === 400 || mismatch.status === 422);
const created = await post("/api/chat/pin", { pin: "4817", confirm: "4817" }, a.cookie);
const createdRaw = await created.text();
row("crear PIN", created.status, created.status === 200 && !createdRaw.includes("4817") && !/hash|salt/i.test(createdRaw));
const lock1 = lockCookie(created);
const inbox1 = await get("/api/chat/inbox", withLock(a, lock1));
row("inbox con candado abierto", inbox1.status, inbox1.status === 200);
const stolen = await get("/api/chat/inbox", withLock(b, lock1));
row("cookie de candado de otra cuenta", stolen.status, stolen.status === 423);
const tampered = await get("/api/chat/inbox", withLock(a, lock1.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"))));
row("cookie de candado manipulada", tampered.status, tampered.status === 423);
const wrong = await post("/api/chat/unlock", { pin: "9051" }, a.cookie);
const wrongBody = await wrong.json();
row("PIN incorrecto: error genérico", `${wrong.status} ${wrongBody.code}`, wrong.status >= 400 && !JSON.stringify(wrongBody).includes("9051"));
const unlocked = await post("/api/chat/unlock", { pin: "4817" }, a.cookie);
row("desbloquear con PIN correcto", unlocked.status, unlocked.status === 200 && Boolean(lockCookie(unlocked)));
const activity = await (await get("/api/chat/activity", a)).text();
row("actividad sin PIN ni hash", activity.includes("4817") || /hash|salt/i.test(activity) ? "fuga" : "limpia", !activity.includes("4817") && !/hash|salt/i.test(activity));
const badRecovery = await post("/api/chat/recovery", { matricula: "426144899" }, a.cookie);
row("recuperación con matrícula ajena", badRecovery.status, badRecovery.status >= 400);
for (const s of [a, b]) {
  const d = await fetch(BASE + "/api/privacy", { method: "DELETE", headers: { origin: BASE, cookie: s.cookie } });
  row("DELETE borrar mis datos", d.status, d.status === 200);
}
const gone = await get("/api/profile", a);
row("perfil tras borrar", gone.status, gone.status === 401 || gone.status === 404);
const pinAfter = await (await enter("426144891")).cookie;
const stAfter = await (await fetch(BASE + "/api/chat/status", { headers: { cookie: pinAfter } })).json();
row("borrar datos elimina el PIN", `hasPin=${stAfter.hasPin}`, stAfter.hasPin === false);
await fetch(BASE + "/api/privacy", { method: "DELETE", headers: { origin: BASE, cookie: pinAfter } });

console.log("| Comprobación | Resultado | Estado |\n|---|---|---|\n" + rows.join("\n"));
