---
kind: configuration_system
name: Zod-Validated Environment & JSON Configuration System
category: configuration_system
scope:
    - '**'
source_files:
    - src/lib/env.ts
    - src/lib/env.server.ts
    - .env.example
    - src/lib/matching-config.ts
    - src/lib/matching-config-v2.ts
    - data/matching-config.json
    - data/matching-config-v2.json
    - next.config.ts
---

## Approach

ZooMatch uses a two-layer configuration system built on **Zod runtime validation**:

1. **Environment variables** — loaded from `process.env` and validated with Zod schemas.
2. **JSON data files** — static matching/algorithm parameters under `data/`, imported as modules and validated at runtime with fallbacks.

There is no dedicated config framework (no dotenv loader, no YAML/TOML parser). The project relies on Next.js's built-in `.env` support plus explicit Zod schemas in `src/lib/env.*`.

## Key Files

- `src/lib/env.ts` — Public (client) env schema: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Exposes `getPublicEnv()` and `isSupabaseConfigured()`.
- `src/lib/env.server.ts` — Server-only env schema: adds `SUPABASE_SERVICE_ROLE_KEY`, `MATRICULA_HMAC_SECRET`. Exposes `getServerEnv()`.
- `.env.example` — Template listing all required and optional variables (`CORS_ALLOWED_ORIGINS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
- `src/lib/matching-config.ts` — v1 matching threshold loader; validates `data/matching-config.json` against a schema with `SAFE_FALLBACK_THRESHOLD = 0.85`.
- `src/lib/matching-config-v2.ts` — v2 dual-track matcher config loader; validates `data/matching-config-v2.json` (romance/amistad tracks, weights, calibration). On validation failure, substitutes safe default thresholds while preserving the rest of the config.
- `data/matching-config.json`, `data/matching-config-v2.json` — Static JSON configuration files consumed by the loaders.
- `next.config.ts` — Runtime security headers / CSP are configured directly in the Next.js config (not via env).

## Architecture & Conventions

### Environment variable separation

Client vs server env vars are split into two distinct Zod schemas:

- `env.ts` defines `PublicEnv` (only `NEXT_PUBLIC_*` vars that can be shipped to the browser).
- `env.server.ts` defines `ServerEnv` (service role key, HMAC secret).

Both modules accept an optional `source: Record<string, string | undefined>` parameter defaulting to `process.env`, which makes them trivially testable without mutating the global environment.

### Validation-first loading

Every config source goes through `z.safeParse()`. If validation fails:

- `matching-config.ts` returns a hardcoded `SAFE_FALLBACK_THRESHOLD = 0.85`.
- `matching-config-v2.ts` merges the raw config with `SAFE_FALLBACK = { romance: 0.8, amistad: 0.75 }` for the failing fields.

This means the application never crashes due to malformed config files — it degrades to safe defaults.

### Data-driven matching parameters

Matching thresholds, dimensions, hard filters, and per-track weights live in JSON files under `data/` rather than code or env vars. This lets operators tune matching behavior without redeploying.

### Security-sensitive env vars

The `.env.example` documents the HMAC secret generation command (`openssl rand -hex 32`) and marks `CORS_ALLOWED_ORIGINS` and Upstash Redis vars as optional. Optional vars are read with optional chaining (e.g. `process.env.UPSTASH_REDIS_REST_URL?.replace(...)` in `src/lib/security/rate-limit.server.ts`).

### Build-time vs runtime

Next.js exposes `NEXT_PUBLIC_*` vars at build time (baked into the client bundle). Server-only vars (`SUPABASE_SERVICE_ROLE_KEY`, `MATRICULA_HMAC_SECRET`) are only available in server-side code (Route Handlers, server components, `*.server.ts` modules).

## Conventions & Constraints

- All environment variables are declared and validated via Zod schemas in `src/lib/env.ts` and `src/lib/env.server.ts`; there is no ad-hoc `process.env.X` access pattern for critical values outside those modules.
- New environment variables must be added to both the schema and `.env.example` to remain discoverable.
- Matching algorithm parameters are stored as JSON under `data/` and validated at import time; changing them requires editing the JSON file, not the TypeScript logic.
- Fallback thresholds are hardcoded constants (`SAFE_FALLBACK_THRESHOLD`, `SAFE_FALLBACK`) inside the respective config loaders — they are the enforced safety net when validation fails.
- Optional environment variables (CORS origins, Upstash Redis URL/token) are handled with optional chaining and fail-open semantics (rate limiting is disabled if Redis is not configured), as documented in `.env.example`.
- The Node engine requirement is pinned to `>=22.12.0` in `package.json`'s `engines` field.