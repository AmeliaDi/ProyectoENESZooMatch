---
kind: external_dependency
name: Supabase (PostgreSQL + Auth) client integration
slug: supabase
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
scope:
    - '**'
---

### Supabase
- Role: Backend / database and auth provider for the Next.js frontend.
- Integration points:
  - `src/lib/supabase/client.ts` creates a browser client with `@supabase/ssr`'s `createBrowserClient`, returning `null` when env is missing.
- Stable shape: always construct clients through these two factories rather than instantiating the SDK directly; both paths short-circuit to `null` if public env vars are absent.
- Verify exact method/params against the official @supabase/ssr docs.