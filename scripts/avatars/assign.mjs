/**
 * Reproduces the MBTI → species pools in data/avatar-config.json.
 * Rule (deterministic, no hand-picking):
 *   1. Temperament = NT / NF (intuitive + T/F) or SJ / SP (sensing + J/P).
 *   2. Candidates for code c: animals whose catalogue primary type shares c's
 *      E/I letter AND whose primary or secondary type shares c's temperament.
 *   3. Score = mbti_afinidad[c] + 0.10 (primary == c) + 0.05 (secondary == c).
 *   4. Greedy by score, each animal used once, POOL animals per code.
 *   5. Codes left short are topped up with temperament-only candidates
 *      (E/I letter relaxed), still one owner per animal.
 * Usage: node scripts/avatars/assign.mjs   (prints the JSON pools)
 */
import { readFileSync } from "node:fs";

const POOL = 5;
const catalog = JSON.parse(readFileSync("data/arquetipos.json", "utf8"));
const temperament = (code) => (code[1] === "N" ? `N${code[2]}` : `S${code[3]}`);
const codes = Object.keys(catalog.animales[0].mbti_afinidad).sort();

function candidates(strict) {
  const out = [];
  for (const a of catalog.animales) {
    for (const code of codes) {
      if (strict && a.mbti_primario[0] !== code[0]) continue;
      const sameTemp = temperament(a.mbti_primario) === temperament(code) || temperament(a.mbti_secundario) === temperament(code);
      if (!sameTemp) continue;
      const bonus = a.mbti_primario === code ? 0.1 : a.mbti_secundario === code ? 0.05 : 0;
      out.push({ score: a.mbti_afinidad[code] + bonus, code, id: a.id });
    }
  }
  return out.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
}

const used = new Set();
const pools = Object.fromEntries(codes.map((c) => [c, []]));
for (const strict of [true, false]) {
  for (const { code, id } of candidates(strict)) {
    if (used.has(id) || pools[code].length >= POOL) continue;
    used.add(id);
    pools[code].push(id);
  }
}
for (const code of codes) console.error(code, temperament(code), pools[code].join(" "));
console.error(`unused: ${catalog.animales.length - used.size}`);
console.log(JSON.stringify(pools));
