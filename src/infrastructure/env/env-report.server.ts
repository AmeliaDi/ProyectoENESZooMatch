import { ENV_ALIASES, readEnv, type CanonicalEnvName } from "@/infrastructure/env/env-aliases";
import { getServerEnv } from "@/infrastructure/env/env.server";
import { getPublicEnv } from "@/infrastructure/env/env";

type EnvSource = Record<string, string | undefined>;

const MIN_SECRET_LENGTH = 32;

/** `ref` claim of a legacy Supabase JWT key (anon/service_role); null otherwise. */
function jwtProjectRef(key: string): string | null {
  const payload = key.split(".")[1];
  if (!key.startsWith("eyJ") || !payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const ref = claims && typeof claims === "object" && "ref" in claims ? claims.ref : null;
    return typeof ref === "string" ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Names (never values) of key variables whose legacy JWT belongs to a
 * different Supabase project than the URL. Happens when two Supabase
 * integrations inject variables into the same Vercel project. New-style
 * `sb_publishable_` / `sb_secret_` keys carry no project ref and are skipped.
 */
export function mismatchedKeyNames(source: EnvSource = process.env): string[] {
  const url = readEnv(source, "NEXT_PUBLIC_SUPABASE_URL");
  const urlRef = url && URL.canParse(url) ? new URL(url).hostname.split(".")[0] : undefined;
  if (!urlRef) return [];
  const keys: CanonicalEnvName[] = ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  return keys.filter((name) => {
    const ref = jwtProjectRef(readEnv(source, name) ?? "");
    return ref !== null && ref !== urlRef;
  });
}

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
