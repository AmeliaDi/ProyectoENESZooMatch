-- ============================================================================
-- ZooMatch — guided rounds, signals and chat safety (docs/CHAT.md §10–13, ADR-035)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
--   node scripts/db-apply.mjs --migration supabase/migrations/20261106000000_chat_safety.sql
-- The same statements are mirrored at the end of 00000000000000_base.sql.
--
--   * profiles.adult_confirmed_at: self-declared 18+; romance chats need it on
--     both sides (ADR-035).
--   * chat_interests.declined_at: "ahora no" hides the invitation from the
--     receiver only; the sender is never told and the signal just expires.
--   * conversation_rounds: one question per round (bank id or own question),
--     alternating asker. Answers are sealed until both answered or passed.
--   * conversation_reactions, chat_feedback_daily (aggregate only, no ids).
--   * conversation_messages.client_key: idempotent delivery.
--   * chat_blocks, chat_closures (cooldown), chat_reports (+ audit).
--   * Text CHECKs: limit × 8 code points (the exact limit is in graphemes,
--     enforced by the API with Intl.Segmenter).
--   * Everything server-only and cascading from profiles.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS adult_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.chat_interests ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS paused_by UUID;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS muted_a BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS muted_b BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversation_answers ADD COLUMN IF NOT EXISTS passed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS client_key UUID;

CREATE TABLE IF NOT EXISTS public.conversation_rounds (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  idx SMALLINT NOT NULL CHECK (idx BETWEEN 0 AND 59),
  asker UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  prompt_id TEXT CHECK (prompt_id IS NULL OR prompt_id ~ '^[par][0-9]{3}$'),
  custom_text TEXT CHECK (custom_text IS NULL OR char_length(custom_text) BETWEEN 1 AND 1600),
  feedback_a BOOLEAN NOT NULL DEFAULT false,
  feedback_b BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, idx),
  CONSTRAINT conversation_rounds_one_question CHECK ((prompt_id IS NULL) <> (custom_text IS NULL))
);

CREATE TABLE IF NOT EXISTS public.conversation_reactions (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  idx SMALLINT NOT NULL CHECK (idx BETWEEN 0 AND 59),
  author UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, idx, author)
);

CREATE TABLE IF NOT EXISTS public.chat_feedback_daily (
  day DATE NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  liked INTEGER NOT NULL DEFAULT 0 CHECK (liked >= 0),
  not_liked INTEGER NOT NULL DEFAULT 0 CHECK (not_liked >= 0),
  PRIMARY KEY (day, track)
);

CREATE TABLE IF NOT EXISTS public.chat_blocks (
  blocker UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  blocked UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CONSTRAINT chat_blocks_not_self CHECK (blocker <> blocked)
);
CREATE INDEX IF NOT EXISTS chat_blocks_blocked_idx ON public.chat_blocks (blocked);

CREATE TABLE IF NOT EXISTS public.chat_closures (
  user_a UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b, track),
  CONSTRAINT chat_closures_ordered_pair CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS public.chat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  reported UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  reason TEXT NOT NULL CHECK (reason IN ('acoso', 'ofensivo', 'datos_personales', 'spam', 'menor_de_edad', 'otro')),
  snapshot JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(snapshot) = 'array'),
  status TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'revisado', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chat_reports_status_idx ON public.chat_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_report_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.chat_reports(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('viewed', 'revisado', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BACKFILL (incremental only): rounds answered under the fixed questions of
-- ADR-032 become rounds with that question as text, asked by user_a. Runs
-- before the touch trigger exists, so unread markers do not change.
INSERT INTO public.conversation_rounds (conversation_id, idx, asker, custom_text, created_at)
SELECT a.conversation_id, a.round, c.user_a,
  CASE c.track
    WHEN 'romance' THEN (ARRAY[
      '¿Qué plan pequeño te alegra una semana pesada?',
      '¿Qué te hace sentir en confianza con alguien?',
      '¿Qué te gustaría que alguien supiera de ti desde el principio?'
    ])[a.round + 1]
    ELSE (ARRAY[
      '¿Qué te gusta hacer en un hueco entre clases?',
      '¿De qué tema podrías platicar por horas?',
      '¿Cómo es para ti una buena amistad?'
    ])[a.round + 1]
  END,
  min(a.created_at)
FROM public.conversation_answers AS a
JOIN public.conversations AS c ON c.id = a.conversation_id
WHERE a.round BETWEEN 0 AND 2
GROUP BY a.conversation_id, a.round, c.user_a, c.track
ON CONFLICT (conversation_id, idx) DO NOTHING;
-- END BACKFILL

ALTER TABLE public.conversation_answers DROP CONSTRAINT IF EXISTS conversation_answers_round_check;
ALTER TABLE public.conversation_answers ADD CONSTRAINT conversation_answers_round_check CHECK (round BETWEEN 0 AND 59);
ALTER TABLE public.conversation_answers DROP CONSTRAINT IF EXISTS conversation_answers_body_check;
ALTER TABLE public.conversation_answers ADD CONSTRAINT conversation_answers_body_check CHECK (
  (passed AND body = '') OR (NOT passed AND char_length(body) BETWEEN 1 AND 2400)
);
ALTER TABLE public.conversation_answers DROP CONSTRAINT IF EXISTS conversation_answers_round_fkey;
ALTER TABLE public.conversation_answers ADD CONSTRAINT conversation_answers_round_fkey
  FOREIGN KEY (conversation_id, round) REFERENCES public.conversation_rounds(conversation_id, idx) ON DELETE CASCADE;
ALTER TABLE public.conversation_messages DROP CONSTRAINT IF EXISTS conversation_messages_body_check;
ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 2400);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_messages_client_key_idx
  ON public.conversation_messages (conversation_id, author, client_key);
CREATE INDEX IF NOT EXISTS conversation_messages_author_idx
  ON public.conversation_messages (author, created_at DESC);

-- Only participants may ask; a new round bumps the activity marker.
CREATE OR REPLACE FUNCTION private.conversation_round_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NEW.created_at, last_actor = NEW.asker
  WHERE id = NEW.conversation_id AND NEW.asker IN (user_a, user_b);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a participant' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_rounds_touch ON public.conversation_rounds;
CREATE TRIGGER conversation_rounds_touch
  AFTER INSERT ON public.conversation_rounds
  FOR EACH ROW EXECUTE FUNCTION private.conversation_round_touch();

-- Signals (docs/CHAT.md §10.1). Returns {"kind": ...}:
--   gone (no current match or a block), adult_required, cooldown, too_many,
--   sent (waiting), open (+ conversation).
DROP FUNCTION IF EXISTS public.express_chat_interest(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.express_chat_interest(
  p_from UUID, p_to UUID, p_track TEXT, p_expire_days INTEGER, p_max_open INTEGER, p_cooldown_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a UUID := LEAST(p_from, p_to);
  v_b UUID := GREATEST(p_from, p_to);
  v_live TIMESTAMPTZ := now() - make_interval(days => p_expire_days);
  v_id UUID;
BEGIN
  PERFORM private.assert_service_role();
  IF p_from = p_to OR NOT EXISTS (
    SELECT 1 FROM public.matches WHERE user_a = v_a AND user_b = v_b AND track = p_track
  ) OR EXISTS (
    SELECT 1 FROM public.chat_blocks
    WHERE (blocker = p_from AND blocked = p_to) OR (blocker = p_to AND blocked = p_from)
  ) THEN
    RETURN jsonb_build_object('kind', 'gone');
  END IF;

  SELECT id INTO v_id FROM public.conversations WHERE user_a = v_a AND user_b = v_b AND track = p_track;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'open', 'conversation', v_id);
  END IF;

  IF p_track = 'romance' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_from AND adult_confirmed_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('kind', 'adult_required');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.chat_closures WHERE user_a = v_a AND user_b = v_b AND track = p_track
      AND closed_at > now() - make_interval(days => p_cooldown_days)
  ) THEN
    RETURN jsonb_build_object('kind', 'cooldown');
  END IF;

  DELETE FROM public.chat_interests WHERE from_user = p_from AND created_at <= v_live;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_interests WHERE from_user = p_from AND to_user = p_to AND track = p_track
  ) AND (SELECT count(*) FROM public.chat_interests WHERE from_user = p_from) >= p_max_open THEN
    RETURN jsonb_build_object('kind', 'too_many');
  END IF;

  INSERT INTO public.chat_interests (from_user, to_user, track)
  VALUES (p_from, p_to, p_track) ON CONFLICT DO NOTHING;

  -- Serialises the two signals of one pair so a mutual race opens exactly one.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_a::TEXT || v_b::TEXT || p_track, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_interests
    WHERE from_user = p_to AND to_user = p_from AND track = p_track AND created_at > v_live
  ) OR (p_track = 'romance' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_to AND adult_confirmed_at IS NOT NULL
  )) THEN
    RETURN jsonb_build_object('kind', 'sent');
  END IF;

  INSERT INTO public.conversations (track, user_a, user_b)
  VALUES (p_track, v_a, v_b)
  ON CONFLICT ON CONSTRAINT conversations_pair_unique DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.conversations WHERE user_a = v_a AND user_b = v_b AND track = p_track;
  END IF;
  DELETE FROM public.chat_interests
  WHERE track = p_track AND ((from_user = p_from AND to_user = p_to) OR (from_user = p_to AND to_user = p_from));
  RETURN jsonb_build_object('kind', 'open', 'conversation', v_id);
END;
$$;

-- Deletes the conversation (rounds, answers, messages cascade), both signals,
-- and records the closure so the pair cools down before signalling again.
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
  INSERT INTO public.chat_closures (user_a, user_b, track) VALUES (v_row.user_a, v_row.user_b, v_row.track)
  ON CONFLICT (user_a, user_b, track) DO UPDATE SET closed_at = now();
  RETURN true;
END;
$$;

-- Silent block: every conversation and signal of the pair disappears at once.
CREATE OR REPLACE FUNCTION public.block_chat_user(p_blocker UUID, p_conversation UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.conversations%ROWTYPE;
  v_other UUID;
BEGIN
  PERFORM private.assert_service_role();
  SELECT * INTO v_row FROM public.conversations WHERE id = p_conversation AND p_blocker IN (user_a, user_b);
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_other := CASE WHEN v_row.user_a = p_blocker THEN v_row.user_b ELSE v_row.user_a END;
  INSERT INTO public.chat_blocks (blocker, blocked) VALUES (p_blocker, v_other) ON CONFLICT DO NOTHING;
  DELETE FROM public.conversations WHERE user_a = v_row.user_a AND user_b = v_row.user_b;
  DELETE FROM public.chat_interests
  WHERE (from_user = p_blocker AND to_user = v_other) OR (from_user = v_other AND to_user = p_blocker);
  RETURN true;
END;
$$;

-- Report = minimal snapshot for moderation (last N messages and revealed
-- answers, labelled by role, never by id) + silent block.
CREATE OR REPLACE FUNCTION public.report_conversation(p_reporter UUID, p_conversation UUID, p_reason TEXT, p_snapshot INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.conversations%ROWTYPE;
  v_other UUID;
  v_snapshot JSONB;
BEGIN
  PERFORM private.assert_service_role();
  SELECT * INTO v_row FROM public.conversations WHERE id = p_conversation AND p_reporter IN (user_a, user_b);
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_other := CASE WHEN v_row.user_a = p_reporter THEN v_row.user_b ELSE v_row.user_a END;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'at'), '[]'::JSONB) INTO v_snapshot FROM (
    SELECT jsonb_build_object(
      'who', CASE WHEN author = p_reporter THEN 'reporta' ELSE 'reportada' END,
      'kind', kind, 'body', body, 'at', created_at
    ) AS x
    FROM (
      SELECT author, 'mensaje' AS kind, body, created_at FROM public.conversation_messages
      WHERE conversation_id = p_conversation
      UNION ALL
      SELECT author, 'respuesta', body, created_at FROM public.conversation_answers
      WHERE conversation_id = p_conversation AND NOT passed
      ORDER BY created_at DESC
      LIMIT p_snapshot
    ) AS recent
  ) AS rows;
  INSERT INTO public.chat_reports (reporter, reported, track, reason, snapshot)
  VALUES (p_reporter, v_other, v_row.track, p_reason, v_snapshot);
  RETURN public.block_chat_user(p_reporter, p_conversation);
END;
$$;

-- Aggregate-only "¿te gustó la conversación?": one vote per side and round,
-- stored as a daily count without any id.
CREATE OR REPLACE FUNCTION public.record_round_feedback(p_conversation UUID, p_user UUID, p_idx INTEGER, p_liked BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_track TEXT;
BEGIN
  PERFORM private.assert_service_role();
  UPDATE public.conversation_rounds AS r
  SET feedback_a = CASE WHEN c.user_a = p_user THEN true ELSE r.feedback_a END,
      feedback_b = CASE WHEN c.user_b = p_user THEN true ELSE r.feedback_b END
  FROM public.conversations AS c
  WHERE r.conversation_id = p_conversation AND r.idx = p_idx AND c.id = r.conversation_id
    AND ((c.user_a = p_user AND NOT r.feedback_a) OR (c.user_b = p_user AND NOT r.feedback_b))
  RETURNING c.track INTO v_track;
  IF v_track IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.chat_feedback_daily (day, track, liked, not_liked)
  VALUES (current_date, v_track, CASE WHEN p_liked THEN 1 ELSE 0 END, CASE WHEN p_liked THEN 0 ELSE 1 END)
  ON CONFLICT (day, track) DO UPDATE
  SET liked = public.chat_feedback_daily.liked + EXCLUDED.liked,
      not_liked = public.chat_feedback_daily.not_liked + EXCLUDED.not_liked;
  RETURN true;
END;
$$;

-- Retention: messages older than N days, conversations idle for M days,
-- expired signals and old closures. Returns rows touched.
CREATE OR REPLACE FUNCTION public.purge_chat(p_message_days INTEGER, p_inactive_days INTEGER, p_signal_days INTEGER, p_cooldown_days INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total INTEGER := 0;
  v_count INTEGER;
BEGIN
  PERFORM private.assert_service_role();
  DELETE FROM public.conversation_messages WHERE created_at < now() - make_interval(days => p_message_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.conversations WHERE updated_at < now() - make_interval(days => p_inactive_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.chat_interests WHERE created_at < now() - make_interval(days => p_signal_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.chat_closures WHERE closed_at < now() - make_interval(days => p_cooldown_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_total + v_count;
END;
$$;

ALTER TABLE public.conversation_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_feedback_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_report_audit ENABLE ROW LEVEL SECURITY;
-- conversation_rounds, conversation_reactions, chat_*: no policies on purpose (server-only).

REVOKE ALL ON public.conversation_rounds, public.conversation_reactions, public.chat_feedback_daily,
  public.chat_blocks, public.chat_closures, public.chat_reports, public.chat_report_audit
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.conversation_rounds, public.conversation_reactions, public.chat_feedback_daily,
  public.chat_blocks, public.chat_closures, public.chat_reports, public.chat_report_audit
  TO service_role;
REVOKE ALL ON FUNCTION private.conversation_round_touch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.express_chat_interest(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER),
  public.leave_conversation(UUID, UUID),
  public.block_chat_user(UUID, UUID),
  public.report_conversation(UUID, UUID, TEXT, INTEGER),
  public.record_round_feedback(UUID, UUID, INTEGER, BOOLEAN),
  public.purge_chat(INTEGER, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.express_chat_interest(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER),
  public.leave_conversation(UUID, UUID),
  public.block_chat_user(UUID, UUID),
  public.report_conversation(UUID, UUID, TEXT, INTEGER),
  public.record_round_feedback(UUID, UUID, INTEGER, BOOLEAN),
  public.purge_chat(INTEGER, INTEGER, INTEGER, INTEGER)
  TO service_role;

COMMIT;
