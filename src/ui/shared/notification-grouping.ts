/**
 * Pure grouping for notification toasts: one toast per kind, newest first,
 * never more than `maxVisible`. No countdowns, no urgency.
 */

import type { SoundEventId } from "@/config";
import type { ToastData, ToastTone } from "@/ui/kit/toast";

export interface IncomingNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at?: string;
}

const TONE: Record<string, ToastTone> = {
  match_romance: "romance",
  match_amistad: "amistad",
};

/**
 * Kinds whose toast never counts: "Tienes novedades en tus chats" says it all,
 * and a growing number would only add pressure (and hint at activity).
 */
const UNCOUNTED = new Set(["chat"]);

/** Where a toast can take the person; content-free, never a specific chat. */
const ACTION: Record<string, NonNullable<ToastData["action"]>> = {
  chat: { href: "/chats", label: "Ir a tus chats" },
};

const SOUND_FOR: Record<string, SoundEventId> = {
  match_romance: "match_nuevo",
  match_amistad: "match_nuevo",
  chat: "mensaje_nuevo",
};

/**
 * One sound for what arrived since the last poll. `previous === null` means
 * "just arrived": whatever was already waiting is not news. A match outranks
 * chat news, and no poll ever asks for two sounds at once.
 */
export function notificationSound(
  previous: ReadonlySet<string> | null,
  list: readonly IncomingNotification[],
): SoundEventId | null {
  if (previous === null) return null;
  let fallback: SoundEventId | null = null;
  for (const n of list) {
    if (n.read || previous.has(n.id)) continue;
    const event = SOUND_FOR[n.type];
    if (event === undefined) continue;
    if (event === "match_nuevo") return event;
    fallback = event;
  }
  return fallback;
}

function foldedBody(type: string, body: string, extra: number): string {
  if (extra <= 0 || UNCOUNTED.has(type) || !body) return body;
  return `${body} (y ${extra} ${extra === 1 ? "aviso más" : "avisos más"})`;
}

export interface GroupedToast extends ToastData {
  /** Every notification id folded into this toast (all are marked read together). */
  ids: string[];
}

export function groupNotifications(
  list: readonly IncomingNotification[],
  dismissed: ReadonlySet<string>,
  maxVisible: number,
): GroupedToast[] {
  const groups = new Map<string, IncomingNotification[]>();
  for (const n of list) {
    if (n.read || dismissed.has(n.id)) continue;
    const bucket = groups.get(n.type) ?? [];
    bucket.push(n);
    groups.set(n.type, bucket);
  }
  const toasts: GroupedToast[] = [];
  for (const [type, items] of groups) {
    const sorted = [...items].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    const head = sorted[0]!;
    toasts.push({
      id: head.id,
      ids: sorted.map((n) => n.id),
      tone: TONE[type] ?? "neutral",
      title: head.title,
      body: foldedBody(type, head.body, sorted.length - 1),
      ...(ACTION[type] ? { action: ACTION[type] } : {}),
    });
  }
  return toasts.slice(0, Math.max(0, maxVisible));
}

export const NOTIFICATIONS_PAUSED_KEY = "zoomatch:notifications-paused";

export function readNotificationsPaused(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATIONS_PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeNotificationsPaused(paused: boolean): void {
  try {
    if (paused) window.localStorage.setItem(NOTIFICATIONS_PAUSED_KEY, "1");
    else window.localStorage.removeItem(NOTIFICATIONS_PAUSED_KEY);
    window.dispatchEvent(new Event(NOTIFICATIONS_PAUSED_KEY));
  } catch {
    // Private mode: the toggle simply does not persist.
  }
}

export function subscribeNotificationsPaused(callback: () => void): () => void {
  window.addEventListener(NOTIFICATIONS_PAUSED_KEY, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(NOTIFICATIONS_PAUSED_KEY, callback);
    window.removeEventListener("storage", callback);
  };
}
