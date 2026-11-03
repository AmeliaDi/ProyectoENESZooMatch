import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Personal access key hashing (ADR-023). scrypt with OWASP's interactive
 * parameters (N = 2^15, r = 8, p = 1): slow enough to make offline guessing
 * of a leaked hash expensive, fast enough (~50 ms) for one login.
 * Stored as `scrypt$N$r$p$salt$hash` so parameters can rise later without
 * invalidating existing keys.
 */
const SCRYPT = { N: 32768, r: 8, p: 1 } as const;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
/** 128 · N · r bytes plus headroom; Node's default cap (32 MiB) is exactly N = 2^15. */
const MAX_MEMORY = 64 * 1024 * 1024;
const PREFIX = "scrypt";

function derive(secret: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_BYTES, { ...options, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashAccessKey(accessKey: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(accessKey, salt, SCRYPT);
  return [PREFIX, SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

function parseStored(stored: string) {
  const [prefix, n, r, p, salt, hash] = stored.split("$");
  if (prefix !== PREFIX || !salt || !hash) return null;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(params).every((v) => Number.isSafeInteger(v) && v > 0)) return null;
  return { params, salt: Buffer.from(salt, "base64url"), hash: Buffer.from(hash, "base64url") };
}

/** Constant-time check; a malformed stored value never verifies. */
export async function verifyAccessKey(accessKey: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed || parsed.hash.length !== KEY_BYTES) return false;
  const candidate = await derive(accessKey, parsed.salt, parsed.params);
  return timingSafeEqual(candidate, parsed.hash);
}
