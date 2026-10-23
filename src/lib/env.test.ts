import { describe, expect, it } from "vitest";

import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";

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