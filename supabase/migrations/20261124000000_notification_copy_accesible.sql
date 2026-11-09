-- ─── Notificaciones: dos frases que se pueden leer en voz alta ───────────────
--
-- Idempotente: `CREATE OR REPLACE` sobre `notify_matches`, así que se puede
-- volver a aplicar sobre un esquema con datos.
--
-- Por qué. ADR-053 dejó una regla de copia: toda frase que ve una persona tiene
-- que poder decirse en voz alta y la tiene que poder leer un lector de pantalla.
-- El marcador «-x» no cumple ninguna de las dos: no tiene sonido, y quien usa
-- lector de pantalla se queda con la palabra partida. Dos avisos de
-- `notify_matches` seguían escribiéndolo («con cada unx», «tranquilx»), y el
-- aviso de «todavía no hay nadie» además estaba en minúsculas, sin acentos y con
-- un «<3» — la copia de notificación ya se prohíbe emojis en
-- `schema.test.ts`, y la guía de tono pide cuando mucho dos frases.
--
-- Una sola copia. `notification-copy.test.ts` exige que cada frase canónica
-- aparezca literal en la migración más nueva de este texto, así que el
-- `CREATE OR REPLACE` de abajo lleva el cuerpo copiado de
-- 20261122000000 con los dos literales cambiados, y las `UPDATE` finales
-- reafirman la copia vigente en los avisos sin leer de los demás tipos.
--
-- Alcance de los datos: solo filas `read = false`. Un aviso ya leído es
-- historial de esa persona y reescribirlo sería editar algo que efectivamente
-- leyó.

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
          ELSE replace(replace('Tu energía de {nombre} quedó arriba del filtro junto a {n} personas del campus. La afinidad estimada es alta con cada una de esas personas; lo que puedan hacer con eso se ve platicando.', '{nombre}', v_identity), '{n}', v_romance::text)
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
      'Todavía no aparece nadie arriba del filtro. No es un veredicto sobre ti ni sobre el amor: cuando entre más gente al hábitat, esto se mueve.');
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;
-- ─── Los avisos sin leer que aún llevan el marcador «-x» ─────────────────────

UPDATE public.notifications
SET body = replace(body, 'es alta con cada unx;', 'es alta con cada una de esas personas;')
WHERE read = false
  AND type = 'match_romance'
  AND body LIKE '%con cada unx%';

UPDATE public.notifications
SET body = 'Todavía no aparece nadie arriba del filtro. No es un veredicto sobre ti ni sobre el amor: cuando entre más gente al hábitat, esto se mueve.'
WHERE read = false
  AND type = 'no_match'
  AND body LIKE '%tranquilx%';

-- Reafirmar la copia canónica donde el texto vivo ya no coincide con ella.
UPDATE public.notifications AS n
SET body = replace('Tu esencia de {nombre} ya está registrada y tu nombre queda fijo: ya no cambia. Cuando alguien compatible entre al hábitat, te lo avisamos.', '{nombre}', p.alias_completo)
FROM public.profiles AS p
WHERE p.user_id = n.user_id
  AND n.read = false
  AND n.type = 'welcome'
  AND n.body IS DISTINCT FROM replace('Tu esencia de {nombre} ya está registrada y tu nombre queda fijo: ya no cambia. Cuando alguien compatible entre al hábitat, te lo avisamos.', '{nombre}', p.alias_completo);

UPDATE public.notifications AS n
SET body = replace('Revisamos tu identidad con la regla nueva y tu nombre quedó fijo: {nombre}. Ya no cambia, aunque completes más módulos.', '{nombre}', p.alias_completo)
FROM public.profiles AS p
WHERE p.user_id = n.user_id
  AND n.read = false
  AND n.type = 'identity'
  AND n.body IS DISTINCT FROM replace('Revisamos tu identidad con la regla nueva y tu nombre quedó fijo: {nombre}. Ya no cambia, aunque completes más módulos.', '{nombre}', p.alias_completo);

COMMIT;
