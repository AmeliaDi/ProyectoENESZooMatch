---
kind: build_system
name: Next.js + Node.js Build via npm Scripts (No CI/Docker)
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - vitest.config.ts
    - eslint.config.mjs
    - postcss.config.mjs
    - requirements.txt
---

## What system/approach is used

The project is a Next.js 16 / React 19 application built entirely through npm scripts defined in `package.json`. There is no Makefile, no Dockerfile, no `.github/` CI configuration, and no custom shell build scripts anywhere in the repository. Python tooling (`requirements.txt`, `scripts/*.py`) exists only for data-generation utilities and is not part of the app build pipeline.

## Key files and packages

- `package.json` — single source of truth for all build/dev/test/lint commands; pins Node engine `>=22.12.0`; declares runtime deps (`next`, `react`, `framer-motion`, `@supabase/*`, `recharts`, `zod`) and dev deps (`typescript`, `eslint`, `tailwindcss`, `vitest`, `vite`).
- `next.config.ts` — minimal Next.js config enabling `reactStrictMode` and `typedRoutes`.
- `vitest.config.ts` — test runner config with an `@` alias pointing at `./src`, environment set to `node`, and test discovery limited to `src/**/*.test.ts`.
- `tsconfig.json` — TypeScript compilation settings (path inferred from repo).
- `eslint.config.mjs` — ESLint 10 flat config consumed by the `lint` script.
- `postcss.config.mjs` + Tailwind v4 (`@tailwindcss/postcss`) — CSS pipeline driven by Next's built-in PostCSS integration.
- `requirements.txt` — pinned `requests` and `beautifulsoup4` versions for the Python data scripts under `scripts/`.

## Architecture and conventions

- **Build entry points** are npm scripts only:
  - `npm run dev` → `next dev`
  - `npm run build` → `next build` (produces the Next.js production artifact)
  - `npm run start` → `next start` (serves the built output)
  - `npm run lint` → `eslint .`
  - `npm run typecheck` → `tsc --noEmit` (type-only check, no emit)
  - `npm run test` → `vitest run` (one-shot); `npm run test:watch` → `vitest`
- **Dependency management**: npm lockfile implied by `package.json`; Python dependencies managed separately via `requirements.txt`.
- **Versioning**: package version is `0.1.0` in `package.json`; no changelog or release automation was found.
- **Node version constraint**: enforced via the `engines.node` field in `package.json` (`>=22.12.0`).
- **Testing**: Vitest runs against `src/**/*.test.ts` files in a Node environment; the `@` path alias resolves to `./src` so tests can import from `@/...`.
- **Linting & types**: separate scripts for ESLint and TypeScript type-checking; no pre-commit hooks or CI gates were detected.

## Conventions and constraints

- The repository contains **no CI pipeline** (no `.github/workflows`, no `.gitlab-ci.yml`, no Circle/GitHub Actions). Consequently, builds/tests/lint are not automatically executed on push/PR.
- The repository contains **no containerization** (no `Dockerfile`, no `docker-compose.*`).
- The repository contains **no cross-compilation or platform-specific build logic**; everything targets the Node.js runtime as declared in `package.json`.
- The `private: true` flag in `package.json` indicates this package is not intended to be published to npm.
- No Makefile, `build*.sh`, or similar build orchestration scripts exist in the repository (verified by grep across the tree).

Because the build surface is confined to npm scripts and standard Next.js tooling, there is no additional build-system layer to document beyond what is declared in `package.json`.