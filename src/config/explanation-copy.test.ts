import { describe, expect, it } from "vitest";

import { FORBIDDEN_COPY, OUTCOME_CLAIMS } from "@/testing/copy-guard";
import { MATCH_CATEGORY_IDS } from "@/types/matching-config";

import { EXPLANATION_COPY } from "./explanation-copy";

/** This file shows numbers next to the sentences, so statistics words are banned here. */
const LOCAL = /\bdestino\b|probabilidad|deshonest|mentiros|tramposx?|\bcodicios/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const PLACEHOLDER = /\{(\w+)\}/g;
const MAX_LENGTH = 200;

function strings(value: unknown, path = "", out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const ALLOWED_PLACEHOLDERS: Record<string, readonly string[]> = {
  "talk.intro": ["points", "total"],
  "talk.enneagram": ["self", "other"],
  "talk.enneagram_same": ["self"],
  "confidence.floor.reason": ["area"],
  "headlines.romance": ["area"],
  "headlines.amistad": ["area"],
};

describe("explanation copy linter", () => {
  const all = strings(EXPLANATION_COPY).filter(([path]) => !/^(version|nota)$/.test(path) && !path.endsWith(".icon") && !path.endsWith(".id"));

  it("has no forbidden or labelling words, no emojis, and stays short", () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(FORBIDDEN_COPY);
      expect(text, path).not.toMatch(OUTCOME_CLAIMS);
      expect(text, path).not.toMatch(LOCAL);
      expect(text, path).not.toMatch(EMOJI);
      expect(text.length, path).toBeLessThan(MAX_LENGTH);
    }
  });

  it("only uses the placeholders each template is filled with", () => {
    for (const [path, text] of all) {
      const used = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
      const allowed = ALLOWED_PLACEHOLDERS[path] ?? [];
      for (const name of used) expect(allowed, `${path}: {${name}}`).toContain(name);
      for (const name of allowed) expect(used, `${path} must use {${name}}`).toContain(name);
    }
  });

  it("has no duplicated phrases across categories", () => {
    const phrases = MATCH_CATEGORY_IDS.flatMap((id) => Object.values(EXPLANATION_COPY.categories[id]!.phrases));
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it("talks about Honestidad-Humildad only in values language", () => {
    expect(EXPLANATION_COPY.personality_factors.hex_h).toMatch(/transparencia y trato justo en común/);
  });

  it("never presents the score as a probability or a prediction of success", () => {
    for (const [path, text] of all) expect(text, path).not.toMatch(/\b(predice|asegura|seguro que)\b/i);
  });
});
