import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE } from "@/domain/matching";
import { getPublicEnv, isSupabaseConfigured } from "@/infrastructure/env/env";
import { getMatchingEngine } from "@/infrastructure/env/env.server";

describe("public environment", () => {
  it("stays build-safe when Supabase credentials are absent", () => {
    expect(getPublicEnv({})).toBeNull();
    expect(isSupabaseConfigured({})).toBe(false);
  });

  it("accepts a valid public Supabase configuration", () => {
    const source = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    };

    expect(getPublicEnv(source)).toEqual(source);
    expect(isSupabaseConfigured(source)).toBe(true);
  });

  it("rejects malformed public URLs", () => {
    expect(
      getPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      }),
    ).toBeNull();
  });
});

describe("matching engine flag", () => {
  it("resolves the live engine when the flag is absent or blank", () => {
    expect(getMatchingEngine({}).id).toBe(DEFAULT_ENGINE);
    expect(getMatchingEngine({ MATCHING_ENGINE: "   " }).id).toBe(DEFAULT_ENGINE);
  });

  it("resolves the flagged engine and throws instead of guessing a typo", () => {
    expect(getMatchingEngine({ MATCHING_ENGINE: " coseno " }).id).toBe("coseno");
    expect(() => getMatchingEngine({ MATCHING_ENGINE: "Coseno" })).toThrow(/Unknown MATCHING_ENGINE/);
  });
});