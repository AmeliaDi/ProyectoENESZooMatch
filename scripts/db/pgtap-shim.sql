-- ============================================================================
-- Subconjunto de pgTAP para la base local (PGlite). NO se carga en producción.
--
-- Por qué existe: `supabase test db` necesita el CLI de Supabase y Docker, y ni
-- psql ni docker están disponibles aquí. PGlite es Postgres real compilado a
-- WASM, pero no carga la extensión pgTAP. Este archivo implementa las mismas
-- funciones con la misma semántica para que los archivos de supabase/tests/
-- corran sin cambios en los dos lados.
--
-- Semántica copiada de pgTAP:
--   plan(n)      fija cuántas aserciones se esperan; finish() lo verifica
--   ok / is      is() usa IS NOT DISTINCT FROM (NULL = NULL), como pgTAP
--   lives_ok     el SQL debe NO lanzar; sus efectos persisten
--   throws_ok    el SQL debe lanzar con ese SQLSTATE exacto; se revierte solo
--   is_empty     el SELECT devuelve cero filas
--   results_eq   misma multiconjunto de filas (EXCEPT ALL en ambos sentidos)
--   has_*        existencia en el catálogo, no comportamiento
--
-- Diferencia declarada: pgTAP emite TAP a stdout; aquí cada aserción queda en
-- pgtap.results y finish() devuelve el texto TAP. El runner lee la tabla.
-- scripts/db/test.mjs incluye una autoprueba del shim: una aserción falsa tiene
-- que reportarse como fallo, para que esto no pueda pasar todo en silencio.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS pgtap;

CREATE TABLE IF NOT EXISTS pgtap.plan (expected INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pgtap.results (
  seq INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ok BOOLEAN NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  diagnostics TEXT
);

CREATE OR REPLACE FUNCTION pgtap.plan(p_expected INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE pgtap.results RESTART IDENTITY;
  DELETE FROM pgtap.plan;
  INSERT INTO pgtap.plan VALUES (p_expected);
END;
$$;

CREATE OR REPLACE FUNCTION pgtap._record(p_ok BOOLEAN, p_desc TEXT, p_diag TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pgtap.results (ok, description, diagnostics) VALUES (p_ok, p_desc, p_diag);
  RETURN p_ok;
END;
$$;

CREATE OR REPLACE FUNCTION pgtap.ok(p_result BOOLEAN, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT pgtap._record(coalesce(p_result, false), p_desc, CASE WHEN p_result THEN NULL ELSE 'resultado falso o NULL' END) $$;

-- Variante con diagnóstico explícito; la usan is_empty/lives_ok/throws_ok/
-- results_eq por dentro. Ninguna prueba la llama: las pruebas conservan las
-- firmas de pgTAP, así que corren igual con la extensión real.
CREATE OR REPLACE FUNCTION pgtap.ok(p_result BOOLEAN, p_desc TEXT, p_diag TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT pgtap._record(coalesce(p_result, false), p_desc, CASE WHEN p_result THEN NULL ELSE p_diag END) $$;

CREATE OR REPLACE FUNCTION pgtap.is(p_got ANYELEMENT, p_want ANYELEMENT, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap._record(p_got IS NOT DISTINCT FROM p_want, p_desc,
    CASE WHEN p_got IS NOT DISTINCT FROM p_want THEN NULL ELSE 'obtenido: ' || coalesce(p_got::text, 'NULL') || ' · esperado: ' || coalesce(p_want::text, 'NULL') END)
$$;

CREATE OR REPLACE FUNCTION pgtap.isnt(p_got ANYELEMENT, p_want ANYELEMENT, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap._record(p_got IS DISTINCT FROM p_want, p_desc,
    CASE WHEN p_got IS DISTINCT FROM p_want THEN NULL ELSE 'ambos valores son ' || coalesce(p_got::text, 'NULL') END)
$$;

CREATE OR REPLACE FUNCTION pgtap.diag(p_text TEXT)
RETURNS VOID LANGUAGE sql AS $$ INSERT INTO pgtap.results (ok, description, diagnostics) VALUES (true, '', p_text) $$;

CREATE OR REPLACE FUNCTION pgtap.has_table(p_schema TEXT, p_table TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap.ok(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = p_schema AND table_name = p_table AND table_type = 'BASE TABLE'),
    'tabla ' || p_schema || '.' || p_table)
$$;

CREATE OR REPLACE FUNCTION pgtap.has_column(p_schema TEXT, p_table TEXT, p_column TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap.ok(EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = p_schema AND table_name = p_table AND column_name = p_column),
    'columna ' || p_schema || '.' || p_table || '.' || p_column)
$$;

CREATE OR REPLACE FUNCTION pgtap.col_is_pk(p_schema TEXT, p_table TEXT, p_column TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap.ok(EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) k ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k
    WHERE c.contype = 'p' AND n.nspname = p_schema AND t.relname = p_table AND a.attname = p_column),
    'llave primaria ' || p_schema || '.' || p_table || '(' || p_column || ')')
$$;

CREATE OR REPLACE FUNCTION pgtap.has_function(p_schema TEXT, p_name TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap.ok(EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = p_schema AND p.proname = p_name), 'función ' || p_schema || '.' || p_name)
$$;

CREATE OR REPLACE FUNCTION pgtap.has_function(p_schema TEXT, p_name TEXT, p_args TEXT[])
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = p_schema AND p.proname = p_name
      AND (SELECT array_agg(format_type(t, NULL) ORDER BY ord)
           FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)) = p_args
  ) INTO v_found;
  RETURN pgtap.ok(v_found, 'función ' || p_schema || '.' || p_name || '(' || array_to_string(p_args, ', ') || ')');
END;
$$;

CREATE OR REPLACE FUNCTION pgtap.has_index(p_schema TEXT, p_table TEXT, p_index TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = p_schema AND tablename = p_table AND indexname = p_index),
    'índice ' || p_schema || '.' || p_table || '.' || p_index)
$$;

CREATE OR REPLACE FUNCTION pgtap.has_trigger(p_schema TEXT, p_table TEXT, p_trigger TEXT)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT pgtap.ok(EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = p_schema AND c.relname = p_table AND t.tgname = p_trigger),
    'trigger ' || p_schema || '.' || p_table || '.' || p_trigger)
$$;

CREATE OR REPLACE FUNCTION pgtap.is_empty(p_sql TEXT, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_n BIGINT;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') AS q' INTO v_n;
  RETURN pgtap.ok(v_n = 0, p_desc, CASE WHEN v_n = 0 THEN NULL ELSE v_n || ' filas donde se esperaban 0' END);
END;
$$;

CREATE OR REPLACE FUNCTION pgtap.lives_ok(p_sql TEXT, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_msg TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RETURN pgtap.ok(true, p_desc);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RETURN pgtap.ok(false, p_desc, 'lanzó: ' || v_msg);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pgtap.throws_ok(p_sql TEXT, p_errcode TEXT, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_code TEXT; v_msg TEXT;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RETURN pgtap.ok(false, p_desc, 'no lanzó ninguna excepción; se esperaba SQLSTATE ' || p_errcode);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RETURN pgtap.ok(v_code = p_errcode, p_desc,
      CASE WHEN v_code = p_errcode THEN NULL ELSE 'SQLSTATE ' || v_code || ', se esperaba ' || p_errcode || ': ' || v_msg END);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pgtap.results_eq(p_got TEXT, p_want TEXT, p_desc TEXT DEFAULT '')
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_n BIGINT;
BEGIN
  EXECUTE 'SELECT count(*) FROM ((SELECT * FROM (' || p_got || ') a EXCEPT ALL SELECT * FROM (' || p_want || ') b) UNION ALL (SELECT * FROM (' || p_want || ') c EXCEPT ALL SELECT * FROM (' || p_got || ') d)) AS diff' INTO v_n;
  RETURN pgtap.ok(v_n = 0, p_desc, CASE WHEN v_n = 0 THEN NULL ELSE v_n || ' filas difieren' END);
END;
$$;

CREATE OR REPLACE FUNCTION pgtap.finish()
RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE v_expected INTEGER; v_n INTEGER; v_failed INTEGER; r RECORD;
BEGIN
  SELECT expected INTO v_expected FROM pgtap.plan;
  SELECT count(*), count(*) FILTER (WHERE NOT ok) INTO v_n, v_failed FROM pgtap.results WHERE description <> '' OR diagnostics IS NOT NULL;
  RETURN NEXT '1..' || coalesce(v_expected::text, '?');
  FOR r IN SELECT * FROM pgtap.results ORDER BY seq LOOP
    IF r.description = '' AND r.diagnostics IS NOT NULL THEN
      RETURN NEXT '# ' || r.diagnostics;
    ELSE
      RETURN NEXT CASE WHEN r.ok THEN 'ok ' ELSE 'not ok ' END || r.seq || ' - ' || r.description;
      IF r.diagnostics IS NOT NULL THEN RETURN NEXT '# ' || r.diagnostics; END IF;
    END IF;
  END LOOP;
  IF v_expected IS NULL THEN
    RETURN NEXT '# sin plan()';
  ELSIF v_n <> v_expected THEN
    RETURN NEXT '# plan roto: se planearon ' || v_expected || ' aserciones y corrieron ' || v_n;
  END IF;
  RETURN NEXT '# ' || v_failed || ' fallos de ' || v_n;
  RETURN;
END;
$$;

-- Al final, cuando todo existe. Las pruebas hacen SET ROLE authenticated/anon
-- para verificar permisos: sin USAGE sobre el esquema no ven ni `plan()` ni
-- `finish()`, y el error llega como «function does not exist», que es falso.
GRANT USAGE ON SCHEMA pgtap TO anon, authenticated, service_role, PUBLIC;
GRANT SELECT, INSERT, TRUNCATE ON pgtap.plan, pgtap.results TO anon, authenticated, service_role, PUBLIC;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgtap TO anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgtap TO anon, authenticated, service_role, PUBLIC;