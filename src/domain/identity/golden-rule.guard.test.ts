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
}

/**
 * Only the *name* fields are suspicious. Catalogue ids (`animalId`, `colorId`)
 * legitimately appear together in sprite cache keys, so they are out of scope.
 * Both orders are checked: the bug did not care which came first.
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
];

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
        const line = text.split(/\r?\n/).findIndex((l) => !l.trim().startsWith("//") && rule.pattern.test(l));
        if (line >= 0) {
          offenders.push(`${relative(SRC_DIR, file)}:${line + 1} — ${rule.id}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
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
