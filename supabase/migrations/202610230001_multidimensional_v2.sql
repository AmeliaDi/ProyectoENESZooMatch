-- ============================================================
-- ZooMatch v2: Multidimensional Dual-Track Matching Schema
-- Migration: 202610230001_multidimensional_v2.sql
-- ============================================================
-- NOTE: This migration is ADDITIVE. It does NOT drop v1 tables.
-- Both schemas coexist until v2 is fully validated.
--
-- Vector lengths (from src/types/microtest-v2.ts):
--   Romance vector:  26 dimensions (BigFive 5 + Identity 2 + Cultural 5 + Intimacy 8 + Values 6)
--   Friendship vector: 16 dimensions (BigFive 5 + Cultural 5 + Values 6)
--
-- Reuses from v1 migration (202610220001_secure_matching.sql):
--   private.cosine_similarity(double precision[], double precision[])
--   private.is_admin(uuid)

BEGIN;

-- ─── 1. Catalog Tables ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.animals (
  id TEXT PRIMARY KEY,
  nombre_fuente TEXT NOT NULL,
  diminutivo_es TEXT NOT NULL UNIQUE,
  categoria_fauna TEXT NOT NULL CHECK (categoria_fauna IN ('anfibio','mamifero','ave','pez','insecto','reptil','crustaceo','molusco','equinodermo','cnidario')),
  personality_affinity JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.colors (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  hex CHAR(7) NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  textura TEXT NOT NULL CHECK (textura IN ('cristalina','mate','sedosa','metalica','terrosa','acuosa','luminosa','aterciopelada')),
  temperatura TEXT NOT NULL CHECK (temperatura IN ('frio','calido','neutro'))
);

-- ─── 2. Quiz Items v2 ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quiz_items_v2 (
  id TEXT PRIMARY KEY,
  categoria TEXT NOT NULL CHECK (categoria IN ('personalidad_bigfive','personalidad_mbti','identidad_filtros','afinidad_cultural','intimidad_afecto','valores_relacionales')),
  subcategoria TEXT,
  prompt TEXT NOT NULL,
  tipo_respuesta TEXT NOT NULL CHECK (tipo_respuesta IN ('likert_5','seleccion_multiple')),
  opciones JSONB,
  polarity TEXT CHECK (polarity IN ('positiva','negativa') OR polarity IS NULL),
  weights JSONB NOT NULL DEFAULT '{}',
  track_romance BOOLEAN NOT NULL DEFAULT true,
  track_amistad BOOLEAN NOT NULL DEFAULT true,
  filtro_duro BOOLEAN NOT NULL DEFAULT false,
  campo_perfil TEXT CHECK (campo_perfil IS NULL OR campo_perfil IN ('orientacion_sexual','identidad_genero','tipo_relacion_busca')),
  source_id TEXT
);

-- ─── 3. Profiles v2 ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles_v2 (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  matricula_hash TEXT NOT NULL UNIQUE CHECK (matricula_hash ~ '^[0-9a-f]{64}$'),
  alias TEXT UNIQUE,
  animal_id TEXT REFERENCES public.animals(id),
  color_id TEXT REFERENCES public.colors(id),
  narrative TEXT,
  -- Hard filters (GIN-indexed arrays for fast overlap queries)
  orientacion_sexual TEXT[] NOT NULL DEFAULT '{}',
  identidad_genero TEXT[] NOT NULL DEFAULT '{}',
  tipo_relacion_busca TEXT[] NOT NULL DEFAULT '{}',
  -- Dual matching vectors
  romance_vector DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  amistad_vector DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  -- Full dimension scores
  dimension_scores JSONB NOT NULL DEFAULT '{}',
  mbti_code CHAR(4) CHECK (mbti_code IS NULL OR mbti_code ~ '^[IE][NS][TF][JP]$'),
  -- Timestamps
  quiz_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Vector length constraints (only enforced when quiz is completed)
  CONSTRAINT valid_romance_length CHECK (romance_vector = '{}' OR array_length(romance_vector, 1) = 26),
  CONSTRAINT valid_amistad_length CHECK (amistad_vector = '{}' OR array_length(amistad_vector, 1) = 16)
);

-- ─── 4. Quiz Responses v2 ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quiz_responses_v2 (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES public.quiz_items_v2(id),
  likert_value SMALLINT CHECK (likert_value BETWEEN 1 AND 5),
  selected_options TEXT[],
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT response_type_check CHECK (
    (likert_value IS NOT NULL AND selected_options IS NULL) OR
    (likert_value IS NULL AND selected_options IS NOT NULL)
  )
);

-- ─── 5. Matches v2 (dual track) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.matches_v2 (
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('romance','amistad')),
  similarity DOUBLE PRECISION NOT NULL CHECK (similarity > 0 AND similarity <= 1),
  badges JSONB NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b, track),
  CONSTRAINT ordered_pair CHECK (user_a < user_b)
);

-- ─── 6. Notifications ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('match_romance','match_amistad','no_match','welcome')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 7. Indexes ───────────────────────────────────────────────

-- Hard filter GIN indices for fast array overlap
CREATE INDEX IF NOT EXISTS idx_profiles_v2_orientacion ON public.profiles_v2 USING GIN (orientacion_sexual);
CREATE INDEX IF NOT EXISTS idx_profiles_v2_genero ON public.profiles_v2 USING GIN (identidad_genero);
CREATE INDEX IF NOT EXISTS idx_profiles_v2_relacion ON public.profiles_v2 USING GIN (tipo_relacion_busca);

-- Match lookups
CREATE INDEX IF NOT EXISTS idx_matches_v2_user_b ON public.matches_v2(user_b, track);
CREATE INDEX IF NOT EXISTS idx_matches_v2_similarity ON public.matches_v2(track, similarity DESC);

-- Notification queries (partial index for unread)
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, created_at DESC) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

-- Profile lookups for admin
CREATE INDEX IF NOT EXISTS idx_profiles_v2_animal ON public.profiles_v2(animal_id);
CREATE INDEX IF NOT EXISTS idx_profiles_v2_color ON public.profiles_v2(color_id);

-- ─── 8. Updated timestamp trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION private.update_profiles_v2_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_v2_updated ON public.profiles_v2;
CREATE TRIGGER profiles_v2_updated
  BEFORE UPDATE ON public.profiles_v2
  FOR EACH ROW EXECUTE FUNCTION private.update_profiles_v2_timestamp();

-- ─── 9. Row Level Security ────────────────────────────────────

-- Enable RLS on all new tables
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_items_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_responses_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Public read for catalogs and quiz items
CREATE POLICY "animals_public_read" ON public.animals FOR SELECT USING (true);
CREATE POLICY "colors_public_read" ON public.colors FOR SELECT USING (true);
CREATE POLICY "quiz_items_v2_public_read" ON public.quiz_items_v2 FOR SELECT USING (true);

-- Profiles: own data or admin only
CREATE POLICY "profiles_v2_own_read" ON public.profiles_v2
  FOR SELECT USING (
    user_id = auth.uid() OR private.is_admin(auth.uid())
  );

-- Quiz responses: own data only
CREATE POLICY "quiz_responses_v2_own_read" ON public.quiz_responses_v2
  FOR SELECT USING (user_id = auth.uid());

-- Matches: participant or admin
CREATE POLICY "matches_v2_participant_read" ON public.matches_v2
  FOR SELECT USING (
    user_a = auth.uid() OR user_b = auth.uid() OR private.is_admin(auth.uid())
  );

-- Notifications: own only
CREATE POLICY "notifications_own_read" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_own_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Revoke direct DML from anon/authenticated (only via SECURITY DEFINER RPCs)
REVOKE INSERT, UPDATE, DELETE ON public.animals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.colors FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.quiz_items_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profiles_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.quiz_responses_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.matches_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;

-- ─── 10. RPC Functions ────────────────────────────────────────

-- 10a. Cosine similarity (reuse from v1 if private schema exists, else create)
-- NOTE: private.cosine_similarity already exists from v1 migration. We reuse it.

-- 10b. Submit quiz result v2
CREATE OR REPLACE FUNCTION public.submit_quiz_result_v2(
  p_user_id UUID,
  p_answers JSONB,            -- array of {itemId, value} for likert + {itemId, selected} for filters
  p_dimension_scores JSONB,   -- all 30 normalized dimension scores
  p_romance_vector DOUBLE PRECISION[],
  p_amistad_vector DOUBLE PRECISION[],
  p_mbti_code TEXT,
  p_hard_filters JSONB,       -- {orientacion_sexual: [], identidad_genero: [], tipo_relacion_busca: []}
  p_animal_id TEXT,
  p_color_id TEXT,
  p_narrative TEXT,
  p_alias TEXT
) RETURNS TABLE(alias TEXT, animal_id TEXT, color_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  -- Validate caller is service_role
  IF auth.jwt() ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate vectors
  IF array_length(p_romance_vector, 1) != 26 THEN
    RAISE EXCEPTION 'Romance vector must have 26 dimensions';
  END IF;
  IF array_length(p_amistad_vector, 1) != 16 THEN
    RAISE EXCEPTION 'Friendship vector must have 16 dimensions';
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles_v2 (
    user_id, matricula_hash, alias, animal_id, color_id, narrative,
    orientacion_sexual, identidad_genero, tipo_relacion_busca,
    romance_vector, amistad_vector, dimension_scores, mbti_code, quiz_completed_at
  ) VALUES (
    p_user_id,
    (SELECT matricula_hash FROM public.profiles WHERE id = p_user_id),
    p_alias, p_animal_id, p_color_id, p_narrative,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_hard_filters->'orientacion_sexual')), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_hard_filters->'identidad_genero')), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_hard_filters->'tipo_relacion_busca')), '{}'),
    p_romance_vector, p_amistad_vector, p_dimension_scores, p_mbti_code, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    alias = EXCLUDED.alias,
    animal_id = EXCLUDED.animal_id,
    color_id = EXCLUDED.color_id,
    narrative = EXCLUDED.narrative,
    orientacion_sexual = EXCLUDED.orientacion_sexual,
    identidad_genero = EXCLUDED.identidad_genero,
    tipo_relacion_busca = EXCLUDED.tipo_relacion_busca,
    romance_vector = EXCLUDED.romance_vector,
    amistad_vector = EXCLUDED.amistad_vector,
    dimension_scores = EXCLUDED.dimension_scores,
    mbti_code = EXCLUDED.mbti_code,
    quiz_completed_at = now(),
    updated_at = now();

  -- Store individual responses
  -- (parse p_answers JSON array and upsert each)
  DELETE FROM public.quiz_responses_v2 WHERE user_id = p_user_id;
  INSERT INTO public.quiz_responses_v2 (user_id, item_id, likert_value, selected_options)
  SELECT
    p_user_id,
    elem->>'itemId',
    CASE WHEN elem->>'value' IS NOT NULL THEN (elem->>'value')::SMALLINT END,
    CASE WHEN elem->'selected' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(elem->'selected')) END
  FROM jsonb_array_elements(p_answers) AS elem;

  RETURN QUERY SELECT p_alias, p_animal_id, p_color_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_result_v2 TO service_role;

-- 10c. Compute dual matches
CREATE OR REPLACE FUNCTION public.compute_dual_matches(
  p_user_id UUID,
  p_romance_threshold DOUBLE PRECISION DEFAULT 0.80,
  p_amistad_threshold DOUBLE PRECISION DEFAULT 0.75
) RETURNS TABLE(track TEXT, other_user UUID, similarity DOUBLE PRECISION, badges JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_user profiles_v2%ROWTYPE;
  v_romance_count INTEGER := 0;
  v_amistad_count INTEGER := 0;
BEGIN
  IF auth.jwt() ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_romance_threshold < 0.5 OR p_romance_threshold >= 1.0 THEN
    RAISE EXCEPTION 'Romance threshold must be in [0.5, 1.0)';
  END IF;
  IF p_amistad_threshold < 0.5 OR p_amistad_threshold >= 1.0 THEN
    RAISE EXCEPTION 'Amistad threshold must be in [0.5, 1.0)';
  END IF;

  SELECT * INTO v_user FROM public.profiles_v2 WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Delete existing matches for this user (both tracks, both directions)
  DELETE FROM public.matches_v2 WHERE user_a = p_user_id OR user_b = p_user_id;

  -- ROMANCE TRACK: hard filters + weighted cosine
  -- Insert matches where hard filters pass AND similarity > threshold
  WITH candidates AS (
    SELECT p2.user_id, p2.romance_vector,
           p2.orientacion_sexual, p2.identidad_genero, p2.tipo_relacion_busca
    FROM public.profiles_v2 p2
    WHERE p2.user_id != p_user_id
      AND p2.quiz_completed_at IS NOT NULL
      -- Hard filter: orientation overlap
      AND (
        v_user.orientacion_sexual && p2.orientacion_sexual
        OR 'todxs' = ANY(v_user.orientacion_sexual)
        OR 'todxs' = ANY(p2.orientacion_sexual)
        OR 'prefiero no decir' = ANY(v_user.orientacion_sexual)
        OR 'prefiero no decir' = ANY(p2.orientacion_sexual)
      )
      -- Hard filter: relationship type compatibility
      AND (
        v_user.tipo_relacion_busca && p2.tipo_relacion_busca
        OR 'sin_definir' = ANY(v_user.tipo_relacion_busca)
        OR 'sin_definir' = ANY(p2.tipo_relacion_busca)
        OR 'anarquia_relacional' = ANY(v_user.tipo_relacion_busca)
        OR 'anarquia_relacional' = ANY(p2.tipo_relacion_busca)
      )
  ),
  scored AS (
    SELECT c.user_id,
           private.cosine_similarity(v_user.romance_vector, c.romance_vector) AS sim
    FROM candidates c
  )
  INSERT INTO public.matches_v2 (user_a, user_b, track, similarity, badges)
  SELECT
    LEAST(p_user_id, s.user_id),
    GREATEST(p_user_id, s.user_id),
    'romance',
    s.sim,
    private.dimension_badges_v2(v_user.romance_vector,
      (SELECT romance_vector FROM profiles_v2 WHERE user_id = s.user_id),
      'romance')
  FROM scored s
  WHERE s.sim > p_romance_threshold
  ON CONFLICT (user_a, user_b, track) DO UPDATE SET
    similarity = EXCLUDED.similarity,
    badges = EXCLUDED.badges,
    computed_at = now();

  GET DIAGNOSTICS v_romance_count = ROW_COUNT;

  -- FRIENDSHIP TRACK: no hard filters, just cosine on amistad_vector
  WITH scored AS (
    SELECT p2.user_id,
           private.cosine_similarity(v_user.amistad_vector, p2.amistad_vector) AS sim
    FROM public.profiles_v2 p2
    WHERE p2.user_id != p_user_id
      AND p2.quiz_completed_at IS NOT NULL
  )
  INSERT INTO public.matches_v2 (user_a, user_b, track, similarity, badges)
  SELECT
    LEAST(p_user_id, s.user_id),
    GREATEST(p_user_id, s.user_id),
    'amistad',
    s.sim,
    private.dimension_badges_v2(v_user.amistad_vector,
      (SELECT amistad_vector FROM profiles_v2 WHERE user_id = s.user_id),
      'amistad')
  FROM scored s
  WHERE s.sim > p_amistad_threshold
  ON CONFLICT (user_a, user_b, track) DO UPDATE SET
    similarity = EXCLUDED.similarity,
    badges = EXCLUDED.badges,
    computed_at = now();

  GET DIAGNOSTICS v_amistad_count = ROW_COUNT;

  -- Return results
  RETURN QUERY
  SELECT m.track,
         CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END AS other_user,
         m.similarity, m.badges
  FROM public.matches_v2 m
  WHERE m.user_a = p_user_id OR m.user_b = p_user_id
  ORDER BY m.track, m.similarity DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_dual_matches TO service_role;

-- 10d. Badge generation helper (private)
CREATE OR REPLACE FUNCTION private.dimension_badges_v2(
  vec_a DOUBLE PRECISION[],
  vec_b DOUBLE PRECISION[],
  p_track TEXT
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_dims TEXT[] := CASE
    WHEN p_track = 'romance' THEN ARRAY[
      'personalidad_apertura','personalidad_responsabilidad','personalidad_extraversion',
      'personalidad_amabilidad','personalidad_estabilidad_emocional',
      'identidad_exclusividad','identidad_comunicacion_afectiva',
      'cultural_musica_exploracion','cultural_estetica_visual','cultural_hobbies_creativos',
      'cultural_vida_universitaria','cultural_humor',
      'intimidad_palabras_afirmacion','intimidad_tiempo_calidad','intimidad_regalos_detalle',
      'intimidad_contacto_fisico','intimidad_actos_servicio','intimidad_apertura_emocional',
      'intimidad_comunicacion_deseos','intimidad_limites_respeto',
      'valores_empatia','valores_confianza','valores_gestion_conflicto',
      'valores_igualdad_genero','valores_corresponsabilidad','valores_respeto_diversidad'
    ]
    ELSE ARRAY[
      'personalidad_apertura','personalidad_responsabilidad','personalidad_extraversion',
      'personalidad_amabilidad','personalidad_estabilidad_emocional',
      'cultural_musica_exploracion','cultural_estetica_visual','cultural_hobbies_creativos',
      'cultural_vida_universitaria','cultural_humor',
      'valores_empatia','valores_confianza','valores_gestion_conflicto',
      'valores_igualdad_genero','valores_corresponsabilidad','valores_respeto_diversidad'
    ]
  END;
  v_limit INT := CASE WHEN p_track = 'romance' THEN 5 ELSE 3 END;
  v_badges JSONB := '[]'::JSONB;
  v_affinities FLOAT[] := '{}';
  i INT;
BEGIN
  FOR i IN 1..array_length(v_dims, 1) LOOP
    v_affinities := array_append(v_affinities, 1.0 - ABS(vec_a[i] - vec_b[i]));
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object(
    'dimension', selected.dimension,
    'affinity', selected.affinity
  ) ORDER BY selected.affinity DESC, selected.idx)
  INTO v_badges
  FROM (
    SELECT
      s.idx,
      v_dims[s.idx] AS dimension,
      v_affinities[s.idx] AS affinity
    FROM generate_subscripts(v_dims, 1) AS s(idx)
    ORDER BY v_affinities[s.idx] DESC, s.idx
    LIMIT v_limit
  ) AS selected;

  RETURN COALESCE(v_badges, '[]'::JSONB);
END;
$$;

-- 10e. Get my matches v2 (for authenticated users)
CREATE OR REPLACE FUNCTION public.get_my_matches_v2()
RETURNS TABLE(
  track TEXT,
  other_alias TEXT,
  other_animal TEXT,
  other_color TEXT,
  similarity DOUBLE PRECISION,
  badges JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    m.track,
    p.alias AS other_alias,
    COALESCE(a.diminutivo_es, '') AS other_animal,
    COALESCE(c.nombre, '') AS other_color,
    m.similarity,
    m.badges
  FROM public.matches_v2 m
  JOIN public.profiles_v2 p ON p.user_id = CASE WHEN m.user_a = v_uid THEN m.user_b ELSE m.user_a END
  LEFT JOIN public.animals a ON a.id = p.animal_id
  LEFT JOIN public.colors c ON c.id = p.color_id
  WHERE m.user_a = v_uid OR m.user_b = v_uid
  ORDER BY m.track, m.similarity DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches_v2 TO authenticated;

-- 10f. Create notifications for matches
CREATE OR REPLACE FUNCTION public.notify_matches_v2(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_count INTEGER := 0;
  v_user profiles_v2%ROWTYPE;
  v_romance_matches INTEGER;
  v_amistad_matches INTEGER;
BEGIN
  IF auth.jwt() ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_user FROM public.profiles_v2 WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Count matches per track
  SELECT COUNT(*) INTO v_romance_matches
  FROM public.matches_v2
  WHERE (user_a = p_user_id OR user_b = p_user_id) AND track = 'romance';

  SELECT COUNT(*) INTO v_amistad_matches
  FROM public.matches_v2
  WHERE (user_a = p_user_id OR user_b = p_user_id) AND track = 'amistad';

  -- Delete old unread notifications for this user (avoid duplicates)
  DELETE FROM public.notifications WHERE user_id = p_user_id AND read = false;

  -- Create appropriate notifications
  IF v_romance_matches > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (p_user_id, 'match_romance',
      'El universo conspiró a tu favor 💫',
      CASE
        WHEN v_romance_matches = 1 THEN
          '¡Oye! Tienes a un ser extraordinario en el campus con quien podrías tener una química increíble. Tu energía de ' ||
          COALESCE((SELECT a.diminutivo_es FROM animals a WHERE a.id = v_user.animal_id), 'tu animalito') || ' ' ||
          COALESCE((SELECT c.nombre FROM colors c WHERE c.id = v_user.color_id), 'tu color') ||
          ' combinó a la perfección.'
        ELSE
          '¡Oye! Tienes a ' || v_romance_matches || ' seres extraordinarios en el campus con los que podrías tener una química increíble. Tu energía de ' ||
          COALESCE((SELECT a.diminutivo_es FROM animals a WHERE a.id = v_user.animal_id), 'tu animalito') || ' ' ||
          COALESCE((SELECT c.nombre FROM colors c WHERE c.id = v_user.color_id), 'tu color') ||
          ' resonó con cada unx de ellxs.'
      END,
      jsonb_build_object('match_count', v_romance_matches, 'track', 'romance')
    );
    v_count := v_count + 1;
  END IF;

  IF v_amistad_matches > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (p_user_id, 'match_amistad',
      'Tu vibra resonó con alguien ✨',
      CASE
        WHEN v_amistad_matches = 1 THEN
          '¡Hey! Tu energía de ' ||
          COALESCE((SELECT a.diminutivo_es FROM animals a WHERE a.id = v_user.animal_id), 'tu animalito') || ' ' ||
          COALESCE((SELECT c.nombre FROM colors c WHERE c.id = v_user.color_id), 'tu color') ||
          ' conectó con alguien del campus. Hay una química de amistad que vale la pena explorar.'
        ELSE
          '¡Hey! Tu energía de ' ||
          COALESCE((SELECT a.diminutivo_es FROM animals a WHERE a.id = v_user.animal_id), 'tu animalito') || ' ' ||
          COALESCE((SELECT c.nombre FROM colors c WHERE c.id = v_user.color_id), 'tu color') ||
          ' resonó con ' || v_amistad_matches || ' personas del campus. Hay amistades esperando florecer.'
      END,
      jsonb_build_object('match_count', v_amistad_matches, 'track', 'amistad')
    );
    v_count := v_count + 1;
  END IF;

  IF v_romance_matches = 0 AND v_amistad_matches = 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, metadata)
    VALUES (p_user_id, 'no_match',
      'Tu momento llegará 🌱',
      'Aún no llega ese ser especial a la base de datos, pero tranquilx, tu vibra es única y esto es solo un proyecto de estadística, no una medida de tu inmenso valor <3',
      '{}'::JSONB
    );
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_matches_v2 TO service_role;

-- 10g. Get my notifications
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_unread_only BOOLEAN DEFAULT true)
RETURNS TABLE(id UUID, type TEXT, title TEXT, body TEXT, metadata JSONB, read BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT n.id, n.type, n.title, n.body, n.metadata, n.read, n.created_at
  FROM public.notifications n
  WHERE n.user_id = auth.uid()
    AND (NOT p_unread_only OR n.read = false)
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_notifications TO authenticated;

-- 10h. Mark notifications read
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE user_id = auth.uid() AND id = ANY(p_ids) AND read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read TO authenticated;

-- 10i. Admin dashboard v2
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_v2(
  p_romance_threshold DOUBLE PRECISION DEFAULT 0.80,
  p_amistad_threshold DOUBLE PRECISION DEFAULT 0.75
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'generatedAt', now()::TEXT,
    'romanceThreshold', p_romance_threshold,
    'amistadThreshold', p_amistad_threshold,
    'totalProfiles', (SELECT COUNT(*) FROM public.profiles_v2 WHERE quiz_completed_at IS NOT NULL),
    'romanceMatches', (SELECT COUNT(*) FROM public.matches_v2 WHERE track = 'romance'),
    'amistadMatches', (SELECT COUNT(*) FROM public.matches_v2 WHERE track = 'amistad'),
    'usersWithRomanceMatch', (
      SELECT COUNT(DISTINCT user_id) FROM (
        SELECT user_a AS user_id FROM public.matches_v2 WHERE track = 'romance'
        UNION
        SELECT user_b FROM public.matches_v2 WHERE track = 'romance'
      ) u
    ),
    'usersWithAmistadMatch', (
      SELECT COUNT(DISTINCT user_id) FROM (
        SELECT user_a AS user_id FROM public.matches_v2 WHERE track = 'amistad'
        UNION
        SELECT user_b FROM public.matches_v2 WHERE track = 'amistad'
      ) u
    ),
    'topAnimals', (
      SELECT jsonb_agg(jsonb_build_object('animal', t.diminutivo_es, 'count', t.cnt))
      FROM (
        SELECT a.diminutivo_es, COUNT(*) AS cnt
        FROM public.profiles_v2 p
        JOIN public.animals a ON a.id = p.animal_id
        GROUP BY a.diminutivo_es
        ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'topColors', (
      SELECT jsonb_agg(jsonb_build_object('color', t.nombre, 'count', t.cnt))
      FROM (
        SELECT c.nombre, COUNT(*) AS cnt
        FROM public.profiles_v2 p
        JOIN public.colors c ON c.id = p.color_id
        GROUP BY c.nombre
        ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'mbtiDistribution', (
      SELECT jsonb_object_agg(COALESCE(mbti_code, 'UNKNOWN'), cnt)
      FROM (SELECT mbti_code, COUNT(*) AS cnt FROM public.profiles_v2 GROUP BY mbti_code) sub
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_v2 TO authenticated;

COMMIT;
