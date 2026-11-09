"use client";

/**
 * The two PIN screens of the gate: create (write, then confirm) and unlock
 * (with growing pauses). Errors and pauses are announced through one polite
 * live region; focus returns to the single input after every step.
 */
import { useEffect, useId, useRef, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import { Button } from "@/ui/kit/button";

import { chatApi } from "./chat-api";
import { CHAT_COPY, attemptsMessage, pausedMessage } from "./chat-copy";
import { PinInput } from "./pin-input";
import { deadlineIn, useSecondsUntil } from "./use-countdown";

const LENGTH = CHAT_CONFIG.pin.length;

function messageFor(code: string): string {
  if (code === "chat.pin_weak") return CHAT_COPY.weak;
  if (code === "chat.pin_mismatch") return CHAT_COPY.mismatch;
  if (code === "chat.reset_required") return CHAT_COPY.resetOnly;
  if (code === "chat.recovery_pending") return CHAT_COPY.recoveryPending;
  if (code === "service.unavailable" || code === "service.misconfigured") return CHAT_COPY.unavailable;
  return CHAT_COPY.failed;
}

function useFocus(dep: unknown) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), [dep]);
  return ref;
}

export interface NewPinFormProps {
  /** Sends the confirmed PIN; resolves to an error code or `null`. */
  submit(pin: string, confirm: string): Promise<string | null>;
  title: string;
  onDone(): void;
}

/** Two steps: a trivial PIN goes back to step one with a kind message. */
export function NewPinForm({ submit, title, onDone }: NewPinFormProps) {
  const messageId = useId();
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useFocus(first);

  async function finish(confirm: string) {
    if (first === null) return;
    setBusy(true);
    const code = await submit(first, confirm);
    setBusy(false);
    if (!code) return onDone();
    setMessage(messageFor(code));
    setFirst(null);
    setValue("");
  }

  function complete(pin: string) {
    if (first === null) {
      setFirst(pin);
      setValue("");
      setMessage(null);
    } else {
      void finish(pin);
    }
  }

  return (
    <form className="zm-chat__form" onSubmit={(e) => { e.preventDefault(); if (value.length === LENGTH) complete(value); }}>
      <h2 className="zm-chat__title">{title}</h2>
      <p className="zm-chat__step">
        {first === null ? CHAT_COPY.createStep : CHAT_COPY.confirmStep} · {CHAT_COPY.lockNote}
      </p>
      <PinInput ref={inputRef} value={value} onChange={setValue} onComplete={complete} disabled={busy} describedBy={messageId} invalid={message !== null} />
      <p id={messageId} className="zm-chat__message" role="status" aria-live="polite">{message}</p>
      {first !== null ? (
        <Button variant="ghost" onClick={() => { setFirst(null); setValue(""); }}>Volver a escribirlo</Button>
      ) : null}
    </form>
  );
}

export interface UnlockFormProps {
  initialPause?: number;
  onUnlocked(): void;
  onForgot(): void;
  onStateChanged(): void;
}

export function UnlockForm({ initialPause, onUnlocked, onForgot, onStateChanged }: UnlockFormProps) {
  const messageId = useId();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<number | null>(() => deadlineIn(initialPause));
  const [busy, setBusy] = useState(false);
  const left = useSecondsUntil(pausedUntil);
  const paused = left > 0;
  const inputRef = useFocus(paused);

  async function tryPin(pin: string) {
    setBusy(true);
    const reply = await chatApi.unlock(pin);
    setBusy(false);
    setValue("");
    if (reply.ok) return onUnlocked();
    if (reply.code === "chat.pin_paused") {
      setPausedUntil(deadlineIn(reply.retryAfter));
      setMessage(null);
    } else if (reply.code === "chat.pin_invalid") {
      setMessage(attemptsMessage(reply.attemptsLeft ?? 0));
    } else {
      setMessage(messageFor(reply.code));
      if (reply.code === "chat.reset_required" || reply.code === "chat.recovery_pending") onStateChanged();
    }
  }

  return (
    <form className="zm-chat__form" onSubmit={(e) => { e.preventDefault(); if (value.length === LENGTH) void tryPin(value); }}>
      <h2 className="zm-chat__title">{CHAT_COPY.unlockTitle}</h2>
      <p className="zm-chat__step">{CHAT_COPY.unlockStep}</p>
      <PinInput ref={inputRef} value={value} onChange={setValue} onComplete={(pin) => void tryPin(pin)} disabled={busy || paused} describedBy={messageId} invalid={message !== null} />
      <p id={messageId} className="zm-chat__message" role="status" aria-live="polite">
        {paused ? <span className="zm-chat__countdown">{pausedMessage(left)}</span> : message}
      </p>
      <Button variant="ghost" onClick={onForgot}>{CHAT_COPY.forgot}</Button>
    </form>
  );
}
