import { z } from "zod";

import { readEnv } from "@/infrastructure/env/env-aliases";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export function getPublicEnv(source: EnvSource = process.env): PublicEnv | null {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: readEnv(source, "NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: readEnv(source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  });

  return result.success ? result.data : null;
}

export function isSupabaseConfigured(source: EnvSource = process.env): boolean {
  return getPublicEnv(source) !== null;
}
