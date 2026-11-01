import { ENV_ALIASES, readEnv, type CanonicalEnvName } from "@/infrastructure/env/env-aliases";
import { getServerEnv } from "@/infrastructure/env/env.server";
import { getPublicEnv } from "@/infrastructure/env/env";

type EnvSource = Record<string, string | undefined>;

const MIN_SECRET_LENGTH = 32;

/**
 * Names (never values) of required variables that are missing or invalid,
 * written as "CANONICAL|ALIAS" so the log says which names are accepted.
 * Empty when both the public and server schemas parse.
 */
export function missingEnvNames(source: EnvSource = process.env): string[] {
  if (getPublicEnv(source) && getServerEnv(source)) return [];
  const names = Object.keys(ENV_ALIASES) as CanonicalEnvName[];
  return names
    .filter((name) => {
      const value = readEnv(source, name);
      if (!value) return true;
      if (name === "NEXT_PUBLIC_SUPABASE_URL") return !URL.canParse(value);
      if (name === "SUPABASE_SERVICE_ROLE_KEY" || name === "MATRICULA_HMAC_SECRET") {
        return value.length < MIN_SECRET_LENGTH;
      }
      return false;
    })
    .map((name) => ENV_ALIASES[name].join("|"));
}
