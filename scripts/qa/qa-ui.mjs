// QA de UI con Edge headless (CDP) contra `next dev -p 3124`.
// Uso: node scripts/qa/qa-ui.mjs  — matrículas falsas 42614489x; borra lo que crea.
// Requiere Microsoft Edge en la ruta de Windows indicada en EDGE.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = "http://localhost:3124";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bank = JSON.parse(readFileSync("data/microtest.json", "utf8"));
const core = bank.items.filter((i) => i.modulo === "nucleo");
const likert = (v) => core.filter((i) => i.tipo_respuesta === "likert_5").map((i, k) => ({ itemId: i.id, value: ((v + k) % 5) + 1 }));
const filters = [
  { itemId: "FIL1", selected: ["mujeres", "hombres", "personas no binarias"] },
  { itemId: "FIL2", selected: ["mujer"] },
  { itemId: "FIL3", selected: ["monogamia", "sin_definir"] },
];
const post = (p, body, cookie, method = "POST") =>
  fetch(BASE + p, { method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
async function user(m, v) {
  const r = await post("/api/enter", { matricula: m });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (v) await post("/api/quiz", { likert: likert(v), filters }, cookie);
  return cookie;
}
const me = await user("426144893", 2);
const peers = [await user("426144894", 2), await user("426144895", 3)];
const fresh = await user("426144896", 0);

const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "zm-qa-"))}`, "about:blank"]);
let url;
for (let i = 0; i < 50 && !url; i++) {
  try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
  await sleep(200);
}
const ws = new WebSocket(url);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (!m.id || !pending.has(m.id)) return;
  pending.get(m.id)(m);
  pending.delete(m.id);
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result?.value;
async function setCookie(cookie) {
  await send("Network.clearBrowserCookies");
  for (const kv of cookie.split("; ").filter(Boolean)) {
    const i = kv.indexOf("=");
    await send("Network.setCookie", { name: kv.slice(0, i), value: kv.slice(i + 1), url: BASE });
  }
}

const PROBE = readFileSync("scripts/qa/qa-ui-probe.js", "utf8");
const pages = [
  ["/", fresh, "entrada"],
  ["/cuestionario", fresh, "test"],
  ["/resultado", me, "resultado"],
  ["/perfil", me, "carta"],
  ["/afinar?modulo=intereses", me, "afinar"],
  ["/evidencia", me, "evidencia"],
  ["/ajustes", me, "ajustes"],
  ["/admin/login", "", "admin"],
  ["/no-existe", me, "404"],
];
await send("Network.enable");
console.log("| Pantalla | Vista | Modo | Scroll X | Táctil < 44 px | Texto < 4.5:1 | Sin foco visible | Fugas DOM | Errores consola |");
console.log("|---|---|---|---|---|---|---|---|---|");
const errors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 120));
});
await send("Runtime.enable");
for (const [route, cookie, label] of pages) {
  await setCookie(cookie);
  for (const [view, width, height, mobile] of [["móvil", 390, 844, true], ["desktop", 1280, 900, false]]) {
    for (const theme of ["night", "day"]) {
      errors.length = 0;
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
      await send("Page.navigate", { url: BASE + route });
      await sleep(route === "/resultado" ? 12000 : 5000);
      await evalJs(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await sleep(300);
      const r = JSON.parse(await evalJs(PROBE));
      console.log(`| ${label} | ${view} | ${theme} | ${r.overflowX} | ${r.small.length ? r.small.join("; ") : "0"} | ${r.lowContrast.length ? r.lowContrast.join("; ") : "0"} | ${r.noFocus.length ? r.noFocus.join("; ") : "0"} | ${r.leaks.join(",") || "0"} | ${errors.length} |`);
    }
  }
}
// Reduced motion on the constellation: the canvas must not keep animating.
await setCookie(me);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url: BASE + "/resultado" });
await sleep(12000);
const frames = await evalJs(`new Promise((res) => { const c = document.querySelector("canvas"); if (!c) return res("sin canvas"); const ctx = c.getContext("2d"); const snap = () => { try { return c.toDataURL().length + ":" + c.toDataURL().slice(-64); } catch (e) { return "x"; } }; const a = snap(); setTimeout(() => res(a === snap() ? "estático" : "se mueve"), 1500); })`);
console.log("\nreduced-motion /resultado:", frames);
const kb = await evalJs(`(() => { const nodes = [...document.querySelectorAll('[role="button"][aria-label]')]; return JSON.stringify({ nodos: nodes.length, ejemplo: nodes[0]?.getAttribute("aria-label") ?? null, tabindex: nodes.every((n) => n.tabIndex >= 0) }); })()`);
console.log("nodos accesibles:", kb);

// Interactions: list view, «Ver por qué», keyboard on a node, Escape closes.
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await send("Page.navigate", { url: BASE + "/resultado" });
await sleep(12000);
const flow = {};
flow.nodeKeyboard = await evalJs(`new Promise((res) => { const n = document.querySelector('g[role="button"][tabindex="0"]'); if (!n) return res("sin nodo"); n.focus(); n.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); setTimeout(() => { const d = document.querySelector('dialog[open]'); const txt = d ? d.textContent : ""; const focusInside = d ? d.contains(document.activeElement) : false; d?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); d?.querySelector('button[aria-label]')?.click(); setTimeout(() => res(JSON.stringify({ nodo: n.getAttribute("aria-label"), abre: !!d, focoDentro: focusInside, estimada: /estimada/i.test(txt), confianza: /confianza/i.test(txt), cierra: !document.querySelector('dialog[open]'), focoVuelve: document.activeElement === n })), 700); }, 900); })`);
await evalJs(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ver lista"))?.click()`);
await sleep(1000);
await evalJs(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("Ver por qué"))?.click()`);
await sleep(800);
flow.list = await evalJs(`JSON.stringify({ filas: document.querySelectorAll(".zm-match").length, porque: [...document.querySelectorAll(".zm-match__detail:not([hidden]) .zm-why__head")].length, overflowX: document.documentElement.scrollWidth - innerWidth })`);
await send("Page.navigate", { url: BASE + "/perfil" });
await sleep(6000);
flow.card = await evalJs(`JSON.stringify({ escalas: document.querySelectorAll(".zm-scale").length, secciones: [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()).slice(0, 8) })`);
console.log("flujo:", JSON.stringify(flow));

ws.close();
edge.kill();
for (const c of [me, ...peers, fresh]) await post("/api/privacy", null, c, "DELETE");
console.log("limpieza: 4 usuarixs falsxs borradxs");
process.exit(0);
