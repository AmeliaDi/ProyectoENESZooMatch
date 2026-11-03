"use client";

/**
 * `/chats`: the gate in front of every conversation. No PIN → create one;
 * PIN and closed lock → ask for it; pending recovery → notice and cancel;
 * open → the inbox, or one conversation (`?c=<id>`), with a quick-lock
 * button. A `chat.locked` reply anywhere re-reads the status, which brings
 * the PIN back. Hiding the page closes the lock (best effort); the server's
 * idle expiry is the guarantee.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Icon } from "@/ui/kit/icon";
import { ErrorState, LoadingState } from "@/ui/kit/states";
import { ExitButton } from "@/ui/shared/exit-button";

import { chatApi, lockOnHide, toStatus, type ChatStatus } from "./chat-api";
import { CHAT_COPY } from "./chat-copy";
import { ConversationView } from "./conversation-view";
import { Inbox } from "./inbox-list";
import { NewPinForm, UnlockForm } from "./pin-forms";
import { RecoveryPending, RecoveryRequest } from "./recovery-flow";
import { useOpenConversation } from "./use-open-conversation";

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

function OpenChats({ onLock, onLocked }: { onLock(): void; onLocked(): void }) {
  const [openId, setOpenId] = useOpenConversation();
  if (openId === null) return <Inbox onOpen={setOpenId} onLock={onLock} onLocked={onLocked} />;
  return <ConversationView key={openId} id={openId} onBack={() => setOpenId(null)} onLock={onLock} onLocked={onLocked} />;
}

function Gate({ status, refresh }: { status: ChatStatus; refresh(): Promise<void> }) {
  const [forgot, setForgot] = useState(false);
  const reload = useCallback(() => {
    setForgot(false);
    void refresh();
  }, [refresh]);
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
  if (status.unlocked) return <OpenChats onLock={() => void lock()} onLocked={reload} />;
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
