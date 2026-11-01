"use client";

/**
 * Notifications: discreet, grouped by kind, pausable from Ajustes. Polling
 * stops while the tab is hidden or the person paused them. Toasts never
 * expire on a timer and never steal focus (no false urgency).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { EXPERIENCE } from "@/config";
import { ToastStack } from "@/ui/kit/toast";

import {
  groupNotifications,
  readNotificationsPaused,
  subscribeNotificationsPaused,
  type IncomingNotification,
} from "./notification-grouping";

interface NotificationContextValue {
  unreadCount: number;
  paused: boolean;
}

const NotificationContext = createContext<NotificationContextValue>({ unreadCount: 0, paused: false });

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}

export function useNotificationsPaused(): boolean {
  return useSyncExternalStore(subscribeNotificationsPaused, readNotificationsPaused, () => false);
}

function parseList(data: unknown): IncomingNotification[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as { notifications?: unknown }).notifications;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (n): n is IncomingNotification =>
      Boolean(n) &&
      typeof n === "object" &&
      typeof (n as IncomingNotification).id === "string" &&
      typeof (n as IncomingNotification).title === "string" &&
      typeof (n as IncomingNotification).body === "string",
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const paused = useNotificationsPaused();
  const [list, setList] = useState<IncomingNotification[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const unauthorized = useRef(false);

  useEffect(() => {
    if (paused) return;
    let active = true;
    async function poll() {
      if (unauthorized.current || document.hidden) return;
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (res.status === 401) unauthorized.current = true;
        if (!res.ok || !active) return;
        setList(parseList(await res.json()));
      } catch {
        // Non-critical: the next tick tries again.
      }
    }
    void poll();
    const timer = window.setInterval(poll, EXPERIENCE.notifications.pollMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paused]);

  const toasts = useMemo(
    () => (paused ? [] : groupNotifications(list, dismissed, EXPERIENCE.notifications.maxVisible)),
    [list, dismissed, paused],
  );

  const dismiss = useCallback(
    (id: string) => {
      const ids = toasts.find((t) => t.id === id)?.ids ?? [id];
      setDismissed((prev) => new Set([...prev, ...ids]));
      void fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch(() => undefined);
    },
    [toasts],
  );

  const value = useMemo(
    () => ({ unreadCount: list.filter((n) => !n.read && !dismissed.has(n.id)).length, paused }),
    [list, dismissed, paused],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}
