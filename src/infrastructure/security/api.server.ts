import {
  isOriginAllowed,
  mergeVary,
  parseAllowedOrigins,
  requestHosts,
} from "@/infrastructure/security/origin";
import type { AppFailure } from "@/application/errors";
import { errorResponse, chatErrorResponse } from "@/infrastructure/http/responses";
import { recordedFailureCode, withRequestScope } from "@/infrastructure/http/request-id.server";
import { logServerEvent, safeErrorFields } from "@/infrastructure/observability/log.server";
import { checkRateLimit, type RateLimitDecision } from "@/infrastructure/security/rate-limit.server";

export interface ApiSecurityPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
  methods: readonly string[];
}

type RouteHandler = (request: Request) => Promise<Response>;
/** Builds the failure body of one API surface: flat, or the chat envelope. */
type FailureResponse = (failure: AppFailure) => Response;

function configuredOrigins(): string[] {
  return parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
}

function originIsAllowed(request: Request): boolean {
  const allowed = isOriginAllowed(
    request.headers.get("origin"),
    requestHosts(request.url, request.headers),
    configuredOrigins(),
  );
  if (!allowed) logServerEvent("warn", "api.origin_rejected", { path: new URL(request.url).pathname });
  return allowed;
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

/**
 * One gate for every API route: origin, rate limit, CORS, `no-store`, a
 * request id, and a global capture so an unforeseen exception still answers
 * the surface's own JSON shape instead of Next's HTML 500. The log carries
 * only the id, the route, the code and the duration — never a body.
 */
function secured(handler: RouteHandler, policy: ApiSecurityPolicy, fail: FailureResponse): RouteHandler {
  return (request) =>
    withRequestScope(async (requestId) => {
      const started = Date.now();
      const route = new URL(request.url).pathname;
      const seal = (response: Response, decision?: RateLimitDecision): Response => {
        applyCorsHeaders(response.headers, request, policy.methods);
        if (decision) applyRateHeaders(response.headers, decision);
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Request-Id", requestId);
        return response;
      };
      const refused = (failure: AppFailure, decision?: RateLimitDecision): Response => {
        logServerEvent("warn", "api.refused", {
          requestId,
          route,
          code: failure.code,
          ms: Date.now() - started,
        });
        return seal(fail(failure), decision);
      };

      if (!originIsAllowed(request)) {
        const response = fail({ code: "auth.forbidden" });
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Request-Id", requestId);
        return response;
      }

      const decision = await checkRateLimit(request, policy);
      if (decision.state === "limited") {
        return refused({ code: "request.rate_limited", retryAfter: decision.retryAfter }, decision);
      }
      if (decision.state === "unavailable") {
        return refused({ code: "service.unavailable" }, decision);
      }
      try {
        const response = await handler(request);
        if (response.status >= 400) {
          logServerEvent("error", "api.failed", {
            requestId,
            route,
            status: response.status,
            code: recordedFailureCode() ?? "",
            ms: Date.now() - started,
          });
        }
        return seal(response, decision);
      } catch (error) {
        logServerEvent("error", "api.threw", {
          requestId,
          route,
          code: "service.internal",
          ms: Date.now() - started,
          ...safeErrorFields(error),
        });
        return seal(fail({ code: "service.internal" }), decision);
      }
    });
}

export function withApiSecurity(handler: RouteHandler, policy: ApiSecurityPolicy): RouteHandler {
  return secured(handler, policy, errorResponse);
}

/** The chat surface: same gate, uniform envelope (ADR-040). */
export function withChatApiSecurity(handler: RouteHandler, policy: ApiSecurityPolicy): RouteHandler {
  return secured(handler, policy, chatErrorResponse);
}

function preflight(methods: readonly string[], fail: FailureResponse): RouteHandler {
  return (request) =>
    withRequestScope(async (requestId) => {
      if (!originIsAllowed(request)) {
        const response = fail({ code: "auth.forbidden" });
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Request-Id", requestId);
        return response;
      }
      const response = new Response(null, { status: 204 });
      applyCorsHeaders(response.headers, request, methods);
      response.headers.set("Cache-Control", "public, max-age=600");
      return response;
    });
}

export function createPreflightHandler(methods: readonly string[]): RouteHandler {
  return preflight(methods, errorResponse);
}

export function createChatPreflightHandler(methods: readonly string[]): RouteHandler {
  return preflight(methods, chatErrorResponse);
}