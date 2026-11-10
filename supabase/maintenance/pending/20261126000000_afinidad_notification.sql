-- ============================================================================
-- Activación del motor: UNA sola notificación por persona (M-02, paso 2).
--
-- Por qué vive aquí y no en `supabase/migrations/`: esta migración cambia el
-- esquema (un CHECK y un índice) y `npm run db:migrate-test` exige que el repo
-- replique producción sin diferencias. Mientras producción no la tenga, ponerla
-- en `supabase/migrations/` rompería esa paridad a propósito: medido, el costo
-- de promoverla es exactamente `1 índice solo en local` + `1 check con
-- definición distinta`. Vive en `supabase/maintenance/pending/` hasta que una
-- persona la aplique. Al aplicarla: mover el archivo a `supabase/migrations/`,
-- refrescar la línea base con `npm run db:schema` y voltear la aserción de
-- `supabase/tests/01_esquema.sql` que hoy exige que el tipo `afinidad_afinada`
-- sea rechazado con 23514.
--
-- Idempotente: el CHECK se re-declara con DROP IF EXISTS + ADD y el índice se
-- crea IF NOT EXISTS. No escribe filas de personas: es puro DDL, así que no
-- necesita respaldo. Transaccional.
--
-- Precedente exacto: el tipo `identity` y su índice único parcial, en
-- supabase/migrations/20261114000000_identity_single_source.sql:837-843.
-- ============================================================================

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('match_romance', 'match_amistad', 'no_match', 'welcome', 'chat', 'identity', 'afinidad_afinada'));

-- Una sola notificación de afinidad por persona, para siempre: reejecutar el
-- recálculo no la duplica. Quien la emite lo hace con ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_afinidad_unique_idx
  ON public.notifications (user_id) WHERE type = 'afinidad_afinada';

COMMIT;
