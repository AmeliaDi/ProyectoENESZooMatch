import { describe, expect, it } from "vitest";

import { accessKeySchema, enterRequestSchema, matriculaSchema } from "./common";

describe("matrícula (ADR-023)", () => {
  it("accepts exactly nine digits, forgiving only surrounding spaces", () => {
    expect(matriculaSchema.parse("123456789")).toBe("123456789");
    expect(matriculaSchema.parse("  123456789 ")).toBe("123456789");
  });

  it.each([
    ["too short", "12345678"],
    ["too long", "1234567890"],
    ["letters", "12345678A"],
    ["old alphanumeric format", "AB1234"],
    ["inner space", "1234 56789"],
    ["dash", "1234-56789"],
    ["underscore", "1234_56789"],
    ["full-width digits", "１２３４５６７８９"],
    ["arabic-indic digits", "١٢٣٤٥٦٧٨٩"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(matriculaSchema.safeParse(value).success).toBe(false);
  });

  it("never maps two different accepted inputs to different accounts' canonical forms by rewriting", () => {
    // The only accepted transform is trim(): the canonical value is a substring of the input.
    for (const input of ["123456789", " 123456789", "123456789\t"]) {
      expect(input).toContain(matriculaSchema.parse(input));
    }
  });
});

describe("access key", () => {
  it("enforces length bounds", () => {
    expect(accessKeySchema.safeParse("12345").success).toBe(false);
    expect(accessKeySchema.safeParse("123456").success).toBe(true);
    expect(accessKeySchema.safeParse("x".repeat(64)).success).toBe(true);
    expect(accessKeySchema.safeParse("x".repeat(65)).success).toBe(false);
  });

  it("rejects control characters and NFC-normalizes accents", () => {
    expect(accessKeySchema.safeParse("abc\u0000def").success).toBe(false);
    expect(accessKeySchema.parse("cafe\u0301ñandú")).toBe("caféñandú");
  });
});

describe("enter request", () => {
  it("requires the key and rejects unknown fields", () => {
    expect(enterRequestSchema.safeParse({ matricula: "123456789" }).success).toBe(false);
    expect(
      enterRequestSchema.safeParse({ matricula: "123456789", accessKey: "secreto1", extra: 1 }).success,
    ).toBe(false);
    expect(enterRequestSchema.safeParse({ matricula: "123456789", accessKey: "secreto1" }).success).toBe(true);
  });
});
