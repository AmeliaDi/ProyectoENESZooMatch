-- ============================================================================
-- ZooMatch — Fase 4: Chat limited to 3 guided questions + automatic free chat
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
-- 1. Restricts guided question rounds to indices 0, 1 and 2 (3 questions max).
-- 2. Automatically marks conversations as free chat (free_ready_a = true,
--    free_ready_b = true) once round 2 (3rd question) is completed by both
--    participants, and migrates any existing conversation with >= 3 completed
--    rounds without losing messages.
-- ============================================================================

BEGIN;

-- Migrate ongoing conversations that already have >= 3 completed rounds
UPDATE public.conversations AS c
SET free_ready_a = true,
    free_ready_b = true
WHERE (NOT c.free_ready_a OR NOT c.free_ready_b)
  AND (
    SELECT count(*)
    FROM public.conversation_rounds AS r
    WHERE r.conversation_id = c.id
      AND r.idx BETWEEN 0 AND 2
      AND (
        (SELECT count(*) FROM public.conversation_answers AS a WHERE a.conversation_id = c.id AND a.round = r.idx) >= 2
        OR r.created_at <= now() - interval '48 hours'
      )
  ) >= 3;

-- Enforce at most 3 guided question rounds (idx 0, 1, 2) on all new writes
-- while keeping any historical round >= 3 intact without data loss (NOT VALID).
ALTER TABLE public.conversation_rounds DROP CONSTRAINT IF EXISTS conversation_rounds_three_questions_check;
ALTER TABLE public.conversation_rounds ADD CONSTRAINT conversation_rounds_three_questions_check
  CHECK (idx BETWEEN 0 AND 2) NOT VALID;

ALTER TABLE public.conversation_answers DROP CONSTRAINT IF EXISTS conversation_answers_three_questions_check;
ALTER TABLE public.conversation_answers ADD CONSTRAINT conversation_answers_three_questions_check
  CHECK (round BETWEEN 0 AND 2) NOT VALID;

ALTER TABLE public.conversation_reactions DROP CONSTRAINT IF EXISTS conversation_reactions_three_questions_check;
ALTER TABLE public.conversation_reactions ADD CONSTRAINT conversation_reactions_three_questions_check
  CHECK (idx BETWEEN 0 AND 2) NOT VALID;

-- Automatically unlock free_ready_a and free_ready_b when all 3 rounds have been answered
CREATE OR REPLACE FUNCTION private.conversation_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_completed_three BOOLEAN := false;
BEGIN
  IF TG_TABLE_NAME = 'conversation_answers' THEN
    SELECT (
      SELECT count(*)
      FROM public.conversation_rounds AS r
      WHERE r.conversation_id = NEW.conversation_id
        AND r.idx BETWEEN 0 AND 2
        AND (
          (SELECT count(*) FROM public.conversation_answers AS a WHERE a.conversation_id = NEW.conversation_id AND a.round = r.idx) >= 2
          OR r.created_at <= now() - interval '48 hours'
        )
    ) >= 3 INTO v_completed_three;
  END IF;

  UPDATE public.conversations
  SET updated_at = NEW.created_at,
      last_actor = NEW.author,
      free_ready_a = CASE WHEN v_completed_three THEN true ELSE free_ready_a END,
      free_ready_b = CASE WHEN v_completed_three THEN true ELSE free_ready_b END
  WHERE id = NEW.conversation_id AND NEW.author IN (user_a, user_b);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a participant' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.conversation_touch() FROM PUBLIC, anon, authenticated;

COMMIT;
