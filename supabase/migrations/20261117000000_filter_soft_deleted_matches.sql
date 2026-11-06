-- ============================================================================
-- F: quien ya no está deja de aparecer en el cielo
--
-- `profiles.eliminado_en` (migración `20261108000000`) marca la baja suave: la
-- fila sobrevive días hasta que el purge la borra de `auth.users`. Durante esa
-- ventana `matches` sigue apuntando a esa persona — las filas cascadean contra
-- `profiles`, no contra la bandera — y `get_user_matches` solo filtraba
-- `estado_identidad = 'eclosionado'`, así que un match ya dado de baja seguía
-- pintando estrella, nombre y ficha.
--
-- Transaccional e idempotente: `CREATE OR REPLACE FUNCTION` sobre la misma
-- firma (no cambia el tipo de fila, así que no hace falta `DROP`), y un
-- `REVOKE`/`GRANT` que reafirma el posture actual. Volver a ejecutarlo no
-- hace nada distinto.
--
-- Antes de aplicar:
--   node --no-warnings scripts/db-backup.mts --out .backups/pre-filtro-bajas
--   node --no-warnings scripts/db-restore.mts --from .backups/pre-filtro-bajas --dry-run
--
-- Medido en producción el 2026-11-06, antes de este cambio: 168 perfiles, 15
-- con `eliminado_en` (3 eclosionados), 0 filas de `matches` y 0 conversaciones
-- tocando a esos 15. Es decir, hoy nadie ve una contraparte dada de baja; este
-- cierre existe para la ventana entre la baja suave y el borrado físico, que
-- es justo cuando el purge aún no ha corrido.
--
-- Las otras tres lecturas del mismo dato se cierran en el código, donde viven
-- las consultas: `findCounterparts` (cielo y carta), `peers` y `latents`
-- (chat). `notify_matches` ya filtraba `eliminado_en IS NULL` para el
-- destinatario; los conteos de matches no nombran a nadie, así que no se tocan.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_matches(p_user_id UUID)
RETURNS TABLE (
  track TEXT,
  other_user UUID,
  similarity DOUBLE PRECISION,
  badges JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_service_role();

  RETURN QUERY
  SELECT
    m.track,
    p.user_id,
    m.similarity,
    m.badges
  FROM public.matches AS m
  JOIN public.profiles AS p
    ON p.user_id = CASE WHEN m.user_a = p_user_id THEN m.user_b ELSE m.user_a END
  WHERE (m.user_a = p_user_id OR m.user_b = p_user_id)
    AND p.estado_identidad = 'eclosionado'
    -- Baja suave: la persona ya no es visible, aunque su fila todavía exista.
    AND p.eliminado_en IS NULL
  ORDER BY m.track, m.similarity DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_matches(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_matches(UUID) TO service_role;

COMMIT;
