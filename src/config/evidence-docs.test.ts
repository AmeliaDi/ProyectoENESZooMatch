/**
 * Guard for docs/DECISIONES_MODELO.md and docs/LITERATURA_ASPECTOS.md.
 *
 * These two documents are the human-facing reading of the evidence ledger, so
 * they are checked the same way the ledger is: every DOI they cite must resolve
 * at the handle registry, every `EV-xx`/`ADR-xx`/`T-xx` they cite must exist,
 * and the coverage and weight numbers they print must still come out of
 * `data/literature/` and `data/matching-config.json` when the test re-measures
 * them. A stale number in a doc fails here instead of in front of a reviewer.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const MATRIZ = read("docs/DECISIONES_MODELO.md");
const ASPECTOS = read("docs/LITERATURA_ASPECTOS.md");

interface Card {
  evidencia?: Array<{ verificacion: string; doi: string | null }>;
}
const config = JSON.parse(read("data/matching-config.json")) as {
  categories: Record<string, { factors?: Record<string, number> }>;
  tracks: Record<string, { core: Record<string, number>; tail: Record<string, number> }>;
};
const checks = JSON.parse(read("data/literature/doi-checks.json")) as {
  checks: Record<string, { estado: string }>;
};
const cards = JSON.parse(read("data/literature/layer-candidates.json")) as {
  fixedCore: Card[];
  candidates: Card[];
};

/** Quote-aware CSV rows: records.csv and review-queue.csv both carry quoted commas. */
function csvRows(file: string): Array<Record<string, string>> {
  const text = read(file).replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.length > 1) rows.push(row);
  }
  const header = rows.shift()!;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** es-MX style as used in the docs: comma decimal separator, fixed width. */
const n = (value: number, digits: number) => value.toFixed(digits).replace(".", ",");

const citedDois = (text: string) =>
  [...new Set([...text.matchAll(/`(10\.\d{4,9}\/[^`\s]+?)(?:`)/g)].map((m) => m[1]!.toLowerCase().replace(/[).,;]+$/, "")))];

const evidence = cards.candidates.flatMap((c) => c.evidencia ?? []);
const inState = (state: string) => evidence.filter((e) => e.verificacion === state).length;
const porEstado = Object.values(checks.checks).reduce<Record<string, number>>(
  (acc, c) => ({ ...acc, [c.estado]: (acc[c.estado] ?? 0) + 1 }),
  {},
);
/** §5 is the register of dead handles; a DOI may only appear there as a dead one. */
const ASPECTOS_VIVAS = ASPECTOS.slice(0, ASPECTOS.indexOf("## 5."));
const records = csvRows("data/literature/records.csv");
const queue = csvRows("data/literature/review-queue.csv");
const evidenceDois = [
  ...new Set(
    [...read("docs/EVIDENCIA.md").matchAll(/doi[:\s]*(10\.\d{4,9}\/[^\s,;"']+)/gi)].map((m) =>
      m[1]!.toLowerCase().replace(/[).,;]+$/, ""),
    ),
  ),
].sort();

describe("docs/LITERATURA_ASPECTOS.md", () => {
  it("only cites DOIs that resolve at the handle registry", () => {
    const cited = citedDois(ASPECTOS_VIVAS);
    expect(cited.length, "el documento debe citar DOIs").toBeGreaterThanOrEqual(25);
    for (const doi of cited) {
      expect(checks.checks[doi], `doi-checks.json no tiene ${doi}`).toBeDefined();
      expect(checks.checks[doi]!.estado, `${doi} no resuelve`).toBe("resuelve");
    }
  });

  it("reports the corpus coverage as re-measured, not as remembered", () => {
    const topics = new Set(records.map((r) => r.topic).filter(Boolean));
    const sinTopic = records.filter((r) => !r.topic).length;
    const pendientes = records.filter((r) => r.verificacion === "pendiente_humana").length;
    const dead = Object.entries(checks.checks)
      .filter(([, c]) => c.estado === "no_resuelve")
      .map(([doi]) => doi);

    expect(ASPECTOS).toContain(
      `| Registros en \`records.csv\` | **${records.length}** en **${topics.size}** topics (${sinTopic} registros sin topic); los ${pendientes} con \`verificacion = pendiente_humana\` |`,
    );
    expect(ASPECTOS).toContain("| Estudios dentro de las fichas de capa (`layer-candidates.json`) | ");
    expect(ASPECTOS).toContain(
      `| **${evidence.length}**: ${inState("crossref_abstract")} ✅ · ${inState("crossref_metadatos")} 🔶 · ${inState("pendiente_humana")} ⏳ |`,
    );
    expect(ASPECTOS).toContain(
      `| Citas DOI en \`docs/EVIDENCIA.md\` | **${evidenceDois.length}**, y **las ${evidenceDois.length} resuelven**`,
    );
    expect(ASPECTOS).toContain(
      `| Comprobaciones en \`doi-checks.json\` | **${Object.keys(checks.checks).length}**: ${porEstado.resuelve} \`resuelve\` · ${porEstado.no_resuelve} \`no_resuelve\` |`,
    );
    expect(ASPECTOS).toContain(`| Filas de la cola | **${queue.length}**`);
    expect(dead).toHaveLength(7);
  });

  it("lists exactly the handles that do not resolve, and keeps them out of the citations", () => {
    const start = ASPECTOS.indexOf("## 5.");
    const section = ASPECTOS.slice(start);
    const dead = Object.entries(checks.checks)
      .filter(([, c]) => c.estado === "no_resuelve")
      .map(([doi]) => doi);
    expect(dead).toHaveLength(7);
    for (const doi of dead) {
      expect(section.toLowerCase(), `${doi} debe aparecer en §5`).toContain(doi);
      expect(citedDois(ASPECTOS_VIVAS), `${doi} no puede citarse como fuente`).not.toContain(doi);
    }
    for (const doi of citedDois(ASPECTOS_VIVAS)) {
      expect(checks.checks[doi]!.estado, `citado antes de §5 y no resuelve: ${doi}`).toBe("resuelve");
    }
    expect(ASPECTOS).toContain("**No son citas activas**");
  });

  it("states on its face which sources were used and which service was not", () => {
    expect(ASPECTOS).toContain("**no se ejecutaron contra ese servicio**");
    for (const source of [
      "layer-candidates.json",
      "layer-criteria.json",
      "records.csv",
      "review-queue.csv",
      "doi-checks.json",
      "seeds.json",
      "docs/EVIDENCIA.md",
    ]) {
      expect(ASPECTOS, `falta ${source} en la lista de fuentes`).toContain(source);
    }
    for (const label of ["prior_literatura", "estimado_sintetico", "supuesto_diseno", "pendiente_verificacion"]) {
      expect(MATRIZ, `falta la etiqueta ${label}`).toContain(label);
    }
  });
});

describe("docs/DECISIONES_MODELO.md", () => {
  const core = config.tracks.romance!.core;
  const tail = config.tracks.romance!.tail;
  const friend = config.tracks.amistad!.core;

  it("carries the fifteen constructs the plan asks for", () => {
    const rows = MATRIZ.split(/\r?\n/).filter((line) => /^\| \d+ \| \*\*/.test(line));
    expect(rows).toHaveLength(15);
    for (const construct of [
      "Apego",
      "Valores",
      "Conflicto",
      "HEXACO",
      "Big Five",
      "Política",
      "Intereses",
      "Regulación emocional",
      "Creencias sobre relaciones",
      "Autoexpansión",
      "Sociosexualidad",
      "Cronotipo",
      "Familismo",
      "MBTI",
      "Eneagrama",
    ]) {
      expect(rows.join("\n"), `falta el constructo ${construct}`).toContain(construct);
    }
  });

  it("quotes the weights that data/matching-config.json actually applies", () => {
    expect(MATRIZ).toContain(`romance **${n(core.personalidad!, 3)}**, amistad **${n(friend.personalidad!, 3)}**`);
    expect(MATRIZ).toContain(
      `romance **${n(core.valores!, 4)}** → ${n(core.valores! / 7, 4)} por cada uno de los 7 factores; amistad **${n(friend.valores!, 3)}** → ${n(friend.valores! / 7, 4)}`,
    );
    expect(MATRIZ).toContain(
      `amistad **${n(friend.estilo!, 3)}** (${n(friend.estilo! / 17, 4)} por factor de 17), romance **${n(core.estilo!, 3)}** (${n(core.estilo! / 17, 4)})`,
    );
    for (const extra of ["conflicto", "apego"]) {
      expect(MATRIZ, `el τ de ${extra}`).toContain(`romance τ = **${n(tail[extra]!, 3)}**`);
    }
    expect(MATRIZ).toContain(`romance τ = **${n(tail.afecto!, 3)}** (${n(tail.afecto! / 5, 3)} por estilo)`);
    expect(MATRIZ).toContain(`romance **${n(tail.mbti!, 3)}** (${n(tail.mbti! / 4, 5)} por eje)`);
    expect(MATRIZ).toContain(`capa 4: romance **${n(tail.eneagrama!, 3)}**, amistad **${n(tail.eneagrama!, 3)}**`);
    expect(MATRIZ).toContain(`romance **${n(core.dealbreakers!, 4)}**`);
    expect(core.relacional).toBe(0);
    expect(tail.big_five).toBe(0);
    expect(tail.conflicto! + tail.apego! + tail.afecto!).toBeLessThanOrEqual(0.05);
    expect(tail.mbti! + tail.eneagrama!).toBeLessThanOrEqual(0.02);
  });

  it("derives the HEXACO factor shares from the declared relative weights", () => {
    const factors = config.categories.personalidad!.factors!;
    const sum = Object.values(factors).reduce((a, b) => a + b, 0);
    const share = (f: string) => (core.personalidad! * factors[f]!) / sum;
    expect(sum).toBe(6.5);
    expect(MATRIZ).toContain(
      `H **${n(factors.hex_h!, 1).replace("0,", "")}**, O **${n(factors.hex_o!, 1).replace("0,", "")}**, E/X/A/C 1,0 → H ${n(share("hex_h"), 4)} / O ${n(share("hex_o"), 4)} / los cuatro restantes ${n(share("hex_e"), 4)} en romance`,
    );
  });

  it("cites only evidence ids, ADRs and traceability rows that exist", () => {
    const evidenceDoc = read("docs/EVIDENCIA.md");
    const decisions = read("docs/DECISIONES.md");
    const traceability = read("docs/TRAZABILIDAD.md");
    for (const id of new Set(MATRIZ.match(/EV-\d+/g) ?? [])) {
      expect(evidenceDoc, `${id} no existe en EVIDENCIA.md`).toMatch(new RegExp(`\\| ${id} \\|`));
    }
    for (const adr of new Set(MATRIZ.match(/ADR-\d+/g) ?? [])) {
      expect(decisions, `${adr} no existe en DECISIONES.md`).toContain(`## ${adr} `);
    }
    for (const t of new Set(MATRIZ.match(/T-\d+/g) ?? [])) {
      expect(traceability, `${t} no existe en TRAZABILIDAD.md`).toMatch(new RegExp(`\\| ${t} \\|`));
    }
  });

  it("points to files and symbols that exist", () => {
    const paths = [
      ...new Set(
        [...MATRIZ.matchAll(/`((?:src|data|scripts|docs)\/[^`\s]+?)`/g)]
          .map((m) => m[1]!.replace(/:\d+$/, ""))
          .filter((p) => !p.includes("*")),
      ),
    ];
    expect(paths.length).toBeGreaterThanOrEqual(12);
    for (const path of paths) expect(existsSync(join(ROOT, path)), path).toBe(true);
    for (const [symbol, file] of [
      ["NON_SCORED_FACTORS", "src/config/matching.ts"],
      ["PARAM_LABELS", "src/types/matching-config.ts"],
      ["neverShare", "src/config/self-reading.ts"],
    ] as const) {
      expect(read(file), `${symbol} debe existir en ${file}`).toContain(symbol);
    }
  });

  it("does not promise a construct the item bank does not measure", () => {
    const bank = JSON.parse(read("data/microtest.json")) as { items: Array<{ factor?: string }> };
    const factors = new Set(bank.items.map((i) => i.factor).filter(Boolean));
    for (const [factor, measured] of [
      ["apego_ansiedad", true],
      ["sub_so", true],
      ["int_humor", true],
      ["val_espiritualidad", true],
      ["soc_familia", true],
      ["cronotipo", false],
      ["autoexpansion", false],
      ["familismo", false],
      ["empatia", false],
    ] as const) {
      expect(factors.has(factor), `¿${factor} está medido?`).toBe(measured);
    }
    expect(MATRIZ).toContain("**cero ítems en el banco psicométrico, cero ficha");
    expect(MATRIZ).toContain("0 ítems de cronotipo");
    expect(MATRIZ).toContain("0 ítems. El constructo **no** está en `data/microtest.json`");
  });
});
