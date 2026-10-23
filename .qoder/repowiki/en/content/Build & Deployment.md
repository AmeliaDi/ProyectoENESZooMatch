# Build & Deployment

<cite>
**Referenced Files in This Document**
- [next.config.ts](file://next.config.ts)
- [tsconfig.json](file://tsconfig.json)
- [package.json](file://package.json)
- [src/lib/env.ts](file://src/lib/env.ts)
- [src/lib/env.server.ts](file://src/lib/env.server.ts)
- [src/app/layout.tsx](file://src/app/layout.tsx)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains how to build, optimize, and deploy ZooMatch, a Next.js application. It covers the Next.js build configuration, TypeScript compilation settings, environment variable management for production, deployment options across platforms, performance monitoring, caching strategies, asset optimization techniques, and common troubleshooting steps.

## Project Structure
ZooMatch is a Next.js app with:
- Application entry and metadata in the App Router layout
- Environment validation utilities for public and server-side variables
- Build and runtime scripts defined in package.json
- Strict TypeScript configuration integrated with Next.js

```mermaid
graph TB
A["package.json<br/>Scripts & dependencies"] --> B["next.config.ts<br/>Next.js config"]
A --> C["tsconfig.json<br/>TypeScript compiler options"]
D["src/app/layout.tsx<br/>App root layout"] --> E["src/lib/env.ts<br/>Public env schema"]
D --> F["src/lib/env.server.ts<br/>Server env schema"]
```

**Diagram sources**
- [package.json:8-16](file://package.json#L8-L16)
- [next.config.ts:1-8](file://next.config.ts#L1-L8)
- [tsconfig.json:1-29](file://tsconfig.json#L1-L29)
- [src/app/layout.tsx:1-17](file://src/app/layout.tsx#L1-L17)
- [src/lib/env.ts:1-26](file://src/lib/env.ts#L1-L26)
- [src/lib/env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

**Section sources**
- [package.json:1-40](file://package.json#L1-L40)
- [next.config.ts:1-8](file://next.config.ts#L1-L8)
- [tsconfig.json:1-29](file://tsconfig.json#L1-L29)
- [src/app/layout.tsx:1-17](file://src/app/layout.tsx#L1-L17)

## Core Components
- Next.js build pipeline driven by Next.js v16 via npm scripts
- TypeScript configured for strict mode, bundler module resolution, and path aliases
- Environment validation using Zod for both client-visible and server-only variables
- Root layout sets page metadata and global styles

Key responsibilities:
- Build and start commands are provided by Next.js; no custom build tooling is present
- Type safety and compile-time checks are enforced through TypeScript
- Environment variables are validated at runtime before use

**Section sources**
- [package.json:8-16](file://package.json#L8-L16)
- [next.config.ts:1-8](file://next.config.ts#L1-L8)
- [tsconfig.json:1-29](file://tsconfig.json#L1-L29)
- [src/lib/env.ts:1-26](file://src/lib/env.ts#L1-L26)
- [src/lib/env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)
- [src/app/layout.tsx:1-17](file://src/app/layout.tsx#L1-L17)

## Architecture Overview
The build and runtime architecture centers on Next.js with TypeScript and Zod-based environment validation. The application uses React 19 and Tailwind CSS (via PostCSS). Supabase client libraries are included as dependencies, indicating integration with Supabase services.

```mermaid
graph TB
subgraph "Build"
P["npm run build<br/>(Next.js)"]
T["TypeScript typecheck<br/>(tsc --noEmit)"]
Z["Zod env validation<br/>(runtime)"]
end
subgraph "Runtime"
N["Next.js Server / Edge"]
R["React 19 UI"]
S["Supabase Client Libraries"]
end
P --> N
T --> P
Z --> N
N --> R
R --> S
```

**Diagram sources**
- [package.json:17-26](file://package.json#L17-L26)
- [package.json:27-39](file://package.json#L27-L39)
- [src/lib/env.ts:1-26](file://src/lib/env.ts#L1-L26)
- [src/lib/env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

## Detailed Component Analysis

### Next.js Build Configuration
- React Strict Mode is enabled
- Typed routes are enabled for safer routing types
- No additional Next.js optimizations are explicitly configured in this repository

Implications:
- Standard Next.js production build behavior applies
- Route types are generated during build for improved developer experience

Recommendations:
- Consider enabling image optimization, font optimization, or CDN-related settings if needed
- Add experimental features only when necessary and validate their impact

**Section sources**
- [next.config.ts:1-8](file://next.config.ts#L1-L8)

### TypeScript Compilation Settings
- Target: ES2022
- Libs: DOM, DOM iterable, ESNext
- Strict mode enabled
- Module resolution set to bundler
- Path alias @/* mapped to src/*
- Incremental compilation enabled
- JSX preserved for Next.js processing
- noEmit true (Next.js handles emit)

Implications:
- Strong typing and modern JS target
- Fast incremental builds
- Clean separation between source and emitted artifacts

Recommendations:
- Keep strict mode enabled for reliability
- Ensure all imports use the @/* alias consistently

**Section sources**
- [tsconfig.json:1-29](file://tsconfig.json#L1-L29)

### Environment Variables Management
Two Zod schemas define required variables:
- Public env schema requires Supabase URL and publishable key
- Server env schema adds service role key and HMAC secret

Validation functions return typed objects or null, allowing safe early exits when configuration is missing.

Production guidance:
- Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on the hosting platform
- For server-side operations, also set SUPABASE_SERVICE_ROLE_KEY and MATRICULA_HMAC_SECRET
- Validate environment at startup and fail fast if required values are missing

```mermaid
flowchart TD
Start(["Process start"]) --> LoadEnv["Load process.env"]
LoadEnv --> ValidatePublic["Validate public env schema"]
ValidatePublic --> PublicOK{"Public env valid?"}
PublicOK --> |No| FailPublic["Fail fast: missing/invalid public env"]
PublicOK --> |Yes| ValidateServer["Validate server env schema"]
ValidateServer --> ServerOK{"Server env valid?"}
ServerOK --> |No| FailServer["Fail fast: missing/invalid server env"]
ServerOK --> |Yes| Ready["Application ready"]
```

**Diagram sources**
- [src/lib/env.ts:1-26](file://src/lib/env.ts#L1-L26)
- [src/lib/env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

**Section sources**
- [src/lib/env.ts:1-26](file://src/lib/env.ts#L1-L26)
- [src/lib/env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

### Build Scripts and Commands
- Development: next dev
- Production build: next build
- Production server: next start
- Linting: eslint .
- Type checking: tsc --noEmit
- Testing: vitest run (watch mode available)

Recommended CI flow:
- Install dependencies
- Run typecheck
- Run linter
- Run tests
- Build production bundle
- Deploy output

**Section sources**
- [package.json:8-16](file://package.json#L8-L16)

### Application Layout and Metadata
- Root layout defines page title and description
- Global CSS imported at the app level

This ensures consistent metadata and styling across pages.

**Section sources**
- [src/app/layout.tsx:1-17](file://src/app/layout.tsx#L1-L17)

## Dependency Analysis
ZooMatch depends on:
- Next.js 16 for framework and build system
- React 19 and React DOM for UI rendering
- Supabase client libraries for backend integration
- Tailwind CSS and PostCSS for styling
- Zod for runtime environment validation
- Vitest for testing

```mermaid
graph LR
Next["Next.js 16"] --> React["React 19"]
Next --> PostCSS["PostCSS"]
PostCSS --> Tailwind["Tailwind CSS"]
App["ZooMatch App"] --> Supabase["@supabase/supabase-js"]
App --> Zod["Zod"]
App --> Vitest["Vitest"]
```

**Diagram sources**
- [package.json:17-26](file://package.json#L17-L26)
- [package.json:27-39](file://package.json#L27-L39)

**Section sources**
- [package.json:17-39](file://package.json#L17-L39)

## Performance Considerations
General recommendations for production:
- Use Next.js default optimizations (code splitting, tree-shaking, static generation where applicable)
- Enable image optimization if images are used
- Minimize client-side JavaScript by moving logic to server components or API routes
- Leverage browser caching via proper cache headers from your hosting provider
- Monitor bundle size and remove unused dependencies
- Use environment-specific configurations to disable development-only features in production

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing environment variables:
  - Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your hosting platform’s environment settings
  - For server-side code, also set SUPABASE_SERVICE_ROLE_KEY and MATRICULA_HMAC_SECRET
- Build failures due to type errors:
  - Run typecheck locally with the provided script to catch issues early
- Runtime crashes due to invalid environment:
  - Validate environment at startup and fail fast if required values are missing
- Styling not applied:
  - Confirm PostCSS and Tailwind are installed and configured correctly
- Test failures:
  - Use the test script to run Vitest suites and fix failing assertions

Operational tips:
- Log environment validation results in development to quickly identify misconfiguration
- Pin Node.js version to the engines requirement in package.json to avoid compatibility issues

**Section sources**
- [package.json:5-7](file://package.json#L5-L7)
- [package.json:8-16](file://package.json#L8-L16)
- [src/lib/env.ts:1-26](file://src/lib/env.ts#L1-L26)
- [src/lib/env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

## Conclusion
ZooMatch relies on Next.js for building and serving the application, with TypeScript ensuring strong typing and Zod validating environment variables at runtime. The repository provides clear scripts for development, building, linting, typechecking, and testing. For production, ensure environment variables are properly configured on your hosting platform, monitor performance metrics, and apply standard optimization practices such as caching and asset optimization.

[No sources needed since this section summarizes without analyzing specific files]