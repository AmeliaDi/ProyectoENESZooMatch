"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApiResult } from "./admin-api";

export interface AdminPageState<T> {
  data: T | null;
  loading: boolean;
  failed: boolean;
  reload(): void;
}

/**
 * Loads one page whenever `load` changes (memoise it on its inputs) or
 * `reload` is called. 401/403 call `onUnauthorized`.
 */
export function useAdminPage<T>(load: () => Promise<ApiResult<T>>, onUnauthorized: () => void): AdminPageState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const start = window.setTimeout(() => setLoading(true), 0);
    void load().then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.ok) {
        setData(result.value);
        setFailed(false);
      } else if (result.reason === "unauthorized") onUnauthorized();
      else setFailed(true);
    });
    return () => {
      alive = false;
      window.clearTimeout(start);
    };
  }, [load, onUnauthorized, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, failed, reload };
}
