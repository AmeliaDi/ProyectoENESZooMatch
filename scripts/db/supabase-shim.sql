-- ============================================================================
-- Emulación LOCAL de las piezas de Supabase que las migraciones dan por hechas.
-- Solo se carga en la base desechable de PGlite (scripts/db/local-pg.mjs).
-- NUNCA se aplica al proyecto remoto: ahí estos objetos ya existen.
--
-- Emula: roles de la API, esquema auth con users/uid/jwt/role, y los claims JWT
--        por GUC (request.jwt.claims) igual que los lee PostgREST.
-- NO emula: GoTrue (verificación real del JWT), PostgREST, Storage, Realtime,
--        Vault, pg_cron, pg_stat_statements ni las políticas de RED del proyecto.
--        Una prueba que dependa de eso vive en scripts/qa o en db:audit, no aquí.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE
SET search_path = ''
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = ''
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE
SET search_path = ''
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user) $$;

GRANT USAGE ON SCHEMA auth, extensions TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;