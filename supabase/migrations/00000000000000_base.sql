-- ============================================================================
-- ZooMatch — base schema (single consolidated migration)
-- ============================================================================
-- Apply on an empty project: `npm run db:reset` (local) or `supabase db push`.
--
-- Security model
--   * API roles (anon, authenticated) can read only the public catalogue and
--     their own admin role. Profiles, answers, matches and notifications are
--     invisible to them: the Next.js server reads them with the service role
--     after verifying the session, and returns DTOs without user ids.
--   * Every SECURITY DEFINER function pins `search_path = ''` and qualifies
--     every object.
--   * Service-only RPCs go through private.assert_service_role(), which also
--     rejects calls with no JWT claim at all.
--
-- Contracts mirrored in TypeScript (checked by
-- src/infrastructure/supabase/schema.test.ts):
--   * romance vector length 26 = ROMANCE_VECTOR_LENGTH
--   * friendship vector length 16 = FRIENDSHIP_VECTOR_LENGTH
--   * RPC and table names = src/infrastructure/supabase/repositories.ts
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TYPE public.app_role AS ENUM ('participant', 'admin');

-- ─── Catalogue (public, read-only) ──────────────────────────────────────────

CREATE TABLE public.animals (
  id TEXT PRIMARY KEY,
  nombre_fuente TEXT NOT NULL,
  diminutivo_es TEXT NOT NULL UNIQUE,
  categoria_fauna TEXT NOT NULL CHECK (categoria_fauna IN (
    'anfibio', 'mamifero', 'ave', 'pez', 'insecto', 'reptil',
    'crustaceo', 'molusco', 'equinodermo', 'cnidario'
  )),
  personality_affinity JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.colors (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  hex CHAR(7) NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  textura TEXT NOT NULL CHECK (textura IN (
    'cristalina', 'mate', 'sedosa', 'metalica', 'terrosa', 'acuosa', 'luminosa', 'aterciopelada'
  )),
  temperatura TEXT NOT NULL CHECK (temperatura IN ('frio', 'calido', 'neutro'))
);

CREATE TABLE public.quiz_items (
  id TEXT PRIMARY KEY,
  categoria TEXT NOT NULL CHECK (categoria IN (
    'personalidad_bigfive', 'personalidad_mbti', 'identidad_filtros',
    'afinidad_cultural', 'intimidad_afecto', 'valores_relacionales'
  )),
  subcategoria TEXT,
  prompt TEXT NOT NULL,
  tipo_respuesta TEXT NOT NULL CHECK (tipo_respuesta IN ('likert_5', 'seleccion_multiple')),
  opciones JSONB,
  polarity TEXT CHECK (polarity IS NULL OR polarity IN ('positiva', 'negativa')),
  weights JSONB NOT NULL DEFAULT '{}',
  track_romance BOOLEAN NOT NULL DEFAULT true,
  track_amistad BOOLEAN NOT NULL DEFAULT true,
  filtro_duro BOOLEAN NOT NULL DEFAULT false,
  campo_perfil TEXT CHECK (campo_perfil IS NULL OR campo_perfil IN (
    'orientacion_sexual', 'identidad_genero', 'tipo_relacion_busca'
  )),
  source_id TEXT
);

-- ─── Roles ──────────────────────────────────────────────────────────────────

CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Participant data (service role only) ───────────────────────────────────

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  matricula_hash TEXT NOT NULL UNIQUE CHECK (matricula_hash ~ '^[0-9a-f]{64}$'),
  alias TEXT UNIQUE,
  animal_id TEXT REFERENCES public.animals(id),
  color_id TEXT REFERENCES public.colors(id),
  narrative TEXT,
  orientacion_sexual TEXT[] NOT NULL DEFAULT '{}',
  identidad_genero TEXT[] NOT NULL DEFAULT '{}',
  tipo_relacion_busca TEXT[] NOT NULL DEFAULT '{}',
  romance_vector DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  amistad_vector DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  dimension_scores JSONB NOT NULL DEFAULT '{}',
  -- Latent posterior (theta, se, quality, answered): the only input of the
  -- compatibility score. Service-role only, never exposed to clients.
  latent_profile JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(latent_profile) = 'object'),
  mbti_code CHAR(4) CHECK (mbti_code IS NULL OR mbti_code ~ '^[IE][NS][TF][JP]$'),
  inclusive_mode TEXT NOT NULL DEFAULT 'neutro_universal' CHECK (inclusive_mode IN (
    'femenino', 'masculino', 'neutro_e', 'neutro_universal'
  )),
  quiz_completed_at TIMESTAMPTZ,
  -- Paused profiles keep their data but leave the matching pool.
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_romance_vector_shape CHECK (
    romance_vector = '{}' OR (array_ndims(romance_vector) = 1 AND cardinality(romance_vector) = 26)
  ),
  CONSTRAINT profiles_amistad_vector_shape CHECK (
    amistad_vector = '{}' OR (array_ndims(amistad_vector) = 1 AND cardinality(amistad_vector) = 16)
  ),
  -- A completed profile is always matchable and displayable.
  CONSTRAINT profiles_completed_is_whole CHECK (
    quiz_completed_at IS NULL OR (
      cardinality(romance_vector) = 26
      AND cardinality(amistad_vector) = 16
      AND alias IS NOT NULL
      AND animal_id IS NOT NULL
      AND color_id IS NOT NULL
    )
  )
);

CREATE TABLE public.quiz_responses (
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES public.quiz_items(id),
  likert_value SMALLINT CHECK (likert_value BETWEEN 1 AND 5),
  selected_options TEXT[],
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT quiz_responses_one_kind CHECK (
    (likert_value IS NOT NULL AND selected_options IS NULL)
    OR (likert_value IS NULL AND selected_options IS NOT NULL)
  )
);

CREATE TABLE public.matches (
  user_a UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  similarity DOUBLE PRECISION NOT NULL CHECK (similarity > 0 AND similarity <= 1),
  badges JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(badges) = 'array'),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b, track),
  CONSTRAINT matches_ordered_pair CHECK (user_a < user_b)
);

CREATE INDEX matches_user_b_idx ON public.matches (user_b, track);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('match_romance', 'match_amistad', 'no_match', 'welcome')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx
  ON public.notifications (user_id, created_at DESC) WHERE read = false;

-- ─── Row-level security and table privileges ────────────────────────────────

ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY animals_public_read ON public.animals
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY colors_public_read ON public.colors
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY quiz_items_public_read ON public.quiz_items
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY user_roles_read_own ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- profiles, quiz_responses, matches, notifications: no policies on purpose.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.animals, public.colors, public.quiz_items TO anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ─── Private helpers ────────────────────────────────────────────────────────

CREATE FUNCTION private.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

CREATE FUNCTION private.assert_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION private.is_admin(requested_user UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = requested_user AND role = 'admin'::public.app_role
  );
$$;

-- True when every element is a number in [0, 1]. Postgres orders NaN above
-- every number (and +/-Infinity sit outside the range), so `v > 1` and
-- `v < 0` also reject them.
CREATE FUNCTION private.is_unit_vector(p_values DOUBLE PRECISION[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(p_values) AS v
    WHERE v IS NULL OR v < 0 OR v > 1
  );
$$;

-- Revision of the completed pool. A trigger bumps it whenever a submission
-- (new or retake) completes or a completed profile is deleted, so callers can
-- read it BEFORE loading the pool and replace_matches rejects stale snapshots.
-- Timestamps are not used: now() is the transaction start, so a slow retake
-- could commit without moving max(quiz_completed_at).
CREATE TABLE private.pool_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  revision BIGINT NOT NULL DEFAULT 0
);
INSERT INTO private.pool_state DEFAULT VALUES;

CREATE FUNCTION private.bump_pool_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE private.pool_state SET revision = revision + 1 WHERE singleton;
  RETURN NULL;
END;
$$;

CREATE TRIGGER profiles_pool_completed
  AFTER UPDATE OF quiz_completed_at ON public.profiles
  FOR EACH ROW
  WHEN (NEW.quiz_completed_at IS DISTINCT FROM OLD.quiz_completed_at)
  EXECUTE FUNCTION private.bump_pool_revision();

CREATE TRIGGER profiles_pool_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.quiz_completed_at IS NOT NULL)
  EXECUTE FUNCTION private.bump_pool_revision();

CREATE TRIGGER profiles_pool_paused
  AFTER UPDATE OF paused_at ON public.profiles
  FOR EACH ROW
  WHEN (NEW.paused_at IS DISTINCT FROM OLD.paused_at AND NEW.quiz_completed_at IS NOT NULL)
  EXECUTE FUNCTION private.bump_pool_revision();

CREATE INDEX profiles_active_pool_idx
  ON public.profiles (user_id) WHERE quiz_completed_at IS NOT NULL AND paused_at IS NULL;

CREATE FUNCTION private.pool_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT revision::text FROM private.pool_state WHERE singleton;
$$;

-- ─── Service RPCs (called by the Next.js server with the service role) ──────

CREATE FUNCTION public.submit_quiz_result(
  p_user_id UUID,
  p_answers JSONB,
  p_dimension_scores JSONB,
  p_romance_vector DOUBLE PRECISION[],
  p_amistad_vector DOUBLE PRECISION[],
  p_mbti_code TEXT,
  p_hard_filters JSONB,
  p_animal_id TEXT,
  p_color_id TEXT,
  p_narrative TEXT,
  p_alias TEXT,
  p_latent_profile JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();

  IF COALESCE(cardinality(p_romance_vector), 0) <> 26
     OR COALESCE(cardinality(p_amistad_vector), 0) <> 16 THEN
    RAISE EXCEPTION 'Vectors must have 26 (romance) and 16 (amistad) dimensions'
      USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_unit_vector(p_romance_vector) OR NOT private.is_unit_vector(p_amistad_vector) THEN
    RAISE EXCEPTION 'Vector components must lie in [0, 1]' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Answers must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_latent_profile -> 'theta') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_latent_profile -> 'se') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Latent profile must carry theta and se objects' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET
    alias = p_alias,
    animal_id = p_animal_id,
    color_id = p_color_id,
    narrative = p_narrative,
    orientacion_sexual = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'orientacion_sexual', '[]'))),
    identidad_genero = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'identidad_genero', '[]'))),
    tipo_relacion_busca = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'tipo_relacion_busca', '[]'))),
    romance_vector = p_romance_vector,
    amistad_vector = p_amistad_vector,
    dimension_scores = p_dimension_scores,
    mbti_code = p_mbti_code,
    latent_profile = p_latent_profile,
    quiz_completed_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.quiz_responses WHERE user_id = p_user_id;
  INSERT INTO public.quiz_responses (user_id, item_id, likert_value, selected_options)
  SELECT
    p_user_id,
    answer ->> 'itemId',
    (answer ->> 'value')::SMALLINT,
    CASE WHEN answer ? 'selected'
      THEN ARRAY(SELECT jsonb_array_elements_text(answer -> 'selected'))
    END
  FROM jsonb_array_elements(p_answers) AS answer;
END;
$$;

CREATE FUNCTION public.get_pool_version()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();
  RETURN private.pool_version();
END;
$$;

-- Atomically replaces the whole match set. Returns -1 (and writes nothing)
-- when the pool changed since `p_pool_version` was read; otherwise returns
-- the number of rows written.
CREATE FUNCTION public.replace_matches(p_matches JSONB, p_pool_version TEXT)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted integer;
BEGIN
  PERFORM private.assert_service_role();

  IF jsonb_typeof(p_matches) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Matches payload must be a JSON array' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zoomatch:matches'));

  IF private.pool_version() IS DISTINCT FROM p_pool_version THEN
    RETURN -1;
  END IF;

  DELETE FROM public.matches WHERE true;
  INSERT INTO public.matches (track, user_a, user_b, similarity, badges)
  SELECT m.track, m.user_a, m.user_b, m.similarity, COALESCE(m.badges, '[]')
  FROM jsonb_to_recordset(p_matches)
    AS m(track TEXT, user_a UUID, user_b UUID, similarity DOUBLE PRECISION, badges JSONB);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Matches of one user, for the server only; the server turns other_user into an
-- opaque per-viewer handle before anything reaches the browser.
CREATE FUNCTION public.get_user_matches(p_user_id UUID)
RETURNS TABLE (
  track TEXT,
  other_user UUID,
  other_alias TEXT,
  other_animal TEXT,
  other_color TEXT,
  similarity DOUBLE PRECISION,
  badges JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();

  RETURN QUERY
  SELECT
    m.track,
    p.user_id,
    p.alias,
    COALESCE(a.diminutivo_es, ''),
    COALESCE(c.nombre, ''),
    m.similarity,
    m.badges
  FROM public.matches AS m
  JOIN public.profiles AS p
    ON p.user_id = CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END
  LEFT JOIN public.animals AS a ON a.id = p.animal_id
  LEFT JOIN public.colors AS c ON c.id = p.color_id
  WHERE m.user_a = p_user_id OR m.user_b = p_user_id
  ORDER BY m.track, m.similarity DESC;
END;
$$;

-- Replaces the user's unread match summary. Unread welcome notifications are
-- kept: this also runs for counterparts when someone else submits.
CREATE FUNCTION public.notify_matches(p_user_id UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity TEXT;
  v_romance integer;
  v_amistad integer;
  v_count integer := 0;
BEGIN
  PERFORM private.assert_service_role();

  SELECT COALESCE(a.diminutivo_es, 'tu animalito') || ' ' || COALESCE(c.nombre, 'tu color')
  INTO v_identity
  FROM public.profiles AS p
  LEFT JOIN public.animals AS a ON a.id = p.animal_id
  LEFT JOIN public.colors AS c ON c.id = p.color_id
  WHERE p.user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT
    count(*) FILTER (WHERE m.track = 'romance'),
    count(*) FILTER (WHERE m.track = 'amistad')
  INTO v_romance, v_amistad
  FROM public.matches AS m
  WHERE m.user_a = p_user_id OR m.user_b = p_user_id;

  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND read = false
    AND type IN ('match_romance', 'match_amistad', 'no_match');

  IF v_romance > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (p_user_id, 'match_romance', 'El universo conspiró a tu favor',
      CASE WHEN v_romance = 1
        THEN '¡Oye! Tienes a un ser extraordinario en el campus con quien podrías tener una química increíble. Tu energía de '
             || v_identity || ' resonó de forma especial.'
        ELSE '¡Oye! Tienes a ' || v_romance || ' seres extraordinarios en el campus con los que podrías tener una química increíble. Tu energía de '
             || v_identity || ' resonó con cada unx de ellxs.'
      END,
      jsonb_build_object('match_count', v_romance, 'track', 'romance'));
    v_count := v_count + 1;
  END IF;

  IF v_amistad > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (p_user_id, 'match_amistad', 'Tu vibra resonó con alguien',
      CASE WHEN v_amistad = 1
        THEN '¡Hey! Tu energía de ' || v_identity
             || ' conectó con alguien del campus. Hay una química de amistad que vale la pena explorar.'
        ELSE '¡Hey! Tu energía de ' || v_identity || ' resonó con ' || v_amistad
             || ' personas del campus. Hay amistades esperando florecer.'
      END,
      jsonb_build_object('match_count', v_amistad, 'track', 'amistad'));
    v_count := v_count + 1;
  END IF;

  IF v_romance = 0 AND v_amistad = 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (p_user_id, 'no_match', 'Tu momento llegará',
      'Aún no llega ese ser especial a la base de datos, pero tranquilx, tu vibra es única y esto es solo un proyecto de estadística, no una medida de tu inmenso valor <3');
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

-- ─── Authenticated RPCs (called with the user's session) ────────────────────

CREATE FUNCTION public.get_my_notifications(p_unread_only BOOLEAN DEFAULT true)
RETURNS TABLE (
  id UUID, type TEXT, title TEXT, body TEXT, metadata JSONB, read BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT n.id, n.type, n.title, n.body, n.metadata, n.read, n.created_at
  FROM public.notifications AS n
  WHERE n.user_id = v_uid AND (NOT p_unread_only OR n.read = false)
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;

CREATE FUNCTION public.mark_notifications_read(p_ids UUID[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE user_id = v_uid AND id = ANY (p_ids) AND read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Aggregates only: no ids, hashes, vectors or answers ever leave this function.
CREATE FUNCTION public.get_admin_dashboard(
  p_romance_threshold DOUBLE PRECISION,
  p_amistad_threshold DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
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

-- ─── Function privileges ────────────────────────────────────────────────────

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.submit_quiz_result(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB),
  public.get_pool_version(),
  public.replace_matches(JSONB, TEXT),
  public.get_user_matches(UUID),
  public.notify_matches(UUID)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.get_my_notifications(BOOLEAN),
  public.mark_notifications_read(UUID[]),
  public.get_admin_dashboard(DOUBLE PRECISION, DOUBLE PRECISION)
TO authenticated;

-- Objects added later start closed; each new table or function must be
-- granted explicitly. The PUBLIC revoke must be global (per-schema default
-- privileges can only add).
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

COMMIT;
