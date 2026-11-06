/**
 * Fase 5 guard — the golden rule as a test.
 *
 *   Identity (animal, colour, suffix, alias) is computed ONCE, at hatching,
 *   stored, and never recalculated. `domain/identity` is the only place that
 *   knows how to say a name.
 *
 * Every bug in docs/DIAGNOSTICO_IDENTIDAD.md came from a second route: a title
 * built from one formula and a subtitle, sprite or notification built from
 * another, so one person appeared under two names. This test fails `npm run
 * check` when a new route appears, before it reaches anybody's constellation.
 *
 * It is deliberately syntactic: it looks for the shapes the old routes had
 * (animal concatenated with colour, an animal derived from a profile) rather
 * than trying to reason about types.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_DIR = join(process.cwd(), "src");

/** Files that own the name route and may therefore build it. */
const ALLOWED_DIRS = [
  join("domain", "identity"),
  join("domain", "avatars"), // sprite art keyed by catalogue ids
  join("config"), // the catalogue schema itself
  join("types"),
];

/** Test fixtures, dev sandboxes and catalogues legitimately spell names out by hand. */
const EXCLUDED = [
  /\.test\.tsx?$/,
  /[\\/]testing[\\/]/,
  /[\\/]fixtures[\\/]/,
  /[\\/]dev[\\/]/, // /dev/* galleries draw every catalogue combination on purpose
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if ([".ts", ".tsx"].includes(extname(entry))) out.push(full);
  }
  return out;
}

interface Rule {
  readonly id: string;
  readonly pattern: RegExp;
  /** Allowed to match across line breaks. */
  readonly multiline?: boolean;
}

/**
 * Only the *name* fields are suspicious. Catalogue ids (`animalId`, `colorId`)
 * legitimately appear together in sprite cache keys, so they are out of scope.
 * Both orders are checked: the bug did not care which came first.
 *
 * The original rules were single-line, and that was itself a hole: a title
 * built as `` `${a}\n${b}` `` or `[animal, color].join(" ")` across three lines
 * walked straight past them. Every rule below is therefore scanned against the
 * whole file, and `multiline` marks the ones that may span lines on purpose.
 */
const RULES: readonly Rule[] = [
  {
    id: "animal name concatenated with a colour name",
    pattern:
      /(?:aliasAnimal|animalName|diminutivo(?:_es)?|\.animal\b)[^\n]{0,60}(?:\+|\|\|)[^\n]{0,60}(?:aliasColor|colorName|\.color\b|\.nombre\b)/,
  },
  {
    id: "colour name concatenated with an animal name",
    pattern:
      /(?:aliasColor|colorName|\.color\b|\.nombre\b)[^\n]{0,60}(?:\+|\|\|)[^\n]{0,60}(?:aliasAnimal|animalName|diminutivo(?:_es)?|\.animal\b)/,
  },
  {
    id: "animal and colour interpolated into one display string",
    pattern:
      /\$\{[^}]{0,60}(?:aliasAnimal|animalName|diminutivo|\.animal\b)[^}]{0,60}\}[^`$]{0,10}\$\{[^}]{0,60}(?:aliasColor|colorName|\.color\b|\.nombre)/,
  },
  {
    id: "colour and animal interpolated into one display string",
    pattern:
      /\$\{[^}]{0,60}(?:aliasColor|colorName|\.color\b|\.nombre)[^}]{0,60}\}[^`$]{0,10}\$\{[^}]{0,60}(?:aliasAnimal|animalName|diminutivo|\.animal\b)/,
  },
  {
    id: "animal recalculated from a profile",
    pattern: /\b(?:pick|choose|select|resolve|compute|generate)(?:The)?Animal[A-Za-z]*\s*\(/,
  },
  {
    id: "animal derived from a psychometric input",
    pattern: /\banimalFrom(?:Mbti|Personality|Profile|Latent|Score[sd]?|Response[sd]?|Theta)\w*\s*\(/i,
  },
  {
    id: "avatar spec rebuilt outside the hatch",
    pattern: /\bbuildAvatarSpec\s*\(/,
  },
  {
    id: "the removed second identity builder",
    pattern: /\bgenerateProfileIdentity\s*\(/,
  },
  // ── Multiline holes closed after the Fase 5 audit ────────────────────────
  {
    id: "a `+` that continues the colour name on the next line",
    pattern: /(?:aliasAnimal|animalName|diminutivo(?:_es)?|\.animal\b)[^\n]{0,60}\+\s*\n\s*[^\n]{0,60}(?:aliasColor|colorName|\.color\b|\.nombre\b)/,
    multiline: true,
  },
  {
    id: "a `+` that continues the animal name on the next line",
    pattern: /(?:aliasColor|colorName|\.color\b|\.nombre\b)[^\n]{0,60}\+\s*\n\s*[^\n]{0,60}(?:aliasAnimal|animalName|diminutivo(?:_es)?|\.animal\b)/,
    multiline: true,
  },
  {
    id: "animal and colour interpolated across lines in one template",
    pattern: /\$\{[^{}]{0,80}(?:aliasAnimal|animalName|diminutivo|\.animal\b)[^{}]{0,80}\}[\s\S]{0,30}\$\{[^{}]{0,80}(?:aliasColor|colorName|\.color\b|\.nombre)/,
    multiline: true,
  },
  {
    id: "colour and animal interpolated across lines in one template",
    pattern: /\$\{[^{}]{0,80}(?:aliasColor|colorName|\.color\b|\.nombre)[^{}]{0,80}\}[\s\S]{0,30}\$\{[^{}]{0,80}(?:aliasAnimal|animalName|diminutivo|\.animal\b)/,
    multiline: true,
  },
  {
    id: "animal and colour put in one array and joined",
    pattern: /\[[^\]]{0,160}(?:aliasAnimal|animalName|diminutivo)[^\]]{0,160}(?:aliasColor|colorName)[^\]]{0,160}\][\s\S]{0,60}\.join\s*\(/,
    multiline: true,
  },
  {
    id: "animal and colour joined through `.concat`",
    pattern: /(?:aliasAnimal|animalName|diminutivo)[\s\S]{0,60}\.concat\s*\([\s\S]{0,60}(?:aliasColor|colorName)/,
    multiline: true,
  },
  {
    id: "colour and animal joined through `.concat`",
    pattern: /(?:aliasColor|colorName)[\s\S]{0,60}\.concat\s*\([\s\S]{0,60}(?:aliasAnimal|animalName|diminutivo)/,
    multiline: true,
  },
];

/** Line number of the first match that is not sitting in a `//` comment. */
function firstRealMatch(text: string, pattern: RegExp): number {
  const lines = text.split(/\r?\n/);
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const hit of text.matchAll(global)) {
    const line = text.slice(0, hit.index).split("\n").length - 1;
    const at = lines.slice(line, line + 20).find((l) => l.trim().length > 0) ?? "";
    if (at.trimStart().startsWith("//") || at.trimStart().startsWith("*")) continue;
    return line;
  }
  return -1;
}

describe("golden rule guard", () => {
  const files = sourceFiles(SRC_DIR).filter((file) => {
    const rel = relative(SRC_DIR, file);
    if (EXCLUDED.some((pattern) => pattern.test(rel))) return false;
    return !ALLOWED_DIRS.some((dir) => rel.startsWith(dir + sep) || rel === dir);
  });

  it("scans a real slice of the app", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("keeps exactly one route from a stored identity to a display name", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const rule of RULES) {
        const line = firstRealMatch(text, rule.pattern);
        if (line >= 0) {
          offenders.push(`${relative(SRC_DIR, file)}:${line + 1} — ${rule.id}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("catches the multiline shapes the single-line rules walked past", () => {
    // A guard nobody can trip is not a guard: each new rule is shown a
    // violation of exactly the shape it exists to find.
    const violations: Array<{ code: string; rule: string }> = [
      {
        code: "const title = `${identity.aliasAnimal} ${\n  identity.aliasColor}`;",
        rule: "animal and colour interpolated across lines in one template",
      },
      {
        code: 'const title = [identity.aliasAnimal, identity.aliasColor]\n  .filter(Boolean)\n  .join(" ");',
        rule: "animal and colour put in one array and joined",
      },
      {
        code: "const title = identity.aliasAnimal\n  .concat(identity.aliasColor);",
        rule: "animal and colour joined through `.concat`",
      },
      {
        code: "const title = identity.aliasAnimal +\n  spec.color.nombre;",
        rule: "a `+` that continues the colour name on the next line",
      },
    ];
    for (const { code, rule } of violations) {
      const hit = RULES.find((candidate) => candidate.id === rule);
      expect(hit, `missing rule ${rule}`).toBeDefined();
      expect(firstRealMatch(code, hit!.pattern), rule).toBeGreaterThanOrEqual(0);
    }

    // And they stay quiet on the shapes that are legitimate: the projection
    // that copies both columns, and the parser that splits them apart again.
    const legal = [
      "return {\n  aliasAnimal: row.alias_animal,\n  aliasColor: row.alias_color,\n  aliasSufijo: row.alias_sufijo,\n};",
      'const shortName = storedFull.slice(0, storedFull.lastIndexOf(" · ")).trim();',
    ];
    for (const sample of legal) {
      for (const rule of RULES.filter((r) => r.multiline)) {
        expect(firstRealMatch(sample, rule.pattern), `${rule.id} fired on legal code`).toBe(-1);
      }
    }
  });

  it("leaves formatIdentity as the only exported formatter of a name", () => {
    const consumers = files.filter((file) =>
      /formatIdentity/.test(readFileSync(file, "utf8")),
    );
    const formatters = sourceFiles(join(SRC_DIR, "domain", "identity"))
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /export function formatIdentity/.test(readFileSync(file, "utf8")));

    expect(formatters.map((f) => relative(SRC_DIR, f))).toEqual([
      join("domain", "identity", "format-identity.ts"),
    ]);
    // If nothing on the surface reads it, the guard above is vacuous.
    expect(consumers.length).toBeGreaterThan(5);
  });
});
