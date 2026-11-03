-- ============================================================================
-- ZooMatch — opt-in shared reading layers (ADR-030)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
--   node scripts/db-apply.mjs --migration supabase/migrations/20261103000000_shared_layers.sql
-- The same column lives in 00000000000000_base.sql so a clean reset matches.
--
--   * profiles.shared_layers: layers a person shows to others as bands.
--     Default empty: others see only alias, animal and colour. profiles stays
--     service-role only (no policies, no API grants); nothing else changes.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shared_layers TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_shared_layers_known;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_shared_layers_known CHECK (shared_layers <@ ARRAY[
    'hexaco', 'big_five', 'mbti', 'eneagrama', 'valores', 'relacional', 'afecto', 'estilo'
  ]::TEXT[]);

COMMIT;

NOTIFY pgrst, 'reload schema';
