"use client";

/**
 * Invitation to the free chat. Once you accepted, it only says you are
 * waiting; it never reveals whether the other person has seen or declined it.
 */
import { useState } from "react";

import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { CONVERSATION_COPY } from "./chat-copy";

export function FreeInvite({ accepted, onAccept }: { accepted: boolean; onAccept(): Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(await onAccept());
    setBusy(false);
  }

  return (
    <section className="zm-box zm-box--frame zm-round zm-invite" aria-labelledby="free-invite">
      <h3 id="free-invite" className="zm-round__question">{CONVERSATION_COPY.inviteTitle}</h3>
      {accepted ? (
        <p className="zm-round__pending" role="status"><Icon name="check" /> {CONVERSATION_COPY.inviteWaiting}</p>
      ) : (
        <>
          <p className="zm-chat__step">{CONVERSATION_COPY.inviteBody}</p>
          <div className="zm-chat__actions">
            <Button variant="primary" icon="amistad" busy={busy} disabled={busy} onClick={() => void accept()}>
              {CONVERSATION_COPY.inviteAccept}
            </Button>
          </div>
        </>
      )}
      <p className="zm-chat__message" role="status" aria-live="polite">{error}</p>
    </section>
  );
}
