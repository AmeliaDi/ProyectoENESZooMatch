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
const privJson = await priv.json();
row("GET /api/privacy", priv.status, priv.status === 200);
row("compartir vacío por defecto (ADR-030)", JSON.stringify(privJson.sharedLayers), Array.isArray(privJson.sharedLayers) && privJson.sharedLayers.length === 0);
const patchShare = (s, body) => fetch(BASE + "/api/privacy", { method: "PATCH", headers: { "content-type": "application/json", origin: BASE, cookie: s.cookie }, body: JSON.stringify(body) });
const badShare = await patchShare(b, { sharedLayers: ["orientacion"] });
row("capa desconocida rechazada", badShare.status, badShare.status === 400);
const share = await patchShare(b, { sharedLayers: ["valores", "hexaco", "valores"] });
const shareJson = await share.json();
row("compartir capas (canónico)", JSON.stringify(shareJson.sharedLayers), share.status === 200 && JSON.stringify(shareJson.sharedLayers) === '["hexaco","valores"]');
const seen = await (await get("/api/result", a)).json();
const seenEntry = [...(seen.matches?.romance ?? []), ...(seen.matches?.amistad ?? [])][0];
const seenRaw = JSON.stringify(seenEntry?.shared ?? {});
row("lo compartido llega en bandas", seenEntry ? `${seenEntry.shared?.sections?.length ?? 0} capas` : "sin match", !seenEntry || (!/position|range|theta|espiritualidad|soc_politica|orientacion/.test(seenRaw) && Array.isArray(seenEntry.layers)));
await patchShare(b, { sharedLayers: [] });
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

// Chat entre matches (ADR-032): solo entre las dos cuentas QA, identificadas por alias.
await fetch(BASE + "/api/privacy", { method: "PATCH", headers: { "content-type": "application/json", origin: BASE, cookie: b.cookie }, body: JSON.stringify({ paused: false }) });
const bAlias = (await (await get("/api/profile", b)).json()).profile?.alias ?? (await (await get("/api/result", b)).json()).alias;
async function entryFor(s, alias) {
  for (let i = 0; i < 6; i++) {
    const r = await (await get("/api/result", s)).json();
    for (const track of ["amistad", "romance"]) {
      const e = (r.matches?.[track] ?? []).find((m) => m.alias === alias);
      if (e?.id) return { track, id: e.id };
    }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return null;
}
const aSeesB = await entryFor(a, bAlias);
const bSeesA = aSeesB ? await entryFor(b, firstAlias) : null;
row("cuentas QA son match entre sí", aSeesB ? aSeesB.track : "no", Boolean(aSeesB && bSeesA));
if (aSeesB && bSeesA && aSeesB.track === bSeesA.track) {
  const del = (p, body, s) => fetch(BASE + p, { method: "DELETE", headers: { "content-type": "application/json", origin: BASE, cookie: s.cookie }, body: body ? JSON.stringify(body) : undefined });
  const bogus = await post("/api/interest", { match: "0123456789abcdef", track: aSeesB.track }, a.cookie);
  row("señal a un handle que no es match", bogus.status, bogus.status === 409);
  const sent = await (await post("/api/interest", { match: aSeesB.id, track: aSeesB.track }, a.cookie)).json();
  row("señal unilateral", sent.state, sent.state === "sent");
  const bStates = await (await get("/api/interest", b)).json();
  row("la señal unilateral es invisible", JSON.stringify(bStates.states), Object.keys(bStates.states ?? {}).length === 0);
  const opened = await (await post("/api/interest", { match: bSeesA.id, track: bSeesA.track }, b.cookie)).json();
  row("señal mutua abre chat", opened.state, opened.state === "open" && /^[0-9a-f-]{36}$/.test(opened.conversation));
  const conv = opened.conversation;
  const aLock = withLock(a, lockCookie(unlocked));
  const locked = await get(`/api/chat/conversations/${conv}`, a);
  row("conversación sin candado", locked.status, locked.status === 423);
  const bPin = await post("/api/chat/pin", { pin: "5926", confirm: "5926" }, b.cookie);
  const bLock = withLock(b, lockCookie(bPin));
  const inboxA = await (await get("/api/chat/inbox", aLock)).json();
  const inboxRaw = JSON.stringify(inboxA);
  row("inbox con la conversación y sin ids", inboxA.conversations?.length, inboxA.conversations?.length === 1 && !/user|matricula|hash/i.test(inboxRaw));
  const ans = await (await post(`/api/chat/conversations/${conv}/answer`, { round: 0, body: "Respuesta QA de A" }, aLock.cookie)).json();
  row("responder ronda 1", ans.rounds?.[0]?.mine ? "ok" : "no", ans.rounds?.[0]?.mine === "Respuesta QA de A" && ans.rounds?.[0]?.theirs === null);
  const bView = await (await get(`/api/chat/conversations/${conv}`, bLock)).json();
  row("respuesta ajena oculta hasta responder", JSON.stringify(bView.rounds?.[0]?.theirs), bView.rounds?.[0]?.theirs === null && !JSON.stringify(bView).includes("Respuesta QA de A"));
  const twice = await post(`/api/chat/conversations/${conv}/answer`, { round: 0, body: "otra" }, aLock.cookie);
  row("no se responde dos veces", twice.status, twice.status === 409);
  const early = await post(`/api/chat/conversations/${conv}/messages`, { body: "hola" }, aLock.cookie);
  row("sin chat libre antes de las rondas", early.status, early.status === 409);
  const bAns = await (await post(`/api/chat/conversations/${conv}/answer`, { round: 0, body: "Respuesta QA de B" }, bLock.cookie)).json();
  row("respuestas reveladas al responder ambas", bAns.rounds?.[0]?.theirs ?? "null", bAns.rounds?.[0]?.theirs === "Respuesta QA de A");
  const outsider = await get(`/api/chat/conversations/${conv}`, { cookie: aLock.cookie.replace(a.cookie, b.cookie) });
  row("candado de A con sesión de B", outsider.status, outsider.status === 423);
  const left = await del(`/api/chat/conversations/${conv}`, null, bLock);
  row("retirarse", left.status, left.status === 200);
  const after = await get(`/api/chat/conversations/${conv}`, aLock);
  row("conversación desaparece para ambas", after.status, after.status === 404);
  const notes = await (await get("/api/notifications", a)).json();
  const chatNotes = (notes.notifications ?? []).filter((n) => n.type === "chat");
  row("aviso de chat sin contenido", chatNotes.length, chatNotes.every((n) => !/Respuesta QA|alias/i.test(n.title + n.body)));
}
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
