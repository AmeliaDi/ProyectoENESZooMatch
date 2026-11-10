-- ============================================================================
-- M-13 / DB-19: que el recálculo ordinario no deje una conversación sin par.
--
-- El problema, medido en producción el 2026-11-10 (`npm run db:audit` →
-- `04_conservacion.sql`): 71 conversaciones apuntan a un par que ya no está en
-- `public.matches`, y 5 de ellas se abrieron DESPUÉS del último recálculo. La
-- conversación sobrevive porque ninguna FK apunta a `matches`
-- (`docs/DB_ESQUEMA.md`), pero la tarjeta del par desaparece: quien escribe un
-- mensaje ya no ve con quién está hablando.
--
-- La causa es una línea: `replace_matches` abre con
-- `DELETE FROM public.matches WHERE true`
-- (`supabase/migrations/20261108000000_fase1_idempotency_and_soft_delete.sql:52`)
-- y luego inserta SOLO lo que produjo el motor. `conserveProtected`
-- (`src/domain/matching/rollout.ts:56`) repone las parejas protegidas, pero esa
-- función vive en el camino de activación del rollout; el recálculo ordinario
-- —el que dispara cada `POST /api/admin/recompute` y cada envío de quiz, porque
-- `submitQuiz` llama `recomputeMatches`— no pasa por ahí.
--
-- Esta migración mueve la protección al único sitio que la hace valer para
-- TODOS los caminos: la propia escritura. El conjunto publicado pasa a ser
--   payload del motor ∪ {parejas con conversación abierta que el motor no produce}
-- y esas parejas se re-publican TAL CUALES estaban (similitud, badges y
-- `computed_at` del renglón previo), así que restituir no es inventar un score.
--
-- Por qué en SQL y no en la capa de aplicación: `recomputeMatches` corre en
-- cada envío de quiz. Pedir las parejas protegidas desde Node costaría entre
-- una y cinco lecturas HTTP por submission (`matches` y `conversations` no
-- tienen FK entre sí, así que PostgREST no puede empotrar la consulta); hacer
-- el `NOT EXISTS` dentro de la misma sentencia cuesta un escaneo sobre un
-- conjunto chico y cero viajes. La compuerta de rollout sigue midiendo en
-- TypeScript: esto no la reemplaza, es lo que hace que su número sea cierto
-- también fuera de la activación.
--
-- Por qué vive aquí y no en `supabase/migrations/`: cambia el comportamiento de
-- la escritura sobre producción, y eso es decisión humana (M-13). Además,
-- `npm run db:migrate-test` exige que el repo replique producción sin
-- diferencias; promover esta migración sin aplicarla rompería esa paridad a
-- propósito. La prueba `supabase/tests/05_conservacion.sql` la aplica DENTRO de
-- su transacción y se lleva el DDL al hacer `ROLLBACK`, así que el verde no
-- depende de que producción ya la tenga.
--
-- Al aplicarla: mover el archivo a `supabase/migrations/`, correr
-- `npm run db:schema` para refrescar la línea base, y actualizar los renglones
-- `conversaciones sin par vigente en matches` de
-- `supabase/maintenance/readonly-audit/04_conservacion.sql` para que esperen
-- `'0'` en las corridas posteriores (los 71 renglones históricos siguen ahí:
-- esta migración evita el daño nuevo, no reescribe el pasado; reconstruir esas
-- 71 tarjetas es otro paso humano, porque para ellas ya no existe un score
-- almacenado que restituir).
--
-- Idempotente: es `CREATE OR REPLACE FUNCTION`, puro DDL, sin filas de personas,
-- sin datos que respaldar y transaccional.
--
-- Por qué son TRES sentencias y no una con CTEs: la primera versión de esta
-- migración era una sola sentencia —`deleted AS (DELETE ... RETURNING *)` →
-- `conserved` → `INSERT`— y falló en la segunda corrida de la prueba
-- (`duplicate key value violates unique constraint "matches_pkey"`). En Postgres
-- los CTEs que modifican datos de una MISMA tabla se ejecutan concurrentes y el
-- chequeo de unicidad va contra el índice vivo, así que reinserar una llave que
-- el propio borrado de la misma sentencia está eliminando choca. En plpgsql, en
-- cambio, cada sentencia termina antes de que empiece la siguiente: primero se
-- toma el snapshot de lo que hay que conservar, después se borra, después se
-- inserta. El orden deja de ser una esperanza y es una garantía del lenguaje.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_matches(p_matches JSONB, p_pool_version TEXT)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload integer;
  v_conserved integer;
  v_keep JSONB;
BEGIN
  PERFORM private.assert_service_role();

  IF jsonb_typeof(p_matches) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Matches payload must be a JSON array' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zoomatch:matches'));

  IF private.pool_version() IS DISTINCT FROM p_pool_version THEN
    RETURN -1;
  END IF;

  -- 1 · Snapshot ANTES de borrar: renglones ya publicados cuya pareja tiene una
  -- conversación abierta en el MISMO track y que el motor no vuelve a producir.
  -- Se guardan tal cual (similitud, badges, computed_at): restituir no es
  -- inventar un score, y una tarjeta que ya existe no se renumera en silencio.
  SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb)
    INTO v_keep
    FROM public.matches m
   WHERE EXISTS (
     SELECT 1 FROM public.conversations c
     WHERE c.track = m.track AND c.user_a = m.user_a AND c.user_b = m.user_b
   )
   AND NOT EXISTS (
     SELECT 1 FROM jsonb_to_recordset(p_matches)
       AS p(track TEXT, user_a UUID, user_b UUID)
     WHERE p.user_a IS NOT NULL AND p.user_b IS NOT NULL AND p.user_a <> p.user_b
       AND p.track = m.track
       AND LEAST(p.user_a, p.user_b) = m.user_a
       AND GREATEST(p.user_a, p.user_b) = m.user_b
   );

  -- 2 · El borrado completo vigente, intacto: ninguna conversación depende de
  --     estos renglones porque el paso 1 ya los apartó.
  DELETE FROM public.matches WHERE true;

  -- 3 · Normalización idéntica a la vigente: orden canónico, auto-matches y
  --     nulos fuera, y del duplicado gana la similitud más alta.
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

  GET DIAGNOSTICS v_payload = ROW_COUNT;

  -- 4 · Y las protegidas de vuelta, con su marca de tiempo original: conservar
  --     no finge un recálculo que no ocurrió.
  INSERT INTO public.matches (track, user_a, user_b, similarity, badges, computed_at)
  SELECT c.track, c.user_a, c.user_b, c.similarity, c.badges, c.computed_at
  FROM jsonb_to_recordset(v_keep)
    AS c(track TEXT, user_a UUID, user_b UUID, similarity DOUBLE PRECISION, badges JSONB, computed_at TIMESTAMPTZ);

  GET DIAGNOSTICS v_conserved = ROW_COUNT;

  RETURN v_payload + v_conserved;
END;
$$;

COMMENT ON FUNCTION public.replace_matches(JSONB, TEXT) IS
  'Publica el conjunto global de matches. Conserva intactas las parejas que ya tienen conversación abierta y que el motor no produce, con la similitud, los badges y computed_at del renglón previo.';

COMMIT;
