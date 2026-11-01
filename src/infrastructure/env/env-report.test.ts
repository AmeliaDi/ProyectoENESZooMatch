import { describe, expect, it } from "vitest";

import { missingEnvNames } from "./env-report.server";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
  MATRICULA_HMAC_SECRET: "y".repeat(64),
};

describe("missingEnvNames", () => {
  it("is empty for a complete configuration", () => {
    expect(missingEnvNames(VALID)).toEqual([]);
  });

  it("lists every variable when nothing is set", () => {
    expect(missingEnvNames({})).toHaveLength(4);
  });

  it("accepts the legacy anon key name", () => {
    const { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, ...rest } = VALID;
    expect(missingEnvNames({ ...rest, NEXT_PUBLIC_SUPABASE_ANON_KEY: key })).toEqual([]);
  });

  it("flags short secrets and malformed URLs by name only", () => {
    const report = missingEnvNames({
      ...VALID,
      NEXT_PUBLIC_SUPABASE_URL: "not a url",
      MATRICULA_HMAC_SECRET: "short",
    });
    expect(report).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "MATRICULA_HMAC_SECRET"]);
    expect(report.join()).not.toContain("short");
  });
});
