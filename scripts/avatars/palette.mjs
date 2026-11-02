/**
 * Reproduces the Enneagram palette in data/avatar-config.json + arquetipos.json.
 * Every colour sits at a fixed WCAG relative luminance band so the sprite base
 * tone keeps ≥ 3:1 (WCAG 1.4.11) against BOTH the night sky and the day paper.
 *   type k  → hue H_k, saturation S_k, luminance 0.18
 *   wing k−1 (ring) → hue nudged 8 % toward the wing, luminance 0.15 ("profundo")
 *   wing k+1 (ring) → hue nudged 8 % toward the wing, luminance 0.21 ("claro")
 * NUDGE = 0.08 maximises the minimum pairwise ΔE(OKLab) over {0.08, 0.10,
 * 0.12, 0.15, 0.20} (0.030 vs ≤ 0.016) — wings read mostly as tone, not hue.
 * Usage: node scripts/avatars/palette.mjs          (checks)
 *        node scripts/avatars/palette.mjs --json   (catalogue `colores` entries)
 */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const NIGHT = [0x10, 0x18, 0x26];
const DAY = [0xf3, 0xea, 0xd7];

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
function atLuminance(h, s, target) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (lum(hsl(h, s, mid)) < target) lo = mid;
    else hi = mid;
  }
  return hsl(h, s, (lo + hi) / 2);
}
function oklab(c) {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const deltaE = (a, b) => { const x = oklab(a); const y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

// [name, temperature] per type; wings append "profundo" (k−1) / "claro" (k+1).
const NAMES = {
  1: ["Azul cobalto", "frio"], 2: ["Rosa orquídea", "calido"], 3: ["Oro viejo", "calido"],
  4: ["Violeta amatista", "frio"], 5: ["Turquesa marino", "frio"], 6: ["Verde bosque", "frio"],
  7: ["Naranja mandarina", "calido"], 8: ["Rojo carmín", "calido"], 9: ["Verde olivo", "neutro"],
};
const TYPES = { 1: [215, 0.6], 2: [328, 0.6], 3: [46, 0.75], 4: [278, 0.5], 5: [188, 0.6], 6: [135, 0.45], 7: [20, 0.7], 8: [354, 0.65], 9: [85, 0.3] };
const BASE_L = 0.18;
const DEEP_L = 0.15;
const LIGHT_L = 0.21;
const NUDGE = 0.08;
const arc = (a, b) => ((b - a + 540) % 360) - 180;
const ring = (k) => [k === 1 ? 9 : k - 1, k === 9 ? 1 : k + 1];

const out = [];
for (let k = 1; k <= 9; k++) {
  const [h, s] = TYPES[k];
  const [name, temperatura] = NAMES[k];
  out.push({ id: `ennea-${k}`, nombre: name, temperatura, rgb: atLuminance(h, s, BASE_L) });
  const [prev, next] = ring(k);
  for (const [wing, l, suffix] of [[prev, DEEP_L, "profundo"], [next, LIGHT_L, "claro"]]) {
    const [wh, ws] = TYPES[wing];
    const hue = (h + NUDGE * arc(h, wh) + 360) % 360;
    out.push({ id: `ennea-${k}-w${wing}`, nombre: `${name} ${suffix}`, temperatura, rgb: atLuminance(hue, s + NUDGE * (ws - s), l) });
  }
}
out.push({ id: "ennea-neblina", nombre: "Gris neblina", temperatura: "neutro", rgb: atLuminance(250, 0.1, BASE_L) });

if (process.argv.includes("--json")) {
  const entries = out.map((c) => ({ id: c.id, nombre: c.nombre, hex: hex(c.rgb), textura: "mate", temperatura: c.temperatura }));
  console.log(JSON.stringify(entries, null, 2));
  process.exit(0);
}

let minDelta = Infinity;
let pair = "";
for (let i = 0; i < out.length; i++) {
  for (let j = i + 1; j < out.length; j++) {
    const d = deltaE(out[i].rgb, out[j].rgb);
    if (d < minDelta) { minDelta = d; pair = `${out[i].id}/${out[j].id}`; }
  }
}
for (const c of out) console.log(c.id.padEnd(14), hex(c.rgb), ratio(c.rgb, NIGHT).toFixed(2), ratio(c.rgb, DAY).toFixed(2));
console.log(`min ΔE(OKLab) ${minDelta.toFixed(4)} (${pair}); min contrast ${Math.min(...out.flatMap((c) => [ratio(c.rgb, NIGHT), ratio(c.rgb, DAY)])).toFixed(2)}`);
