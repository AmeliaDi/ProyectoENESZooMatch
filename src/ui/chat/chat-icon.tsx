"use client";

/**
 * Chat icon for the global nav (docs/CHAT.md §13.4). Shows a pixel speech
 * bubble with a subtle golden halo when there's news (unread notifications or
 * pending invitations). The dot is announced to screen readers but never
 * carries a number — anxiety-inducing counters are forbidden.
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Icon } from "@/ui/kit/icon";

import { readInterest, subscribeInterest } from "./interest-api";

function hasNews(): boolean {
  const snapshot = readInterest();
  if (snapshot.kind !== "ready") return false;
  // Any invitation waiting is news.
  for (const state of Object.values(snapshot.states)) {
    if (state.state === "invited") return true;
  }
  return false;
}

export function ChatIcon() {
  const news = useSyncExternalStore(subscribeInterest, hasNews, () => false);
  return (
    <Link
      href="/chats"
      className="zm-box zm-btn zm-btn--ghost zm-btn--icon"
      aria-label={news ? "Chats, hay novedades" : "Chats"}
    >
      <Icon name="chat" />
      {news ? <span className="zm-chat-dot" aria-hidden="true" /> : null}
    </Link>
  );
}