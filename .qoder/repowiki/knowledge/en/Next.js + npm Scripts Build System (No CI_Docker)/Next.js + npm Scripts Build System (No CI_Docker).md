---
kind: build_system
name: Next.js + npm Scripts Build System (No CI/Docker)
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - vitest.config.ts
    - tsconfig.json
    - eslint.config.mjs
    - postcss.config.mjs
    - requirements.txt
    - CONTEXTO_PROYECTO.md
---

## What system/approach is used

The project uses a minimal, script-driven build system centered on **Next.js** with **npm scripts** as the single entry point. There is no Makefile, no Dockerfile, and no CI pipeline — this is explicitly documented in `CONTEXTO_PROYECTO.md`:

> "Sin CI, sin Docker": todo se maneja con scripts npm (`dev`, `build`, `start`, `lint`, `test`).

Python tooling lives separately under `scripts/` and is invoked via `python3` against `requirements.txt` (requests, beautifulsoup4) for data generation tasks.

## Key files and packages

- `package.json` — declares Node engine `>=22.12.0`, version `0.1.0`, and all build/test/lint scripts.
- `next.config.ts` — Next.js runtime configuration: security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy), React Strict Mode, typed routes.
- `vitest.config.ts` — test runner config using `node` environment, `@` alias to `./src`, glob `src/**/*.test.ts`.
- `tsconfig.json` / `next-env.d.ts` — TypeScript compilation settings consumed by both Next.js and Vitest.
- `eslint.config.mjs` — ESLint 10 configuration (via `eslint-config-next`).
- `postcss.config.mjs` + `tailwindcss` v4 — CSS pipeline.
- `requirements.txt` — Python dependencies for data-generation scripts.
- `scripts/*.py` and `scripts/generate-synthetic-profiles.ts` — data pipeline scripts (no shared build wrapper).
- `supabase/migrations/` — SQL migrations applied outside the JS build.

## Architecture and conventions

- **Single-toolchain boundary**: `npm run build` delegates entirely to `next build`; there are no custom webpack/Vite overrides beyond what Next.js provides.
- **TypeScript-first**: All source is `.ts/.tsx`; tests are co-located next to source as `*.test.ts` and discovered by Vitest's default include pattern.
- **Environment separation**: `next.config.ts` switches CSP policy based on `NODE_ENV === 'development'` (allowing `'unsafe-inline' 'unsafe-eval'` only in dev).
- **Versioning**: Semver-like `0.1.0` in `package.json`; no changelog or release automation found.
- **Data vs. app build**: Python scripts under `scripts/` generate JSON fixtures written into `data/` (e.g. `catalogo_arquetipos_v2.json`, `matching-config-v2.json`, `synthetic-calibration.json`) — these are committed artifacts, not built at runtime.
- **Supabase schema evolution**: Migrations live in `supabase/migrations/` and are applied independently of the Next.js build.

## Conventions and constraints

- **Node version gate**: `package.json` `engines.node = ">=22.12.0"` — enforced by npm/yarn when installing.
- **No CI/Docker**: Explicitly stated in `CONTEXTO_PROYECTO.md`; deployment is manual via `npm run build` then `npm start`.
- **Test discovery**: Only files matching `src/**/*.test.ts` are picked up by Vitest; non-test `.ts` files in `src/` are application code.
- **Path alias**: `@` resolves to `./src` in both Next.js and Vitest, keeping imports consistent across app and tests.
- **Security headers**: Every response gets CSP, HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `Permissions-Policy` disabling camera/microphone/geolocation, and `Cross-Origin-*` headers — enforced server-side by `next.config.ts` `headers()` hook.
- **Dependency pinning**: Uses `package-lock.json` (npm) and `requirements.txt` (pinned ranges like `>=2.32,<3`) for reproducible installs.