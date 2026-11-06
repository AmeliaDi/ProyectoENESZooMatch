-- =============================================================================
-- Fase 3: Permanent retention policy RPC (apply_retention_policy)
-- Idempotent: safe to apply on a populated project and to re-run.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_retention_policy(
  p_abandoned_days INTEGER,
  p_grace_days INTEGER,
  p_read_notification_days INTEGER,
  p_security_event_days INTEGER,
  p_access_guard_hours INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_soft_deleted_abandoned INTEGER := 0;
  v_purged_soft_deleted INTEGER := 0;
  v_purged_read_notifications INTEGER := 0;
  v_purged_security_events INTEGER := 0;
  v_purged_access_guard INTEGER := 0;
BEGIN
  PERFORM private.assert_service_role();

  -- 1. Soft-delete incomplete profiles abandoned for more than p_abandoned_days
  UPDATE public.profiles AS p
  SET eliminado_en = now()
  WHERE p.quiz_completed_at IS NULL
    AND p.eliminado_en IS NULL
    AND p.created_at < now() - make_interval(days => GREATEST(p_abandoned_days, 1))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles AS r WHERE r.user_id = p.user_id AND r.role = 'admin'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_credentials AS a WHERE a.user_id = p.user_id
    );
  GET DIAGNOSTICS v_soft_deleted_abandoned = ROW_COUNT;

  -- 2. Permanently purge profiles that have been soft-deleted for more than p_grace_days
  DELETE FROM auth.users AS u
  USING public.profiles AS p
  WHERE u.id = p.user_id
    AND p.eliminado_en IS NOT NULL
    AND p.eliminado_en < now() - make_interval(days => GREATEST(p_grace_days, 1))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles AS r WHERE r.user_id = p.user_id AND r.role = 'admin'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_credentials AS a WHERE a.user_id = p.user_id
    );
  GET DIAGNOSTICS v_purged_soft_deleted = ROW_COUNT;

  -- 3. Purge read notifications older than p_read_notification_days
  DELETE FROM public.notifications
  WHERE read = true
    AND created_at < now() - make_interval(days => GREATEST(p_read_notification_days, 1));
  GET DIAGNOSTICS v_purged_read_notifications = ROW_COUNT;

  -- 4. Purge old chat security events older than p_security_event_days
  DELETE FROM public.chat_security_events
  WHERE created_at < now() - make_interval(days => GREATEST(p_security_event_days, 1));
  GET DIAGNOSTICS v_purged_security_events = ROW_COUNT;

  -- 5. Purge expired access_guard windows older than p_access_guard_hours
  DELETE FROM private.access_guard
  WHERE window_started_at < now() - make_interval(hours => GREATEST(p_access_guard_hours, 1))
    AND (locked_until IS NULL OR locked_until < now());
  GET DIAGNOSTICS v_purged_access_guard = ROW_COUNT;

  RETURN jsonb_build_object(
    'softDeletedAbandoned', v_soft_deleted_abandoned,
    'purgedSoftDeleted', v_purged_soft_deleted,
    'purgedReadNotifications', v_purged_read_notifications,
    'purgedSecurityEvents', v_purged_security_events,
    'purgedAccessGuard', v_purged_access_guard
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.apply_retention_policy(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.apply_retention_policy(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER)
TO service_role;

COMMIT;
