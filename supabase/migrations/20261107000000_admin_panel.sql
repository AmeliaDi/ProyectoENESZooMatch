-- ============================================================================
-- ZooMatch — admin console: credentials, audit and user control (ADR-036)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
--   node scripts/db-apply.mjs --migration supabase/migrations/20261107000000_admin_panel.sql
-- The same block lives in 00000000000000_base.sql so a clean reset matches.
--
--   * public.admin_credentials: the admin PIN (scrypt hash + salt + KDF
--     params) and its pause counters. One row per admin; cascades from the
--     profile. Server-only: RLS on, no policies, no API grants.
--   * public.admin_audit: every console action (who, what, on which alias,
--     when). The target is stored as an alias and a bare id WITHOUT a foreign
--     key, so the trail survives the deletion of the account it describes.
--   * RPCs (service role only, called after the route checked the admin
--     session): list users, reset a quiz, list reports, review a report.
--     Lists never return matrícula hashes, answers, vectors or θ.
--   * private.access_guard accepts the new 'admin_address' kind.
--   * get_admin_dashboard also answers the service role: the console
--     authenticates with its own signed session, not a Supabase one.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_credentials (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL CHECK (char_length(pin_hash) BETWEEN 16 AND 128),
  salt TEXT NOT NULL CHECK (char_length(salt) BETWEEN 8 AND 64),
  kdf_params JSONB NOT NULL CHECK (jsonb_typeof(kdf_params) = 'object'),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  pause_step INTEGER NOT NULL DEFAULT 0 CHECK (pause_step >= 0),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_alias TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'login', 'login_failed', 'logout', 'delete_user', 'reset_quiz', 'pause_user', 'resume_user',
    'reset_chat_pin', 'recompute', 'report_revisado', 'report_cerrado'
  )),
  target_user UUID,
  target_alias TEXT,
  detail JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON public.admin_audit (created_at DESC);

CREATE OR REPLACE FUNCTION private.admin_credentials_bump_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_credentials_bump_revision ON public.admin_credentials;
CREATE TRIGGER admin_credentials_bump_revision
  BEFORE UPDATE ON public.admin_credentials
  FOR EACH ROW EXECUTE FUNCTION private.admin_credentials_bump_revision();

-- One page of accounts with counts, newest first. Alias search is a plain
-- case-insensitive substring (wildcards escaped). Never returns the
-- matrícula hash, answers, vectors, θ or hard filters.
CREATE OR REPLACE FUNCTION public.admin_list_users(p_search TEXT, p_user UUID, p_limit INTEGER, p_offset INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pattern TEXT := '%' || replace(replace(replace(COALESCE(p_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  PERFORM private.assert_service_role();
  SELECT count(*) INTO v_total FROM public.profiles AS p
  WHERE (p_user IS NULL OR p.user_id = p_user)
    AND (COALESCE(p_search, '') = '' OR COALESCE(p.alias, '') ILIKE v_pattern);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created DESC), '[]'::JSONB) INTO v_rows FROM (
    SELECT p.created_at AS created, jsonb_build_object(
      'id', p.user_id,
      'alias', p.alias,
      'animal', a.diminutivo_es,
      'color', c.nombre,
      'colorHex', c.hex,
      'mbti', p.mbti_code,
      'createdAt', p.created_at,
      'quizCompletedAt', p.quiz_completed_at,
      'paused', p.paused_at IS NOT NULL,
      'adult', p.adult_confirmed_at IS NOT NULL,
      'modules', cardinality(p.completed_modules),
      'isAdmin', EXISTS (SELECT 1 FROM public.user_roles AS r WHERE r.user_id = p.user_id AND r.role = 'admin'::public.app_role),
      'hasChatPin', EXISTS (SELECT 1 FROM public.chat_pins AS k WHERE k.user_id = p.user_id),
      'romanceMatches', (SELECT count(*) FROM public.matches AS m WHERE m.track = 'romance' AND p.user_id IN (m.user_a, m.user_b)),
      'amistadMatches', (SELECT count(*) FROM public.matches AS m WHERE m.track = 'amistad' AND p.user_id IN (m.user_a, m.user_b)),
      'conversations', (SELECT count(*) FROM public.conversations AS v WHERE p.user_id IN (v.user_a, v.user_b)),
      'reportsReceived', (SELECT count(*) FROM public.chat_reports AS x WHERE x.reported = p.user_id)
    ) AS row_data
    FROM public.profiles AS p
    LEFT JOIN public.animals AS a ON a.id = p.animal_id
    LEFT JOIN public.colors AS c ON c.id = p.color_id
    WHERE (p_user IS NULL OR p.user_id = p_user)
      AND (COALESCE(p_search, '') = '' OR COALESCE(p.alias, '') ILIKE v_pattern)
    ORDER BY p.created_at DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  ) AS page;

  RETURN jsonb_build_object('total', v_total, 'users', v_rows);
END;
$$;

-- Back to "sin cuestionario": answers, scores, avatar and matches go; the
-- alias stays (ADR-024) and so do chats, PIN and reports. The pool version
-- changes through the quiz_completed_at trigger, so the caller republishes.
CREATE OR REPLACE FUNCTION public.admin_reset_quiz(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();
  UPDATE public.profiles SET
    quiz_completed_at = NULL,
    animal_id = NULL,
    color_id = NULL,
    avatar_mark = NULL,
    narrative = NULL,
    orientacion_sexual = '{}',
    identidad_genero = '{}',
    tipo_relacion_busca = '{}',
    romance_vector = '{}',
    amistad_vector = '{}',
    dimension_scores = '{}',
    latent_profile = '{}',
    completed_modules = '{}',
    mbti_code = NULL
  WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM public.quiz_responses WHERE user_id = p_user;
  DELETE FROM public.matches WHERE p_user IN (user_a, user_b);
  RETURN true;
END;
$$;

-- Reports for moderation, newest first, labelled by alias (never by matrícula).
CREATE OR REPLACE FUNCTION public.admin_list_reports(p_status TEXT, p_limit INTEGER, p_offset INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  PERFORM private.assert_service_role();
  SELECT count(*) INTO v_total FROM public.chat_reports WHERE p_status IS NULL OR status = p_status;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY created DESC), '[]'::JSONB) INTO v_rows FROM (
    SELECT r.created_at AS created, jsonb_build_object(
      'id', r.id,
      'reporterAlias', rp.alias,
      'reportedId', r.reported,
      'reportedAlias', rd.alias,
      'track', r.track,
      'reason', r.reason,
      'status', r.status,
      'snapshot', r.snapshot,
      'createdAt', r.created_at,
      'reviewedAt', r.reviewed_at
    ) AS row_data
    FROM public.chat_reports AS r
    LEFT JOIN public.profiles AS rp ON rp.user_id = r.reporter
    LEFT JOIN public.profiles AS rd ON rd.user_id = r.reported
    WHERE p_status IS NULL OR r.status = p_status
    ORDER BY r.created_at DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0)
  ) AS page;
  RETURN jsonb_build_object('total', v_total, 'reports', v_rows);
END;
$$;

-- Moves a report to revisado/cerrado and records it in chat_report_audit.
CREATE OR REPLACE FUNCTION public.admin_review_report(p_admin UUID, p_report UUID, p_status TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();
  IF p_status NOT IN ('revisado', 'cerrado') THEN
    RAISE EXCEPTION 'Invalid report status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.chat_reports SET status = p_status, reviewed_at = now() WHERE id = p_report;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO public.chat_report_audit (report_id, admin_id, action) VALUES (p_report, p_admin, p_status);
  RETURN true;
END;
$$;

-- MIRROR-SKIP
ALTER TABLE private.access_guard DROP CONSTRAINT IF EXISTS access_guard_kind_check;
ALTER TABLE private.access_guard ADD CONSTRAINT access_guard_kind_check
  CHECK (kind IN ('address_attempt', 'chat_pin_address', 'admin_address'));

CREATE OR REPLACE FUNCTION public.get_admin_dashboard(
  p_romance_threshold DOUBLE PRECISION,
  p_amistad_threshold DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'romanceThreshold', p_romance_threshold,
    'amistadThreshold', p_amistad_threshold,
    'totalProfiles',
      (SELECT count(*) FROM public.profiles WHERE quiz_completed_at IS NOT NULL AND paused_at IS NULL),
    'romanceMatches', (SELECT count(*) FROM public.matches WHERE track = 'romance'),
    'amistadMatches', (SELECT count(*) FROM public.matches WHERE track = 'amistad'),
    'usersWithRomanceMatch', (
      SELECT count(*) FROM (
        SELECT user_a FROM public.matches WHERE track = 'romance'
        UNION SELECT user_b FROM public.matches WHERE track = 'romance'
      ) AS u
    ),
    'usersWithAmistadMatch', (
      SELECT count(*) FROM (
        SELECT user_a FROM public.matches WHERE track = 'amistad'
        UNION SELECT user_b FROM public.matches WHERE track = 'amistad'
      ) AS u
    ),
    'topAnimals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('animal', t.label, 'count', t.total) ORDER BY t.total DESC, t.label)
      FROM (
        SELECT a.diminutivo_es AS label, count(*) AS total
        FROM public.profiles AS p JOIN public.animals AS a ON a.id = p.animal_id
        WHERE p.quiz_completed_at IS NOT NULL
        GROUP BY a.diminutivo_es
        ORDER BY total DESC, label
        LIMIT 10
      ) AS t
    ), '[]'),
    'topColors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('color', t.label, 'count', t.total) ORDER BY t.total DESC, t.label)
      FROM (
        SELECT c.nombre AS label, count(*) AS total
        FROM public.profiles AS p JOIN public.colors AS c ON c.id = p.color_id
        WHERE p.quiz_completed_at IS NOT NULL
        GROUP BY c.nombre
        ORDER BY total DESC, label
        LIMIT 10
      ) AS t
    ), '[]'),
    'mbtiDistribution', COALESCE((
      SELECT jsonb_object_agg(s.code, s.total)
      FROM (
        SELECT mbti_code AS code, count(*) AS total
        FROM public.profiles
        WHERE quiz_completed_at IS NOT NULL AND mbti_code IS NOT NULL
        GROUP BY mbti_code
      ) AS s
    ), '{}')
  );
END;
$$;
-- END MIRROR-SKIP

ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
-- admin_credentials, admin_audit: no policies on purpose (server-only).

REVOKE ALL ON public.admin_credentials, public.admin_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_credentials, public.admin_audit TO service_role;
REVOKE ALL ON FUNCTION private.admin_credentials_bump_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.admin_list_users(TEXT, UUID, INTEGER, INTEGER),
  public.admin_reset_quiz(UUID),
  public.admin_list_reports(TEXT, INTEGER, INTEGER),
  public.admin_review_report(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.admin_list_users(TEXT, UUID, INTEGER, INTEGER),
  public.admin_reset_quiz(UUID),
  public.admin_list_reports(TEXT, INTEGER, INTEGER),
  public.admin_review_report(UUID, UUID, TEXT)
  TO service_role;

COMMIT;
