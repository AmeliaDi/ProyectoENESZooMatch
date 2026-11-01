type EnvSource = Record<string, string | undefined>;

/**
 * Accepted names per variable, canonical first. Supabase's dashboard and its
 * Vercel integration provision different names depending on the key system
 * (legacy anon/service_role vs. publishable/secret), so all are accepted.
 */
export const ENV_ALIASES = {
  NEXT_PUBLIC_SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  ],
  SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
  MATRICULA_HMAC_SECRET: ["MATRICULA_HMAC_SECRET"],
} as const;

export type CanonicalEnvName = keyof typeof ENV_ALIASES;

/** First non-empty value among the accepted names, trimmed. */
export function readEnv(source: EnvSource, name: CanonicalEnvName): string | undefined {
  for (const alias of ENV_ALIASES[name]) {
    const value = source[alias]?.trim();
    if (value) return value;
  }
  return undefined;
}
