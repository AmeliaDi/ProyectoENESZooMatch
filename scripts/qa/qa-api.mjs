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
  return { status: r.status, cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "), setCookie: r.headers.getSetCookie() };
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
for (const s of [a, b]) {
  const d = await fetch(BASE + "/api/privacy", { method: "DELETE", headers: { origin: BASE, cookie: s.cookie } });
  row("DELETE borrar mis datos", d.status, d.status === 200);
}
const gone = await get("/api/profile", a);
row("perfil tras borrar", gone.status, gone.status === 401 || gone.status === 404);

console.log("| Comprobación | Resultado | Estado |\n|---|---|---|\n" + rows.join("\n"));
