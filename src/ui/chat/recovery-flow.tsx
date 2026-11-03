"use client";

/**
 * "Olvidé mi PIN": retype the matrícula, wait 24 h (chats stay closed and the
 * notice is visible), cancel with the current PIN, or set a new PIN once the
 * wait is over.
 */
import { useId, useState } from "react";

import { ACCESS_CONFIG, CHAT_CONFIG } from "@/config";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";

import { chatApi } from "./chat-api";
import { CHAT_COPY, attemptsMessage, pausedMessage } from "./chat-copy";
import { NewPinForm } from "./pin-forms";
import { PinInput } from "./pin-input";

const DIGITS = ACCESS_CONFIG.matricula.digits;
const LENGTH = CHAT_CONFIG.pin.length;

const readyLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function RecoveryRequest({ onRequested, onBack }: { onRequested(): void; onBack(): void }) {
  const [matricula, setMatricula] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const reply = await chatApi.requestRecovery(matricula);
    setBusy(false);
    if (reply.ok) return onRequested();
    setError(reply.code === "chat.pin_paused" ? pausedMessage(reply.retryAfter ?? 0) : CHAT_COPY.recoveryInvalid);
  }

  return (
    <form className="zm-chat__form" onSubmit={(e) => { e.preventDefault(); if (matricula.length === DIGITS) void send(); }}>
      <h2 className="zm-chat__title">{CHAT_COPY.recoveryTitle}</h2>
      <p className="zm-chat__step">{CHAT_COPY.recoveryBody}</p>
      <Field
        autoFocus
        label="Tu matrícula"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={DIGITS}
        autoComplete="off"
        name="chat-recovery-account"
        value={matricula}
        error={error}
        onChange={(e) => setMatricula(e.target.value.replace(/[^0-9]/g, "").slice(0, DIGITS))}
      />
      <div className="zm-chat__actions">
        <Button variant="ghost" onClick={onBack}>Volver</Button>
        <Button type="submit" variant="primary" busy={busy} disabled={busy || matricula.length !== DIGITS}>Pedir restablecer</Button>
      </div>
    </form>
  );
}

export function RecoveryPending({ readyAt, ready, onChanged }: { readyAt: string; ready: boolean; onChanged(): void }) {
  const messageId = useId();
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel(value: string) {
    setBusy(true);
    const reply = await chatApi.cancelRecovery(value);
    setBusy(false);
    setPin("");
    if (reply.ok) {
      setMessage(CHAT_COPY.recoveryCancelled);
      return onChanged();
    }
    if (reply.code === "chat.pin_paused") setMessage(pausedMessage(reply.retryAfter ?? 0));
    else setMessage(reply.code === "chat.pin_invalid" ? attemptsMessage(reply.attemptsLeft ?? 0) : CHAT_COPY.failed);
  }

  async function complete(next: string, confirm: string): Promise<string | null> {
    const reply = await chatApi.completeRecovery(next, confirm);
    return reply.ok ? null : reply.code;
  }

  return (
    <div className="zm-chat__form">
      <p className="zm-box zm-chat__notice" role="alert">{CHAT_COPY.recoveryPending}</p>
      {ready ? (
        <>
          <p className="zm-chat__step">{CHAT_COPY.recoveryReady}</p>
          <NewPinForm title="Tu PIN nuevo" submit={complete} onDone={onChanged} />
        </>
      ) : (
        <p className="zm-chat__step">Tu PIN nuevo podrá crearse a partir del {readyLabel(readyAt)}.</p>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (pin.length === LENGTH) void cancel(pin); }}>
        <p className="zm-setting__label">{CHAT_COPY.recoveryCancel}</p>
        <PinInput value={pin} onChange={setPin} onComplete={(v) => void cancel(v)} disabled={busy} describedBy={messageId} />
        <p id={messageId} className="zm-chat__message" role="status" aria-live="polite">{message}</p>
      </form>
    </div>
  );
}
