---
kind: error_handling
name: 'Error Handling in ZooMatch: Route-Level JSON Errors, Zod Validation, and Fail-Open Security Middleware'
category: error_handling
scope:
    - '**'
source_files:
    - src/lib/security/api.server.ts
    - src/lib/security/rate-limit.server.ts
    - src/lib/security/origin.ts
    - src/app/api/quiz-v2/route.ts
    - src/app/api/result-v2/route.ts
    - src/lib/matching-v2.ts
    - src/lib/matching.ts
    - src/lib/explainability.ts
    - src/lib/validation.ts
    - src/lib/validation-v2.ts
---

## Approach

ZooMatch uses a lightweight, route-local error strategy rather than a centralized exception hierarchy:

- **API routes** (`src/app/api/**/route.ts`) return `NextResponse.json({ error: "..." }, { status })` for every failure path.
- **Input validation** is done with [Zod](https://zod.dev) schemas (`quizSubmissionV2Schema`, `matchRowSchema`, etc.) via `.safeParse`; failures are surfaced as HTTP 400 responses.
- A shared security wrapper (`withApiSecurity`) in `src/lib/security/api.server.ts` enforces CORS origin checks, rate limiting (Upstash Redis), and adds security headers (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`).
- Internal library functions throw plain `Error`s for programmer errors (e.g. mismatched vector lengths); these are caught at the route boundary and translated into user-facing JSON errors.
- There is no global error middleware, no custom error class hierarchy, and no `try/catch` blocks around Supabase RPC calls — failures are detected by inspecting `{ error }` fields returned by Supabase clients.

## Key Files

| File | Role |
|---|---|
| `src/lib/security/api.server.ts` | `withApiSecurity` decorator + `createPreflightHandler`; centralizes CORS, rate-limit decision propagation, and security headers. |
| `src/lib/security/rate-limit.server.ts` | Upstash Redis-backed rate limiter; defines `RateLimitState` (`allowed | limited | unavailable | bypass`) and fail-open behavior when Redis is missing or unreachable. |
| `src/lib/security/origin.ts` | Allowed-origin parsing and matching used by the security wrapper. |
| `src/lib/validation.ts` | Shared `parseJsonBody` helper used before Zod validation. |
| `src/lib/validation-v2.ts` | Zod schemas for v2 quiz submissions. |
| `src/app/api/quiz-v2/route.ts` | Example of route-level error handling: input validation → auth check → try/catch around scoring → Supabase RPC error inspection. |
| `src/app/api/result-v2/route.ts` | Demonstrates graceful degradation: malformed match data returns 503, missing profile returns 404, explanation generation is wrapped in try/catch returning `null`. |
| `src/lib/matching-v2.ts`, `src/lib/matching.ts` | Core matching logic that throws `Error` on invariant violations (incomplete quiz, vector length mismatches). |
| `src/lib/explainability.ts` | Throws on dimension-length mismatches; callers swallow it to keep responses partial. |

## Architecture & Conventions

1. **Route handlers are pure async functions** taking `Request` / returning `Promise<Response>`; they are wrapped by `withApiSecurity(handler, policy)` which applies origin gating, rate limiting, and CORS headers uniformly.

2. **Error shape is uniform**: every client-facing error is `NextResponse.json({ error: string }, { status })`. Status codes follow standard conventions:
   - `400` — invalid request body (Zod `.safeParse` failure).
   - `401` — unauthenticated (missing session).
   - `403` — forbidden (CORS origin not allowed, admin role missing).
   - `404` — resource not found (e.g. quiz not completed).
   - `429` — too many requests (rate limit exceeded).
   - `503` — service unavailable (Supabase client missing, RPC error, Redis down).

3. **Fail-open security model**: `checkRateLimit` in `rate-limit.server.ts` treats missing Redis configuration or network failure as a `bypass` decision in development and an `unavailable` decision in production, never crashing the route. The `failureDecision` function centralizes this policy.

4. **Supabase errors are inspected, not thrown**: routes call `admin.rpc(...)` and `client.from(...)` then check the returned `{ error }` field. There are no `try/catch` blocks around these calls — the Supabase JS client resolves promises even on DB errors and attaches an `error` property.

5. **Internal invariants use `throw new Error(...)`**: pure library code (matching algorithms, explainability) asserts preconditions with `throw new Error(...)`. These are expected to be caught by route handlers (e.g. `scoreQuizV2` is wrapped in try/catch in `quiz-v2/route.ts`).

6. **No global error boundary**: there is no Next.js `error.tsx` page, no Express-style error middleware, and no custom error classes. Each route owns its own error translation.

7. **Preflight handling**: `OPTIONS` endpoints are generated via `createPreflightHandler(methods)` from the same security module, ensuring consistent CORS behavior for all routes.

## Conventions & Constraints

- Every API route returns a typed `NextResponse` with an explicit HTTP status; there are no bare `console.error` calls in route handlers for client-facing failures.
- Input validation always goes through Zod `.safeParse`; if `parsed.success` is false, the route returns 400 with `{ error: "Invalid request" }`.
- Authentication failures consistently return 401 with `{ error: "Unauthorized" }`.
- Missing or misconfigured external services (Supabase client, Redis) return 503 with `{ error: "Service unavailable" }` or domain-specific messages like `"Metrics unavailable"`, `"Notifications unavailable"`, `"Unable to save result"`.
- Rate limiting is configured per-route via the `ApiSecurityPolicy` object passed to `withApiSecurity`, specifying `name`, `limit`, `windowSeconds`, and `methods`.
- The `RateLimitState` union type (`allowed | limited | unavailable | bypass`) is the single source of truth for rate-limit outcomes; `evaluateRateLimit`, `bypassDecision`, and `failureDecision` are the only producers.
- External I/O (Redis fetch) uses `AbortSignal.timeout(2500)` so rate-limit lookups cannot hang indefinitely.
- Library functions that perform mathematical operations validate array/vector lengths and throw descriptive `Error` messages (e.g. `"Vectors must have the same length"`, `"Incomplete quiz: missing answer for item ..."`); these are programmer-error signals, not user errors.
- Tests under `src/lib/**/*.test.ts` assert on thrown `Error` objects using Vitest's `toThrow`, confirming that internal invariants are enforced programmatically.