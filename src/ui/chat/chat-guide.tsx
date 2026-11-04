"use client";

/**
 * First-time guide inside a conversation: three short lines (300 graphemes,
 * anonymity, what to do if something feels off). Skippable; "seen" is a local
 * preference and a failed write simply shows it again next time.
 */
import { useSyncExternalStore } from "react";

import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { SAFETY_COPY } from "./chat-copy";

const SEEN_KEY = "zm-chat-guide-seen";
const listeners = new Set<() => void>();

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage unavailable: the guide shows again next time, which is harmless.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function ChatGuide() {
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  if (seen) return null;
  return (
    <aside className="zm-box zm-box--frame zm-chat-guide" aria-labelledby="chat-guide">
      <h3 id="chat-guide" className="zm-chat__title"><Icon name="help" /> {SAFETY_COPY.guideTitle}</h3>
      <ul className="zm-chat-guide__list">
        <li>{SAFETY_COPY.guideLimit}</li>
        <li>{SAFETY_COPY.guideAnon}</li>
        <li>{SAFETY_COPY.guideSafety}</li>
        <li>{SAFETY_COPY.reducedGlow}</li>
      </ul>
      <Button variant="primary" icon="check" onClick={markSeen}>{SAFETY_COPY.guideOk}</Button>
    </aside>
  );
}
