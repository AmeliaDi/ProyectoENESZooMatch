"use client";

/**
 * Ajustes → Chats: change the PIN, "Olvidé mi PIN" (goes to /chats), recent
 * security activity and the aggregate of recent failed attempts. Never shows
 * an IP, a device or the PIN.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/ui/kit/button";
import { chatApi, toStatus, type ChatStatus } from "@/ui/chat/chat-api";
import { CHAT_COPY, attemptsMessage, pausedMessage } from "@/ui/chat/chat-copy";
import { NewPinForm } from "@/ui/chat/pin-forms";
import { PinInput } from "@/ui/chat/pin-input";

export const CHAT_EVENT_LABELS: Record<string, string> = {
  created: "Creaste tu PIN",
  changed: "Cambiaste tu PIN",
  paused: "Pausa por intentos fallidos",
  recovery_requested: "Se pidió restablecer tu PIN",
  recovery_cancelled: "Se canceló la solicitud de restablecer",
  recovery_completed: "Se restableció tu PIN",
};

interface Activity {
  events: Array<{ kind: string; at: string }>;
  recentFailures: number;
  lastFailedAt: string | null;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

function useChatSecurity() {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([chatApi.status(), chatApi.activity()]).then(([s, a]) => {
      if (!active) return;
      setStatus(s.ok ? toStatus(s.body) : null);
      setActivity(a.ok ? (a.body as unknown as Activity) : null);
    });
    return () => {
      active = false;
    };
  }, [version]);
  return { status, activity, reload: () => setVersion((v) => v + 1) };
}

function ChangePin({ onDone }: { onDone(): void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(pin: string, confirm: string): Promise<string | null> {
    const reply = await chatApi.change(current ?? "", pin, confirm);
    if (reply.ok) return null;
    setCurrent(null);
    if (reply.code === "chat.pin_invalid") setMessage(attemptsMessage(reply.attemptsLeft ?? 0));
    else if (reply.code === "chat.pin_paused") setMessage(pausedMessage(reply.retryAfter ?? 0));
    return reply.code;
  }

  if (current === null) {
    return (
      <div className="zm-setting">
        <p className="zm-chat__step">Primero escribe tu PIN actual.</p>
        <PinInput value={value} onChange={setValue} onComplete={(pin) => { setCurrent(pin); setValue(""); setMessage(null); }} />
        <p className="zm-chat__message" role="status" aria-live="polite">{message}</p>
      </div>
    );
  }
  return <NewPinForm title="Tu PIN nuevo" submit={submit} onDone={onDone} />;
}

function RecentActivity({ activity }: { activity: Activity | null }) {
  const failures = activity?.recentFailures ?? 0;
  return (
    <div className="zm-setting">
      <p className="zm-setting__label">Actividad de seguridad reciente</p>
      <p className="zm-detail__muted">
        Intentos fallidos recientes: {failures}
        {failures > 0 && activity?.lastFailedAt ? ` (${when(activity.lastFailedAt)})` : ""}
      </p>
      {activity && activity.events.length > 0 ? (
        <ul className="zm-chat__activity">
          {activity.events.map((event) => (
            <li key={`${event.kind}-${event.at}`}>
              {CHAT_EVENT_LABELS[event.kind] ?? event.kind} <span className="zm-chat__when">{when(event.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ChatSecuritySection() {
  const { status, activity, reload } = useChatSecurity();
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!status) return <p className="zm-detail__muted">{CHAT_COPY.noSession}</p>;
  if (!status.hasPin) {
    return <p className="zm-detail__muted">Aún no creas tu PIN de chats. <Link href="/chats">Crear mi PIN</Link></p>;
  }
  return (
    <div className="zm-settings__account">
      {status.recovery ? <p className="zm-box zm-chat__notice" role="alert">{CHAT_COPY.recoveryPending} <Link href="/chats">Revisar</Link></p> : null}
      <div className="zm-setting">
        <p className="zm-setting__label">PIN de chats</p>
        <p className="zm-detail__muted">{CHAT_COPY.intro}</p>
        {changing ? (
          <ChangePin onDone={() => { setChanging(false); setNotice("Listo: tu PIN cambió."); reload(); }} />
        ) : (
          <div className="zm-chat__actions">
            <Button variant="secondary" icon="privacy" disabled={Boolean(status.recovery) || status.resetOnly} onClick={() => setChanging(true)}>Cambiar mi PIN</Button>
            <Link href="/chats" className="zm-box zm-btn zm-btn--ghost">{CHAT_COPY.forgot}</Link>
          </div>
        )}
        <p className="zm-settings__message" role="status" aria-live="polite">{notice}</p>
      </div>
      <RecentActivity activity={activity} />
    </div>
  );
}
