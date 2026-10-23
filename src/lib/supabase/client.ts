"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient(): ReturnType<typeof createBrowserClient> | null {
  if (browserClient) {
    return browserClient;
  }

  const env = getPublicEnv();
  if (!env) {
    return null;
  }

  browserClient = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return browserClient;
}