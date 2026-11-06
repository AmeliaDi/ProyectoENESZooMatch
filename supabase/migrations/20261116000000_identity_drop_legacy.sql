-- ============================================================================
-- Identidad única y fija: paso 2 de 2 — borrar lo que ya nadie lee
--
-- NO se aplica hasta que:
--   1. el build nuevo está en producción y verificado (`npm run check` + smoke
--      E2E + `docs/CHANGELOG_IDENTIDAD.md` con los ids tocados), y
--   2. `scripts/identity-backfill.mts --check` reporta 0 filas provisionales.
--
-- Antes de aplicar:
--   node --no-warnings scripts/db-backup.mts --out .backups/pre-identidad-paso2
--   node --no-warnings scripts/db-restore.mts --from .backups/pre-identidad-paso2 --dry-run
--
-- El borrado es en transacción y condicional: si queda alguna fila que todavía
-- depende de `profiles.alias` (build antiguo, fila provisional o alias huérfano)
-- la excepción hace rollback de todo y no se pierde nada. Es idempotente: cada
-- objeto usa DROP ... IF EXISTS / CREATE OR REPLACE y `DROP COLUMN IF EXISTS`,
-- así que volver a ejecutarlo sobre un esquema ya limpio no hace nada.
--
-- Cada objeto que leía o escribía la columna se reescribe aquí antes de borrarla,
-- copiado del paso 1 menos la línea que la tocaba: `reject_identity_mutation` y
-- su trigger (comparaban `OLD.alias`), `hatch_profile_identity` (escribía
-- `alias`), `admin_reset_quiz` (la limpiaba) y `notify_matches` (leía el respaldo
-- heredado). `get_user_matches`, `admin_list_users`, `admin_list_reports` y
-- `get_admin_dashboard` dejaron de leerla en el paso 1, así que no se tocan:
-- reescribirlos aquí sería una segunda ruta de lectura, justo lo que se corrige.
-- ============================================================================

BEGIN;

-- ─── 1. Precondiciones: el paso 1 ya no puede tener filas a medio congelar ───

DO $$
DECLARE
  v_provisional INTEGER;
  v_huerfanos INTEGER;
  v_bajas INTEGER;
BEGIN
  -- Solo perfiles vivos: `identity-backfill.mts` recorre `eliminado_en IS NULL` y
  -- no congela a quien ya se fue, así que exigirles la marca habría hecho este
  -- paso inalcanzable. Esas filas se van con la purga de retención junto con sus
  -- matches; se cuentan y se avisan, no se ignoran en silencio.
  SELECT count(*) INTO v_bajas
  FROM public.profiles
  WHERE estado_identidad = 'eclosionado' AND eclosionado_en IS NULL
    AND eliminado_en IS NOT NULL;
  IF v_bajas > 0 THEN
    RAISE NOTICE '% bajas lógicas siguen sin congelar; las retira la purga de retención',
      v_bajas USING ERRCODE = '01000';
  END IF;

  SELECT count(*) INTO v_provisional
  FROM public.profiles
  WHERE estado_identidad = 'eclosionado' AND eclosionado_en IS NULL
    AND eliminado_en IS NULL;
  IF v_provisional > 0 THEN
    RAISE EXCEPTION '% perfiles siguen con alias heredado sin congelar; ejecuta scripts/identity-backfill.mts primero',
      v_provisional USING ERRCODE = '22023';
  END IF;

  -- Alias duplicados o con animal/color que no coinciden con el texto: el
  -- backfill debió resolverlos antes de permitir este paso.
  SELECT count(*) INTO v_huerfanos
  FROM public.profiles
  WHERE estado_identidad = 'eclosionado' AND eliminado_en IS NULL
    AND (alias_completo IS DISTINCT FROM alias
         OR alias_completo NOT LIKE alias_animal || ' ' || alias_color || ' %');
  IF v_huerfanos > 0 THEN
    RAISE EXCEPTION '% alias no coinciden con sus partes guardadas', v_huerfanos
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ─── 2. Escrituras: la única fila de nombre que existe es alias_completo ─────

CREATE OR REPLACE FUNCTION private.reject_identity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_is_full_reset BOOLEAN;
BEGIN
  IF OLD.eclosionado_en IS NULL THEN
    RETURN NEW;
  END IF;

  -- Único cambio permitido: el reinicio administrativo, que devuelve la
  -- persona a huevo borrando la identidad completa.
  v_is_full_reset := NEW.estado_identidad = 'huevo'
    AND NEW.animal_id IS NULL AND NEW.color_id IS NULL
    AND NEW.alias_completo IS NULL
    AND NEW.enneagram_code IS NULL
    AND NEW.eclosionado_en IS NULL;

  IF NOT v_is_full_reset AND (
       NEW.animal_id      IS DISTINCT FROM OLD.animal_id
    OR NEW.color_id       IS DISTINCT FROM OLD.color_id
    OR NEW.alias_animal   IS DISTINCT FROM OLD.alias_animal
    OR NEW.alias_color    IS DISTINCT FROM OLD.alias_color
    OR NEW.alias_sufijo   IS DISTINCT FROM OLD.alias_sufijo
    OR NEW.alias_completo IS DISTINCT FROM OLD.alias_completo
    OR NEW.enneagram_code IS DISTINCT FROM OLD.enneagram_code
    OR NEW.estado_identidad <> OLD.estado_identidad
  ) THEN
    RAISE EXCEPTION 'identity is frozen after hatching (user %)', OLD.user_id
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;


-- El trigger también se re-declara: `UPDATE OF alias` depende de la columna y
-- Postgres no dejaría borrarla mientras el trigger la nombre.
DROP TRIGGER IF EXISTS profiles_identity_immutable ON public.profiles;
CREATE TRIGGER profiles_identity_immutable
  BEFORE UPDATE OF animal_id, color_id, alias_animal, alias_color,
                  alias_sufijo, alias_completo, enneagram_code, estado_identidad, eclosionado_en
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_identity_mutation();

CREATE OR REPLACE FUNCTION public.hatch_profile_identity(
  p_user_id UUID,
  p_animal_id TEXT,
  p_color_id TEXT,
  p_alias_animal TEXT,
  p_alias_color TEXT,
  p_alias_sufijo TEXT,
  p_alias_completo TEXT,
  p_enneagram_code TEXT,
  p_narrative TEXT,
  p_avatar_mark TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alias TEXT;
  v_estado TEXT;
  v_congelado TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_service_role();

  IF p_alias_completo !~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)* · [BCDFGHJKLMNPQRSTVWXYZ]{4}$'
     OR char_length(p_alias_completo) > 64
     OR p_alias_completo IS DISTINCT FROM p_alias_animal || ' ' || p_alias_color || ' · ' || p_alias_sufijo THEN
    RAISE EXCEPTION 'alias "% · %" has an invalid format', p_alias_animal, p_alias_sufijo
      USING ERRCODE = '22023';
  END IF;
  IF p_enneagram_code IS NOT NULL AND p_enneagram_code !~ '^[1-9](w[1-9])?$' THEN
    RAISE EXCEPTION 'enneagram readout "%" is outside the type/wing format', p_enneagram_code
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.animals WHERE id = p_animal_id)
     OR NOT EXISTS (SELECT 1 FROM public.colors WHERE id = p_color_id) THEN
    RAISE EXCEPTION 'animal % or color % is outside the catalogue', p_animal_id, p_color_id
      USING ERRCODE = '22023';
  END IF;

  -- Bloqueo de fila: ante dos envíos concurrentes gana el primero y el
  -- segundo devuelve la identidad ya guardada sin tocarla.
  SELECT estado_identidad, eclosionado_en, alias_completo
    INTO v_estado, v_congelado, v_alias
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado = 'eclosionado' AND v_congelado IS NOT NULL THEN
    RETURN v_alias;
  END IF;

  -- Colisión de alias: el índice único es la última barrera. Aquí se rechaza
  -- y el servidor reintenta con el siguiente sufijo determinista.
  IF EXISTS (SELECT 1 FROM public.profiles
             WHERE alias_completo = p_alias_completo AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'alias % is already taken', p_alias_completo USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles SET
    estado_identidad = 'eclosionado',
    animal_id = p_animal_id,
    color_id = p_color_id,
    alias_animal = p_alias_animal,
    alias_color = p_alias_color,
    alias_sufijo = p_alias_sufijo,
    alias_completo = p_alias_completo,
    enneagram_code = p_enneagram_code,
    narrative = p_narrative,
    avatar_mark = p_avatar_mark,
    color_asignado_en = COALESCE(color_asignado_en, now()),
    eclosionado_en = now()
  WHERE user_id = p_user_id
  RETURNING public.profiles.alias_completo INTO v_alias;

  RETURN v_alias;
END;
$$;

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
    estado_identidad = 'huevo',
    animal_id = NULL,
    color_id = NULL,
    color_asignado_en = NULL,
    avatar_mark = NULL,
    narrative = NULL,
    alias_animal = NULL,
    alias_color = NULL,
    alias_sufijo = NULL,
    alias_completo = NULL,
    enneagram_code = NULL,
    eclosionado_en = NULL,
    revelacion_vista = false,
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

-- ─── 2b. La única lectura con respaldo heredado ──────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_matches(p_user_id UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity TEXT;
  v_estado TEXT;
  v_romance integer;
  v_amistad integer;
  v_romance_hash TEXT;
  v_amistad_hash TEXT;
  v_last_romance_hash TEXT;
  v_last_romance_count integer;
  v_last_amistad_hash TEXT;
  v_last_amistad_count integer;
  v_last_any_type TEXT;
  v_count integer := 0;
BEGIN
  PERFORM private.assert_service_role();

  -- El texto de la notificación usa el nombre guardado, tal como lo ve la
  -- propia persona en todas las pantallas. Un huevo no recibe avisos de
  -- matches, porque todavía no existe con quién coincidir.
  SELECT p.alias_completo, p.estado_identidad
    INTO v_identity, v_estado
  FROM public.profiles AS p
  WHERE p.user_id = p_user_id AND p.eliminado_en IS NULL;
  IF NOT FOUND OR v_estado = 'huevo' OR v_identity IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    count(*) FILTER (WHERE m.track = 'romance'),
    count(*) FILTER (WHERE m.track = 'amistad'),
    md5(string_agg(
      (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text,
      ',' ORDER BY (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text
    ) FILTER (WHERE m.track = 'romance')),
    md5(string_agg(
      (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text,
      ',' ORDER BY (CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END)::text
    ) FILTER (WHERE m.track = 'amistad'))
  INTO v_romance, v_amistad, v_romance_hash, v_amistad_hash
  FROM public.matches AS m
  WHERE m.user_a = p_user_id OR m.user_b = p_user_id;

  SELECT
    n.metadata ->> 'match_set_hash',
    (n.metadata ->> 'match_count')::integer
  INTO v_last_romance_hash, v_last_romance_count
  FROM public.notifications AS n
  WHERE n.user_id = p_user_id AND n.type = 'match_romance'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  SELECT
    n.metadata ->> 'match_set_hash',
    (n.metadata ->> 'match_count')::integer
  INTO v_last_amistad_hash, v_last_amistad_count
  FROM public.notifications AS n
  WHERE n.user_id = p_user_id AND n.type = 'match_amistad'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  SELECT type INTO v_last_any_type
  FROM public.notifications
  WHERE user_id = p_user_id AND type IN ('match_romance', 'match_amistad', 'no_match')
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_romance > 0 THEN
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'no_match';

    IF v_last_romance_hash IS DISTINCT FROM v_romance_hash
       AND (v_last_romance_hash IS NOT NULL OR v_last_romance_count IS DISTINCT FROM v_romance) THEN
      DELETE FROM public.notifications
      WHERE user_id = p_user_id AND read = false AND type = 'match_romance';

      INSERT INTO public.notifications (user_id, type, title, body, metadata)
      VALUES (p_user_id, 'match_romance', 'El universo conspiró a tu favor',
        CASE WHEN v_romance = 1
          THEN 'Tu energía de ' || v_identity
               || ' encontró una resonancia especial en el campus. Hay alguien con quien la química fluye de forma única.'
          ELSE 'Tienes a ' || v_romance || ' seres extraordinarios en el campus con los que podrías tener una química increíble. Tu energía de '
               || v_identity || ' resonó con cada unx de ellxs.'
        END,
        jsonb_build_object('match_count', v_romance, 'track', 'romance', 'match_set_hash', v_romance_hash));
      v_count := v_count + 1;
    END IF;
  ELSE
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'match_romance';
  END IF;

  IF v_amistad > 0 THEN
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'no_match';

    IF v_last_amistad_hash IS DISTINCT FROM v_amistad_hash
       AND (v_last_amistad_hash IS NOT NULL OR v_last_amistad_count IS DISTINCT FROM v_amistad) THEN
      DELETE FROM public.notifications
      WHERE user_id = p_user_id AND read = false AND type = 'match_amistad';

      INSERT INTO public.notifications (user_id, type, title, body, metadata)
      VALUES (p_user_id, 'match_amistad',
        CASE WHEN v_amistad = 1 THEN 'Tu vibra resonó con alguien' ELSE 'Tu vibra resonó con el campus' END,
        CASE WHEN v_amistad = 1
          THEN 'Tu energía de ' || v_identity
               || ' encontró una conexión de amistad genuina en el campus. Hay alguien cuyo espíritu complementa el tuyo.'
          ELSE 'Tu energía de ' || v_identity || ' resonó con ' || v_amistad
               || ' personas del campus. Hay amistades esperando florecer — sus personalidades y gustos se complementan de forma hermosa.'
        END,
        jsonb_build_object('match_count', v_amistad, 'track', 'amistad', 'match_set_hash', v_amistad_hash));
      v_count := v_count + 1;
    END IF;
  ELSE
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'match_amistad';
  END IF;

  IF v_romance = 0 AND v_amistad = 0 AND v_last_any_type IS DISTINCT FROM 'no_match' THEN
    -- Mismo texto que `NO_MATCH_MESSAGE` en domain/messages/notification-copy.ts:
    -- la copia del motor de mensajes es la única, también dentro del SQL.
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (p_user_id, 'no_match', 'Tu momento llegará',
      'aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor <3');
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

-- ─── 3. Restricciones completas: sin la salida de emergencia provisional ─────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_identity_shape;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_identity_shape CHECK (
    -- La fila ya no es visible cuando `eliminado_en` está escrito: la regla de oro
    -- habla de identidades que alguien puede ver, y estas filas esperan la purga de
    -- retención (7 días de gracia). Exigirles el congelamiento habría hecho este
    -- paso dependiente de un job, no del backfill.
    eliminado_en IS NOT NULL
    OR CASE estado_identidad
      WHEN 'huevo' THEN
        animal_id IS NULL AND color_id IS NULL AND alias_completo IS NULL
        AND alias_animal IS NULL AND alias_color IS NULL AND alias_sufijo IS NULL
        AND enneagram_code IS NULL AND eclosionado_en IS NULL
      ELSE
        animal_id IS NOT NULL AND color_id IS NOT NULL
        AND alias_completo IS NOT NULL
        AND alias_animal IS NOT NULL AND alias_color IS NOT NULL AND alias_sufijo IS NOT NULL
        AND eclosionado_en IS NOT NULL
    END
  );

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_alias_completo_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_alias_completo_format CHECK (
    -- Misma exención: el texto heredado de una baja lógica puede conservar un
    -- sufijo ilegal; no se muestra y se va con la purga.
    eliminado_en IS NOT NULL
    OR estado_identidad = 'huevo'
    OR (
      char_length(alias_completo) BETWEEN 8 AND 64
      AND alias_completo ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)* · [BCDFGHJKLMNPQRSTVWXYZ]{4}$'
      AND alias_completo = alias_animal || ' ' || alias_color || ' · ' || alias_sufijo
      AND alias_sufijo ~ '^[BCDFGHJKLMNPQRSTVWXYZ]{4}$'
      AND alias_animal ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$'
      AND alias_color ~ '^[a-záéíóúüñ]+( [a-záéíóúüñ]+)*$'
    )
  );

-- ─── 4. Se borra la columna duplicada y la firma legacy que la escribía ──────

DROP FUNCTION IF EXISTS public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], BOOLEAN, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.submit_quiz_result(
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
  p_latent_profile JSONB,
  p_avatar_mark TEXT,
  p_completed_modules TEXT[],
  p_alias_animal TEXT DEFAULT NULL,
  p_alias_color TEXT DEFAULT NULL,
  p_alias_sufijo TEXT DEFAULT NULL,
  p_enneagram_code TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
  v_alias TEXT;
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

  SELECT estado_identidad INTO v_estado
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not initialized: enter with matricula first' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET
    narrative = p_narrative,
    orientacion_sexual = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'orientacion_sexual', '[]'))),
    identidad_genero = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'identidad_genero', '[]'))),
    tipo_relacion_busca = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_hard_filters -> 'tipo_relacion_busca', '[]'))),
    romance_vector = p_romance_vector,
    amistad_vector = p_amistad_vector,
    dimension_scores = p_dimension_scores,
    mbti_code = p_mbti_code,
    latent_profile = p_latent_profile,
    avatar_mark = CASE WHEN v_estado = 'eclosionado' THEN p_avatar_mark ELSE public.profiles.avatar_mark END,
    completed_modules = COALESCE(p_completed_modules, '{}'),
    quiz_completed_at = now()
  WHERE user_id = p_user_id;

  -- Sin `p_alias` que ignorar: las tres partes son la única entrada, y el
  -- huevo que no las trae sigue siendo huevo hasta que las traiga.
  IF v_estado = 'huevo'
     AND p_animal_id IS NOT NULL AND p_color_id IS NOT NULL
     AND p_alias_animal IS NOT NULL AND p_alias_color IS NOT NULL AND p_alias_sufijo IS NOT NULL THEN
    v_alias := public.hatch_profile_identity(
      p_user_id, p_animal_id, p_color_id,
      p_alias_animal, p_alias_color, p_alias_sufijo,
      p_alias_animal || ' ' || p_alias_color || ' · ' || p_alias_sufijo,
      p_enneagram_code, p_narrative, p_avatar_mark
    );
  ELSE
    SELECT alias_completo INTO v_alias FROM public.profiles WHERE user_id = p_user_id;
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

ALTER TABLE public.profiles DROP COLUMN IF EXISTS alias;

REVOKE ALL ON FUNCTION public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_result(
  UUID, JSONB, JSONB, DOUBLE PRECISION[], DOUBLE PRECISION[], TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
