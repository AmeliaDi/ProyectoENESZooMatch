"use client";

/**
 * `/chats`: the gate in front of every conversation. No PIN → create one;
 * PIN and closed lock → ask for it; pending recovery → notice and cancel;
 * open → the (still empty) inbox, with a quick-lock button. Hiding the page
 * closes the lock (best effort); the server's idle expiry is the guarantee.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";
import { ExitButton } from "@/ui/shared/exit-button";

import { chatApi, lockOnHide, toStatus, type ChatStatus } from "./chat-api";
import { CHAT_COPY } from "./chat-copy";
import { NewPinForm, UnlockForm } from "./pin-forms";
import { RecoveryPending, RecoveryRequest } from "./recovery-flow";

type Screen =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; status: ChatStatus };

function useChatStatus() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const refresh = useCallback(async () => {
    const reply = await chatApi.status();
    if (reply.ok) return setScreen({ kind: "ready", status: toStatus(reply.body) });
    const message = reply.code === "auth.unauthorized" ? CHAT_COPY.noSession : CHAT_COPY.unavailable;
    setScreen({ kind: "error", message });
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(first);
  }, [refresh]);
  return [screen, refresh] as const;
}

function useLockOnHide(active: boolean) {
  useEffect(() => {
    if (!active || !CHAT_CONFIG.lock.onHidden) return;
    window.addEventListener("pagehide", lockOnHide);
    return () => window.removeEventListener("pagehide", lockOnHide);
  }, [active]);
}

function Inbox({ onLock }: { onLock(): void }) {
  return (
    <>
      <EmptyState title={CHAT_COPY.emptyTitle} body={CHAT_COPY.empty} />
      <div className="zm-chat__actions">
        <Button variant="secondary" icon="privacy" onClick={onLock}>{CHAT_COPY.lock}</Button>
      </div>
    </>
  );
}

function Gate({ status, refresh }: { status: ChatStatus; refresh(): Promise<void> }) {
  const [forgot, setForgot] = useState(false);
  const reload = () => {
    setForgot(false);
    void refresh();
  };
  const lock = async () => {
    await chatApi.lock();
    void refresh();
  };
  const create = async (pin: string, confirm: string) => {
    const reply = await chatApi.create(pin, confirm);
    return reply.ok ? null : reply.code;
  };

  if (!status.hasPin) return <NewPinForm title={CHAT_COPY.createTitle} submit={create} onDone={reload} />;
  if (status.recovery) return <RecoveryPending readyAt={status.recovery.readyAt} ready={status.recovery.ready} onChanged={reload} />;
  if (forgot || status.resetOnly) {
    return <RecoveryRequest onRequested={reload} onBack={() => setForgot(false)} />;
  }
  if (status.unlocked) return <Inbox onLock={() => void lock()} />;
  return (
    <UnlockForm
      {...(status.retryAfter === undefined ? {} : { initialPause: status.retryAfter })}
      onUnlocked={reload}
      onForgot={() => setForgot(true)}
      onStateChanged={reload}
    />
  );
}

export function ChatsView() {
  const [screen, refresh] = useChatStatus();
  useLockOnHide(screen.kind === "ready" && screen.status.unlocked);

  return (
    <AtlasShell
      plate="Lámina 06 · chats"
      actions={
        <>
          <Link href="/resultado" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Volver a mi cielo">
            <Icon name="back" />
          </Link>
          <ExitButton />
        </>
      }
    >
      <main className="zm-chat">
        <h1 className="zm-chat__heading">Chats</h1>
        <p className="zm-chat__intro">{CHAT_COPY.intro}</p>
        <section className="zm-box zm-box--frame zm-chat__panel">
          {screen.kind === "loading" ? <LoadingState title="Revisando tu candado…" /> : null}
          {screen.kind === "error" ? (
            <ErrorState title={screen.message} action={<Link href="/">Ir a la entrada</Link>} />
          ) : null}
          {screen.kind === "ready" ? <Gate status={screen.status} refresh={refresh} /> : null}
        </section>
        <p className="zm-detail__muted">
          ¿Quieres cambiar tu PIN o ver la actividad de tu candado? <Link href="/ajustes#chats">Ve a Ajustes</Link>
        </p>
      </main>
    </AtlasShell>
  );
}
