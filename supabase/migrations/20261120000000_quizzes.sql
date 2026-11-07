-- Migración: Quizzes rompehielos (Gustos, Gaming, Picante 18+)
-- Fecha: 2026-11-20
-- Propósito: tablas para quizzes, respuestas, visibilidad y consentimiento; RPC de coincidencias
-- Idempotente: sí, usa IF NOT EXISTS y IF EXISTS

-- ============================================================================
-- 1. Tablas base
-- ============================================================================

-- Intento de quiz completado (una fila por persona por quiz)
CREATE TABLE IF NOT EXISTS quiz_attempts (
  persona_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  completado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (persona_id, quiz_id)
);

-- Respuestas individuales (una fila por ítem respondido)
CREATE TABLE IF NOT EXISTS quiz_answers (
  persona_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  valor TEXT NOT NULL, -- opción seleccionada o JSON array para múltiple
  PRIMARY KEY (persona_id, quiz_id, item_id)
);

-- Visibilidad por quiz (nivel de compartir)
CREATE TABLE IF NOT EXISTS quiz_sharing (
  persona_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  nivel_visibilidad TEXT NOT NULL DEFAULT 'privado',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (persona_id, quiz_id),
  CONSTRAINT quiz_sharing_nivel_check CHECK (nivel_visibilidad IN ('privado', 'compartir_coincidencias_con_matches'))
);

-- Consentimiento para Picante (una fila por persona que lo aceptó)
CREATE TABLE IF NOT EXISTS quiz_picante_consent (
  persona_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE PRIMARY KEY,
  mayor_de_edad BOOLEAN NOT NULL,
  consentimiento_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  track_romance_activo BOOLEAN NOT NULL DEFAULT false
);

-- ============================================================================
-- 2. Índices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_quiz_answers_persona_quiz ON quiz_answers(persona_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sharing_persona ON quiz_sharing(persona_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_persona ON quiz_attempts(persona_id);

-- ============================================================================
-- 3. Permisos y RLS
-- ============================================================================

-- Revocar permisos de anon y authenticated
REVOKE ALL ON quiz_attempts FROM anon, authenticated;
REVOKE ALL ON quiz_answers FROM anon, authenticated;
REVOKE ALL ON quiz_sharing FROM anon, authenticated;
REVOKE ALL ON quiz_picante_consent FROM anon, authenticated;

-- Otorgar permisos solo a service_role
GRANT ALL ON quiz_attempts TO service_role;
GRANT ALL ON quiz_answers TO service_role;
GRANT ALL ON quiz_sharing TO service_role;
GRANT ALL ON quiz_picante_consent TO service_role;

-- Activar RLS
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_picante_consent ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. RPC: quiz_coincidencias
-- ============================================================================

CREATE OR REPLACE FUNCTION quiz_coincidencias(
  p_yo UUID,
  p_otra_persona UUID,
  p_quiz_id TEXT
)
RETURNS TABLE (item_id TEXT, valor TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verificar que ambas tengan visibilidad activada para este quiz
  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_sharing
    WHERE persona_id = p_yo
      AND quiz_id = p_quiz_id
      AND nivel_visibilidad = 'compartir_coincidencias_con_matches'
  ) THEN
    RETURN; -- Sin coincidencias si yo no compartí
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quiz_sharing
    WHERE persona_id = p_otra_persona
      AND quiz_id = p_quiz_id
      AND nivel_visibilidad = 'compartir_coincidencias_con_matches'
  ) THEN
    RETURN; -- Sin coincidencias si la otra persona no compartió
  END IF;

  -- Verificar que haya match vigente entre yo y la otra persona
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE (person_a = p_yo AND person_b = p_otra_persona)
       OR (person_a = p_otra_persona AND person_b = p_yo)
  ) THEN
    RETURN; -- Sin match, sin coincidencias
  END IF;

  -- Para Picante, verificar que ambas tengan el track de romance activo
  IF p_quiz_id LIKE 'picante_%' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = p_yo AND track_romance = true
    ) THEN
      RETURN;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = p_otra_persona AND track_romance = true
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Devolver solo los ítems donde ambas respondieron lo mismo
  RETURN QUERY
  SELECT a.item_id, a.valor
  FROM public.quiz_answers a
  JOIN public.quiz_answers b
    ON a.quiz_id = b.quiz_id
    AND a.item_id = b.item_id
    AND a.valor = b.valor
  WHERE a.persona_id = p_yo
    AND b.persona_id = p_otra_persona
    AND a.quiz_id = p_quiz_id
    AND a.valor NOT IN ('no', 'prefiero_no_decir')
    AND b.valor NOT IN ('no', 'prefiero_no_decir');
END;
$$;

-- Revocar permisos de anon y authenticated de la RPC
REVOKE ALL ON FUNCTION quiz_coincidencias(UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION quiz_coincidencias(UUID, UUID, TEXT) TO service_role;

-- ============================================================================
-- 5. Funciones de servicio para el servidor
-- ============================================================================

-- Guardar respuesta de quiz
CREATE OR REPLACE FUNCTION private.quiz_save_answer(
  p_persona_id UUID,
  p_quiz_id TEXT,
  p_item_id TEXT,
  p_valor TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.quiz_answers (persona_id, quiz_id, item_id, valor)
  VALUES (p_persona_id, p_quiz_id, p_item_id, p_valor)
  ON CONFLICT (persona_id, quiz_id, item_id)
  DO UPDATE SET valor = EXCLUDED.valor;
END;
$$;

-- Marcar quiz como completado
CREATE OR REPLACE FUNCTION private.quiz_mark_completed(
  p_persona_id UUID,
  p_quiz_id TEXT,
  p_revision TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.quiz_attempts (persona_id, quiz_id, revision, completado_en)
  VALUES (p_persona_id, p_quiz_id, p_revision, NOW())
  ON CONFLICT (persona_id, quiz_id)
  DO UPDATE SET revision = EXCLUDED.revision, completado_en = NOW();
END;
$$;

-- Actualizar visibilidad de quiz
CREATE OR REPLACE FUNCTION private.quiz_set_sharing(
  p_persona_id UUID,
  p_quiz_id TEXT,
  p_nivel TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.quiz_sharing (persona_id, quiz_id, nivel_visibilidad, actualizado_en)
  VALUES (p_persona_id, p_quiz_id, p_nivel, NOW())
  ON CONFLICT (persona_id, quiz_id)
  DO UPDATE SET nivel_visibilidad = EXCLUDED.nivel_visibilidad, actualizado_en = NOW();
END;
$$;

-- Borrar respuestas de un quiz
CREATE OR REPLACE FUNCTION private.quiz_delete_answers(
  p_persona_id UUID,
  p_quiz_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.quiz_answers
  WHERE persona_id = p_persona_id
    AND (p_quiz_id IS NULL OR quiz_id = p_quiz_id);

  DELETE FROM public.quiz_attempts
  WHERE persona_id = p_persona_id
    AND (p_quiz_id IS NULL OR quiz_id = p_quiz_id);

  DELETE FROM public.quiz_sharing
  WHERE persona_id = p_persona_id
    AND (p_quiz_id IS NULL OR quiz_id = p_quiz_id);
END;
$$;

-- Guardar consentimiento de Picante
CREATE OR REPLACE FUNCTION private.quiz_picante_save_consent(
  p_persona_id UUID,
  p_mayor_de_edad BOOLEAN,
  p_track_romance_activo BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.quiz_picante_consent (persona_id, mayor_de_edad, consentimiento_en, track_romance_activo)
  VALUES (p_persona_id, p_mayor_de_edad, NOW(), p_track_romance_activo)
  ON CONFLICT (persona_id)
  DO UPDATE SET mayor_de_edad = EXCLUDED.mayor_de_edad, consentimiento_en = NOW(), track_romance_activo = EXCLUDED.track_romance_activo;
END;
$$;

-- Leer consentimiento de Picante
CREATE OR REPLACE FUNCTION private.quiz_picante_get_consent(
  p_persona_id UUID
)
RETURNS TABLE (mayor_de_edad BOOLEAN, consentimiento_en TIMESTAMPTZ, track_romance_activo BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT c.mayor_de_edad, c.consentimiento_en, c.track_romance_activo
  FROM public.quiz_picante_consent c
  WHERE c.persona_id = p_persona_id;
END;
$$;

-- ============================================================================
-- 6. Verificación post-migración
-- ============================================================================

DO $$
BEGIN
  -- Verificar que las tablas existen
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('quiz_attempts', 'quiz_answers', 'quiz_sharing', 'quiz_picante_consent')) = 4,
    'Faltan tablas de quizzes';

  -- Verificar que la RPC existe
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'quiz_coincidencias') > 0,
    'Falta la RPC quiz_coincidencias';

  RAISE NOTICE 'Migración de quizzes completada exitosamente';
END $$;
