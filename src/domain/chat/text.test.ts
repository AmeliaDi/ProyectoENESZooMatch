import { describe, expect, it } from "vitest";

import { DB_CODEPOINTS_PER_GRAPHEME, cleanChatText, graphemeCount } from "./text";

const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
const FLAG_MX = "\u{1F1F2}\u{1F1FD}";
const THUMB_DARK = "\u{1F44D}\u{1F3FF}";
const RAINBOW_FLAG = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
const E_COMBINING = "e\u0301";

describe("graphemeCount", () => {
  it("counts what a person sees as one character", () => {
    expect(graphemeCount(FAMILY)).toBe(1);
    expect(graphemeCount(FLAG_MX)).toBe(1);
    expect(graphemeCount(THUMB_DARK)).toBe(1);
    expect(graphemeCount(RAINBOW_FLAG)).toBe(1);
    expect(graphemeCount(E_COMBINING)).toBe(1);
    expect(graphemeCount(`hola ${FLAG_MX}${FAMILY}`)).toBe(7);
  });

  it("keeps every grapheme within the database code point margin", () => {
    for (const g of [FAMILY, FLAG_MX, THUMB_DARK, RAINBOW_FLAG]) {
      expect([...g].length).toBeLessThanOrEqual(DB_CODEPOINTS_PER_GRAPHEME);
    }
  });
});

describe("cleanChatText", () => {
  it("normalises to NFC and strips control, zero-width and bidi characters", () => {
    expect(cleanChatText("  hola\u202E\u0007\u200B\uFEFF \r\n\n\n\nmundo  ", 50)).toBe("hola\n\nmundo");
    expect(cleanChatText(E_COMBINING, 5)).toBe("\u00e9");
  });

  it("keeps the joiner inside emoji sequences", () => {
    expect(cleanChatText(FAMILY, 1)).toBe(FAMILY);
    expect(cleanChatText(RAINBOW_FLAG, 1)).toBe(RAINBOW_FLAG);
  });

  it("rejects empty, only-invisible and over-long text instead of truncating", () => {
    expect(cleanChatText(" \n\t ", 10)).toBeNull();
    expect(cleanChatText("\u200D\u200B\u202E", 10)).toBeNull();
    expect(cleanChatText("a".repeat(301), 300)).toBeNull();
    expect(cleanChatText("a".repeat(300), 300)).toHaveLength(300);
  });

  it("applies the 300 limit by graphemes, not code units", () => {
    expect(cleanChatText(FAMILY.repeat(300), 300)).not.toBeNull();
    expect(cleanChatText(FAMILY.repeat(301), 300)).toBeNull();
    expect(cleanChatText(FLAG_MX.repeat(300), 300)).not.toBeNull();
  });

  it("keeps markup as plain text (rendering is always text, never HTML)", () => {
    expect(cleanChatText("<script>alert(1)</script>", 300)).toBe("<script>alert(1)</script>");
  });
});
