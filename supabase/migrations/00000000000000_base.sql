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
  -- Timestamp of the base color assignment (fixed across optional-module refinements).
  color_asignado_en TIMESTAMPTZ,
  -- Enneagram subtype mark on the sprite (identity layer, docs/AVATARES.md).
  avatar_mark TEXT CHECK (avatar_mark IS NULL OR avatar_mark IN ('sp', 'so', 'sx')),
  -- Opt-in: third parties see the wing tone and subtype mark only when true.
  show_avatar_detail BOOLEAN NOT NULL DEFAULT false,
  -- Opt-in reading layers shown to third parties as bands (ADR-030).
  shared_layers TEXT[] NOT NULL DEFAULT '{}' CONSTRAINT profiles_shared_layers_known CHECK (shared_layers <@ ARRAY[
    'hexaco', 'big_five', 'mbti', 'eneagrama', 'valores', 'relacional', 'afecto', 'estilo'
  ]::TEXT[]),
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
  -- Optional deepening modules completed (layers beyond the core). More
  -- modules narrow the posterior; nothing is imputed (ADR-016, ADR-021).
  completed_modules TEXT[] NOT NULL DEFAULT '{}' CHECK (completed_modules <@ ARRAY[
    'hexaco_facetas', 'puente_big_five', 'valores', 'actitudes', 'intereses',
    'estilo_vida', 'relacional', 'mbti', 'eneagrama', 'subtipo'
  ]::TEXT[]),
  mbti_code CHAR(4) CHECK (mbti_code IS NULL OR mbti_code ~ '^[IE][NS][TF][JP]$'),
  inclusive_mode TEXT NOT NULL DEFAULT 'neutro_universal' CHECK (inclusive_mode IN (
    'femenino', 'masculino', 'neutro_e', 'neutro_universal'
  )),
  quiz_completed_at TIMESTAMPTZ,
  -- Paused profiles keep their data but leave the matching pool.
  paused_at TIMESTAMPTZ,
  -- Self-declared 18+ (ADR-035): romance chats need it on both sides.
  adult_confirmed_at TIMESTAMPTZ,
  -- Soft-delete timestamp for reversible profile merges and retention purges.
  eliminado_en TIMESTAMPTZ,
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
  type TEXT NOT NULL CONSTRAINT notifications_type_check CHECK (type IN ('match_romance', 'match_amistad', 'no_match', 'welcome', 'chat')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx
  ON public.notifications (user_id, created_at DESC) WHERE read = false;
CREATE UNIQUE INDEX notifications_welcome_unique_idx
  ON public.notifications (user_id) WHERE type = 'welcome';

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

CREATE TRIGGER profiles_pool_soft_deleted
  AFTER UPDATE OF eliminado_en ON public.profiles
  FOR EACH ROW
  WHEN (NEW.eliminado_en IS DISTINCT FROM OLD.eliminado_en AND NEW.quiz_completed_at IS NOT NULL)
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
  p_latent_profile JSONB,
  p_avatar_mark TEXT,
  p_completed_modules TEXT[],
  p_preserve_color BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alias TEXT;
  v_candidate TEXT := p_alias;
  v_attempt INTEGER := 0;
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

  -- A new alias that another profile already holds gets a deterministic
  -- suffix derived from the user id, so the UNIQUE constraint never blocks
  -- a submission (ADR-034). Existing aliases are untouched.
  WHILE v_candidate IS NOT NULL
        AND v_attempt < 8
        AND EXISTS (SELECT 1 FROM public.profiles
                    WHERE alias = v_candidate AND user_id <> p_user_id) LOOP
    v_attempt := v_attempt + 1;
    v_candidate := p_alias || '-' || upper(substr(md5(p_user_id::TEXT || v_attempt::TEXT), 1, 3));
  END LOOP;

  -- The alias is fixed at first assignment (ADR-024): retakes never rename.
  -- When p_preserve_color is true (optional module refinement), the existing
  -- color_id and color_asignado_en are preserved.
  UPDATE public.profiles SET
    alias = COALESCE(public.profiles.alias, v_candidate),
    animal_id = p_animal_id,
    color_id = CASE
      WHEN COALESCE(p_preserve_color, false) AND public.profiles.color_id IS NOT NULL
        THEN public.profiles.color_id
      ELSE p_color_id
    END,
    color_asignado_en = CASE
      WHEN COALESCE(p_preserve_color, false) AND public.profiles.color_id IS NOT NULL
        THEN COALESCE(public.profiles.color_asignado_en, now())
      ELSE now()
    END,
    avatar_mark = p_avatar_mark,
    narrative = p_narrative,
    orientacion_sexual = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'orientacion_sexual', '[]'))),
    identidad_genero = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'identidad_genero', '[]'))),
    tipo_relacion_busca = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'tipo_relacion_busca', '[]'))),
    romance_vector = p_romance_vector,
    amistad_vector = p_amistad_vector,
    dimension_scores = p_dimension_scores,
    mbti_code = p_mbti_code,
    latent_profile = p_latent_profile,
    completed_modules = COALESCE(p_completed_modules, '{}'),
    quiz_completed_at = now()
  WHERE user_id = p_user_id
  RETURNING public.profiles.alias INTO v_alias;

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

  RETURN v_alias;
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
  SELECT DISTINCT ON (m.track, LEAST(m.user_a, m.user_b), GREATEST(m.user_a, m.user_b))
    m.track,
    LEAST(m.user_a, m.user_b),
    GREATEST(m.user_a, m.user_b),
    m.similarity,
    COALESCE(m.badges, '[]')
  FROM jsonb_to_recordset(p_matches)
    AS m(track TEXT, user_a UUID, user_b UUID, similarity DOUBLE PRECISION, badges JSONB)
  WHERE m.user_a IS NOT NULL AND m.user_b IS NOT NULL AND m.user_a <> m.user_b
  ORDER BY m.track, LEAST(m.user_a, m.user_b), GREATEST(m.user_a, m.user_b), m.similarity DESC;

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

-- ─── Entry guard (ADR-023) ──────────────────────────────────────────────────
-- Throttles entry attempts per network address (ADR-026: the matrícula is the
-- only credential, so there are no per-account key failures to count).
-- Subjects are HMAC digests computed by the server: no raw IP or matrícula is
-- ever stored. Rows expire on their own; stale ones are swept on each hit.
CREATE TABLE private.access_guard (
  kind TEXT NOT NULL CONSTRAINT access_guard_kind_check CHECK (kind IN ('address_attempt', 'chat_pin_address', 'admin_address')),
  subject TEXT NOT NULL CHECK (subject ~ '^[0-9a-f]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (kind, subject)
);

-- Counts one hit and returns the seconds the subject stays locked (0 = allowed).
-- While locked, hits are not counted, so a lock never extends itself.
CREATE FUNCTION public.access_guard_hit(
  p_kind TEXT,
  p_subject TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER,
  p_lock_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row private.access_guard%ROWTYPE;
BEGIN
  PERFORM private.assert_service_role();
  IF p_limit < 1 OR p_window_seconds < 1 OR p_lock_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid guard policy' USING ERRCODE = '22023';
  END IF;

  DELETE FROM private.access_guard
  WHERE window_started_at < now() - interval '1 day'
    AND (locked_until IS NULL OR locked_until < now());

  INSERT INTO private.access_guard AS g (kind, subject, hits)
  VALUES (p_kind, p_subject, 1)
  ON CONFLICT (kind, subject) DO UPDATE SET
    hits = CASE
      WHEN g.locked_until IS NOT NULL AND g.locked_until > now() THEN g.hits
      WHEN g.window_started_at < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE g.hits + 1
    END,
    window_started_at = CASE
      WHEN g.locked_until IS NOT NULL AND g.locked_until > now() THEN g.window_started_at
      WHEN g.window_started_at < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE g.window_started_at
    END
  RETURNING * INTO v_row;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN ceil(extract(epoch FROM v_row.locked_until - now()))::INTEGER;
  END IF;

  IF v_row.hits > p_limit THEN
    UPDATE private.access_guard
    SET locked_until = now() + make_interval(secs => p_lock_seconds), hits = 0, window_started_at = now()
    WHERE kind = p_kind AND subject = p_subject;
    RETURN p_lock_seconds;
  END IF;

  RETURN 0;
END;
$$;

-- ─── Chat PIN lock (docs/CHAT.md, ADR-029) ────────────────────────────────
-- Mirrors 20261102000000_chat_pin.sql (the idempotent version for populated
-- projects). Server-only: RLS on and no policies. Failed guesses are an
-- aggregate in chat_pins, not one event per guess. Both tables cascade from
-- profiles, so deleting the account deletes them.
CREATE TABLE public.chat_pins (
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

CREATE TABLE public.chat_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'created', 'changed', 'paused', 'recovery_requested', 'recovery_cancelled', 'recovery_completed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_security_events_user_idx
  ON public.chat_security_events (user_id, created_at DESC);

-- Compare-and-swap token: every update bumps it, so two parallel PIN guesses
-- cannot both be charged against the same counter value.
CREATE FUNCTION private.chat_pins_bump_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_pins_bump_revision
  BEFORE UPDATE ON public.chat_pins
  FOR EACH ROW EXECUTE FUNCTION private.chat_pins_bump_revision();

ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_security_events ENABLE ROW LEVEL SECURITY;
-- chat_pins, chat_security_events: no policies on purpose (server-only).

REVOKE ALL ON public.chat_pins, public.chat_security_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_pins, public.chat_security_events TO service_role;


-- ─── Chat between matches (docs/CHAT.md §10, ADR-032) ──────────────────────
-- Mirrors 20261104000000_conversations.sql. Server-only: RLS on, no policies.
-- Everything cascades from profiles; leaving deletes the conversation and
-- both signals.
CREATE TABLE public.chat_interests (
  from_user UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_user, to_user, track),
  CONSTRAINT chat_interests_not_self CHECK (from_user <> to_user)
);
CREATE INDEX chat_interests_to_idx ON public.chat_interests (to_user, track);

CREATE TABLE public.conversations (
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
CREATE INDEX conversations_user_b_idx ON public.conversations (user_b);

CREATE TABLE public.conversation_answers (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  round SMALLINT NOT NULL CHECK (round BETWEEN 0 AND 5),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, author, round)
);

CREATE TABLE public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversation_messages_conv_idx
  ON public.conversation_messages (conversation_id, created_at DESC);

-- Only participants may write into a conversation; bumps the activity marker.
CREATE FUNCTION private.conversation_touch()
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

CREATE TRIGGER conversation_answers_touch
  AFTER INSERT ON public.conversation_answers
  FOR EACH ROW EXECUTE FUNCTION private.conversation_touch();
CREATE TRIGGER conversation_messages_touch
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION private.conversation_touch();

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

-- ─── Guided rounds, signals and chat safety (docs/CHAT.md §10–13, ADR-035) ──
-- Mirrors 20261106000000_chat_safety.sql. Server-only: RLS on, no policies.
ALTER TABLE public.chat_interests ADD COLUMN declined_at TIMESTAMPTZ;
ALTER TABLE public.conversations ADD COLUMN paused_by UUID;
ALTER TABLE public.conversations ADD COLUMN muted_a BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN muted_b BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversation_answers ADD COLUMN passed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversation_messages ADD COLUMN client_key UUID;

CREATE TABLE public.conversation_rounds (
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

CREATE TABLE public.conversation_reactions (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  idx SMALLINT NOT NULL CHECK (idx BETWEEN 0 AND 59),
  author UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, idx, author)
);

CREATE TABLE public.chat_feedback_daily (
  day DATE NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  liked INTEGER NOT NULL DEFAULT 0 CHECK (liked >= 0),
  not_liked INTEGER NOT NULL DEFAULT 0 CHECK (not_liked >= 0),
  PRIMARY KEY (day, track)
);

CREATE TABLE public.chat_blocks (
  blocker UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  blocked UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CONSTRAINT chat_blocks_not_self CHECK (blocker <> blocked)
);
CREATE INDEX chat_blocks_blocked_idx ON public.chat_blocks (blocked);

CREATE TABLE public.chat_closures (
  user_a UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance', 'amistad')),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b, track),
  CONSTRAINT chat_closures_ordered_pair CHECK (user_a < user_b)
);

CREATE TABLE public.chat_reports (
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
CREATE INDEX chat_reports_status_idx ON public.chat_reports (status, created_at DESC);

CREATE TABLE public.chat_report_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.chat_reports(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('viewed', 'revisado', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
CREATE UNIQUE INDEX conversation_messages_client_key_idx
  ON public.conversation_messages (conversation_id, author, client_key);
CREATE INDEX conversation_messages_author_idx
  ON public.conversation_messages (author, created_at DESC);

-- Only participants may ask; a new round bumps the activity marker.
CREATE FUNCTION private.conversation_round_touch()
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

CREATE TRIGGER conversation_rounds_touch
  AFTER INSERT ON public.conversation_rounds
  FOR EACH ROW EXECUTE FUNCTION private.conversation_round_touch();

-- Signals (docs/CHAT.md §10.1). Returns {"kind": ...}:
--   gone (no current match or a block), adult_required, cooldown, too_many,
--   sent (waiting), open (+ conversation).
CREATE FUNCTION public.express_chat_interest(
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
CREATE FUNCTION public.leave_conversation(p_id UUID, p_user UUID)
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
CREATE FUNCTION public.block_chat_user(p_blocker UUID, p_conversation UUID)
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
CREATE FUNCTION public.report_conversation(p_reporter UUID, p_conversation UUID, p_reason TEXT, p_snapshot INTEGER)
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
CREATE FUNCTION public.record_round_feedback(p_conversation UUID, p_user UUID, p_idx INTEGER, p_liked BOOLEAN)
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
CREATE FUNCTION public.purge_chat(p_message_days INTEGER, p_inactive_days INTEGER, p_signal_days INTEGER, p_cooldown_days INTEGER)
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

-- ─── Admin console (ADR-036) ────────────────────────────────────────────────
-- Mirrors 20261107000000_admin_panel.sql. Server-only: RLS on, no policies.
CREATE TABLE public.admin_credentials (
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

CREATE TABLE public.admin_audit (
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
CREATE INDEX admin_audit_created_idx ON public.admin_audit (created_at DESC);

CREATE FUNCTION private.admin_credentials_bump_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_credentials_bump_revision
  BEFORE UPDATE ON public.admin_credentials
  FOR EACH ROW EXECUTE FUNCTION private.admin_credentials_bump_revision();

-- One page of accounts with counts, newest first. Alias search is a plain
-- case-insensitive substring (wildcards escaped). Never returns the
-- matrícula hash, answers, vectors, θ or hard filters.
CREATE FUNCTION public.admin_list_users(p_search TEXT, p_user UUID, p_limit INTEGER, p_offset INTEGER)
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
CREATE FUNCTION public.admin_reset_quiz(p_user UUID)
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
    color_asignado_en = NULL,
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
CREATE FUNCTION public.admin_list_reports(p_status TEXT, p_limit INTEGER, p_offset INTEGER)
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
CREATE FUNCTION public.admin_review_report(p_admin UUID, p_report UUID, p_status TEXT)
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

ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
-- admin_credentials, admin_audit: no policies on purpose (server-only).

REVOKE ALL ON public.admin_credentials, public.admin_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_credentials, public.admin_audit TO service_role;
REVOKE ALL ON FUNCTION private.admin_credentials_bump_revision() FROM PUBLIC, anon, authenticated;

-- ─── Function privileges ────────────────────────────────────────────────────

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.submit_quiz_result(UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN),
  public.get_pool_version(),
  public.replace_matches(JSONB, TEXT),
  public.get_user_matches(UUID),
  public.notify_matches(UUID),
  public.access_guard_hit(TEXT, TEXT, INTEGER, INTEGER, INTEGER),
  public.express_chat_interest(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER),
  public.leave_conversation(UUID, UUID),
  public.block_chat_user(UUID, UUID),
  public.report_conversation(UUID, UUID, TEXT, INTEGER),
  public.record_round_feedback(UUID, UUID, INTEGER, BOOLEAN),
  public.purge_chat(INTEGER, INTEGER, INTEGER, INTEGER),
  public.admin_list_users(TEXT, UUID, INTEGER, INTEGER),
  public.admin_reset_quiz(UUID),
  public.admin_list_reports(TEXT, INTEGER, INTEGER),
  public.admin_review_report(UUID, UUID, TEXT)
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
