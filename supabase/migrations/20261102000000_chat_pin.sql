-- ============================================================================
-- ZooMatch — chat PIN lock (docs/CHAT.md, ADR-029)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
--   node scripts/db-apply.mjs --migration supabase/migrations/20261102000000_chat_pin.sql
-- The same block lives in 00000000000000_base.sql so a clean reset matches.
--
--   * public.chat_pins: one PIN per person (scrypt hash + salt + KDF params,
--     attempt counters, pause, recovery request). RLS on, NO policies and no
--     grants to anon/authenticated: only the service-role server reads it.
--   * public.chat_security_events: created/changed/paused/recovery_* with a
--     timestamp, never the PIN, an IP or content. Server-only as well; failed
--     guesses are kept as an aggregate in chat_pins (recent_failures), not one
--     row per guess.
--   * Both cascade from profiles (which cascades from auth.users): deleting
--     the account deletes them. Resetting a PIN only rewrites chat_pins.
--   * private.access_guard accepts the new 'chat_pin_address' kind.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_pins (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL CHECK (char_length(pin_hash) BETWEEN 16 AND 128),
  salt TEXT NOT NULL CHECK (char_length(salt) BETWEEN 8 AND 64),
  kdf_params JSONB NOT NULL CHECK (jsonb_typeof(kdf_params) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  pause_step INTEGER NOT NULL DEFAULT 0 CHECK (pause_step >= 0),
  long_pauses INTEGER NOT NULL DEFAULT 0 CHECK (long_pauses >= 0),
  locked_until TIMESTAMPTZ,
  recent_failures INTEGER NOT NULL DEFAULT 0 CHECK (recent_failures >= 0),
  last_failed_at TIMESTAMPTZ,
  recovery_requested_at TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.chat_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'created', 'changed', 'paused', 'recovery_requested', 'recovery_cancelled', 'recovery_completed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_security_events_user_idx
  ON public.chat_security_events (user_id, created_at DESC);

-- Compare-and-swap token: every update bumps it, so two parallel PIN guesses
-- cannot both be charged against the same counter value.
CREATE OR REPLACE FUNCTION private.chat_pins_bump_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_pins_bump_revision ON public.chat_pins;
CREATE TRIGGER chat_pins_bump_revision
  BEFORE UPDATE ON public.chat_pins
  FOR EACH ROW EXECUTE FUNCTION private.chat_pins_bump_revision();

ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_security_events ENABLE ROW LEVEL SECURITY;
-- chat_pins, chat_security_events: no policies on purpose (server-only).
DROP POLICY IF EXISTS chat_pins_read_own ON public.chat_pins;
DROP POLICY IF EXISTS chat_security_events_read_own ON public.chat_security_events;

REVOKE ALL ON public.chat_pins, public.chat_security_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_pins, public.chat_security_events TO service_role;
REVOKE ALL ON FUNCTION private.chat_pins_bump_revision() FROM PUBLIC, anon, authenticated;

ALTER TABLE private.access_guard DROP CONSTRAINT IF EXISTS access_guard_kind_check;
ALTER TABLE private.access_guard ADD CONSTRAINT access_guard_kind_check
  CHECK (kind IN ('address_attempt', 'chat_pin_address'));

COMMIT;
