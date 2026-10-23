---
kind: configuration_system
name: Zod-Validated Runtime Environment Configuration for Supabase
category: configuration_system
scope:
    - '**'
source_files:
    - src/lib/env.ts
    - src/lib/env.test.ts
    - src/lib/supabase/client.ts
    - src/lib/supabase/server.ts
    - next.config.ts
---

## Overview

The application uses a minimal, Zod-based runtime configuration layer that validates and exposes Next.js public environment variables (`NEXT_PUBLIC_*`) consumed by the Supabase client factories. There is no dedicated `config/` directory, no `.env` files committed to the repo, and no server-side secret loader — only browser-exposed Supabase credentials are handled.

## Key Files

- `src/lib/env.ts` — schema definition and validation helpers
- `src/lib/env.test.ts` — Vitest tests covering absent, valid, and malformed env inputs
- `src/lib/supabase/client.ts` — browser-side Supabase client factory (uses `getPublicEnv`)
- `src/lib/supabase/server.ts` — server-side Supabase client factory (uses `getPublicEnv` + Next `cookies()`)
- `next.config.ts` — Next.js build-time config (no env loading here)

## Architecture and Conventions

1. **Schema-first validation with Zod.**
   `publicEnvSchema` in `src/lib/env.ts` declares exactly two required fields:
   - `NEXT_PUBLIC_SUPABASE_URL` — validated as a URL via `z.string().url()`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — validated as a non-empty string via `z.string().min(1)`

2. **Safe accessors, not direct `process.env` reads.**
   `getPublicEnv(source = process.env)` returns either the fully typed `PublicEnv` object or `null`. Callers must handle the `null` case; both Supabase client factories return `null` when env is missing rather than throwing.

3. **Testable source injection.**
   Both `getPublicEnv` and `isSupabaseConfigured` accept an optional `source: NodeJS.ProcessEnv`, defaulting to `process.env`. The test suite exercises this by passing `{}` and a fully populated fixture, decoupling validation from the global environment.

4. **Feature-gate helper.**
   `isSupabaseConfigured()` is a thin boolean wrapper around `getPublicEnv() !== null`, used to gate whether Supabase functionality is available at runtime.

5. **Client factories consume the validated env.**
   - `src/lib/supabase/client.ts` creates a cached browser client via `@supabase/ssr.createBrowserClient`; it caches the instance in a module-level variable and returns `null` if env is missing.
   - `src/lib/supabase/server.ts` creates a server client via `createServerClient`, wiring Next's `cookies()` store into the Supabase cookie adapter. It also returns `null` when env is absent.

6. **No server-side secrets loader.**
   Only `NEXT_PUBLIC_*` variables are loaded and validated. No `.env.local` parsing, no dotenv, no server-only secret resolution is present in this codebase.

7. **Build-time vs runtime separation.**
   `next.config.ts` contains only static Next.js options (`reactStrictMode`, `typedRoutes`). All runtime configuration flows through `src/lib/env.ts` at request/component time.

## Conventions and Constraints

- **Only two public env vars are recognized:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Any other `NEXT_PUBLIC_*` values are ignored by the schema and will not be exposed through `getPublicEnv`.
- **Missing or invalid env yields `null`, never throws:** `getPublicEnv` uses `safeParse` and callers branch on `null`. This is enforced by the type signature `PublicEnv | null` and verified by the test "stays build-safe when Supabase credentials are absent" which asserts `getPublicEnv({}) === null` and `isSupabaseConfigured({}) === false`.
- **URLs are strictly validated:** A malformed URL (e.g. `"not-a-url"`) causes `getPublicEnv` to return `null`, as asserted in the third test case.
- **Supabase clients are lazy and cached (browser):** The browser client is instantiated once per module load and memoized in a local `browserClient` variable; subsequent calls return the same instance.
- **Server client creation depends on cookies:** The server factory awaits `cookies()` before constructing the Supabase client, so it can only be called inside Server Components or API routes where the Next headers API is available.
- **Tests use Vitest** (see `vitest.config.ts` and `src/lib/env.test.ts`) and exercise the env layer with injected `ProcessEnv` objects rather than relying on the real `process.env`.