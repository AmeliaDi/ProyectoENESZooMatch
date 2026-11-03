-- ============================================================================
-- ZooMatch — chat between matches (docs/CHAT.md §10, ADR-032)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
--   node scripts/db-apply.mjs --migration supabase/migrations/20261104000000_conversations.sql
-- The same block lives in 00000000000000_base.sql so a clean reset matches.
--
--   * chat_interests: one-sided "me interesa conocerte" signals. Never shown
--     to the other person unless they are mutual.
--   * conversations: opened atomically by express_chat_interest when both
--     signals exist AND the pair is a current match on that track.
--   * conversation_answers / conversation_messages: question rounds and free
--     chat. A trigger bumps conversations.updated_at / last_actor.
--   * All server-only (RLS on, no policies, no grants to anon/authenticated)
--     and cascading from profiles: deleting the account deletes everything.
--   * leave_conversation deletes the conversation (answers and messages
--     cascade) and BOTH signals, so reopening needs two new signals.
--   * notifications accept the content-free 'chat' type.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_interests (
  from_user UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_user, to_user, track),
  CONSTRAINT chat_interests_not_self CHECK (from_user <> to_user)
);
CREATE INDEX IF NOT EXISTS chat_interests_to_idx ON public.chat_interests (to_user, track);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  user_a UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  free_ready_a BOOLEAN NOT NULL DEFAULT false,
  free_ready_b BOOLEAN NOT NULL DEFAULT false,
  seen_a TIMESTAMPTZ,
  seen_b TIMESTAMPTZ,
  last_actor UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversations_ordered_pair CHECK (user_a < user_b),
  CONSTRAINT conversations_pair_unique UNIQUE (user_a, user_b, track)
);
CREATE INDEX IF NOT EXISTS conversations_user_b_idx ON public.conversations (user_b);

CREATE TABLE IF NOT EXISTS public.conversation_answers (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  round SMALLINT NOT NULL CHECK (round BETWEEN 0 AND 5),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, author, round)
);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_messages_conv_idx
  ON public.conversation_messages (conversation_id, created_at DESC);

-- Only participants may write into a conversation; bumps the activity marker.
CREATE OR REPLACE FUNCTION private.conversation_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NEW.created_at, last_actor = NEW.author
  WHERE id = NEW.conversation_id AND NEW.author IN (user_a, user_b);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a participant' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_answers_touch ON public.conversation_answers;
CREATE TRIGGER conversation_answers_touch
  AFTER INSERT ON public.conversation_answers
  FOR EACH ROW EXECUTE FUNCTION private.conversation_touch();
DROP TRIGGER IF EXISTS conversation_messages_touch ON public.conversation_messages;
CREATE TRIGGER conversation_messages_touch
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION private.conversation_touch();

-- Records a signal and opens the conversation when it is mutual. Returns
-- {"kind": "gone"} when the pair is not a current match on that track.
CREATE OR REPLACE FUNCTION public.express_chat_interest(p_from UUID, p_to UUID, p_track TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a UUID := LEAST(p_from, p_to);
  v_b UUID := GREATEST(p_from, p_to);
  v_id UUID;
BEGIN
  PERFORM private.assert_service_role();
  IF p_from = p_to OR NOT EXISTS (
    SELECT 1 FROM public.matches WHERE user_a = v_a AND user_b = v_b AND track = p_track
  ) THEN
    RETURN jsonb_build_object('kind', 'gone');
  END IF;

  SELECT id INTO v_id FROM public.conversations WHERE user_a = v_a AND user_b = v_b AND track = p_track;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'open', 'conversation', v_id);
  END IF;

  INSERT INTO public.chat_interests (from_user, to_user, track)
  VALUES (p_from, p_to, p_track) ON CONFLICT DO NOTHING;

  -- Serialises the two signals of one pair so a mutual race opens exactly one.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_a::TEXT || v_b::TEXT || p_track, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_interests WHERE from_user = p_to AND to_user = p_from AND track = p_track
  ) THEN
    RETURN jsonb_build_object('kind', 'sent');
  END IF;

  INSERT INTO public.conversations (track, user_a, user_b)
  VALUES (p_track, v_a, v_b)
  ON CONFLICT ON CONSTRAINT conversations_pair_unique DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.conversations WHERE user_a = v_a AND user_b = v_b AND track = p_track;
  END IF;
  RETURN jsonb_build_object('kind', 'open', 'conversation', v_id);
END;
$$;

-- Deletes the conversation (answers and messages cascade) and both signals.
CREATE OR REPLACE FUNCTION public.leave_conversation(p_id UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.conversations%ROWTYPE;
BEGIN
  PERFORM private.assert_service_role();
  DELETE FROM public.conversations
  WHERE id = p_id AND p_user IN (user_a, user_b)
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM public.chat_interests
  WHERE track = v_row.track
    AND ((from_user = v_row.user_a AND to_user = v_row.user_b)
      OR (from_user = v_row.user_b AND to_user = v_row.user_a));
  RETURN true;
END;
$$;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('match_romance', 'match_amistad', 'no_match', 'welcome', 'chat'));

ALTER TABLE public.chat_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
-- chat_interests, conversations, conversation_*: no policies on purpose (server-only).

REVOKE ALL ON public.chat_interests, public.conversations, public.conversation_answers, public.conversation_messages
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_interests, public.conversations, public.conversation_answers, public.conversation_messages
  TO service_role;
REVOKE ALL ON FUNCTION private.conversation_touch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.express_chat_interest(UUID, UUID, TEXT), public.leave_conversation(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.express_chat_interest(UUID, UUID, TEXT), public.leave_conversation(UUID, UUID)
  TO service_role;

COMMIT;
