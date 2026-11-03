import { z } from "zod";

import { readEnv } from "@/infrastructure/env/env-aliases";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(32),
  MATRICULA_HMAC_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export function getServerEnv(source: EnvSource = process.env): ServerEnv | null {
  const result = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: readEnv(source, "NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv(source, "SUPABASE_SERVICE_ROLE_KEY"),
    MATRICULA_HMAC_SECRET: readEnv(source, "MATRICULA_HMAC_SECRET"),
  });

  return result.success ? result.data : null;
}

const MIN_PEPPER_LENGTH = 32;

/**
 * Optional server-only pepper of the chat PIN (ADR-029). Kept out of the
 * required schema: without it only the chat PIN routes answer
 * `service.unavailable`; the rest of the app keeps working.
 */
export function getChatPinPepper(source: EnvSource = process.env): string | null {
  const value = source.CHAT_PIN_PEPPER?.trim();
  return value && value.length >= MIN_PEPPER_LENGTH ? value : null;
}
