import { describe, expect, it } from "vitest";

import { getServerEnv } from "./env.server";
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

  it("accepts the names Supabase's dashboard shows", () => {
    const source = {
      SUPABASE_URL: VALID.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: VALID.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: ` ${VALID.SUPABASE_SERVICE_ROLE_KEY}`,
      MATRICULA_HMAC_SECRET: VALID.MATRICULA_HMAC_SECRET,
    };
    expect(missingEnvNames(source)).toEqual([]);
    expect(getServerEnv(source)?.SUPABASE_SERVICE_ROLE_KEY).toBe(VALID.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("prefers the canonical name and skips empty aliases", () => {
    const source = { ...VALID, SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "z".repeat(40) };
    expect(getServerEnv(source)?.SUPABASE_SERVICE_ROLE_KEY).toBe("z".repeat(40));
  });

  it("flags short secrets and malformed URLs by name only", () => {
    const report = missingEnvNames({
      ...VALID,
      NEXT_PUBLIC_SUPABASE_URL: "not a url",
      MATRICULA_HMAC_SECRET: "short",
    });
    expect(report).toEqual(["NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL", "MATRICULA_HMAC_SECRET"]);
    expect(report.join()).not.toContain("short");
  });
});
