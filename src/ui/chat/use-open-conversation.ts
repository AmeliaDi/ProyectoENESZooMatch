"use client";

/**
 * Which conversation `/chats` shows, kept in `?c=<id>` so the browser's back
 * button returns to the list. Only the random conversation id goes into the
 * URL, never an alias.
 */
import { useCallback, useSyncExternalStore } from "react";

const PARAM = "c";
const CHANGED = "zoomatch:chat-conversation";
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(CHANGED, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(CHANGED, callback);
  };
}

function read(): string | null {
  const id = new URLSearchParams(window.location.search).get(PARAM);
  return id !== null && SAFE_ID.test(id) ? id : null;
}

/** Link target for `next/link` (typed routes accept a URL object). */
export function conversationHref(id: string): { pathname: "/chats"; query: Record<string, string> } {
  return { pathname: "/chats", query: { [PARAM]: id } };
}

export function useOpenConversation() {
  const id = useSyncExternalStore(subscribe, read, () => null);
  const open = useCallback((next: string | null) => {
    const url = new URL(window.location.href);
    if (next === null) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, next);
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [id, open] as const;
}
