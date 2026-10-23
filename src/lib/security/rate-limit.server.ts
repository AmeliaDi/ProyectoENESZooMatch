import { createHash } from "node:crypto";

export type RateLimitState = "allowed" | "limited" | "unavailable" | "development-bypass";

export interface RateLimitDecision {
  state: RateLimitState;
  limit: number;
  remaining: number;
  retryAfter: number;
  resetAt: number;
}

interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
}

const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

export function evaluateRateLimit(
  count: number,
  policy: Pick<RateLimitPolicy, "limit" | "windowSeconds">,
  ttlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): RateLimitDecision {
  const ttl = Math.max(1, ttlSeconds > 0 ? ttlSeconds : policy.windowSeconds);
  const limited = count > policy.limit;

  return {
    state: limited ? "limited" : "allowed",
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    retryAfter: limited ? ttl : 0,
    resetAt: nowSeconds + ttl,
  };
}

function fallbackDecision(policy: RateLimitPolicy): RateLimitDecision {
  const development = process.env.NODE_ENV === "development";
  return {
    state: development ? "development-bypass" : "unavailable",
    limit: policy.limit,
    remaining: development ? policy.limit : 0,
    retryAfter: development ? 0 : 30,
    resetAt: Math.floor(Date.now() / 1000) + (development ? policy.windowSeconds : 30),
  };
}

function requestFingerprint(request: Request, policyName: string): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? "unresolved-client";
  const address = forwarded.split(",")[0]?.trim() || "unresolved-client";
  return createHash("sha256").update(`${policyName}:${address}`, "utf8").digest("hex");
}

export async function checkRateLimit(
  request: Request,
  policy: RateLimitPolicy,
): Promise<RateLimitDecision> {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!endpoint || !token) return fallbackDecision(policy);

  const key = `zoomatch:limit:${policy.name}:${requestFingerprint(request, policy.name)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", INCREMENT_SCRIPT, "1", key, String(policy.windowSeconds)]),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) return fallbackDecision(policy);

    const payload: unknown = await response.json();
    if (
      !payload
      || typeof payload !== "object"
      || !("result" in payload)
      || !Array.isArray(payload.result)
      || typeof payload.result[0] !== "number"
      || typeof payload.result[1] !== "number"
    ) {
      return fallbackDecision(policy);
    }

    return evaluateRateLimit(payload.result[0], policy, payload.result[1]);
  } catch {
    return fallbackDecision(policy);
  }
}
