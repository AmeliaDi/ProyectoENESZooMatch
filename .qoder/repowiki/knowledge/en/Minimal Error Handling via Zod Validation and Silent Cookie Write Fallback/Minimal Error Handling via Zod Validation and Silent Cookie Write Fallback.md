---
kind: error_handling
name: Minimal Error Handling via Zod Validation and Silent Cookie Write Fallback
category: error_handling
scope:
    - '**'
source_files:
    - src/lib/env.ts
    - src/lib/supabase/server.ts
---

## Overview

This Next.js Foundation App has a very small codebase and uses minimal, localized error handling. There is no centralized error type system, no custom error classes, no middleware-based error boundary, and no global `try/catch` strategy. Errors surface only in two places:

1. **Environment validation** — using Zod's `safeParse`, which returns a success/failure result rather than throwing.
2. **Supabase cookie writes in Server Components** — a bare `catch` that silently swallows failures with an explanatory comment.

## Key Files

- `src/lib/env.ts` — environment schema and validators.
- `src/lib/supabase/server.ts` — Supabase server client factory.
- `src/lib/env.test.ts` — test file (exists but not inspected here).

## Architecture and Conventions

### Environment errors are validated, not thrown

`getPublicEnv()` in `src/lib/env.ts` uses `z.object({...}).safeParse(...)` on the public env subset (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). On invalid or missing values it returns `null`; callers then branch on truthiness. The companion helper `isSupabaseConfigured()` exposes this as a boolean predicate.

This means environment misconfiguration is treated as a *graceful degradation* path: if the Supabase URL/key are absent or malformed, `createClient()` in `server.ts` receives `null` from `getPublicEnv()` and returns `null` to its caller instead of throwing.

### Cookie write failures are swallowed

In `src/lib/supabase/server.ts`, the `setAll` callback passed to `createServerClient` wraps `cookieStore.set(...)` calls in a `try { ... } catch { /* Server Components cannot write cookies; middleware can refresh them later. */ }`. This is a deliberate silent failure: when Server Components attempt to set cookies, the write fails, and the error is ignored because the Supabase auth flow will re-set cookies through the app's middleware on the next request.

There is no logging, no rethrow, and no user-facing feedback for this failure.

### No other error patterns observed

Across the rest of the repository (`src/app/layout.tsx`, `src/app/page.tsx`, `src/components/foundation-hero.tsx`, `src/types/archetype.ts`), there are no additional `try/catch` blocks, no `throw` statements, no custom error constructors, no `Error` subclasses, no `Promise.reject`, and no React error boundaries. Network or runtime errors in those files would propagate as unhandled exceptions.

## Conventions and Constraints

- **Environment configuration is validated at runtime with Zod** (`src/lib/env.ts`) using `safeParse`, returning `null` on failure rather than throwing.
- **Missing/invalid Supabase config results in a null client**, allowing callers to short-circuit gracefully (see `src/lib/supabase/server.ts` lines 8–10).
- **Cookie write failures inside the Supabase client are intentionally swallowed** with a comment explaining that middleware handles refreshing cookies later (`src/lib/supabase/server.ts` lines 23–29).
- There is **no centralized error type hierarchy**, no sentinel error constants, and no global error handler/middleware for this concern.
- Tests exist for the env validator (`src/lib/env.test.ts`), suggesting the intended contract is that `getPublicEnv` returns `null` on bad input — but without inspecting the test file we cannot assert what behavior is verified.