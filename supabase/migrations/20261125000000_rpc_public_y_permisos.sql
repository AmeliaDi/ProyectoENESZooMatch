-- ============================================================================
-- Los RPC que la app llama tienen que vivir en `public` y ser ejecutables por
-- `service_role`. Hasta hoy solo era cierto en el proyecto vivo, no en el repo.
--
-- Evidencia (reproducción local con PGlite, `npm run db:migrate-test`):
--   * Las 20 migraciones aplican en orden y producen 30 tablas / 212 columnas /
--     39 FK / 78 checks / 12 triggers / 4 políticas / 54 índices, idéntico al
--     catálogo vivo. Pero los 6 RPC de quizzes quedan en `private`:
--       private.quiz_save_answer, quiz_delete_answers, quiz_mark_completed,
--       quiz_set_sharing, quiz_picante_save_consent, quiz_picante_get_consent
--     PostgREST solo expone `public`, así que `admin.rpc("quiz_save_answer", …)`
--     (src/infrastructure/quiz/quiz-repository.ts) responde
--     `42883 function public.quiz_save_answer(...) does not exist`.
--     En producción esas 6 ya están en `public` con el MISMO cuerpo: el md5 de
--     `prosrc` coincide una a una. Alguien las movió a mano y el repo nunca lo
--     registró, así que un proyecto nuevo (`db:reset` / `db:apply`) nace roto.
--   * `get_my_notifications` y `mark_notifications_read` no tienen GRANT para
--     service_role en ninguna migración: sobre el esquema recién replicado
--     `SET ROLE service_role; SELECT public.get_my_notifications(false)` da
--     `42501 permission denied for function`. En producción el grant existe.
--
-- Qué hace: mueve los 6 RPC a `public` solo si siguen en `private`, y deja el
-- ACL de TODO función pública igual al medido en producción: dueño + service_role,
-- sin PUBLIC ni anon. No toca `authenticated`: las migraciones ya decidieron
-- cuáles 3 funciones lo llevan (get_admin_dashboard de 2 args, get_my_notifications,
-- mark_notifications_read) y este archivo no reescribe esa decisión.
--
-- Idempotente: ALTER ... SET SCHEMA va guardado por existencia, y GRANT/REVOKE
-- son no-ops cuando el permiso ya está. En producción no cambia nada observable.
-- Transaccional. No requiere respaldo: no lee ni escribe filas de personas.
-- ============================================================================

BEGIN;

-- ─── 1. Los RPC de quizzes, a la vista de PostgREST ──────────────────────────

DO $$
DECLARE
  v_name TEXT;
  v_args TEXT;
BEGIN
  FOR v_name, v_args IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname IN (
        'quiz_save_answer', 'quiz_delete_answers', 'quiz_mark_completed',
        'quiz_set_sharing', 'quiz_picante_save_consent', 'quiz_picante_get_consent'
      )
  LOOP
    -- Si el destino ya existe, moverlo encima fallaría: se deja como está.
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
        AND pg_get_function_identity_arguments(p.oid) = v_args
    ) THEN
      RAISE NOTICE 'public.% ya existe; no se mueve', v_name;
    ELSE
      EXECUTE format('ALTER FUNCTION private.%I(%s) SET SCHEMA public', v_name, v_args);
      RAISE NOTICE 'private.% movido a public', v_name;
    END IF;
  END LOOP;
END;
$$;

-- ─── 2. Permisos: service_role ejecuta, PUBLIC y anon no ─────────────────────

DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOR v_fn IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END;
$$;

COMMIT;