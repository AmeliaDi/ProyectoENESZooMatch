import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function getPublicEnv(
  source: NodeJS.ProcessEnv = process.env,
): PublicEnv | null {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return result.success ? result.data : null;
}

export function isSupabaseConfigured(
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  return getPublicEnv(source) !== null;
}