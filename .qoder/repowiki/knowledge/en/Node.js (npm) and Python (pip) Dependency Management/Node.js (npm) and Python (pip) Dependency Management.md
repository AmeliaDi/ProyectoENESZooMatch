---
kind: dependency_management
name: Node.js (npm) and Python (pip) Dependency Management
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - requirements.txt
---

## Systems Used

This repository manages dependencies for two separate runtimes:

- **Node.js / TypeScript** via `package.json` with the npm ecosystem.
- **Python scripts** via `requirements.txt` with pip.

There is no lockfile present (`package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` are absent), and there is no vendored dependency tree under `node_modules/` in the committed tree. The Python side also has no `pyproject.toml`, `Pipfile`, or virtual-environment configuration.

## Key Files

- `package.json` — declares runtime dependencies, devDependencies, Node engine constraint, and npm scripts.
- `requirements.txt` — pins Python packages with upper-bound constraints.

## Node.js Dependencies

Runtime dependencies (production):
- `next` ^16.4.2
- `react` ^19.3.1 / `react-dom` ^19.3.1
- `@supabase/supabase-js` ^2.118.0 / `@supabase/ssr` ^0.12.7
- `framer-motion` ^14.6.0
- `recharts` ^3.10.1
- `zod` ^4.6.7

Dev dependencies:
- `typescript` ^6.0.3
- `eslint` ^10.13.0 + `eslint-config-next` ^16.4.2
- `tailwindcss` ^4.3.3 + `@tailwindcss/postcss` ^4.3.3
- `postcss` ^8.5.31
- `vitest` ^5.0.5 + `vite` ^8.3.5
- `@types/node`, `@types/react`, `@types/react-dom`

The `engines.node` field constrains the runtime to `>=22.12.0`. All version ranges use caret (`^`) semantics, so installs resolve to the latest compatible minor/patch within the major version. No private registry or scoped-auth configuration is present in the manifest; npm's default registry is used.

## Python Dependencies

`requirements.txt` lists two packages with range constraints:
- `requests>=2.32,<3`
- `beautifulsoup4>=4.12,<5`

These are used by the top-level `scripts/generar_arquetipos.py` and `scripts/recopilar_items.py` data-collection utilities.

## Conventions and Constraints

- **No lockfiles committed**: There is no `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or equivalent Python lockfile in the repository root. This means reproducible builds depend on the package manager's default resolution at install time rather than a checked-in snapshot.
- **Caret-based versioning**: All Node.js dependencies use `^` prefixes, allowing automatic minor/patch upgrades within the same major version.
- **Upper-bound pinning for Python**: Python packages use `<N` upper bounds to prevent breaking-major-version upgrades while still accepting any newer patch/minor release.
- **Engine gating**: The Node.js engine is explicitly constrained to `>=22.12.0` via the `engines` field in `package.json`.
- **No vendoring**: Neither JavaScript nor Python dependencies are vendored into the repository; they are expected to be installed from remote registries at build time.
- **No private registry configuration**: No `.npmrc`, `~/.npmrc`, `PIP_INDEX_URL`, or similar files were found that would point to a private registry or alter authentication.
- **Scripts as entry points**: Dependency installation is not automated through CI or Makefiles in this repo; developers invoke `npm`/`pip` directly using the scripts defined in `package.json` (`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`).