-- ============================================================================
-- ZooMatch — Fase 5: Idempotent match notifications (notify_matches)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run.
-- Prevents notification flooding on global match recomputation: a user receives
-- a new match_romance / match_amistad / no_match notification ONLY when their
-- counterpart set on that track actually changes (tracked via opaque md5 hash
-- match_set_hash in metadata, never storing raw counterpart UUIDs).
-- ============================================================================

BEGIN;

-- Deduplicate any existing multiple unread match notifications per (user_id, type),
-- keeping only the newest unread notification per track.
DELETE FROM public.notifications AS n
WHERE n.read = false
  AND n.type IN ('match_romance', 'match_amistad', 'no_match')
  AND EXISTS (
    SELECT 1
    FROM public.notifications AS newer
    WHERE newer.user_id = n.user_id
      AND newer.type = n.type
      AND newer.read = false
      AND (newer.created_at > n.created_at OR (newer.created_at = n.created_at AND newer.id > n.id))
  );

CREATE OR REPLACE FUNCTION public.notify_matches(p_user_id UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity TEXT;
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

  SELECT COALESCE(a.diminutivo_es, 'tu animalito') || ' ' || COALESCE(c.nombre, 'tu color')
  INTO v_identity
  FROM public.profiles AS p
  LEFT JOIN public.animals AS a ON a.id = p.animal_id
  LEFT JOIN public.colors AS c ON c.id = p.color_id
  WHERE p.user_id = p_user_id AND p.eliminado_en IS NULL;
  IF NOT FOUND THEN
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
          THEN '¡Oye! Tienes a un ser extraordinario en el campus con quien podrías tener una química increíble. Tu energía de '
               || v_identity || ' resonó de forma especial.'
          ELSE '¡Oye! Tienes a ' || v_romance || ' seres extraordinarios en el campus con los que podrías tener una química increíble. Tu energía de '
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
      VALUES (p_user_id, 'match_amistad', 'Tu vibra resonó con alguien',
        CASE WHEN v_amistad = 1
          THEN '¡Hey! Tu energía de ' || v_identity
               || ' conectó con alguien del campus. Hay una química de amistad que vale la pena explorar.'
          ELSE '¡Hey! Tu energía de ' || v_identity || ' resonó con ' || v_amistad
               || ' personas del campus. Hay amistades esperando florecer.'
        END,
        jsonb_build_object('match_count', v_amistad, 'track', 'amistad', 'match_set_hash', v_amistad_hash));
      v_count := v_count + 1;
    END IF;
  ELSE
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'match_amistad';
  END IF;

  IF v_romance = 0 AND v_amistad = 0 AND v_last_any_type IS DISTINCT FROM 'no_match' THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (p_user_id, 'no_match', 'Tu momento llegará',
      'Aún no llega ese ser especial a la base de datos, pero tranquilx, tu vibra es única y esto es solo un proyecto de estadística, no una medida de tu inmenso valor <3');
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_matches(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_matches(UUID) TO service_role;

COMMIT;
