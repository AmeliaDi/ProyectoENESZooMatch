"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppNotification, NotificationType } from "@/types/microtest-v2";

// ─── Toast variant map ────────────────────────────────────────────────────────

const TOAST_VARIANT: Record<NotificationType, string> = {
  match_romance: "romance",
  match_amistad: "amistad",
  no_match: "no-match",
  welcome: "welcome",
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (ids: string[]) => Promise<void>;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [visibleToast, setVisibleToast] = useState<AppNotification | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const unauthorizedRef = useRef(false);

  const markAsRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      );
    } catch {
      /* silent — non-critical */
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setVisibleToast(null);
      dismissedRef.current.add(id);
      void markAsRead([id]);
    },
    [markAsRead],
  );

  useEffect(() => {
    let active = true;

    async function fetchNotifications() {
      if (unauthorizedRef.current) return;
      try {
        const res = await fetch("/api/notifications");
        if (res.status === 401) {
          unauthorizedRef.current = true;
          return;
        }
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!active) return;
        if (!data || typeof data !== "object") return;
        const list = (data as { notifications?: unknown }).notifications;
        if (!Array.isArray(list) || list.length === 0) return;

        setNotifications(list as AppNotification[]);

        const unread = (list as AppNotification[]).find(
          (n) => !n.read && !dismissedRef.current.has(n.id),
        );
        if (unread) setVisibleToast(unread);
      } catch {
        /* silent — notifications are non-critical */
      }
    }

    void fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, dismiss }}>
      {children}
      <AnimatePresence>
        {visibleToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`notification-toast notification-toast--${TOAST_VARIANT[visibleToast.type] ?? "welcome"}`}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{visibleToast.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/70">{visibleToast.body}</p>
              </div>
              <button
                onClick={() => dismiss(visibleToast.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink/60 transition-colors hover:bg-ink/20"
                aria-label="Cerrar notificación"
              >
                ×
              </button>
            </div>
            {visibleToast.type !== "welcome" && (
              <a
                href="/resultado-v2"
                onClick={() => dismiss(visibleToast.id)}
                className="mt-3 inline-block text-xs font-semibold text-clay transition-colors hover:text-clay/80"
              >
                Ver compatibilidad →
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
}
