-- ============================================================================
-- ZooMatch — observatorio ampliado: contadores manuales, series diarias,
-- embudo, calidad de matching, composición y auditoría agregada
-- (ADR-036, piso k de ADR-012)
-- ============================================================================
-- Idempotent: safe to apply on a populated project and to re-run. Every
-- statement is `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
-- `DROP ... IF EXISTS` or a `REVOKE`/`GRANT` re-affirming the same posture,
-- so applying this file twice produces nothing different.
--
--   node --no-warnings scripts/db-backup.mts --out .backups/pre-observatorio
--   node scripts/db-apply.mjs --migration supabase/migrations/20261121000000_admin_observatorio.sql
--
-- Medido en producción el 2026-11-08, antes de este cambio: 221 perfiles (167
-- con cuestionario, todos eclosionados), 14 con `eliminado_en`, 0 con
-- `paused_at`, 995 filas de `matches` (276 romance, 719 amistad) con
-- similitud entre 0.4699 y 0.6663; el 87 % de las filas cae en [0.50, 0.60) y
-- NINGUNA por arriba de 0.70. Ese es el motivo del eje normalizado `z` que se
-- describe más abajo: un histograma de [0, 1] sería ocho cajas vacías y una
-- llena. Altas entre 2026-11-02 y 2026-11-08 (7 días de historia real), 23
-- filas de `admin_audit`, 64 perfiles con eneagrama y 25 con marca.
--
--   * public.admin_counters: el tanteo a mano de las relaciones que de verdad
--     ocurrieron, que ningún cálculo puede derivar. Solo service role (RLS
--     activo, sin políticas). La historia NO se duplica aquí: cada escritura
--     deja su fila en `admin_audit`, que ya sobrevive al borrado de cuentas.
--   * public.admin_audit acepta la acción 'counter_update' (duodécimo valor).
--   * public.admin_bump_counter: suma, resta o corrige y audita.
--   * private.live_pairs: el único sitio donde se define "par visible hoy".
--   * private.admin_iso_date: una fecha imposible se ignora, no revienta.
--   * public.get_admin_dashboard: recibe ventana y referencias de calibración
--     y devuelve además `series`, `embudo`, `eclosion`, `matching`,
--     `composicion`, `contadores` y `auditoria`.
--   * public.admin_list_users: acepta `p_filter` (JSONB) con filtros y orden.
--
-- Las firmas viejas de `get_admin_dashboard` (dos argumentos) y
-- `admin_list_users` (cuatro) NO se retiran: la consola desplegada hoy las
-- sigue llamando y dejarlas vivas es lo que evita que el panel se quede sin
-- lectura entre aplicar esta migración y publicar el frontend nuevo. Coexisten
-- sin ambigüedad porque las nuevas exigen todos sus parámetros (ninguno con
-- DEFAULT): `rpc()` de PostgREST resuelve por aridad, así que cuatro nombres
-- de argumento llaman a la vieja y cinco a la nueva.
--
-- Todo lo agregado respeta en la UI el piso k de `data/experience.json`
-- (k = 5): una celda por debajo se muestra "< 5". Ninguna consulta devuelve
-- matrícula, hash, respuestas, vectores, θ, filtros duros ni afinidades
-- individuales. Los modos de lenguaje (`inclusive_mode`) se excluyen a
-- propósito: cuatro celdas adyacentes a género sobre 221 personas no se
-- protegen con k = 5.
--
-- Las series agrupan por día UTC. `timestamptz::date` depende del GUC
-- `TimeZone`, así que ambas RPCs lo fijan a 'UTC' en su propia declaración en
-- vez de heredar el del servidor; coincide con la etiqueta `UTC` que la
-- consola ya muestra en `generatedAt`.
--
-- Dos predicados se repiten a propósito y conviene tenerlos a la vista:
--   presente   = quiz_completed_at IS NOT NULL AND paused_at IS NULL
--                AND eliminado_en IS NULL
--   par vivo   = ninguna de las dos partes tiene `eliminado_en`
-- `presente` es el denominador de las tasas nuevas; `par vivo` se resuelve en
-- `private.live_pairs` para que conteos, percentiles y bins hablen del mismo
-- conjunto. Los campos que ya existían conservan SU definición exacta
-- (incluido `totalProfiles`, que no filtra bajas suaves) para no mover de
-- golpe los números publicados.
-- ============================================================================

BEGIN;

-- ─── Contadores manuales ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_counters (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Claves que la consola sabe dibujar. Añadir una clave aquí basta para que
-- aparezca; la etiqueta vive en `src/ui/admin/admin-copy.ts`, no en la base.
INSERT INTO public.admin_counters (key) VALUES ('ligues'), ('novios')
  ON CONFLICT (key) DO NOTHING;

-- ─── Auditoría: una acción más ───────────────────────────────────────────────
ALTER TABLE public.admin_audit DROP CONSTRAINT IF EXISTS admin_audit_action_check;
ALTER TABLE public.admin_audit ADD CONSTRAINT admin_audit_action_check CHECK (action IN (
  'login', 'login_failed', 'logout', 'delete_user', 'reset_quiz', 'pause_user', 'resume_user',
  'reset_chat_pin', 'recompute', 'report_revisado', 'report_cerrado', 'counter_update'
));

-- ─── Un solo lugar para "par que alguien puede ver hoy" ─────────────────────
-- Las filas de `matches` cascadean contra `profiles`, no contra la baja suave
-- (migración 20261117), así que hasta que corre el purge un par muerto sigue
-- existiendo. `get_user_matches` ya filtra a la contraparte; las métricas
-- agregadas necesitan el mismo corte y lo piden aquí. No es una RPC: vive en
-- `private`, donde PostgREST no la ve, y sus columnas se llaman distinto a
-- las de `matches` para que el body no tenga referencias ambiguas.
CREATE OR REPLACE FUNCTION private.live_pairs(p_track TEXT)
RETURNS TABLE (a UUID, b UUID, sim DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.user_a, m.user_b, m.similarity
  FROM public.matches AS m
  WHERE m.track = p_track
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS x
      WHERE x.user_id IN (m.user_a, m.user_b) AND x.eliminado_en IS NOT NULL
    );
$$;

-- ─── Una fecha ISO real, o nada ─────────────────────────────────────────────
-- El filtro de rango aceptaba cualquier cosa con forma `AAAA-MM-DD`, pero
-- `'2026-02-30'::date` NO redondea: lanza 22008 y tumba la lectura entera del
-- panel. Medido en producción: `2026-02-30`, `2026-13-01` y `0000-01-01`
-- daban 400. Aquí el valor imposible se convierte en NULL, que es lo que ya
-- significa "sin filtro", en vez de convertirse en un error de pantalla.
CREATE OR REPLACE FUNCTION private.admin_iso_date(p_value TEXT)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_value !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::date;
EXCEPTION WHEN SQLSTATE '22008' THEN
  RETURN NULL;
END;
$$;

-- ─── Sumar, restar o corregir un contador, dejando rastro ───────────────────
-- Delta y valor absoluto comparten RPC. El movimiento se hace bajo
-- `FOR UPDATE` y el clamp a cero vive en la base: dos sesiones no se pisén y
-- la consola no puede fabricar un contador negativo.
CREATE OR REPLACE FUNCTION public.admin_bump_counter(
  p_key TEXT,
  p_admin UUID,
  p_delta INTEGER DEFAULT NULL,
  p_set INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before INTEGER;
  v_after INTEGER;
  v_alias TEXT;
BEGIN
  PERFORM private.assert_service_role();

  IF p_key !~ '^[a-z][a-z0-9_]{1,31}$' THEN
    RAISE EXCEPTION 'bad counter key' USING ERRCODE = '22023';
  END IF;
  IF (p_delta IS NULL AND p_set IS NULL) OR (p_delta IS NOT NULL AND p_set IS NOT NULL) THEN
    RAISE EXCEPTION 'exactly one of delta or set' USING ERRCODE = '22023';
  END IF;
  IF p_delta IS NOT NULL AND abs(p_delta) > 100 THEN
    RAISE EXCEPTION 'delta out of range' USING ERRCODE = '22023';
  END IF;
  IF p_set IS NOT NULL AND (p_set < 0 OR p_set > 100000) THEN
    RAISE EXCEPTION 'value out of range' USING ERRCODE = '22023';
  END IF;

  -- La clave puede llegar antes que el INSERT semilla de este archivo.
  INSERT INTO public.admin_counters (key) VALUES (p_key) ON CONFLICT (key) DO NOTHING;

  SELECT value INTO v_before FROM public.admin_counters WHERE key = p_key FOR UPDATE;

  IF p_set IS NOT NULL THEN
    v_after := p_set;
  ELSE
    v_after := GREATEST(0, v_before + p_delta);
  END IF;

  UPDATE public.admin_counters
     SET value = v_after, updated_at = now(), updated_by = p_admin
   WHERE key = p_key;

  SELECT alias_completo INTO v_alias FROM public.profiles WHERE user_id = p_admin;

  INSERT INTO public.admin_audit (admin_id, admin_alias, action, detail)
  VALUES (
    p_admin,
    v_alias,
    'counter_update',
    jsonb_build_object(
      'key', p_key,
      'antes', v_before,
      'despues', v_after,
      'delta', CASE WHEN p_set IS NULL THEN p_delta ELSE v_after - v_before END
    )
  );

  RETURN jsonb_build_object('key', p_key, 'value', v_after, 'antes', v_before);
END;
$$;

-- ─── Dashboard ampliado ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_dashboard(
  p_romance_threshold DOUBLE PRECISION,
  p_amistad_threshold DOUBLE PRECISION,
  p_romance_reference DOUBLE PRECISION,
  p_amistad_reference DOUBLE PRECISION,
  p_window_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_window_days, 30), 1), 120);
  v_day_from DATE := (date_trunc('day', now()) - ((v_days - 1) * interval '1 day'))::date;
  v_day_to DATE := date_trunc('day', now())::date;
  -- 0.25 de ancho deja 12 cajas sobre el eje `z`, hasta z = 3.
  v_width CONSTANT DOUBLE PRECISION := 0.25;
  v_series JSONB;
  v_embudo JSONB;
  v_eclosion JSONB;
  v_romance JSONB;
  v_amistad JSONB;
  v_composicion JSONB;
  v_contadores JSONB;
  v_auditoria JSONB;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- ── Serie diaria: altas, encuestas, eclosiones, pausas y bajas ──
  -- Cada columna sale de su propio timestamp; si la columna se borra
  -- (reactivar limpia `paused_at`) el día vuelve a cero, así que `pausas` es
  -- estado y no historia. La UI lo etiqueta así.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', cal.day::text,
    'altas', COALESCE(alt.n, 0),
    'encuestas', COALESCE(en.n, 0),
    'eclosiones', COALESCE(ec.n, 0),
    'pausas', COALESCE(pa.n, 0),
    'bajas', COALESCE(ba.n, 0)
  ) ORDER BY cal.day), '[]') INTO v_series
  FROM (
    SELECT generate_series(v_day_from::timestamp, v_day_to::timestamp, interval '1 day')::date AS day
  ) AS cal
  LEFT JOIN (SELECT created_at::date AS day, count(*) AS n FROM public.profiles GROUP BY 1) AS alt ON alt.day = cal.day
  LEFT JOIN (SELECT quiz_completed_at::date AS day, count(*) AS n FROM public.profiles
             WHERE quiz_completed_at IS NOT NULL GROUP BY 1) AS en ON en.day = cal.day
  LEFT JOIN (SELECT eclosionado_en::date AS day, count(*) AS n FROM public.profiles
             WHERE eclosionado_en IS NOT NULL GROUP BY 1) AS ec ON ec.day = cal.day
  LEFT JOIN (SELECT paused_at::date AS day, count(*) AS n FROM public.profiles
             WHERE paused_at IS NOT NULL GROUP BY 1) AS pa ON pa.day = cal.day
  LEFT JOIN (SELECT eliminado_en::date AS day, count(*) AS n FROM public.profiles
             WHERE eliminado_en IS NOT NULL GROUP BY 1) AS ba ON ba.day = cal.day;

  -- ── Embudo de participación ──
  SELECT jsonb_build_object(
    'registradas', (SELECT count(*) FROM public.profiles WHERE eliminado_en IS NULL),
    'conEncuesta', (SELECT count(*) FROM public.profiles
                    WHERE quiz_completed_at IS NOT NULL AND eliminado_en IS NULL),
    'eclosionados', (SELECT count(*) FROM public.profiles
                     WHERE estado_identidad = 'eclosionado' AND eliminado_en IS NULL),
    'presentes', (SELECT count(*) FROM public.profiles AS p
                  WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL),
    'conRomance', (SELECT count(*) FROM public.profiles AS p
                   WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL
                     AND EXISTS (SELECT 1 FROM private.live_pairs('romance') AS r
                                 WHERE p.user_id IN (r.a, r.b))),
    'conAmistad', (SELECT count(*) FROM public.profiles AS p
                   WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL
                     AND EXISTS (SELECT 1 FROM private.live_pairs('amistad') AS r
                                 WHERE p.user_id IN (r.a, r.b)))
  ) INTO v_embudo;

  -- ── Tiempo de la alta a la eclosión, sobre quien tiene ambas fechas ──
  -- `created_at` es NOT NULL en la tabla, así que la muestra es quien eclosionó.
  -- `EXTRACT` devuelve numeric desde PG14 y `percentile_cont` pide double
  -- precision, así que el tipo se afirma a mano en vez de confiar en el cast.
  SELECT jsonb_build_object(
    'medianaHoras', percentile_cont(0.5) WITHIN GROUP (ORDER BY
      (EXTRACT(epoch FROM p.eclosionado_en - p.created_at) / 3600.0)::double precision),
    'p75Horas', percentile_cont(0.75) WITHIN GROUP (ORDER BY
      (EXTRACT(epoch FROM p.eclosionado_en - p.created_at) / 3600.0)::double precision),
    'muestra', count(*)
  ) INTO v_eclosion
  FROM public.profiles AS p
  WHERE p.eclosionado_en IS NOT NULL;

  -- ── Calidad del matching por pista ──
  -- Eje normalizado contra la calibración de la propia pista:
  --     z = (similitud - umbral) / (referencia_alta - umbral)
  -- z = 0 es el corte, z = 1 es `reference_high`. Romance y amistad quedan
  -- comparables sobre el mismo eje sin inventar constantes nuevas: las cuatro
  -- llegan desde `data/matching-config.json` por parámetro, y la config ya
  -- garantiza `reference_high > threshold`, así que el denominador es positivo
  -- y `z` crece con la similitud. Si aun así llegara cero, NULLIF da NULL,
  -- `floor(NULL)::int` es NULL y la caja se descarta: nunca división por cero.
  SELECT jsonb_build_object(
    'filas', (SELECT count(*) FROM private.live_pairs('romance')),
    'conAfinidad', (SELECT count(*) FROM public.profiles AS p
                    WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL
                      AND EXISTS (SELECT 1 FROM private.live_pairs('romance') AS r
                                  WHERE p.user_id IN (r.a, r.b))),
    'aislados', (SELECT count(*) FROM public.profiles AS p
                 WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL
                   AND NOT EXISTS (SELECT 1 FROM private.live_pairs('romance') AS r
                                   WHERE p.user_id IN (r.a, r.b))),
    'media', (SELECT avg(l.sim) FROM private.live_pairs('romance') AS l),
    'p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY l.sim) FROM private.live_pairs('romance') AS l),
    'p90', (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY l.sim) FROM private.live_pairs('romance') AS l),
    'max', (SELECT max(l.sim) FROM private.live_pairs('romance') AS l),
    'bajoUmbral', (SELECT count(*) FROM private.live_pairs('romance') AS l
                   WHERE l.sim < p_romance_threshold),
    'bins', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('i', b.i, 'n', b.n) ORDER BY b.i)
      FROM (
        SELECT floor((l.sim - p_romance_threshold) /
                     NULLIF(p_romance_reference - p_romance_threshold, 0) / v_width)::int AS i,
               count(*) AS n
        FROM private.live_pairs('romance') AS l
        WHERE l.sim >= p_romance_threshold
        GROUP BY 1
      ) AS b
      WHERE b.i >= 0 AND b.i < 12
    ), '[]'),
    'sobreEje', COALESCE((SELECT count(*) FROM private.live_pairs('romance') AS l
                          WHERE l.sim >= p_romance_threshold
                            AND floor((l.sim - p_romance_threshold) /
                                      NULLIF(p_romance_reference - p_romance_threshold, 0) / v_width)::int >= 12), 0)
  ) INTO v_romance;

  SELECT jsonb_build_object(
    'filas', (SELECT count(*) FROM private.live_pairs('amistad')),
    'conAfinidad', (SELECT count(*) FROM public.profiles AS p
                    WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL
                      AND EXISTS (SELECT 1 FROM private.live_pairs('amistad') AS r
                                  WHERE p.user_id IN (r.a, r.b))),
    'aislados', (SELECT count(*) FROM public.profiles AS p
                 WHERE p.quiz_completed_at IS NOT NULL AND p.paused_at IS NULL AND p.eliminado_en IS NULL
                   AND NOT EXISTS (SELECT 1 FROM private.live_pairs('amistad') AS r
                                   WHERE p.user_id IN (r.a, r.b))),
    'media', (SELECT avg(l.sim) FROM private.live_pairs('amistad') AS l),
    'p50', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY l.sim) FROM private.live_pairs('amistad') AS l),
    'p90', (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY l.sim) FROM private.live_pairs('amistad') AS l),
    'max', (SELECT max(l.sim) FROM private.live_pairs('amistad') AS l),
    'bajoUmbral', (SELECT count(*) FROM private.live_pairs('amistad') AS l
                   WHERE l.sim < p_amistad_threshold),
    'bins', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('i', b.i, 'n', b.n) ORDER BY b.i)
      FROM (
        SELECT floor((l.sim - p_amistad_threshold) /
                     NULLIF(p_amistad_reference - p_amistad_threshold, 0) / v_width)::int AS i,
               count(*) AS n
        FROM private.live_pairs('amistad') AS l
        WHERE l.sim >= p_amistad_threshold
        GROUP BY 1
      ) AS b
      WHERE b.i >= 0 AND b.i < 12
    ), '[]'),
    'sobreEje', COALESCE((SELECT count(*) FROM private.live_pairs('amistad') AS l
                          WHERE l.sim >= p_amistad_threshold
                            AND floor((l.sim - p_amistad_threshold) /
                                      NULLIF(p_amistad_reference - p_amistad_threshold, 0) / v_width)::int >= 12), 0)
  ) INTO v_amistad;

  -- ── Composición del cielo (solo eclosionados: el huevo no tiene estas columnas) ──
  SELECT jsonb_build_object(
    'eneagrama', COALESCE((
      SELECT jsonb_object_agg(s.code, s.total)
      FROM (SELECT enneagram_code AS code, count(*) AS total
            FROM public.profiles
            WHERE estado_identidad = 'eclosionado' AND enneagram_code IS NOT NULL
            GROUP BY 1) AS s), '{}'),
    'marcas', COALESCE((
      SELECT jsonb_object_agg(s.mark, s.total)
      FROM (SELECT avatar_mark AS mark, count(*) AS total
            FROM public.profiles
            WHERE estado_identidad = 'eclosionado' AND avatar_mark IS NOT NULL
            GROUP BY 1) AS s), '{}'),
    'modulos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('n', s.card, 'total', s.total) ORDER BY s.card)
      FROM (SELECT cardinality(completed_modules) AS card, count(*) AS total
            FROM public.profiles
            WHERE quiz_completed_at IS NOT NULL
            GROUP BY 1) AS s), '[]')
  ) INTO v_composicion;

  -- ── Contadores manuales ──
  -- `actualizadoPor` es el alias guardado: si la cuenta se borró el FK ya
  -- puso NULL y la celda queda sin nombre, pero el valor sigue ahí.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', k.key,
    'value', k.value,
    'actualizadoEn', k.updated_at,
    'actualizadoPor', p.alias_completo
  ) ORDER BY k.key), '[]') INTO v_contadores
  FROM public.admin_counters AS k
  LEFT JOIN public.profiles AS p ON p.user_id = k.updated_by;

  -- ── Auditoría agregada en la ventana ──
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.admin_audit),
    'porAccion', COALESCE((
      SELECT jsonb_object_agg(s.action, s.total)
      FROM (SELECT action, count(*) AS total FROM public.admin_audit GROUP BY 1) AS s), '{}'),
    'porDia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'day', cal.day::text, 'n', COALESCE(a.total, 0)) ORDER BY cal.day)
      FROM (
        SELECT generate_series(v_day_from::timestamp, v_day_to::timestamp, interval '1 day')::date AS day
      ) AS cal
      LEFT JOIN (SELECT created_at::date AS day, count(*) AS total
                 FROM public.admin_audit
                 WHERE created_at::date >= v_day_from
                 GROUP BY 1) AS a ON a.day = cal.day
    ), '[]')
  ) INTO v_auditoria;

  RETURN jsonb_build_object(
    -- Campos viejos: definición intacta.
    'generatedAt', now(),
    'romanceThreshold', p_romance_threshold,
    'amistadThreshold', p_amistad_threshold,
    'totalProfiles',
      (SELECT count(*) FROM public.profiles WHERE quiz_completed_at IS NOT NULL AND paused_at IS NULL),
    'huevos', (SELECT count(*) FROM public.profiles WHERE estado_identidad = 'huevo'),
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
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'count', t.total) ORDER BY t.total DESC, t.name)
      FROM (
        SELECT p.animal_id AS id, a.diminutivo_es AS name, count(*) AS total
        FROM public.profiles AS p
        JOIN public.animals AS a ON a.id = p.animal_id
        WHERE p.estado_identidad = 'eclosionado' AND p.animal_id IS NOT NULL
        GROUP BY p.animal_id, a.diminutivo_es
        ORDER BY total DESC, name
        LIMIT 10
      ) AS t
    ), '[]'),
    'topColors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'count', t.total) ORDER BY t.total DESC, t.name)
      FROM (
        SELECT p.color_id AS id, c.nombre AS name, count(*) AS total
        FROM public.profiles AS p
        JOIN public.colors AS c ON c.id = p.color_id
        WHERE p.estado_identidad = 'eclosionado' AND p.color_id IS NOT NULL
        GROUP BY p.color_id, c.nombre
        ORDER BY total DESC, name
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
    ), '{}'),
    -- Campos nuevos.
    'referencias', jsonb_build_object('romance', p_romance_reference, 'amistad', p_amistad_reference),
    'ventanaDias', v_days,
    'desde', v_day_from::text,
    'hasta', v_day_to::text,
    'series', v_series,
    'embudo', v_embudo,
    'eclosion', v_eclosion,
    'matching', jsonb_build_object('romance', v_romance, 'amistad', v_amistad),
    'composicion', v_composicion,
    'contadores', v_contadores,
    'auditoria', v_auditoria
  );
END;
$$;

-- ─── Listado de personas con filtros y orden ────────────────────────────────
-- `p_filter` es un objeto con claves opcionales:
--   { "estado": "huevo" | "eclosionado", "pausado": "si" | "no",
--     "sinAfinidad": "romance" | "amistad", "mbti": "INTJ",
--     "desde": "YYYY-MM-DD", "hasta": "YYYY-MM-DD", "soloAdmin": "si",
--     "orden": "recientes" | "antiguas" | "masAfinidades" |
--              "menosAfinidades" | "nombre" }
-- Cada valor pasa por una lista blanca: un filtro que no se reconoce se ignora
-- en vez de colarse en la consulta, así que ningún cliente puede cambiarle el
-- sentido a un WHERE ni inyectar SQL. Las fechas solo se aceptan en ISO
-- completo, para que un texto suelto no reviente la RPC con un error de cast.
--
-- Son dos pasadas (conteo y página), como en la versión actual: el total debe
-- ser el de todo el filtro y no el de la página, porque el paginador lo usa
-- para saber cuántas páginas hay. El orden elegido sobrevive al `jsonb_agg`
-- porque se agrega sobre el ordinal `rn`, no sobre la fecha.
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search TEXT,
  p_user UUID,
  p_limit INTEGER,
  p_offset INTEGER,
  p_filter JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  v_pattern TEXT := '%' || replace(replace(replace(COALESCE(p_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_estado TEXT := CASE WHEN p_filter ->> 'estado' IN ('huevo', 'eclosionado') THEN p_filter ->> 'estado' END;
  v_pausado TEXT := CASE WHEN p_filter ->> 'pausado' IN ('si', 'no') THEN p_filter ->> 'pausado' END;
  v_sin TEXT := CASE WHEN p_filter ->> 'sinAfinidad' IN ('romance', 'amistad') THEN p_filter ->> 'sinAfinidad' END;
  v_admin TEXT := CASE WHEN p_filter ->> 'soloAdmin' = 'si' THEN 'si' END;
  v_mbti TEXT := CASE WHEN upper(COALESCE(p_filter ->> 'mbti', '')) ~ '^[IE][NS][TF][JP]$'
                      THEN upper(p_filter ->> 'mbti') END;
  v_orden TEXT := CASE WHEN NULLIF(p_filter ->> 'orden', '') IN
                           ('recientes', 'antiguas', 'masAfinidades', 'menosAfinidades', 'nombre')
                       THEN NULLIF(p_filter ->> 'orden', '') ELSE 'recientes' END;
  v_desde DATE := private.admin_iso_date(p_filter ->> 'desde');
  v_hasta DATE := private.admin_iso_date(p_filter ->> 'hasta');
  v_lim INTEGER := GREATEST(COALESCE(p_limit, 25), 0);
  v_off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_total INTEGER;
  v_rows JSONB;
BEGIN
  PERFORM private.assert_service_role();

  SELECT count(*) INTO v_total
  FROM public.profiles AS p
  WHERE (p_user IS NULL OR p.user_id = p_user)
    AND (COALESCE(p_search, '') = '' OR COALESCE(p.alias_completo, '') ILIKE v_pattern)
    AND (v_estado IS NULL OR p.estado_identidad = v_estado)
    AND (v_mbti IS NULL OR p.mbti_code::text = v_mbti)
    AND (v_pausado IS NULL OR (v_pausado = 'si') = (p.paused_at IS NOT NULL))
    AND (v_desde IS NULL OR p.created_at >= v_desde)
    AND (v_hasta IS NULL OR p.created_at < v_hasta + 1)
    AND (v_admin IS NULL OR (v_admin = 'si') = EXISTS (
           SELECT 1 FROM public.user_roles AS r
           WHERE r.user_id = p.user_id AND r.role = 'admin'::public.app_role))
    AND (v_sin IS NULL OR NOT EXISTS (
           SELECT 1 FROM private.live_pairs(v_sin) AS r
           WHERE p.user_id IN (r.a, r.b)));

  SELECT COALESCE(jsonb_agg(page.row_data ORDER BY page.rn), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT row_number() OVER (ORDER BY
             CASE WHEN v_orden = 'recientes' THEN p.created_at END DESC NULLS LAST,
             CASE WHEN v_orden = 'antiguas' THEN p.created_at END ASC NULLS LAST,
             CASE WHEN v_orden = 'nombre' THEN lower(p.alias_completo) END ASC NULLS LAST,
             -- Afinidades por persona, preagregadas: un orden por conteo no
             -- puede llevar una subconsulta dentro del ORDER BY de la ventana.
             CASE WHEN v_orden = 'masAfinidades' THEN COALESCE(af.n, 0) END DESC NULLS LAST,
             CASE WHEN v_orden = 'menosAfinidades' THEN COALESCE(af.n, 0) END ASC NULLS LAST,
             -- desempate estable para cualquier orden elegido
             p.created_at DESC, p.user_id
           ) AS rn,
           jsonb_build_object(
             'id', p.user_id,
             -- `identity` es el registro guardado, proyectado y nunca armado: la
             -- consola muestra exactamente estas columnas y no puede inventar un
             -- nombre. Una fila legada muestra nulos hasta su backfill.
             'identity', jsonb_build_object(
               'estadoIdentidad', p.estado_identidad,
               'aliasCompleto', p.alias_completo,
               'aliasAnimal', p.alias_animal,
               'aliasColor', p.alias_color,
               'aliasSufijo', p.alias_sufijo,
               'animalId', p.animal_id,
               'colorId', p.color_id,
               'colorHex', c.hex,
               'mbtiCode', p.mbti_code,
               'enneagramCode', p.enneagram_code,
               'mark', p.avatar_mark,
               'revelacionVista', p.revelacion_vista
             ),
             'createdAt', p.created_at,
             'quizCompletedAt', p.quiz_completed_at,
             'eclosionadoEn', p.eclosionado_en,
             'eliminadoEn', p.eliminado_en,
             'paused', p.paused_at IS NOT NULL,
             'adult', p.adult_confirmed_at IS NOT NULL,
             'modules', cardinality(p.completed_modules),
             'isAdmin', EXISTS (SELECT 1 FROM public.user_roles AS r
                                WHERE r.user_id = p.user_id AND r.role = 'admin'::public.app_role),
             'hasChatPin', EXISTS (SELECT 1 FROM public.chat_pins AS k WHERE k.user_id = p.user_id),
             -- Conteos con la definición vieja (todas las filas, vivas o no) para
             -- no mover los números por persona que la consola ya mostraba.
             'romanceMatches', (SELECT count(*) FROM public.matches AS m
                                WHERE m.track = 'romance' AND p.user_id IN (m.user_a, m.user_b)),
             'amistadMatches', (SELECT count(*) FROM public.matches AS m
                                WHERE m.track = 'amistad' AND p.user_id IN (m.user_a, m.user_b)),
             'conversations', (SELECT count(*) FROM public.conversations AS v
                               WHERE p.user_id IN (v.user_a, v.user_b)),
             'reportsReceived', (SELECT count(*) FROM public.chat_reports AS x WHERE x.reported = p.user_id)
           ) AS row_data
    FROM public.profiles AS p
    LEFT JOIN (
      SELECT u.uid, count(*) AS n
      FROM (SELECT user_a AS uid FROM public.matches
            UNION ALL
            SELECT user_b FROM public.matches) AS u
      GROUP BY 1
    ) AS af ON af.uid = p.user_id
    LEFT JOIN public.colors AS c ON c.id = p.color_id
    WHERE (p_user IS NULL OR p.user_id = p_user)
      AND (COALESCE(p_search, '') = '' OR COALESCE(p.alias_completo, '') ILIKE v_pattern)
      AND (v_estado IS NULL OR p.estado_identidad = v_estado)
      AND (v_mbti IS NULL OR p.mbti_code::text = v_mbti)
      AND (v_pausado IS NULL OR (v_pausado = 'si') = (p.paused_at IS NOT NULL))
      AND (v_desde IS NULL OR p.created_at >= v_desde)
      AND (v_hasta IS NULL OR p.created_at < v_hasta + 1)
      AND (v_admin IS NULL OR (v_admin = 'si') = EXISTS (
             SELECT 1 FROM public.user_roles AS r
             WHERE r.user_id = p.user_id AND r.role = 'admin'::public.app_role))
      AND (v_sin IS NULL OR NOT EXISTS (
             SELECT 1 FROM private.live_pairs(v_sin) AS r
             WHERE p.user_id IN (r.a, r.b)))
    ORDER BY rn
    LIMIT v_lim OFFSET v_off
  ) AS page;

  RETURN jsonb_build_object('total', v_total, 'users', v_rows);
END;
$$;

-- ─── Postura de acceso ───────────────────────────────────────────────────────
ALTER TABLE public.admin_counters ENABLE ROW LEVEL SECURITY;
-- admin_counters: sin políticas a propósito (solo service role).
REVOKE ALL ON public.admin_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_counters TO service_role;

REVOKE ALL ON FUNCTION private.live_pairs(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.live_pairs(TEXT) TO service_role;

REVOKE ALL ON FUNCTION private.admin_iso_date(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_iso_date(TEXT) TO service_role;

REVOKE ALL ON FUNCTION
  public.admin_bump_counter(TEXT, UUID, INTEGER, INTEGER),
  public.admin_list_users(TEXT, UUID, INTEGER, INTEGER, JSONB),
  public.get_admin_dashboard(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.admin_bump_counter(TEXT, UUID, INTEGER, INTEGER),
  public.admin_list_users(TEXT, UUID, INTEGER, INTEGER, JSONB),
  public.get_admin_dashboard(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER)
  TO service_role;

COMMIT;
