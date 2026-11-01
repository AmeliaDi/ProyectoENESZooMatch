import { getServerEnv } from "@/infrastructure/env/env.server";
import { getPublicEnv } from "@/infrastructure/env/env";

type EnvSource = Record<string, string | undefined>;

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MATRICULA_HMAC_SECRET",
] as const;

/**
 * Names (never values) of required variables that are missing or invalid.
 * Empty when both the public and server schemas parse.
 */
export function missingEnvNames(source: EnvSource = process.env): string[] {
  if (getPublicEnv(source) && getServerEnv(source)) return [];
  return REQUIRED.filter((name) => {
    const value =
      name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
        ? source[name] || source.NEXT_PUBLIC_SUPABASE_ANON_KEY
        : source[name];
    if (!value) return true;
    if (name === "NEXT_PUBLIC_SUPABASE_URL") return !URL.canParse(value);
    if (name === "SUPABASE_SERVICE_ROLE_KEY" || name === "MATRICULA_HMAC_SECRET") {
      return value.length < 32;
    }
    return false;
  });
}
