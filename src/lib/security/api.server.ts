import { isOriginAllowed, mergeVary, parseAllowedOrigins } from "@/lib/security/origin";
import { checkRateLimit, type RateLimitDecision } from "@/lib/security/rate-limit.server";

export interface ApiSecurityPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
  methods: readonly string[];
}

type RouteHandler = (request: Request) => Promise<Response>;

function configuredOrigins(): string[] {
  return parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
}

function originIsAllowed(request: Request): boolean {
  return isOriginAllowed(
    request.headers.get("origin"),
    request.url,
    configuredOrigins(),
  );
}

function applyCorsHeaders(
  headers: Headers,
  request: Request,
  methods: readonly string[],
): void {
  const origin = request.headers.get("origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", new URL(origin).origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.set("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
  headers.set("Access-Control-Max-Age", "600");
  headers.set("Vary", mergeVary(headers.get("Vary"), "Origin"));
}

function applyRateHeaders(headers: Headers, decision: RateLimitDecision): void {
  headers.set("X-RateLimit-Limit", String(decision.limit));
  headers.set("X-RateLimit-Remaining", String(decision.remaining));
  headers.set("X-RateLimit-Reset", String(decision.resetAt));
  if (decision.retryAfter > 0) {
    headers.set("Retry-After", String(decision.retryAfter));
  }
  if (decision.state === "bypass") {
    headers.set("X-RateLimit-Policy", "fail-open");
  }
}

function securedJson(
  request: Request,
  methods: readonly string[],
  body: Record<string, string>,
  status: number,
  decision?: RateLimitDecision,
): Response {
  const response = Response.json(body, { status });
  applyCorsHeaders(response.headers, request, methods);
  if (decision) applyRateHeaders(response.headers, decision);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function withApiSecurity(
  handler: RouteHandler,
  policy: ApiSecurityPolicy,
): RouteHandler {
  return async (request) => {
    if (!originIsAllowed(request)) {
      return Response.json(
        { error: "Origin not allowed" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const decision = await checkRateLimit(request, policy);
    if (decision.state === "limited") {
      return securedJson(request, policy.methods, { error: "Too many requests" }, 429, decision);
    }
    if (decision.state === "unavailable") {
      return securedJson(
        request,
        policy.methods,
        { error: "Rate limit service unavailable" },
        503,
        decision,
      );
    }

    const response = await handler(request);
    applyCorsHeaders(response.headers, request, policy.methods);
    applyRateHeaders(response.headers, decision);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  };
}

export function createPreflightHandler(methods: readonly string[]): RouteHandler {
  return async (request) => {
    if (!originIsAllowed(request)) {
      return Response.json(
        { error: "Origin not allowed" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = new Response(null, { status: 204 });
    applyCorsHeaders(response.headers, request, methods);
    response.headers.set("Cache-Control", "public, max-age=600");
    return response;
  };
}
