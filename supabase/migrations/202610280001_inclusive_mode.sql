-- ─── Inclusive-language preference ─────────────────────────────
-- Additive, nullable-with-default column. The preference is cosmetic metadata for
-- result copy; it is never used by matching, filters or analytics. The browser
-- persists the same value in localStorage, so a missing write here is harmless.

ALTER TABLE public.profiles_v2
  ADD COLUMN IF NOT EXISTS inclusive_mode TEXT NOT NULL DEFAULT 'neutro_universal';

ALTER TABLE public.profiles_v2
  DROP CONSTRAINT IF EXISTS profiles_v2_inclusive_mode_check;

ALTER TABLE public.profiles_v2
  ADD CONSTRAINT profiles_v2_inclusive_mode_check
  CHECK (inclusive_mode IN ('femenino', 'masculino', 'neutro_e', 'neutro_universal'));

COMMENT ON COLUMN public.profiles_v2.inclusive_mode IS
  'Preferred inclusive Spanish voice for result copy (femenino, masculino, neutro_e, neutro_universal).';
