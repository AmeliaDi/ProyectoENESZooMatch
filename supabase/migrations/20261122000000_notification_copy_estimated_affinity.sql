-- ─── Notificaciones: la copia describe la afinidad estimada, no un desenlace ─
--
-- Por qué. `notify_matches` es quien escribe los avisos que llegan a la campana,
-- y su texto vivía aparte del de `domain/messages/notification-copy.ts`: dos
-- rutas para una misma frase, con la consecuencia de que el TS pudo corregirse
-- sin corregir lo que la gente lee. Esta migración pega el texto del SQL al de
-- `NOTIFICATION_COPY` (literal por literal, y `notification-copy.test.ts` falla
-- si vuelven a separarse) y quita las promesas de desenlace relacional:
-- "el universo conspiró", "tu momento llegará", "podrías tener una química
-- increíble", "hay amistades esperando florecer". Lo que queda dice lo único
-- que el motor sabe: que la afinidad estimada quedó arriba del filtro.
--
-- Alcance de los datos: solo filas `read = false`. Un aviso ya leído es
-- historial de esa persona y se va con la retención; reescribirlo sería editar
-- algo que alguien efectivamente leyó.

BEGIN;

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

      -- La función solo conoce el nombre de quien recibe el aviso: el de la
      -- contraparte se ve en el resultado, así que aquí va la variante "hidden".
      INSERT INTO public.notifications (user_id, type, title, body, metadata)
      VALUES (p_user_id, 'match_romance', 'Tu energía resonó en el hábitat',
        CASE WHEN v_romance = 1
          THEN replace('Tu energía de {nombre} quedó arriba del filtro. La afinidad estimada es alta; el nombre de quien es lo ves en tu resultado.', '{nombre}', v_identity)
          ELSE replace(replace('Tu energía de {nombre} quedó arriba del filtro junto a {n} personas del campus. La afinidad estimada es alta con cada unx; lo que puedan hacer con eso se ve platicando.', '{nombre}', v_identity), '{n}', v_romance::text)
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
          THEN replace('Tu energía de {nombre} resonó arriba del filtro de amistad. Los puntos en común ya están; el nombre de quien es lo ves en tu resultado.', '{nombre}', v_identity)
          ELSE replace(replace('Tu energía de {nombre} resonó arriba del filtro de amistad con {n} personas del campus. Hay amistades con terreno compartido; lo que sigue se ve platicando.', '{nombre}', v_identity), '{n}', v_amistad::text)
        END,
        jsonb_build_object('match_count', v_amistad, 'track', 'amistad', 'match_set_hash', v_amistad_hash));
      v_count := v_count + 1;
    END IF;
  ELSE
    DELETE FROM public.notifications
    WHERE user_id = p_user_id AND read = false AND type = 'match_amistad';
  END IF;

  IF v_romance = 0 AND v_amistad = 0 AND v_last_any_type IS DISTINCT FROM 'no_match' THEN
    -- Mismo texto que `NOTIFICATION_COPY.no_match` en
    -- domain/messages/notification-copy.ts: la copia del motor de mensajes es
    -- la única, también dentro del SQL.
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (p_user_id, 'no_match', 'Aún no hay resonancias en el hábitat',
      'aun no aparece nadie arriba del filtro pero tranquilx, solo es un proyecto de estadistica, no de amor <3');
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

-- ─── Los avisos sin leer que aún prometen un destino ─────────────────────────

UPDATE public.notifications AS n
SET title = 'Tu energía resonó en el hábitat',
    body = CASE WHEN (n.metadata ->> 'match_count')::int > 1
      THEN replace(replace('Tu energía de {nombre} quedó arriba del filtro junto a {n} personas del campus. La afinidad estimada es alta con cada unx; lo que puedan hacer con eso se ve platicando.', '{nombre}', p.alias_completo), '{n}', (n.metadata ->> 'match_count'))
      ELSE replace('Tu energía de {nombre} quedó arriba del filtro. La afinidad estimada es alta; el nombre de quien es lo ves en tu resultado.', '{nombre}', p.alias_completo)
    END
FROM public.profiles AS p
WHERE p.user_id = n.user_id
  AND n.read = false
  AND n.type = 'match_romance'
  AND n.title = 'El universo conspiró a tu favor';

UPDATE public.notifications AS n
SET title = CASE WHEN (n.metadata ->> 'match_count')::int > 1
      THEN 'Tu vibra resonó con el campus' ELSE 'Tu vibra resonó con alguien' END,
    body = CASE WHEN (n.metadata ->> 'match_count')::int > 1
      THEN replace(replace('Tu energía de {nombre} resonó arriba del filtro de amistad con {n} personas del campus. Hay amistades con terreno compartido; lo que sigue se ve platicando.', '{nombre}', p.alias_completo), '{n}', (n.metadata ->> 'match_count'))
      ELSE replace('Tu energía de {nombre} resonó arriba del filtro de amistad. Los puntos en común ya están; el nombre de quien es lo ves en tu resultado.', '{nombre}', p.alias_completo)
    END
FROM public.profiles AS p
WHERE p.user_id = n.user_id
  AND n.read = false
  AND n.type = 'match_amistad'
  AND n.title IN ('Tu vibra resonó con alguien', 'Tu vibra resonó con el campus');

UPDATE public.notifications
SET title = 'Aún no hay resonancias en el hábitat',
    body = 'aun no aparece nadie arriba del filtro pero tranquilx, solo es un proyecto de estadistica, no de amor <3'
WHERE read = false
  AND (title = 'Tu momento llegará'
       OR body = 'aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor <3');

UPDATE public.notifications AS n
SET body = replace('Tu esencia de {nombre} ya está registrada y tu nombre queda fijo: ya no cambia. Cuando alguien compatible entre al hábitat, te lo avisamos.', '{nombre}', p.alias_completo)
FROM public.profiles AS p
WHERE p.user_id = n.user_id
  AND n.read = false
  AND n.type = 'welcome'
  AND n.body LIKE '%el universo te lo hará saber%';

UPDATE public.notifications AS n
SET body = replace('Revisamos tu identidad con la regla nueva y tu nombre quedó fijo: {nombre}. Ya no cambia, aunque completes más módulos.', '{nombre}', p.alias_completo)
FROM public.profiles AS p
WHERE p.user_id = n.user_id
  AND n.read = false
  AND n.type = 'identity'
  AND n.body LIKE '%fijo para siempre%';

COMMIT;
