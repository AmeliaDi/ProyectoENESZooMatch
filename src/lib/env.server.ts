import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  MATRICULA_HMAC_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv | null {
  const result = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    MATRICULA_HMAC_SECRET: source.MATRICULA_HMAC_SECRET,
  });

  return result.success ? result.data : null;
}
